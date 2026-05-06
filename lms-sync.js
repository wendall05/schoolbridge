/**
 * LMS direct grade sync — Canvas and Google Classroom
 * Gets grades at the source (where teachers actually grade)
 * instead of waiting for OneRoster to pick them up second-hand.
 */

const { query } = require('./db');

// ── Canvas Grades API ─────────────────────────────────────────────────────────

async function canvasGet(domain, path, token) {
  const res = await fetch(`https://${domain}/api/v1${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Canvas ${res.status}: ${path}`);

  // Handle Canvas pagination (Link header)
  const data = await res.json();
  const linkHeader = res.headers.get('Link') || '';
  const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return { data, nextUrl: nextMatch ? nextMatch[1] : null };
}

async function canvasGetAll(domain, path, token) {
  const results = [];
  let url = path;
  while (url) {
    const { data, nextUrl } = await canvasGet(domain, url, token);
    results.push(...(Array.isArray(data) ? data : [data]));
    url = nextUrl ? nextUrl.replace(`https://${domain}/api/v1`, '') : null;
  }
  return results;
}

async function syncCanvasGrades(db, schoolId) {
  const domain = process.env.CANVAS_DOMAIN;
  const token  = process.env.CANVAS_API_TOKEN;
  if (!domain || !token) {
    console.log('[canvas] Skipping — CANVAS_DOMAIN or CANVAS_API_TOKEN not configured');
    return { skipped: true };
  }

  let totalCount = 0;

  try {
    // Get courses for this school
    const sections = await db.query(
      `SELECT id, lms_course_id FROM sections WHERE school_id=$1 AND lms_course_id IS NOT NULL`,
      [schoolId]
    );

    for (const section of sections.rows) {
      try {
        // Get assignments for course
        const assignments = await canvasGetAll(domain, `/courses/${section.lms_course_id}/assignments?per_page=100`, token);

        for (const assignment of assignments) {
          // Get submissions (student grades)
          const submissions = await canvasGetAll(domain,
            `/courses/${section.lms_course_id}/assignments/${assignment.id}/submissions?per_page=100&include[]=user`, token
          );

          for (const sub of submissions) {
            const studentCanvasId = sub.user_id?.toString();
            const stuR = await db.query(
              `SELECT s.id FROM students s
               JOIN student_external_ids sei ON sei.student_id=s.id
               WHERE sei.system='canvas' AND sei.external_id=$1`,
              [studentCanvasId]
            );
            if (!stuR.rows[0]) continue;

            const score = sub.score !== null ? parseFloat(sub.score) : null;
            const maxScore = parseFloat(assignment.points_possible) || 100;
            const missing = sub.missing === true;
            const dueDate = assignment.due_at ? new Date(assignment.due_at).toISOString().split('T')[0] : null;

            await db.query(`
              INSERT INTO grades
                (student_id, section_id, assignment_title, score, max_score, missing, due_date, submitted_at, source, source_id, tier)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'canvas',$9,1)
              ON CONFLICT (source_id) DO UPDATE SET score=$4, missing=$6
            `, [
              stuR.rows[0].id, section.id,
              assignment.name || 'Assignment',
              score, maxScore, missing, dueDate,
              sub.submitted_at || null,
              `canvas:${sub.id}`,
            ]);
            totalCount++;
          }
        }
      } catch (e) {
        console.error(`[canvas] Section ${section.id} sync error: ${e.message}`);
      }
    }

    await db.query(
      `INSERT INTO sync_log (school_id, source, type, records_synced, last_synced_at, status) VALUES ($1,'canvas','grades',$2,NOW(),'ok')`,
      [schoolId, totalCount]
    );
    return { count: totalCount };
  } catch (e) {
    await db.query(
      `INSERT INTO sync_log (school_id, source, type, status, error) VALUES ($1,'canvas','grades','error',$2)`,
      [schoolId, e.message]
    );
    throw e;
  }
}

// ── Google Classroom API ──────────────────────────────────────────────────────

async function googleGet(path, token) {
  const res = await fetch(`https://classroom.googleapis.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Google Classroom ${res.status}: ${path}`);
  return res.json();
}

async function syncGoogleClassroomGrades(db, schoolId, googleToken) {
  const token = googleToken || process.env.GOOGLE_CLASSROOM_TOKEN;
  if (!token) {
    console.log('[google-classroom] Skipping — GOOGLE_CLASSROOM_TOKEN not configured');
    return { skipped: true };
  }

  let totalCount = 0;

  try {
    const sections = await db.query(
      `SELECT id, lms_course_id FROM sections WHERE school_id=$1 AND lms_course_id IS NOT NULL`,
      [schoolId]
    );

    for (const section of sections.rows) {
      try {
        // Get coursework (assignments)
        const cwData = await googleGet(`/courses/${section.lms_course_id}/courseWork?pageSize=50`, token);
        const courseWorks = cwData.courseWork || [];

        for (const cw of courseWorks) {
          // Get student submissions
          const subsData = await googleGet(`/courses/${section.lms_course_id}/courseWork/${cw.id}/studentSubmissions?pageSize=100`, token);
          const submissions = subsData.studentSubmissions || [];

          for (const sub of submissions) {
            const googleUserId = sub.userId;
            const stuR = await db.query(
              `SELECT s.id FROM students s
               JOIN student_external_ids sei ON sei.student_id=s.id
               WHERE sei.system='google' AND sei.external_id=$1`,
              [googleUserId]
            );
            if (!stuR.rows[0]) continue;

            const score = sub.assignedGrade !== undefined ? parseFloat(sub.assignedGrade) : null;
            const maxScore = parseFloat(cw.maxPoints) || 100;
            const missing = sub.state === 'TURNED_IN' ? false : sub.state !== 'RETURNED';
            const dueDate = cw.dueDate ? `${cw.dueDate.year}-${String(cw.dueDate.month).padStart(2,'0')}-${String(cw.dueDate.day).padStart(2,'0')}` : null;
            const submittedAt = sub.submissionHistory?.slice(-1)[0]?.stateHistory?.stateTimestamp || null;

            await db.query(`
              INSERT INTO grades
                (student_id, section_id, assignment_title, score, max_score, missing, due_date, submitted_at, source, source_id, tier)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'google_classroom',$9,1)
              ON CONFLICT (source_id) DO UPDATE SET score=$4, missing=$6
            `, [
              stuR.rows[0].id, section.id,
              cw.title || 'Assignment',
              score, maxScore, missing, dueDate,
              submittedAt || null,
              `gc:${sub.id}`,
            ]);
            totalCount++;
          }
        }
      } catch (e) {
        console.error(`[google-classroom] Section ${section.id} error: ${e.message}`);
      }
    }

    await db.query(
      `INSERT INTO sync_log (school_id, source, type, records_synced, last_synced_at, status) VALUES ($1,'google_classroom','grades',$2,NOW(),'ok')`,
      [schoolId, totalCount]
    );
    return { count: totalCount };
  } catch (e) {
    await db.query(
      `INSERT INTO sync_log (school_id, source, type, status, error) VALUES ($1,'google_classroom','grades','error',$2)`,
      [schoolId, e.message]
    );
    throw e;
  }
}

module.exports = { syncCanvasGrades, syncGoogleClassroomGrades };
