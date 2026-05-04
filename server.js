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

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  store: new pgSession({ pool, tableName: 'session' }),
  secret: process.env.SESSION_SECRET || 'sb-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

const requireAuth = (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  next();
};
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.session.role)) return res.status(403).json({ error: 'Forbidden' });
  next();
};

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const r = await query('SELECT * FROM users WHERE email=$1', [email]);
    const user = r.rows[0];
    if (!user || !await bcrypt.compare(password, user.password_hash))
      return res.status(401).json({ error: 'Invalid email or password' });
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.schoolId = user.school_id;
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, consent_tier: user.consent_tier });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/auth/me', requireAuth, async (req, res) => {
  const r = await query('SELECT id,name,email,role,consent_tier,school_id FROM users WHERE id=$1', [req.session.userId]);
  res.json(r.rows[0]);
});

// ── Parent: Feed ──────────────────────────────────────────────────────────────

app.get('/api/feed', requireAuth, requireRole('parent'), async (req, res) => {
  try {
    const tier = req.session.consentTier || 3;
    const parentId = req.session.userId;

    // Get children
    const children = await query(`
      SELECT s.id, s.name, s.grade FROM students s
      JOIN parent_students ps ON ps.student_id = s.id
      WHERE ps.parent_id = $1
    `, [parentId]);

    const feed = [];

    for (const child of children.rows) {
      // Log data access
      await query(`INSERT INTO data_audit_log (parent_id, action, source, student_id) VALUES ($1,'feed_view','api',$2)`, [parentId, child.id]);

      // Attendance last 10 school days
      const attendance = await query(`
        SELECT date, status FROM attendance
        WHERE student_id=$1 AND tier <= $2
        ORDER BY date DESC LIMIT 10
      `, [child.id, tier]);

      // Recent grades
      const grades = await query(`
        SELECT g.assignment_title, g.score, g.max_score, g.letter_grade, g.missing,
               g.due_date, g.created_at, s.name as section_name, s.subject
        FROM grades g
        LEFT JOIN sections s ON s.id = g.section_id
        WHERE g.student_id=$1 AND g.tier <= $2
        ORDER BY g.created_at DESC LIMIT 10
      `, [child.id, tier]);

      // Upcoming assignments (not submitted, due in next 7 days)
      const upcoming = await query(`
        SELECT g.assignment_title, g.due_date, s.subject, s.name as section_name
        FROM grades g
        LEFT JOIN sections s ON s.id = g.section_id
        WHERE g.student_id=$1 AND g.submitted_at IS NULL
        AND g.due_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
        AND g.tier <= $2
        ORDER BY g.due_date ASC
      `, [child.id, tier]);

      // Behavior (tier 2+)
      const behavior = tier >= 2 ? await query(`
        SELECT type, note, created_at, source FROM behavior_events
        WHERE student_id=$1 ORDER BY created_at DESC LIMIT 5
      `, [child.id]) : { rows: [] };

      // Shadow messages (tier 3)
      const shadow = tier >= 3 ? await query(`
        SELECT platform, parsed_type, raw_text, created_at FROM shadow_messages
        WHERE student_id=$1 ORDER BY created_at DESC LIMIT 5
      `, [child.id]) : { rows: [] };

      // Unread alerts
      const alerts = await query(`
        SELECT id, priority, type, message, channels, created_at FROM alerts
        WHERE parent_id=$1 AND student_id=$2 AND read_at IS NULL
        ORDER BY priority DESC, created_at DESC
      `, [parentId, child.id]);

      feed.push({
        student: child,
        alerts: alerts.rows,
        attendance: attendance.rows,
        grades: grades.rows,
        upcoming: upcoming.rows,
        behavior: behavior.rows,
        shadow: shadow.rows,
      });
    }

    res.json(feed);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/alerts/:id/read', requireAuth, async (req, res) => {
  await query('UPDATE alerts SET read_at=NOW() WHERE id=$1 AND parent_id=$2', [req.params.id, req.session.userId]);
  res.json({ ok: true });
});

// ── Parent: Consent / Data Sovereignty ───────────────────────────────────────

app.get('/api/consent', requireAuth, async (req, res) => {
  const r = await query('SELECT consent_tier FROM users WHERE id=$1', [req.session.userId]);
  res.json({ tier: r.rows[0].consent_tier });
});

app.put('/api/consent', requireAuth, requireRole('parent'), async (req, res) => {
  const { tier } = req.body; // 1 = core only, 2 = +behavior, 3 = +shadow
  if (![1,2,3].includes(tier)) return res.status(400).json({ error: 'Invalid tier' });
  await query('UPDATE users SET consent_tier=$1 WHERE id=$2', [tier, req.session.userId]);
  req.session.consentTier = tier;

  // Purge higher-tier data if opting down
  if (tier < 3) await query('DELETE FROM shadow_messages WHERE parent_id=$1', [req.session.userId]);
  if (tier < 2) await query('DELETE FROM behavior_events WHERE student_id IN (SELECT student_id FROM parent_students WHERE parent_id=$1)', [req.session.userId]);

  await query('INSERT INTO data_audit_log (parent_id, action, source) VALUES ($1,\'consent_update\',\'settings\')', [req.session.userId]);
  res.json({ ok: true, tier });
});

app.get('/api/audit-log', requireAuth, async (req, res) => {
  const r = await query(`
    SELECT action, source, tier, created_at FROM data_audit_log
    WHERE parent_id=$1 ORDER BY created_at DESC LIMIT 50
  `, [req.session.userId]);
  res.json(r.rows);
});

// ── Messages ──────────────────────────────────────────────────────────────────

app.get('/api/messages', requireAuth, async (req, res) => {
  const r = await query(`
    SELECT m.*, u.name as from_name, u.role as from_role,
           s.name as student_name
    FROM messages m
    JOIN users u ON u.id = m.from_id
    LEFT JOIN students s ON s.id = m.student_id
    WHERE m.to_id=$1 OR m.from_id=$1
    ORDER BY m.created_at DESC LIMIT 50
  `, [req.session.userId]);
  res.json(r.rows);
});

app.post('/api/messages', requireAuth, async (req, res) => {
  const { to_id, student_id, content } = req.body;
  const r = await query(`
    INSERT INTO messages (from_id, to_id, student_id, content)
    VALUES ($1,$2,$3,$4) RETURNING *
  `, [req.session.userId, to_id, student_id, content]);
  res.json(r.rows[0]);
});

app.put('/api/messages/:id/read', requireAuth, async (req, res) => {
  await query('UPDATE messages SET read_at=NOW() WHERE id=$1 AND to_id=$2', [req.params.id, req.session.userId]);
  res.json({ ok: true });
});

// ── Teacher: Attendance ───────────────────────────────────────────────────────

app.get('/api/teacher/sections', requireAuth, requireRole('teacher','admin'), async (req, res) => {
  const r = await query(`
    SELECT sec.id, sec.name, sec.subject, sec.grade,
           COUNT(ss.student_id) as student_count
    FROM sections sec
    LEFT JOIN section_students ss ON ss.section_id = sec.id
    WHERE sec.teacher_id=$1 OR $2='admin'
    GROUP BY sec.id ORDER BY sec.name
  `, [req.session.userId, req.session.role]);
  res.json(r.rows);
});

app.get('/api/teacher/sections/:id/students', requireAuth, requireRole('teacher','admin'), async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const r = await query(`
    SELECT s.id, s.name, s.grade,
           a.status as today_status
    FROM students s
    JOIN section_students ss ON ss.student_id = s.id
    LEFT JOIN attendance a ON a.student_id = s.id AND a.date=$2 AND a.section_id=$1
    WHERE ss.section_id=$1
    ORDER BY s.name
  `, [req.params.id, today]);
  res.json(r.rows);
});

