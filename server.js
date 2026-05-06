require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const path = require('path');
const cron = require('node-cron');
const { query, pool, initDb } = require('./db');
const { loadSandboxData } = require('./clever');
const { runInterventionCheck } = require('./intervention');
const { logDataAccess, enforceRetentionPolicies, deleteStudentRecord, getCipaComplianceStatement } = require('./compliance');
const { helmetMiddleware, globalLimiter, authLimiter, requestLogger, httpsRedirect } = require('./security');
const { decrypt, decryptRows } = require('./crypto');
const { cacheBusLocation, getBusLocation, cacheStudentBusState, getStudentBusState } = require('./bus-cache');
const { runFullSync } = require('./oneroster');
const { handleOidcLogin, handleLaunch, handleDeepLink, registerPlatform } = require('./lti');
const { cleverAuthUrl, cleverCallback, classLinkAuthUrl, classLinkCallback, samlAuthUrl, samlCallback } = require('./auth-sso');
const { getChronicAbsenteeismReport, getDistrictAbsenteeismReport, getWeeklyReport } = require('./reports');
const { runEdFiSync } = require('./edfi');
const { syncCanvasGrades, syncGoogleClassroomGrades } = require('./lms-sync');

const app = express();
const PORT = process.env.PORT || 3000;

// In production, log internally but don't expose details to clients
function safeError(e, context) {
  console.error(`[error]${context ? ' ' + context + ':' : ''} ${e.message}`);
  if (process.env.NODE_ENV === 'production') return 'An error occurred';
  return e.message;
}

// ── Security middleware ───────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(httpsRedirect);
app.use(helmetMiddleware);
app.use(globalLimiter);
app.use(requestLogger);
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'sb-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
  },
}));

// ── SSE broadcast registry ────────────────────────────────────────────────────
const schoolClients = new Map();

function broadcast(schoolId, payload) {
  const clients = schoolClients.get(schoolId);
  if (!clients) return;
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try { res.write(msg); } catch (e) { clients.delete(res); }
  }
}

const requireAuth = (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  next();
};
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.session.role)) return res.status(403).json({ error: 'Forbidden' });
  next();
};

// ── SSE ───────────────────────────────────────────────────────────────────────
app.get('/api/events', requireAuth, (req, res) => {
  const schoolId = req.session.schoolId;
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('data: {"type":"connected"}\n\n');
  if (!schoolClients.has(schoolId)) schoolClients.set(schoolId, new Set());
  schoolClients.get(schoolId).add(res);
  const heartbeat = setInterval(() => { try { res.write(':ping\n\n'); } catch (e) {} }, 25000);
  req.on('close', () => { clearInterval(heartbeat); schoolClients.get(schoolId)?.delete(res); });
});

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post('/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const r = await query('SELECT * FROM users WHERE email=$1', [email]);
    const user = r.rows[0];
    if (!user || !await bcrypt.compare(password, user.password_hash))
      return res.status(401).json({ error: 'Invalid email or password' });
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.schoolId = user.school_id;
    req.session.consentTier = user.consent_tier;
    const name = decrypt(user.name);
    const email_out = decrypt(user.email);
    const schoolR = await query('SELECT name, district FROM schools WHERE id=$1', [user.school_id]);
    const school = schoolR.rows[0] || {};
    res.json({ id: user.id, name, email: email_out, role: user.role, consent_tier: user.consent_tier, school_name: school.name || null, district_name: school.district || null });
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/auth/me', requireAuth, async (req, res) => {
  const r = await query('SELECT id,name,email,role,consent_tier,school_id FROM users WHERE id=$1', [req.session.userId]);
  const user = r.rows[0];
  if (!user) return res.status(404).json({ error: 'Not found' });
  const schoolR = await query('SELECT name, district FROM schools WHERE id=$1', [user.school_id]);
  const school = schoolR.rows[0] || {};
  res.json({ ...user, name: decrypt(user.name), email: decrypt(user.email), school_name: school.name || null, district_name: school.district || null });
});

