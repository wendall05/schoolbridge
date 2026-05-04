// OneRoster 1.2 sync — grades and attendance from SIS
// Supports PowerSchool, Infinite Campus, Skyward, Canvas

async function oneRosterGet(baseUrl, path, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    }
  });
  if (!res.ok) throw new Error(`OneRoster ${res.status}: ${path}`);
  return res.json();
}

async function syncGrades(baseUrl, token, db, schoolId) {
  try {
    const data = await oneRosterGet(baseUrl, '/ims/oneroster/v1p1/results?limit=200', token);
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
    await db.query(`INSERT INTO sync_log (school_id, source, type, records_synced) VALUES ($1,'oneroster','grades',$2)`, [schoolId, count]);
    return count;
  } catch (e) {
    await db.query(`INSERT INTO sync_log (school_id, source, type, status, error) VALUES ($1,'oneroster','grades','error',$2)`, [schoolId, e.message]);
    throw e;
  }
}

async function syncAttendance(baseUrl, token, db, schoolId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const data = await oneRosterGet(baseUrl, `/ims/oneroster/v1p1/attendances?filter=date='${today}'&limit=200`, token);
    const records = data.attendances || [];
    let count = 0;
    for (const a of records) {
      const stu = await db.query('SELECT id FROM students WHERE clever_id=$1', [a.student?.sourcedId]);
      if (!stu.rows[0]) continue;
      const status = a.attendanceCode === 'P' ? 'present' : a.attendanceCode === 'T' ? 'tardy' : a.attendanceCode === 'E' ? 'excused' : 'absent';
      await db.query(`
        INSERT INTO attendance (student_id, date, status, source, source_id, tier)
        VALUES ($1,$2,$3,'oneroster',$4,1)
        ON CONFLICT (student_id, date, section_id) DO UPDATE SET status=$3
      `, [stu.rows[0].id, a.date, status, a.sourcedId]);
      count++;
    }
    await db.query(`INSERT INTO sync_log (school_id, source, type, records_synced) VALUES ($1,'oneroster','attendance',$2)`, [schoolId, count]);
    return count;
  } catch (e) {
    await db.query(`INSERT INTO sync_log (school_id, source, type, status, error) VALUES ($1,'oneroster','attendance','error',$2)`, [schoolId, e.message]);
    throw e;
  }
}

module.exports = { syncGrades, syncAttendance };