app.post('/api/teacher/attendance', requireAuth, requireRole('teacher','admin'), async (req, res) => {
  const { records } = req.body; // [{ student_id, section_id, date, status }]
  for (const r of records) {
    await query(`
      INSERT INTO attendance (student_id, section_id, date, status, source)
      VALUES ($1,$2,$3,$4,'direct')
      ON CONFLICT (student_id, date, section_id) DO UPDATE SET status=$4
    `, [r.student_id, r.section_id, r.date, r.status]);
  }
  // Run intervention check after attendance logged
  if (req.session.schoolId) {
    runInterventionCheck(req.session.schoolId).catch(console.error);
  }
  res.json({ ok: true, count: records.length });
});

app.post('/api/teacher/behavior', requireAuth, requireRole('teacher','admin'), async (req, res) => {
  const { student_id, section_id, type, note } = req.body;
  const r = await query(`
    INSERT INTO behavior_events (student_id, section_id, teacher_id, type, note, source, tier)
    VALUES ($1,$2,$3,$4,$5,'direct',2) RETURNING *
  `, [student_id, section_id, req.session.userId, type, note]);
  runInterventionCheck(req.session.schoolId).catch(console.error);
  res.json(r.rows[0]);
});

// ── Admin ─────────────────────────────────────────────────────────────────────