// ── Parent: Feed ──────────────────────────────────────────────────────────────
app.get('/api/feed', requireAuth, requireRole('parent'), async (req, res) => {
  try {
    const tier = req.session.consentTier || 3;
    const parentId = req.session.userId;

    const children = await query(`
      SELECT s.id, s.name, s.grade, s.has_iep, s.has_504, s.transport_status
      FROM students s
      JOIN parent_students ps ON ps.student_id = s.id
      WHERE ps.parent_id = $1
    `, [parentId]);

    const feed = [];

    for (const child of children.rows) {
      child.name = decrypt(child.name);

      await logDataAccess(parentId, child.id, 'feed_view', 'api', tier, req.ip);

      const attendance = await query(`
        SELECT date, status, justification FROM attendance
        WHERE student_id=$1 AND tier <= $2
        ORDER BY date DESC LIMIT 10
      `, [child.id, tier]);

      const grades = await query(`
        SELECT g.assignment_title, g.score, g.max_score, g.letter_grade, g.missing,
               g.due_date, g.created_at, s.name as section_name, s.subject
        FROM grades g
        LEFT JOIN sections s ON s.id = g.section_id
        WHERE g.student_id=$1 AND g.tier <= $2
        ORDER BY g.created_at DESC LIMIT 10
      `, [child.id, tier]);

      const upcoming = await query(`
        SELECT g.assignment_title, g.due_date, s.subject, s.name as section_name
        FROM grades g
        LEFT JOIN sections s ON s.id = g.section_id
        WHERE g.student_id=$1 AND g.submitted_at IS NULL
        AND g.due_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
        AND g.tier <= $2
        ORDER BY g.due_date ASC
      `, [child.id, tier]);

      const behavior = tier >= 2 ? await query(`
        SELECT type, note, created_at, source FROM behavior_events
        WHERE student_id=$1 ORDER BY created_at DESC LIMIT 5
      `, [child.id]) : { rows: [] };

      const shadow = tier >= 3 ? await query(`
        SELECT platform, parsed_type, raw_text, created_at FROM shadow_messages
        WHERE student_id=$1 ORDER BY created_at DESC LIMIT 5
      `, [child.id]) : { rows: [] };

      const alerts = await query(`
        SELECT id, priority, type, message, channels, created_at FROM alerts
        WHERE parent_id=$1 AND student_id=$2 AND read_at IS NULL
        ORDER BY priority DESC, created_at DESC
      `, [parentId, child.id]);

      const teachers = await query(`
        SELECT DISTINCT u.id, u.name, sec.subject
        FROM section_students ss
        JOIN sections sec ON sec.id = ss.section_id
        JOIN users u ON u.id = sec.teacher_id
        WHERE ss.student_id = $1
        ORDER BY sec.subject
      `, [child.id]);

      // Bus status
      const busStatus = await query(`
        SELECT bs.scan_type, bs.scanned_at, br.route_name
        FROM bus_scans bs
        JOIN bus_routes br ON br.id = bs.route_id
        WHERE bs.student_id=$1
        ORDER BY bs.scanned_at DESC LIMIT 1
      `, [child.id]);

      feed.push({
        student: child,
        alerts: alerts.rows,
        attendance: attendance.rows,
        grades: grades.rows,
        upcoming: upcoming.rows,
        behavior: behavior.rows,
        shadow: shadow.rows,
        teachers: teachers.rows.map(t => ({ ...t, name: decrypt(t.name) })),
        bus: busStatus.rows[0] || null,
      });
    }

    res.json(feed);
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

app.post('/api/alerts/:id/read', requireAuth, async (req, res) => {
  await query('UPDATE alerts SET read_at=NOW() WHERE id=$1 AND parent_id=$2', [req.params.id, req.session.userId]);
  res.json({ ok: true });
});

// ── Absence Justification ─────────────────────────────────────────────────────
app.post('/api/attendance/:id/justify', requireAuth, requireRole('parent'), async (req, res) => {
  try {
    const { justification } = req.body;
    if (!justification || justification.trim().length < 5)
      return res.status(400).json({ error: 'Justification required (min 5 characters)' });

    // Verify this parent is linked to the student on this attendance record
    const r = await query(`
      SELECT a.id, a.student_id FROM attendance a
      JOIN parent_students ps ON ps.student_id = a.student_id
      WHERE a.id=$1 AND ps.parent_id=$2
    `, [req.params.id, req.session.userId]);

    if (!r.rows.length) return res.status(403).json({ error: 'Not authorized for this record' });

    await query(
      `UPDATE attendance SET justification=$1, justification_submitted_at=NOW(), status='excused'
       WHERE id=$2`,
      [justification.trim(), req.params.id]
    );

    await logDataAccess(req.session.userId, r.rows[0].student_id, 'absence_justification', 'parent', 1, req.ip);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

// ── Parent: Consent / Data Sovereignty ───────────────────────────────────────
app.get('/api/consent', requireAuth, async (req, res) => {
  const r = await query('SELECT consent_tier FROM users WHERE id=$1', [req.session.userId]);
  res.json({ tier: r.rows[0].consent_tier });
});

app.put('/api/consent', requireAuth, requireRole('parent'), async (req, res) => {
  const { tier } = req.body;
  if (![1,2,3].includes(tier)) return res.status(400).json({ error: 'Invalid tier' });
  await query('UPDATE users SET consent_tier=$1 WHERE id=$2', [tier, req.session.userId]);
  req.session.consentTier = tier;
  if (tier < 3) await query('DELETE FROM shadow_messages WHERE parent_id=$1', [req.session.userId]);
  if (tier < 2) await query('DELETE FROM behavior_events WHERE student_id IN (SELECT student_id FROM parent_students WHERE parent_id=$1)', [req.session.userId]);
  await logDataAccess(req.session.userId, null, 'consent_update', 'settings', tier, req.ip);
  res.json({ ok: true, tier });
});

app.get('/api/audit-log', requireAuth, async (req, res) => {
  const r = await query(`
    SELECT action, source, tier, created_at FROM data_audit_log
    WHERE parent_id=$1 ORDER BY created_at DESC LIMIT 50
  `, [req.session.userId]);
  res.json(r.rows);
});

// ── FERPA / COPPA / SOPPA / PPRA rights requests ──────────────────────────────
app.post('/api/rights-request', requireAuth, async (req, res) => {
  try {
    const { request_type, student_id, regulation, notes } = req.body;
    const valid = ['disclosure','deletion','correction','portability','inspection','opt_out'];
    if (!valid.includes(request_type)) return res.status(400).json({ error: 'Invalid request_type' });

    // Verify the requesting parent is linked to this student before any action
    if (student_id && req.session.role === 'parent') {
      const own = await query(`SELECT 1 FROM parent_students WHERE parent_id=$1 AND student_id=$2`, [req.session.userId, student_id]);
      if (!own.rows.length) return res.status(403).json({ error: 'Not authorized for this student' });
    }

    const userR = await query('SELECT name, school_id FROM users WHERE id=$1', [req.session.userId]);
    const user = userR.rows[0];
    const schoolR = await query('SELECT district_id FROM schools WHERE id=$1', [user.school_id]);

    const { submitFerpaRequest } = require('./compliance');
    const id = await submitFerpaRequest(
      schoolR.rows[0]?.district_id, user.school_id, student_id,
      request_type, decrypt(user.name), regulation || 'FERPA'
    );

    if (request_type === 'deletion' && student_id) {
      await deleteStudentRecord(student_id, decrypt(user.name));
    }

    res.json({ ok: true, request_id: id });
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

// PPRA opt-out
app.post('/api/ppra/opt-out', requireAuth, requireRole('parent'), async (req, res) => {
  try {
    const { student_id, activity_type } = req.body;
    if (!student_id || !activity_type) return res.status(400).json({ error: 'student_id and activity_type required' });
    const own = await query(`SELECT 1 FROM parent_students WHERE parent_id=$1 AND student_id=$2`, [req.session.userId, student_id]);
    if (!own.rows.length) return res.status(403).json({ error: 'Not authorized for this student' });
    const { recordPpraOptOut } = require('./compliance');
    await recordPpraOptOut(req.session.userId, student_id, activity_type);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Request failed' }); }
});

// CIPA compliance statement (public)
app.get('/api/compliance/cipa', (req, res) => {
  res.json(getCipaComplianceStatement());
});

// ── Messages ──────────────────────────────────────────────────────────────────
app.get('/api/messages', requireAuth, async (req, res) => {
  const r = await query(`
    SELECT m.*, u.name as from_name, u.role as from_role,
           t2.name as to_name, s.name as student_name
    FROM messages m
    JOIN users u ON u.id = m.from_id
    LEFT JOIN users t2 ON t2.id = m.to_id
    LEFT JOIN students s ON s.id = m.student_id
    WHERE m.to_id=$1 OR m.from_id=$1
    ORDER BY m.created_at DESC LIMIT 50
  `, [req.session.userId]);
  const rows = r.rows.map(row => ({
    ...row,
    from_name: decrypt(row.from_name),
    to_name: decrypt(row.to_name),
    student_name: decrypt(row.student_name),
  }));
  res.json(rows);
});

app.post('/api/messages', requireAuth, async (req, res) => {
  const { to_id, student_id, content } = req.body;
  if (!content || content.trim().length === 0) return res.status(400).json({ error: 'Content required' });
  const r = await query(
    `INSERT INTO messages (from_id, to_id, student_id, content) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.session.userId, to_id, student_id, content.trim()]
  );
  res.json(r.rows[0]);
});

app.put('/api/messages/:id/read', requireAuth, async (req, res) => {
  await query('UPDATE messages SET read_at=NOW() WHERE id=$1 AND to_id=$2', [req.params.id, req.session.userId]);
  res.json({ ok: true });
});

// ── Teacher: Attendance ───────────────────────────────────────────────────────
app.get('/api/teacher/sections', requireAuth, requireRole('teacher','admin'), async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const r = await query(`
    SELECT sec.id, sec.name, sec.subject, sec.grade,
           COUNT(ss.student_id) as student_count,
           EXISTS(SELECT 1 FROM attendance a WHERE a.section_id=sec.id AND a.date=$3) as submitted_today,
           COUNT(ss.student_id) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM bus_scans bs
               WHERE bs.student_id=ss.student_id AND bs.scan_type='board' AND bs.scanned_at::date=$3
               AND bs.scanned_at <= NOW() - INTERVAL '30 minutes'
               AND NOT EXISTS (
                 SELECT 1 FROM attendance att
                 WHERE att.student_id=ss.student_id AND att.date=$3 AND att.status = 'present'
               )
             )
           ) as lp_count
    FROM sections sec
    LEFT JOIN section_students ss ON ss.section_id = sec.id
    WHERE sec.teacher_id=$1 OR $2='admin'
    GROUP BY sec.id ORDER BY sec.name
  `, [req.session.userId, req.session.role, today]);
  res.json(r.rows);
});

app.get('/api/teacher/sections/:id/students', requireAuth, requireRole('teacher','admin'), async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const r = await query(`
    SELECT s.id, s.name, s.grade, s.has_iep, s.has_504, s.transport_status,
           a.status as today_status,
           EXISTS (
             SELECT 1 FROM bus_scans bs
             WHERE bs.student_id=s.id AND bs.scan_type='board' AND bs.scanned_at::date=$2
             AND bs.scanned_at <= NOW() - INTERVAL '30 minutes'
             AND NOT EXISTS (
               SELECT 1 FROM attendance att
               WHERE att.student_id=s.id AND att.date=$2 AND att.status = 'present'
             )
           ) as logistically_present
    FROM students s
    JOIN section_students ss ON ss.student_id = s.id
    LEFT JOIN attendance a ON a.student_id = s.id AND a.date=$2 AND a.section_id=$1
    WHERE ss.section_id=$1
    ORDER BY logistically_present DESC, s.name
  `, [req.params.id, today]);
  res.json(r.rows.map(row => ({ ...row, name: decrypt(row.name) })));
});

app.post('/api/teacher/attendance', requireAuth, requireRole('teacher','admin'), async (req, res) => {
  const { records } = req.body;
  if (!Array.isArray(records) || records.length === 0)
    return res.status(400).json({ error: 'Records array required' });
  for (const r of records) {
    await query(`
      INSERT INTO attendance (student_id, section_id, date, status, source)
      VALUES ($1,$2,$3,$4,'direct')
      ON CONFLICT (student_id, date, section_id) DO UPDATE SET status=$4
    `, [r.student_id, r.section_id, r.date, r.status]);
  }
  if (req.session.schoolId) {
    runInterventionCheck(req.session.schoolId)
      .then(() => broadcast(req.session.schoolId, { type: 'attendance' }))
      .catch(console.error);
  }
  res.json({ ok: true, count: records.length });
});

app.get('/api/teacher/behavior-history/:studentId', requireAuth, requireRole('teacher','admin'), async (req, res) => {
  const r = await query(`
    SELECT type, note, created_at FROM behavior_events
    WHERE student_id=$1 ORDER BY created_at DESC LIMIT 5
  `, [req.params.studentId]);
  res.json(r.rows);
});

app.post('/api/teacher/behavior', requireAuth, requireRole('teacher','admin'), async (req, res) => {
  const { student_id, section_id, type, note } = req.body;
  const r = await query(`
    INSERT INTO behavior_events (student_id, section_id, teacher_id, type, note, source, tier)
    VALUES ($1,$2,$3,$4,$5,'direct',2) RETURNING *
  `, [student_id, section_id, req.session.userId, type, note]);
  runInterventionCheck(req.session.schoolId)
    .then(() => broadcast(req.session.schoolId, { type: 'behavior' }))
    .catch(console.error);
  res.json(r.rows[0]);
});

// ── Admin ─────────────────────────────────────────────────────────────────────
app.get('/api/admin/overview', requireAuth, requireRole('admin','district_admin'), async (req, res) => {
  const schoolId = req.session.schoolId;
  const today = new Date().toISOString().split('T')[0];

  const [students, teachers, absentToday, alertsToday, lpToday, syncs] = await Promise.all([
    query('SELECT COUNT(*) FROM students WHERE school_id=$1', [schoolId]),
    query("SELECT COUNT(*) FROM users WHERE school_id=$1 AND role='teacher'", [schoolId]),
    query("SELECT COUNT(DISTINCT student_id) FROM attendance WHERE date=$1 AND status='absent'", [today]),
    query('SELECT COUNT(DISTINCT student_id) FROM alerts WHERE created_at::date=$1::date', [today]),
    query(`SELECT COUNT(DISTINCT bs.student_id)
           FROM bus_scans bs
           JOIN students st ON st.id=bs.student_id
           WHERE st.school_id=$1 AND bs.scan_type='board' AND bs.scanned_at::date=$2
           AND bs.scanned_at <= NOW() - INTERVAL '30 minutes'
           AND NOT EXISTS (
             SELECT 1 FROM attendance a
             WHERE a.student_id=bs.student_id AND a.date=$2 AND a.status = 'present'
           )`, [schoolId, today]),
    query('SELECT * FROM sync_log WHERE school_id=$1 ORDER BY created_at DESC LIMIT 10', [schoolId]),
  ]);

  res.json({
    students: parseInt(students.rows[0].count),
    teachers: parseInt(teachers.rows[0].count),
    absent_today: parseInt(absentToday.rows[0].count),
    alerts_today: parseInt(alertsToday.rows[0].count),
    lp_today: parseInt(lpToday.rows[0].count),
    syncs: syncs.rows,
  });
});

app.get('/api/admin/students', requireAuth, requireRole('admin','district_admin'), async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const r = await query(`
    SELECT s.id, s.name, s.grade, s.has_iep, s.has_504,
           s.transport_status,
           COUNT(DISTINCT a.id) FILTER (WHERE a.status='absent') as absences,
           COUNT(DISTINCT g.id) FILTER (WHERE g.missing=true) as missing_assignments,
           MAX(al.created_at) as last_alert,
           BOOL_OR(a2.status='absent') as absent_today,
           EXISTS (
             SELECT 1 FROM bus_scans bs
             WHERE bs.student_id=s.id AND bs.scan_type='board' AND bs.scanned_at::date=$2
             AND bs.scanned_at <= NOW() - INTERVAL '30 minutes'
             AND NOT EXISTS (
               SELECT 1 FROM attendance att
               WHERE att.student_id=s.id AND att.date=$2 AND att.status = 'present'
             )
           ) as logistically_present
    FROM students s
    LEFT JOIN attendance a ON a.student_id=s.id AND a.date >= NOW()-INTERVAL '30 days'
    LEFT JOIN attendance a2 ON a2.student_id=s.id AND a2.date=$2
    LEFT JOIN grades g ON g.student_id=s.id
    LEFT JOIN alerts al ON al.student_id=s.id
    WHERE s.school_id=$1
    GROUP BY s.id ORDER BY logistically_present DESC, absences DESC, missing_assignments DESC
  `, [req.session.schoolId, today]);
  res.json(r.rows.map(row => ({ ...row, name: decrypt(row.name) })));
});

// LP students visible to both teachers and admins — used by the "Bus Status" panel
app.get('/api/lp-students', requireAuth, requireRole('teacher','admin','district_admin'), async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const r = await query(`
    SELECT s.id, s.name, s.grade, bs.scanned_at, br.route_name
    FROM bus_scans bs
    JOIN students s ON s.id=bs.student_id
    JOIN bus_routes br ON br.id=bs.route_id
    WHERE s.school_id=$1 AND bs.scan_type='board' AND bs.scanned_at::date=$2
    AND bs.scanned_at <= NOW() - INTERVAL '30 minutes'
    AND NOT EXISTS (
      SELECT 1 FROM attendance a WHERE a.student_id=s.id AND a.date=$2 AND a.status='present'
    )
    ORDER BY bs.scanned_at ASC
  `, [req.session.schoolId, today]);
  res.json(r.rows.map(row => ({ ...row, name: decrypt(row.name) })));
});

app.post('/api/admin/sync', requireAuth, requireRole('admin','district_admin'), async (req, res) => {
  try {
    const alerts = await runInterventionCheck(req.session.schoolId);
    broadcast(req.session.schoolId, { type: 'sync' });
    res.json({ ok: true, alerts_created: alerts.length, alerts });
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

app.get('/api/admin/student/:id', requireAuth, requireRole('admin','district_admin'), async (req, res) => {
  try {
    const stuId = req.params.id;
    const today = new Date().toISOString().split('T')[0];
    const [student, attendance, grades, behavior, alerts, parents, busStatus] = await Promise.all([
      // Scope to admin's school (district_admin can see across district via join)
      query(`SELECT s.* FROM students s
             JOIN schools sc ON sc.id=s.school_id
             WHERE s.id=$1 AND (s.school_id=$2 OR sc.district_id=(SELECT district_id FROM schools WHERE id=$2))`,
             [stuId, req.session.schoolId]),
      query(`SELECT a.date, a.status, a.justification, s.name as section_name
             FROM attendance a LEFT JOIN sections s ON s.id=a.section_id
             WHERE a.student_id=$1 ORDER BY a.date DESC LIMIT 20`, [stuId]),
      query(`SELECT g.*, s.name as section_name, s.subject
             FROM grades g LEFT JOIN sections s ON s.id=g.section_id
             WHERE g.student_id=$1 ORDER BY g.due_date DESC LIMIT 30`, [stuId]),
      query(`SELECT b.*, u.name as teacher_name
             FROM behavior_events b LEFT JOIN users u ON u.id=b.teacher_id
             WHERE b.student_id=$1 ORDER BY b.created_at DESC LIMIT 10`, [stuId]),
      query(`SELECT al.*, u.name as parent_name
             FROM alerts al LEFT JOIN users u ON u.id=al.parent_id
             WHERE al.student_id=$1 ORDER BY al.created_at DESC LIMIT 10`, [stuId]),
      query(`SELECT u.id, u.name FROM users u
             JOIN parent_students ps ON ps.parent_id=u.id
             WHERE ps.student_id=$1`, [stuId]),
      query(`SELECT bs.scan_type, bs.scanned_at, br.route_name, br.am_arrival_expected
             FROM bus_scans bs JOIN bus_routes br ON br.id=bs.route_id
             WHERE bs.student_id=$1 ORDER BY bs.scanned_at DESC LIMIT 1`, [stuId]),
    ]);
    const s = student.rows[0];
    if (!s) return res.status(404).json({ error: 'Not found' });
    const absences = attendance.rows.filter(a => a.status === 'absent').length;
    const missing = grades.rows.filter(g => g.missing).length;
    const presentToday = attendance.rows.some(a => a.date === today && ['present','logistically_present'].includes(a.status));
    const bus = busStatus.rows[0] || null;
    const logisticallyPresent = bus?.scan_type === 'board' && !presentToday;
    res.json({
      student: { ...s, name: decrypt(s.name) },
      attendance: attendance.rows,
      grades: grades.rows,
      behavior: behavior.rows.map(b => ({ ...b, teacher_name: decrypt(b.teacher_name) })),
      alerts: alerts.rows.map(a => ({ ...a, parent_name: decrypt(a.parent_name) })),
      parents: parents.rows.map(p => ({ ...p, name: decrypt(p.name) })),
      stats: { absences, missing },
      bus,
      logistically_present: logisticallyPresent,
    });
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

// ── Aggregator endpoint (Bus + Attendance + Grades) ───────────────────────────
app.get('/api/aggregate/:studentId', requireAuth, async (req, res) => {
  try {
    const stuId = req.params.studentId;

    // Authorization: parents must own the student; teachers/admins must share school
    if (req.session.role === 'parent') {
      const own = await query(`SELECT 1 FROM parent_students WHERE parent_id=$1 AND student_id=$2`, [req.session.userId, stuId]);
      if (!own.rows.length) return res.status(403).json({ error: 'Forbidden' });
    } else {
      const own = await query(`SELECT 1 FROM students WHERE id=$1 AND school_id=$2`, [stuId, req.session.schoolId]);
      if (!own.rows.length) return res.status(403).json({ error: 'Forbidden' });
    }
    const today = new Date().toISOString().split('T')[0];

    const [student, todayAttendance, recentGrades, busStatus, lastScan] = await Promise.all([
      query('SELECT id, name, grade, transport_status, has_iep, has_504 FROM students WHERE id=$1', [stuId]),
      query(`SELECT date, status, section_id FROM attendance WHERE student_id=$1 AND date=$2`, [stuId, today]),
      query(`SELECT assignment_title, score, max_score, letter_grade, missing, due_date
             FROM grades WHERE student_id=$1 ORDER BY created_at DESC LIMIT 5`, [stuId]),
      query(`SELECT te.event_type, te.recorded_at, br.route_name
             FROM transportation_events te
             JOIN bus_routes br ON br.id=te.route_id
             JOIN bus_scans bs ON bs.route_id=te.route_id
             WHERE bs.student_id=$1
             ORDER BY te.recorded_at DESC LIMIT 1`, [stuId]),
      query(`SELECT scan_type, scanned_at, br.route_name
             FROM bus_scans bs JOIN bus_routes br ON br.id=bs.route_id
             WHERE bs.student_id=$1 ORDER BY scanned_at DESC LIMIT 1`, [stuId]),
    ]);

    const s = student.rows[0];
    if (!s) return res.status(404).json({ error: 'Student not found' });

    const inClassToday = todayAttendance.rows.some(a => a.status === 'present');
    const scannedOnBus = lastScan.rows[0]?.scan_type === 'board';
    const logisticallyPresent = scannedOnBus && !inClassToday;

    res.json({
      student: { ...s, name: decrypt(s.name) },
      today: {
        attendance: todayAttendance.rows,
        in_class: inClassToday,
        bus: lastScan.rows[0] || null,
        logistically_present: logisticallyPresent,
      },
      grades: recentGrades.rows,
      bus_event: busStatus.rows[0] || null,
    });
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

// ── Shadow IT ingest ──────────────────────────────────────────────────────────
app.post('/api/shadow/ingest', requireAuth, requireRole('parent'), async (req, res) => {
  const { platform, raw_text, student_id } = req.body;
  if (!student_id) return res.status(400).json({ error: 'student_id required' });
  const own = await query(`SELECT 1 FROM parent_students WHERE parent_id=$1 AND student_id=$2`, [req.session.userId, student_id]);
  if (!own.rows.length) return res.status(403).json({ error: 'Not authorized for this student' });
  const tier = (await query('SELECT consent_tier FROM users WHERE id=$1', [req.session.userId])).rows[0]?.consent_tier;
  if (tier < 3) return res.status(403).json({ error: 'Shadow IT tier not enabled' });

  let parsed_type = 'general';
  if (/absent|attendance/i.test(raw_text)) parsed_type = 'attendance';
  else if (/behavior|conduct/i.test(raw_text)) parsed_type = 'behavior';
  else if (/grade|score|assignment/i.test(raw_text)) parsed_type = 'grade';
  else if (/remind|message/i.test(raw_text)) parsed_type = 'message';

  await query(
    `INSERT INTO shadow_messages (student_id, parent_id, platform, raw_text, parsed_type) VALUES ($1,$2,$3,$4,$5)`,
    [student_id, req.session.userId, platform, raw_text, parsed_type]
  );
  res.json({ ok: true, parsed_type });
});

// ── Bus scan ingestion (from bus hardware / GPS provider webhook) ─────────────
app.post('/api/bus/scan', async (req, res) => {
  try {
    // Secured with a shared secret header, not session auth (device-originated)
    const secret = req.headers['x-bus-secret'];
    if (!secret || secret !== process.env.BUS_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { student_id, route_id, stop_id, scan_type } = req.body;
    if (!student_id || !route_id || !scan_type)
      return res.status(400).json({ error: 'student_id, route_id, scan_type required' });
    if (!['board','alight'].includes(scan_type))
      return res.status(400).json({ error: 'scan_type must be board or alight' });

    await query(
      `INSERT INTO bus_scans (student_id, route_id, stop_id, scan_type) VALUES ($1,$2,$3,$4)`,
      [student_id, route_id, stop_id || null, scan_type]
    );

    // Update transport_status on student
    const status = scan_type === 'board' ? 'on_bus' : 'at_school';
    await query(`UPDATE students SET transport_status=$1 WHERE id=$2`, [status, student_id]);

    // Cache in Redis for real-time feed
    await cacheStudentBusState(student_id, { scan_type, route_id, scanned_at: new Date().toISOString() });

    // If student boarded bus, trigger intervention check for "Logistically Present" detection
    if (scan_type === 'board') {
      const stuR = await query('SELECT school_id FROM students WHERE id=$1', [student_id]);
      if (stuR.rows[0]) {
        runInterventionCheck(stuR.rows[0].school_id)
          .then(() => broadcast(stuR.rows[0].school_id, { type: 'bus_scan', student_id }))
          .catch(console.error);
      }
    }

    res.json({ ok: true, status });
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

// Bus GPS ping (from vehicle tracking system)
app.post('/api/bus/ping', async (req, res) => {
  try {
    const secret = req.headers['x-bus-secret'];
    if (!secret || secret !== process.env.BUS_WEBHOOK_SECRET)
      return res.status(401).json({ error: 'Unauthorized' });

    const { route_id, latitude, longitude, event_type, stop_id, speed_mph, heading } = req.body;
    if (!route_id || !event_type) return res.status(400).json({ error: 'route_id and event_type required' });

    await query(
      `INSERT INTO transportation_events (route_id, event_type, latitude, longitude, stop_id, speed_mph, heading)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [route_id, event_type, latitude, longitude, stop_id || null, speed_mph || null, heading || null]
    );

    // Cache latest location in Redis
    await cacheBusLocation(route_id, { latitude, longitude, event_type, recorded_at: new Date().toISOString(), speed_mph, heading });

    // Broadcast to school clients so bus progress bar updates live
    if (event_type === 'arrived_school') {
      const routeR = await query('SELECT school_id FROM bus_routes WHERE id=$1', [route_id]);
      if (routeR.rows[0]) broadcast(routeR.rows[0].school_id, { type: 'bus_arrived', route_id });
    }

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

// Real-time bus location for parent dashboard
app.get('/api/bus/location/:routeId', requireAuth, async (req, res) => {
  try {
    // Try Redis cache first
    const cached = await getBusLocation(req.params.routeId);
    if (cached) return res.json({ source: 'cache', ...cached });

    // Fall back to DB
    const r = await query(
      `SELECT event_type, latitude, longitude, recorded_at, speed_mph
       FROM transportation_events WHERE route_id=$1
       ORDER BY recorded_at DESC LIMIT 1`,
      [req.params.routeId]
    );
    res.json(r.rows[0] ? { source: 'db', ...r.rows[0] } : { source: 'none' });
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

// Student's bus status (Redis-first)
app.get('/api/bus/student/:studentId', requireAuth, async (req, res) => {
  try {
    const stuId = req.params.studentId;
    if (req.session.role === 'parent') {
      const own = await query(`SELECT 1 FROM parent_students WHERE parent_id=$1 AND student_id=$2`, [req.session.userId, stuId]);
      if (!own.rows.length) return res.status(403).json({ error: 'Forbidden' });
    } else {
      const own = await query(`SELECT 1 FROM students WHERE id=$1 AND school_id=$2`, [stuId, req.session.schoolId]);
      if (!own.rows.length) return res.status(403).json({ error: 'Forbidden' });
    }
    const cached = await getStudentBusState(req.params.studentId);
    if (cached) return res.json({ source: 'cache', ...cached });

    const r = await query(
      `SELECT bs.scan_type, bs.scanned_at, br.route_name, br.id as route_id
       FROM bus_scans bs JOIN bus_routes br ON br.id=bs.route_id
       WHERE bs.student_id=$1 ORDER BY bs.scanned_at DESC LIMIT 1`,
      [req.params.studentId]
    );
    res.json(r.rows[0] ? { source: 'db', ...r.rows[0] } : null);
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

// ── OneRoster sync (admin-triggered + cron) ───────────────────────────────────
app.post('/api/admin/oneroster-sync', requireAuth, requireRole('admin','district_admin'), async (req, res) => {
  try {
    const result = await runFullSync({ query }, req.session.schoolId);
    broadcast(req.session.schoolId, { type: 'sync' });
    res.json({ ok: true, result });
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

// ── LTI 1.3 Advantage ────────────────────────────────────────────────────────
app.get('/lti/login',  handleOidcLogin);
app.post('/lti/login', handleOidcLogin);
app.post('/lti/launch', express.urlencoded({ extended: false }), handleLaunch);
app.get('/lti/deeplink', requireAuth, handleDeepLink);

app.post('/api/admin/lti/platform', requireAuth, requireRole('admin','district_admin'), async (req, res) => {
  try {
    const { platformName, issuer, clientId, authEndpoint, jwksUri, tokenEndpoint } = req.body;
    if (!issuer || !clientId || !authEndpoint || !jwksUri || !tokenEndpoint)
      return res.status(400).json({ error: 'All platform fields required' });
    const schoolR = await query('SELECT district_id FROM schools WHERE id=$1', [req.session.schoolId]);
    const id = await registerPlatform({
      districtId: schoolR.rows[0]?.district_id,
      platformName, issuer, clientId, authEndpoint, jwksUri, tokenEndpoint,
    });
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

app.get('/api/admin/lti/platforms', requireAuth, requireRole('admin','district_admin'), async (req, res) => {
  const schoolR = await query('SELECT district_id FROM schools WHERE id=$1', [req.session.schoolId]);
  const r = await query('SELECT id, platform_name, issuer, client_id, created_at FROM lti_platforms WHERE district_id=$1', [schoolR.rows[0]?.district_id]);
  res.json(r.rows);
});

// ── SSO: Clever (wired) ───────────────────────────────────────────────────────
app.get('/auth/clever', async (req, res) => {
  try {
    const redirect = `${process.env.APP_URL || 'http://localhost:3000'}/auth/clever/callback`;
    if (!process.env.CLEVER_CLIENT_ID) return res.redirect('/?clever=sandbox'); // demo fallback
    const url = await cleverAuthUrl(redirect);
    res.redirect(url);
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

app.get('/auth/clever/callback', async (req, res) => {
  try {
    if (!req.query.code || !process.env.CLEVER_CLIENT_ID) return res.redirect('/?clever=sandbox');
    const redirect = `${process.env.APP_URL || 'http://localhost:3000'}/auth/clever/callback`;
    const user = await cleverCallback(req.query.code, redirect);
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.schoolId = user.school_id;
    req.session.consentTier = user.consent_tier || 3;
    const dest = user.role === 'parent' ? '/' : user.role === 'teacher' ? '/#attendance' : '/#admin';
    res.redirect(dest);
  } catch (e) {
    console.error('[sso] Clever callback error:', e.message);
    res.redirect('/?error=clever_sso_failed');
  }
});

// ── SSO: ClassLink ────────────────────────────────────────────────────────────
app.get('/auth/classlink', async (req, res) => {
  try {
    const redirect = `${process.env.APP_URL || 'http://localhost:3000'}/auth/classlink/callback`;
    const url = await classLinkAuthUrl(redirect);
    res.redirect(url);
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

app.get('/auth/classlink/callback', async (req, res) => {
  try {
    const redirect = `${process.env.APP_URL || 'http://localhost:3000'}/auth/classlink/callback`;
    const user = await classLinkCallback(req.query.code, redirect);
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.schoolId = user.school_id;
    req.session.consentTier = user.consent_tier || 3;
    res.redirect('/');
  } catch (e) {
    console.error('[sso] ClassLink callback error:', e.message);
    res.redirect('/?error=classlink_sso_failed');
  }
});

// ── SSO: SAML 2.0 (Google Workspace / Microsoft Education) ───────────────────
app.get('/auth/saml', async (req, res) => {
  try {
    const url = await samlAuthUrl(req);
    res.redirect(url);
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

app.post('/auth/saml/callback', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const user = await samlCallback(req);
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.schoolId = user.school_id;
    req.session.consentTier = user.consent_tier || 3;
    res.redirect('/');
  } catch (e) {
    console.error('[sso] SAML callback error:', e.message);
    res.redirect('/?error=saml_sso_failed');
  }
});

// SAML metadata (required by IdP for trust registration)
app.get('/auth/saml/metadata', (req, res) => {
  try {
    const { getSaml } = require('./auth-sso');
    res.type('application/xml');
    res.send('<!-- SAML metadata: configure SAML_ENTRY_POINT and SAML_IDP_CERT to enable -->');
  } catch (e) { res.status(500).send(e.message); }
});

// ── EdFi sync ─────────────────────────────────────────────────────────────────
app.post('/api/admin/edfi-sync', requireAuth, requireRole('admin','district_admin'), async (req, res) => {
  try {
    const result = await runEdFiSync({ query }, req.session.schoolId);
    broadcast(req.session.schoolId, { type: 'sync' });
    res.json({ ok: true, result });
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

// ── LMS grade sync (Canvas + Google Classroom) ────────────────────────────────
app.post('/api/admin/canvas-sync', requireAuth, requireRole('admin','district_admin'), async (req, res) => {
  try {
    const result = await syncCanvasGrades({ query }, req.session.schoolId);
    broadcast(req.session.schoolId, { type: 'sync' });
    res.json({ ok: true, result });
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

app.post('/api/admin/google-classroom-sync', requireAuth, requireRole('admin','district_admin'), async (req, res) => {
  try {
    const result = await syncGoogleClassroomGrades({ query }, req.session.schoolId, req.body.token);
    broadcast(req.session.schoolId, { type: 'sync' });
    res.json({ ok: true, result });
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

// ── Chronic Absenteeism (ESSA) ────────────────────────────────────────────────
app.get('/api/admin/reports/chronic-absenteeism', requireAuth, requireRole('admin','district_admin'), async (req, res) => {
  try {
    const report = await getChronicAbsenteeismReport(req.session.schoolId, req.query.from);
    res.json(report);
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

app.get('/api/district/reports/chronic-absenteeism', requireAuth, requireRole('district_admin'), async (req, res) => {
  try {
    const schoolR = await query('SELECT district_id FROM schools WHERE id=$1', [req.session.schoolId]);
    const districtId = schoolR.rows[0]?.district_id;
    if (!districtId) return res.status(400).json({ error: 'No district linked to this school' });
    const report = await getDistrictAbsenteeismReport(districtId, req.query.from);
    res.json(report);
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

app.get('/api/admin/reports/weekly', requireAuth, requireRole('admin','district_admin'), async (req, res) => {
  try {
    const report = await getWeeklyReport(req.session.schoolId);
    res.json(report);
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

// ── Intervention Rules Engine ─────────────────────────────────────────────────
app.get('/api/admin/rules', requireAuth, requireRole('admin','district_admin'), async (req, res) => {
  try {
    const schoolR = await query('SELECT district_id FROM schools WHERE id=$1', [req.session.schoolId]);
    const districtId = schoolR.rows[0]?.district_id;
    if (!districtId) return res.json({ using_defaults: true, defaults: { absence_watch:1, absence_high:2, absence_critical:3, missing_watch:1, missing_high:2 } });
    const r = await query(
      `SELECT rule_absence_watch, rule_absence_high, rule_absence_critical,
              rule_missing_watch, rule_missing_high FROM districts WHERE id=$1`,
      [districtId]
    );
    res.json(r.rows[0] || {});
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

app.put('/api/admin/rules', requireAuth, requireRole('admin','district_admin'), async (req, res) => {
  try {
    const { absence_watch, absence_high, absence_critical, missing_watch, missing_high } = req.body;
    const schoolR = await query('SELECT district_id FROM schools WHERE id=$1', [req.session.schoolId]);
    const districtId = schoolR.rows[0]?.district_id;
    if (!districtId) return res.status(400).json({ error: 'No district linked' });

    await query(`
      UPDATE districts SET
        rule_absence_watch=$1, rule_absence_high=$2, rule_absence_critical=$3,
        rule_missing_watch=$4, rule_missing_high=$5
      WHERE id=$6
    `, [absence_watch, absence_high, absence_critical, missing_watch, missing_high, districtId]);

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: safeError(e, req.path) }); }
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', uptime: process.uptime(), compliance: ['FERPA','COPPA','SOPPA','CIPA','PPRA'] });
  } catch (e) {
    res.status(503).json({ status: 'error', error: safeError(e) });
  }
});

// ── Catch-all ─────────────────────────────────────────────────────────────────
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Scheduled jobs ────────────────────────────────────────────────────────────

// Intervention check every 15 min during school hours
cron.schedule('*/15 7-16 * * 1-5', async () => {
  try {
    const schools = await query('SELECT id FROM schools');
    for (const s of schools.rows) await runInterventionCheck(s.id);
  } catch (e) { console.error('[cron] Intervention check error:', e.message); }
});

// OneRoster delta sync — every 30 min during school hours
cron.schedule('*/30 6-17 * * 1-5', async () => {
  try {
    const schools = await query('SELECT id FROM schools WHERE oneroster_base_url IS NOT NULL');
    for (const s of schools.rows) {
      await runFullSync({ query }, s.id).catch(e =>
        console.error(`[cron] OneRoster sync failed for school ${s.id}:`, e.message)
      );
    }
  } catch (e) { console.error('[cron] OneRoster cron error:', e.message); }
});

// EdFi sync — every hour during school hours
cron.schedule('0 7-17 * * 1-5', async () => {
  try {
    const schools = await query('SELECT id FROM schools');
    for (const s of schools.rows) {
      await runEdFiSync({ query }, s.id).catch(e =>
        console.error(`[cron] EdFi sync failed for school ${s.id}:`, e.message)
      );
    }
  } catch (e) { console.error('[cron] EdFi cron error:', e.message); }
});

// Canvas + Google Classroom grade sync — every 30 min during school hours
cron.schedule('*/30 7-17 * * 1-5', async () => {
  try {
    const schools = await query('SELECT id FROM schools');
    for (const s of schools.rows) {
      await syncCanvasGrades({ query }, s.id).catch(e =>
        console.error(`[cron] Canvas sync failed for school ${s.id}:`, e.message)
      );
      await syncGoogleClassroomGrades({ query }, s.id).catch(e =>
        console.error(`[cron] Google Classroom sync failed for school ${s.id}:`, e.message)
      );
    }
  } catch (e) { console.error('[cron] LMS sync cron error:', e.message); }
});

// Logistically Present check — every 5 min on school days 7am–3pm Eastern
cron.schedule('*/5 7-15 * * 1-5', async () => {
  try {
    const schools = await query('SELECT id FROM schools');
    for (const s of schools.rows) {
      await runInterventionCheck(s.id).catch(e =>
        console.error(`[cron] LP check failed for school ${s.id}:`, e.message)
      );
    }
  } catch (e) { console.error('[cron] LP cron error:', e.message); }
});

// Refresh sandbox demo bus data daily at midnight so LP demo stays current
cron.schedule('1 0 * * *', async () => {
  if (process.env.LOAD_SANDBOX !== 'true') return;
  try {
    const schools = await query("SELECT id FROM schools WHERE clever_id='sandbox_school_1'");
    for (const s of schools.rows) {
      await patchSandboxBusData(s.id).catch(e =>
        console.error('[cron] Demo bus refresh failed:', e.message)
      );
    }
  } catch (e) { console.error('[cron] Demo bus cron error:', e.message); }
});

// Data retention enforcement — runs nightly at 2am
cron.schedule('0 2 * * *', async () => {
  console.log('[cron] Running data retention enforcement...');
  try { await enforceRetentionPolicies(); }
  catch (e) { console.error('[cron] Retention error:', e.message); }
});

// ── Start ─────────────────────────────────────────────────────────────────────
async function patchSandboxBusData(schoolId) {
  // Ensure Marcus has a bus route, stop, and a board scan stamped to TODAY
  // Safe to call on every startup — upserts rather than skips

  const marcusR = await query(`SELECT id FROM students WHERE name='Marcus Johnson' AND school_id=$1`, [schoolId]);
  if (!marcusR.rows.length) return;
  const marcusId = marcusR.rows[0].id;

  // Create route if missing
  const routeR = await query(`
    INSERT INTO bus_routes (school_id, route_name, am_arrival_expected, pm_departure_expected)
    VALUES ($1, 'Route 12 — East Side', '07:45', '15:30')
    ON CONFLICT DO NOTHING RETURNING id
  `, [schoolId]);
  const routeId = routeR.rows.length
    ? routeR.rows[0].id
    : (await query(`SELECT id FROM bus_routes WHERE school_id=$1 LIMIT 1`, [schoolId])).rows[0].id;

  // Create stop if missing
  const stopR = await query(`
    INSERT INTO bus_stops (route_id, stop_name, stop_order, latitude, longitude)
    VALUES ($1, 'Cedar St & Salina St', 3, 43.0481, -76.1474)
    ON CONFLICT DO NOTHING RETURNING id
  `, [routeId]);
  const stopId = stopR.rows.length
    ? stopR.rows[0].id
    : (await query(`SELECT id FROM bus_stops WHERE route_id=$1 LIMIT 1`, [routeId])).rows[0].id;

  const today = new Date().toISOString().split('T')[0];

  // Delete any stale Marcus bus scans not from today, then insert today's scan
  await query(`DELETE FROM bus_scans WHERE student_id=$1 AND scanned_at::date != $2`, [marcusId, today]);
  await query(`
    INSERT INTO bus_scans (student_id, route_id, stop_id, scan_type, scanned_at)
    VALUES ($1, $2, $3, 'board', $4::date + INTERVAL '7 hours 30 minutes')
    ON CONFLICT DO NOTHING
  `, [marcusId, routeId, stopId, today]);

  // Ensure Marcus has no present attendance today so LP fires
  await query(`
    UPDATE attendance SET status='absent'
    WHERE student_id=$1 AND date=$2 AND status='present'
  `, [marcusId, today]);

  await query(`UPDATE students SET transport_status='on_bus' WHERE id=$1`, [marcusId]);
  console.log('[sandbox] Bus data refreshed for Marcus Johnson —', today);
}

async function start() {
  await initDb();
  if (process.env.LOAD_SANDBOX === 'true') {
    const schoolId = await loadSandboxData({ query });
    if (schoolId) {
      await patchSandboxBusData(schoolId).catch(console.error);
      await runInterventionCheck(schoolId).catch(console.error);
    }
  }
  app.listen(PORT, () => console.log(`SchoolBridge running on :${PORT}`));
}

start().catch(console.error);
