/**
 * EdFi API connector — state-mandated K-12 data standard
 * Supports Ed-Fi ODS/API v3.x (used by TX, WI, MN, IN, AZ and growing)
 * Auth: OAuth2 client_credentials (bearer token, refreshed automatically)
 */

const { encrypt } = require('./crypto');
const { query } = require('./db');

// Token cache per base URL
const tokenCache = new Map();

async function getToken(baseUrl) {
  const cached = tokenCache.get(baseUrl);
  if (cached && cached.expiresAt > Date.now() + 30000) return cached.token;

  const clientId = process.env.EDFI_CLIENT_ID;
  const clientSecret = process.env.EDFI_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('EDFI_CLIENT_ID and EDFI_CLIENT_SECRET required');

  const res = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`EdFi token failed: ${res.status}`);
  const data = await res.json();

  tokenCache.set(baseUrl, { token: data.access_token, expiresAt: Date.now() + (data.expires_in * 1000) });
  return data.access_token;
}

async function edfiGet(baseUrl, path, params = {}) {
  const token = await getToken(baseUrl);
  const url = new URL(`${baseUrl}/data/v3/ed-fi${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`EdFi ${res.status}: ${path}`);
  return res.json();
}

async function logSync(schoolId, type, count, error = null) {
  await query(
    `INSERT INTO sync_log (school_id, source, type, records_synced, last_synced_at, status, error)
     VALUES ($1,'edfi',$2,$3,NOW(),$4,$5)`,
    [schoolId, type, count, error ? 'error' : 'ok', error || null]
  );
}

// ── Students ──────────────────────────────────────────────────────────────────

async function syncStudents(baseUrl, db, schoolId) {
  try {
    // Get school's EdFi localEducationAgencyId
    const schoolR = await db.query('SELECT clever_id FROM schools WHERE id=$1', [schoolId]);
    const leaId = schoolR.rows[0]?.clever_id;

    const students = await edfiGet(baseUrl, '/students', { limit: 500 });
    let count = 0;

    for (const s of students) {
      const name = encrypt(`${s.firstName} ${s.lastSurname}`.trim());
      const studentNum = s.studentUniqueId;

      await db.query(`
        INSERT INTO students (school_id, name, student_number, grade)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (student_number) DO UPDATE SET name=$2, grade=$4
      `, [schoolId, name, studentNum, s.birthGradeWhenEnrolled || null]);

      // Store EdFi external ID
      await db.query(`
        INSERT INTO student_external_ids (student_id, system, external_id)
        SELECT id, 'edfi', $2 FROM students WHERE student_number=$1
        ON CONFLICT (student_id, system) DO UPDATE SET external_id=$2
      `, [studentNum, s.id]);

      count++;
    }

    await logSync(schoolId, 'students', count);
    return count;
  } catch (e) {
    await logSync(schoolId, 'students', 0, e.message);
    throw e;
  }
}

// ── Attendance ────────────────────────────────────────────────────────────────

async function syncAttendance(baseUrl, db, schoolId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const events = await edfiGet(baseUrl, '/studentAttendanceEvents', { eventDate: today, limit: 500 });
    let count = 0;

    for (const e of events) {
      const studentNum = e.studentReference?.studentUniqueId;
      if (!studentNum) continue;

      const stuR = await db.query('SELECT id FROM students WHERE student_number=$1', [studentNum]);
      if (!stuR.rows[0]) continue;

      // EdFi attendance codes: 'In Attendance', 'Excused Absence', 'Unexcused Absence', 'Tardy'
      const status = e.attendanceEventCategory === 'In Attendance' ? 'present'
        : e.attendanceEventCategory === 'Excused Absence' ? 'excused'
        : e.attendanceEventCategory === 'Tardy' ? 'tardy'
        : 'absent';

      await db.query(`
        INSERT INTO attendance (student_id, date, status, source, source_id, tier)
        VALUES ($1,$2,$3,'edfi',$4,1)
        ON CONFLICT (student_id, date, section_id) DO UPDATE SET status=$3
      `, [stuR.rows[0].id, e.eventDate, status, e.id]);
      count++;
    }

    await logSync(schoolId, 'attendance', count);
    return count;
  } catch (e) {
    await logSync(schoolId, 'attendance', 0, e.message);
    throw e;
  }
}

// ── Grades ────────────────────────────────────────────────────────────────────

async function syncGrades(baseUrl, db, schoolId) {
  try {
    const grades = await edfiGet(baseUrl, '/grades', { limit: 500 });
    let count = 0;

    for (const g of grades) {
      const studentNum = g.studentSectionAssociationReference?.studentUniqueId;
      if (!studentNum) continue;

      const stuR = await db.query('SELECT id FROM students WHERE student_number=$1', [studentNum]);
      if (!stuR.rows[0]) continue;

      const letterGrade = g.letterGradeEarned;
      const numericGrade = g.numericGradeEarned;

      await db.query(`
        INSERT INTO grades (student_id, assignment_title, score, max_score, letter_grade, source, source_id, tier)
        VALUES ($1,$2,$3,$4,$5,'edfi',$6,1)
        ON CONFLICT DO NOTHING
      `, [stuR.rows[0].id, g.gradeType || 'Grade', numericGrade, 100, letterGrade, g.id]);
      count++;
    }

    await logSync(schoolId, 'grades', count);
    return count;
  } catch (e) {
    await logSync(schoolId, 'grades', 0, e.message);
    throw e;
  }
}

// Full EdFi sync
async function runEdFiSync(db, schoolId) {
  const baseUrl = process.env.EDFI_BASE_URL;
  if (!baseUrl) {
    console.log(`[edfi] Skipping — EDFI_BASE_URL not configured`);
    return { skipped: true };
  }
  const results = {};
  results.students   = await syncStudents(baseUrl, db, schoolId);
  results.attendance = await syncAttendance(baseUrl, db, schoolId);
  results.grades     = await syncGrades(baseUrl, db, schoolId);
  console.log(`[edfi] School ${schoolId} sync complete:`, results);
  return results;
}

module.exports = { runEdFiSync, syncStudents, syncAttendance, syncGrades };