app.get('/api/admin/overview', requireAuth, requireRole('admin'), async (req, res) => {
  const schoolId = req.session.schoolId;
  const today = new Date().toISOString().split('T')[0];

  const [students, teachers, absentToday, alertsToday, syncs] = await Promise.all([
    query('SELECT COUNT(*) FROM students WHERE school_id=$1', [schoolId]),
    query("SELECT COUNT(*) FROM users WHERE school_id=$1 AND role='teacher'", [schoolId]),
    query("SELECT COUNT(DISTINCT student_id) FROM attendance WHERE date=$1 AND status='absent'", [today]),
    query('SELECT COUNT(*) FROM alerts WHERE created_at::date=$1::date', [today]),
    query('SELECT * FROM sync_log WHERE school_id=$1 ORDER BY created_at DESC LIMIT 10', [schoolId]),
  ]);

  res.json({
    students: parseInt(students.rows[0].count),
    teachers: parseInt(teachers.rows[0].count),
    absent_today: parseInt(absentToday.rows[0].count),
    alerts_today: parseInt(alertsToday.rows[0].count),
    syncs: syncs.rows,
  });
});

app.get('/api/admin/students', requireAuth, requireRole('admin'), async (req, res) => {
  const r = await query(`
    SELECT s.id, s.name, s.grade,
           COUNT(DISTINCT a.id) FILTER (WHERE a.status='absent') as absences,
           COUNT(DISTINCT g.id) FILTER (WHERE g.missing=true) as missing_assignments,
           MAX(al.created_at) as last_alert
    FROM students s
    LEFT JOIN attendance a ON a.student_id=s.id AND a.date >= NOW()-INTERVAL '30 days'
    LEFT JOIN grades g ON g.student_id=s.id
    LEFT JOIN alerts al ON al.student_id=s.id
    WHERE s.school_id=$1
    GROUP BY s.id ORDER BY absences DESC, missing_assignments DESC
  `, [req.session.schoolId]);
  res.json(r.rows);
});

app.post('/api/admin/sync', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const alerts = await runInterventionCheck(req.session.schoolId);
    res.json({ ok: true, alerts_created: alerts.length, alerts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Shadow IT ingest ──────────────────────────────────────────────────────────

app.post('/api/shadow/ingest', requireAuth, requireRole('parent'), async (req, res) => {
  const { platform, raw_text, student_id } = req.body;
  const tier = (await query('SELECT consent_tier FROM users WHERE id=$1', [req.session.userId])).rows[0]?.consent_tier;
  if (tier < 3) return res.status(403).json({ error: 'Shadow IT tier not enabled' });

  // Simple parser — detect type from text
  let parsed_type = 'general';
  if (/absent|attendance/i.test(raw_text)) parsed_type = 'attendance';
  else if (/behavior|conduct/i.test(raw_text)) parsed_type = 'behavior';
  else if (/grade|score|assignment/i.test(raw_text)) parsed_type = 'grade';
  else if (/remind|message/i.test(raw_text)) parsed_type = 'message';

  await query(`
    INSERT INTO shadow_messages (student_id, parent_id, platform, raw_text, parsed_type)
    VALUES ($1,$2,$3,$4,$5)
  `, [student_id, req.session.userId, platform, raw_text, parsed_type]);

  res.json({ ok: true, parsed_type });
});

// ── Clever OAuth ──────────────────────────────────────────────────────────────

app.get('/auth/clever', (req, res) => {
  const clientId = process.env.CLEVER_CLIENT_ID || 'demo';
  const redirect = `${process.env.APP_URL || 'http://localhost:3000'}/auth/clever/callback`;
  res.redirect(`https://clever.com/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}`);
});

app.get('/auth/clever/callback', async (req, res) => {
  // In production: exchange code for token, pull identity from Clever
  // For sandbox: redirect to demo login
  res.redirect('/?clever=sandbox');
});

// ── Catch-all ─────────────────────────────────────────────────────────────────

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Scheduled jobs ────────────────────────────────────────────────────────────

// Delta sync every 15 min during school hours
cron.schedule('*/15 7-16 * * 1-5', async () => {
  console.log('Running delta intervention check...');
  try {
    const schools = await query('SELECT id FROM schools');
    for (const s of schools.rows) {
      await runInterventionCheck(s.id);
    }
  } catch (e) { console.error('Cron error:', e.message); }
});

// ── Start ─────────────────────────────────────────────────────────────────────

async function start() {
  await initDb();
  if (process.env.LOAD_SANDBOX === 'true') {
    await loadSandboxData({ query });
  }
  app.listen(PORT, () => console.log(`SchoolBridge running on :${PORT}`));
}

start().catch(console.error);
