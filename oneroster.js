/**
 * OneRoster 1.1/2.0 sync — Students, Enrollments, Grades, Attendance
 * Supports PowerSchool, Infinite Campus, Skyward, Canvas, Aeries
 * Uses delta sync (last_synced_at) to avoid full pulls at scale.
 */

const { encrypt } = require('./crypto');

async function oneRosterGet(baseUrl, path, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`OneRoster ${res.status}: ${path}`);
  return res.json();
}

function sinceParam(lastSyncedAt) {
  if (!lastSyncedAt) return '';
  const iso = new Date(lastSyncedAt).toISOString();
  return `&filter=dateLastModified>='${iso.split('T')[0]}'`;
}

async function getLastSynced(db, schoolId, type) {
  const r = await db.query(
    `SELECT last_synced_at FROM sync_log WHERE school_id=$1 AND source='oneroster' AND type=$2
     AND status='ok' ORDER BY created_at DESC LIMIT 1`,
    [schoolId, type]
  );
  return r.rows[0]?.last_synced_at || null;
}

async function logSync(db, schoolId, type, count, error = null) {
  await db.query(
    `INSERT INTO sync_log (school_id, source, type, records_synced, last_synced_at, status, error)
     VALUES ($1,'oneroster',$2,$3,NOW(),$4,$5)`,
    [schoolId, type, count, error ? 'error' : 'ok', error || null]
  );
}

// Sync student roster from OneRoster
async function syncStudents(baseUrl, token, db, schoolId) {
  try {
    const last = await getLastSynced(db, schoolId, 'students');
    const data = await oneRosterGet(baseUrl, `/ims/oneroster/v1p1/students?limit=500${sinceParam(last)}`, token);
    const students = data.users || [];
    let count = 0;

    for (const s of students) {
      const name = encrypt(`${s.givenName} ${s.familyName}`.trim());
      await db.query(`
        INSERT INTO students (school_id, clever_id, name, grade, student_number)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (clever_id) DO UPDATE SET name=$3, grade=$4, student_number=$5
      `, [schoolId, s.sourcedId, name, s.grades?.[0] || null, s.identifier || null]);

      // Store external ID mapping
      await db.query(`
        INSERT INTO student_external_ids (student_id, system, external_id)
        SELECT id, 'oneroster', $2 FROM students WHERE clever_id=$1
        ON CONFLICT (student_id, system) DO UPDATE SET external_id=$2
      `, [s.sourcedId, s.sourcedId]);

      count++;
    }

    await logSync(db, schoolId, 'students', count);
    return count;
  } catch (e) {
    await logSync(db, schoolId, 'students', 0, e.message);
    throw e;
  }
}

// Sync class enrollments
async function syncEnrollments(baseUrl, token, db, schoolId) {
  try {
    const last = await getLastSynced(db, schoolId, 'enrollments');
    const data = await oneRosterGet(baseUrl, `/ims/oneroster/v1p1/enrollments?limit=500${sinceParam(last)}`, token);
    const enrollments = data.enrollments || [];
    let count = 0;

    for (const e of enrollments) {
      const stuR = await db.query('SELECT id FROM students WHERE clever_id=$1', [e.user?.sourcedId]);
      const secR = await db.query('SELECT id FROM sections WHERE clever_id=$1', [e.class?.sourcedId]);
      if (!stuR.rows[0] || !secR.rows[0]) continue;

      await db.query(`
        INSERT INTO section_students (section_id, student_id)
        VALUES ($1,$2) ON CONFLICT DO NOTHING
      `, [secR.rows[0].id, stuR.rows[0].id]);
      count++;
    }

    await logSync(db, schoolId, 'enrollments', count);
    return count;
  } catch (e) {
    await logSync(db, schoolId, 'enrollments', 0, e.message);
    throw e;
  }
}

// Sync grades (delta)
async function syncGrades(baseUrl, token, db, schoolId) {
  try {
    const last = await getLastSynced(db, schoolId, 'grades');
    const data = await oneRosterGet(baseUrl, `/ims/oneroster/v1p1/results?limit=500${sinceParam(last)}`, token);
    const results = data.results || [];
    let count = 0;

    for (const r of results) {
      const stu = await db.query('SELECT id FROM students WHERE clever_id=$1', [r.student?.sourcedId]);
      const sec = await db.query('SELECT id FROM sections WHERE clever_id=$1', [r.lineItem?.sourcedId]);
      if (!stu.rows[0] || !sec.rows[0]) continue;

      await db.query(`
        INSERT INTO grades (student_id, section_id, assignment_title, score, max_score, source, source_id, tier)
        VALUES ($1,$2,$3,$4,$5,'oneroster',$6,1)
        ON CONFLICT (source_id) DO UPDATE SET score=$4
      `, [stu.rows[0].id, sec.rows[0].id, r.lineItem?.title || 'Assignment', r.score, 100, r.sourcedId]);
      count++;
    }

    await logSync(db, schoolId, 'grades', count);
    return count;
  } catch (e) {
    await logSync(db, schoolId, 'grades', 0, e.message);
    throw e;
  }
}

// Sync attendance (delta — today only by default)
async function syncAttendance(baseUrl, token, db, schoolId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const data = await oneRosterGet(baseUrl, `/ims/oneroster/v1p1/attendances?filter=date='${today}'&limit=500`, token);
    const records = data.attendances || [];
    let count = 0;

    for (const a of records) {
      const stu = await db.query('SELECT id FROM students WHERE clever_id=$1', [a.student?.sourcedId]);
      if (!stu.rows[0]) continue;
      const status = a.attendanceCode === 'P' ? 'present'
        : a.attendanceCode === 'T' ? 'tardy'
        : a.attendanceCode === 'E' ? 'excused'
        : 'absent';
      await db.query(`
        INSERT INTO attendance (student_id, date, status, source, source_id, tier)
        VALUES ($1,$2,$3,'oneroster',$4,1)
        ON CONFLICT (student_id, date, section_id) DO UPDATE SET status=$3
      `, [stu.rows[0].id, a.date, status, a.sourcedId]);
      count++;
    }

    await logSync(db, schoolId, 'attendance', count);
    return count;
  } catch (e) {
    await logSync(db, schoolId, 'attendance', 0, e.message);
    throw e;
  }
}

// Full sync: students → enrollments → grades → attendance
async function runFullSync(db, schoolId) {
  const school = await db.query('SELECT oneroster_base_url FROM schools WHERE id=$1', [schoolId]);
  const baseUrl = school.rows[0]?.oneroster_base_url;
  const token = process.env.ONEROSTER_TOKEN;

  if (!baseUrl || !token) {
    console.log(`[oneroster] Skipping school ${schoolId} — no baseUrl or token configured`);
    return { skipped: true };
  }

  const results = {};
  results.students    = await syncStudents(baseUrl, token, db, schoolId);
  results.enrollments = await syncEnrollments(baseUrl, token, db, schoolId);
  results.grades      = await syncGrades(baseUrl, token, db, schoolId);
  results.attendance  = await syncAttendance(baseUrl, token, db, schoolId);

  console.log(`[oneroster] School ${schoolId} sync complete:`, results);
  return results;
}

module.exports = { syncStudents, syncEnrollments, syncGrades, syncAttendance, runFullSync };
