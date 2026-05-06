// Clever API v3.0 integration + demo data

const CLEVER_BASE = 'https://api.clever.com/v3.0';

async function cleverGet(path, token) {
  const res = await fetch(`${CLEVER_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Clever API ${res.status}: ${path}`);
  return res.json();
}

async function syncStudents(token, db, schoolId) {
  const data = await cleverGet('/students?limit=100', token);
  let count = 0;
  for (const s of (data.data || [])) {
    const d = s.data;
    await db.query(`
      INSERT INTO students (school_id, clever_id, name, grade, student_number)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (clever_id) DO UPDATE SET name=$3, grade=$4
    `, [schoolId, d.id, `${d.name.first} ${d.name.last}`, d.grade, d.student_number]);
    count++;
  }
  return count;
}

async function syncTeachers(token, db, schoolId) {
  const data = await cleverGet('/teachers?limit=100', token);
  let count = 0;
  for (const t of (data.data || [])) {
    const d = t.data;
    await db.query(`
      INSERT INTO users (school_id, clever_id, name, email, role)
      VALUES ($1,$2,$3,$4,'teacher')
      ON CONFLICT (clever_id) DO UPDATE SET name=$3, email=$4
    `, [schoolId, d.id, `${d.name.first} ${d.name.last}`, d.email]);
    count++;
  }
  return count;
}

async function syncSections(token, db, schoolId) {
  const data = await cleverGet('/sections?limit=100', token);
  let count = 0;
  for (const s of (data.data || [])) {
    const d = s.data;
    const teacher = await db.query('SELECT id FROM users WHERE clever_id=$1', [d.teacher]);
    const teacherId = teacher.rows[0]?.id || null;
    const sec = await db.query(`
      INSERT INTO sections (school_id, teacher_id, clever_id, name, subject, grade, source)
      VALUES ($1,$2,$3,$4,$5,$6,'clever')
      ON CONFLICT (clever_id) DO UPDATE SET name=$4, subject=$5
      RETURNING id
    `, [schoolId, teacherId, d.id, d.name, d.subject, d.grade]);
    for (const stuClId of (d.students || [])) {
      const stu = await db.query('SELECT id FROM students WHERE clever_id=$1', [stuClId]);
      if (stu.rows[0]) {
        await db.query(`INSERT INTO section_students VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [sec.rows[0].id, stu.rows[0].id]);
      }
    }
    count++;
  }
  return count;
}

// ── Demo data ─────────────────────────────────────────────────────────────────
async function loadSandboxData(db) {
  const check = await db.query("SELECT id FROM schools WHERE clever_id='sandbox_school_1'");
  if (check.rows.length > 0) {
    console.log('Sandbox data already loaded');
    return check.rows[0].id;
  }

  const bcrypt = require('bcryptjs');

  // Helper: date string N calendar days from today
  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(12, 0, 0, 0);
    return d.toISOString().split('T')[0];
  }

  // Helper: ISO timestamp string
  function ts(dateStr, hour = 12) {
    return `${dateStr}T${String(hour).padStart(2,'0')}:00:00.000Z`;
  }

  // Helper: letter grade
  function letter(pct) {
    if (pct >= 93) return 'A'; if (pct >= 90) return 'A-';
    if (pct >= 87) return 'B+'; if (pct >= 83) return 'B'; if (pct >= 80) return 'B-';
    if (pct >= 77) return 'C+'; if (pct >= 73) return 'C'; if (pct >= 70) return 'C-';
    if (pct >= 67) return 'D+'; if (pct >= 60) return 'D';
    return 'F';
  }

  // Get 10 most recent school days (Mon–Fri), oldest first, index 9 = today
  function schoolDays(count = 10) {
    const days = [];
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    for (let i = 0; days.length < count; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      if (d.getDay() !== 0 && d.getDay() !== 6)
        days.unshift(d.toISOString().split('T')[0]);
      if (i > 25) break;
    }
    return days;
  }
  const DAYS = schoolDays(10); // DAYS[0] = oldest, DAYS[9] = today

  // ── 1. School ──────────────────────────────────────────────────────────────
  const schoolR = await db.query(`
    INSERT INTO schools (name, district, clever_id)
    VALUES ('Lincoln Middle School', 'Syracuse City School District', 'sandbox_school_1')
    RETURNING id
  `);
  const schoolId = schoolR.rows[0].id;

  // ── 2. Teachers ────────────────────────────────────────────────────────────
  const teacherPw = await bcrypt.hash('teacher123', 10);
  const teacherRows = [];
  for (const t of [
    { name: 'Mr. David Thompson', email: 'thompson@lincoln.edu', subject: 'Math' },
    { name: 'Ms. Carmen Rivera',  email: 'rivera@lincoln.edu',   subject: 'Science' },
    { name: 'Mr. Andre Johnson',  email: 'ajohnson@lincoln.edu', subject: 'English' },
  ]) {
    const r = await db.query(`
      INSERT INTO users (school_id, name, email, password_hash, role)
      VALUES ($1,$2,$3,$4,'teacher') RETURNING id
    `, [schoolId, t.name, t.email, teacherPw]);
    teacherRows.push({ id: r.rows[0].id, ...t });
  }

  // ── 3. Admin ───────────────────────────────────────────────────────────────
  const adminPw = await bcrypt.hash('admin123', 10);
  await db.query(`
    INSERT INTO users (school_id, name, email, password_hash, role)
    VALUES ($1,'Principal Angela Davis','admin@lincoln.edu',$2,'admin')
  `, [schoolId, adminPw]);

  // ── 4. Students ────────────────────────────────────────────────────────────
  // [0] Marcus  — CRITICAL: chronic absent + grade collapse
  // [1] Aaliyah — HIGH: A-student, first missing + grade dip
  // [2] Devon   — OK: model student, all A's
  // [3] Zoe     — WATCH: 2 absences, 1 missing, trending down
  // [4] Jaylen  — RECOVERING: was at-risk, now improving
  const stuRows = [];
  for (const name of ['Marcus Johnson','Aaliyah Williams','Devon Carter','Zoe Martinez','Jaylen Brown']) {
    const r = await db.query(`
      INSERT INTO students (school_id, name, grade) VALUES ($1,$2,'7th') RETURNING id
    `, [schoolId, name]);
    stuRows.push(r.rows[0].id);
  }

  // ── 5. Parents ─────────────────────────────────────────────────────────────
  const parentPw = await bcrypt.hash('parent123', 10);
  const parentRows = [];
  for (const p of [
    { name: 'Sandra Johnson', email: 'parent@demo.com', stuIdx: 0 },
    { name: 'Rosa Williams',  email: 'rosa@demo.com',   stuIdx: 1 },
  ]) {
    const r = await db.query(`
      INSERT INTO users (school_id, name, email, password_hash, role, consent_tier)
      VALUES ($1,$2,$3,$4,'parent',3) RETURNING id
    `, [schoolId, p.name, p.email, parentPw]);
    await db.query(`INSERT INTO parent_students VALUES ($1,$2)`, [r.rows[0].id, stuRows[p.stuIdx]]);
    parentRows.push(r.rows[0].id);
  }

  // ── 6. Sections ────────────────────────────────────────────────────────────
  const secRows = [];
  for (const [i, s] of [
    { name: 'Period 1 — 7th Grade Math',    subject: 'Math',    teachIdx: 0 },
    { name: 'Period 2 — 7th Grade Science', subject: 'Science', teachIdx: 1 },
    { name: 'Period 3 — 7th Grade English', subject: 'English', teachIdx: 2 },
  ].entries()) {
    const r = await db.query(`
      INSERT INTO sections (school_id, teacher_id, name, subject, grade, source)
      VALUES ($1,$2,$3,$4,'7th','demo') RETURNING id
    `, [schoolId, teacherRows[s.teachIdx].id, s.name, s.subject]);
    secRows.push(r.rows[0].id);
    for (const stuId of stuRows) {
      await db.query(`INSERT INTO section_students VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [r.rows[0].id, stuId]);
    }
  }

  // ── 7. Attendance ──────────────────────────────────────────────────────────
  // Patterns indexed by DAYS[0..9], values = status
  const attPatterns = [
    // Marcus  — 5 absences, 1 tardy, absent TODAY
    ['present','present','absent','present','absent','absent','present','absent','tardy','absent'],
    // Aaliyah — 1 tardy, otherwise perfect
    ['present','present','present','tardy','present','present','present','present','present','present'],
    // Devon   — perfect attendance
    ['present','present','present','present','present','present','present','present','present','present'],
    // Zoe     — 2 absences (mid and late week)
    ['present','present','present','present','absent','present','present','present','absent','present'],
    // Jaylen  — 2 absences early, then perfect (recovery)
    ['absent','present','absent','present','present','present','present','present','present','present'],
  ];
  for (let si = 0; si < stuRows.length; si++) {
    for (let di = 0; di < DAYS.length; di++) {
      const status = attPatterns[si][di] || 'present';
      await db.query(`
        INSERT INTO attendance (student_id, section_id, date, status, source)
        VALUES ($1,$2,$3,$4,'demo')
        ON CONFLICT (student_id, date, section_id) DO NOTHING
      `, [stuRows[si], secRows[0], DAYS[di], status]);
    }
  }

  // ── 8. Grades ──────────────────────────────────────────────────────────────
  // daysAgo > 0 = past assignment; 0 = today; < 0 = upcoming
  const gradeData = [
    // ── Marcus [0] — dramatic 22pt decline across Math, missed 3 assignments ──
    // Math
    [0,0,'Ch. 3 Test',              89,100, 18],
    [0,0,'Homework #11',            85,100, 12],
    [0,0,'Ch. 4 Quiz',              84,100, 10],
    [0,0,'Homework #12',            81,100,  8],
    [0,0,'Ch. 5 Quiz',              67,100,  4], // 22pt drop
    [0,0,'Homework #13',          null,100,  2, true],
    [0,0,'Homework #14',          null,100,  0, true],
    [0,0,'Ch. 6 Test',            null,100, -3],  // upcoming
    // Science
    [0,1,'Lab Report #1',           82,100, 15],
    [0,1,'Quiz 3 — Ecosystems',     71,100,  7],
    [0,1,'Lab Report #2',         null,100,  1, true],
    [0,1,'Science Presentation',  null,100, -5],  // upcoming
    // English
    [0,2,'Essay Draft',             79,100, 14],
    [0,2,'Vocabulary Test',         74,100,  6],
    [0,2,'Book Report',           null,100, -2],  // upcoming

    // ── Aaliyah [1] — A student slipping, first missing HW ────────────────────
    // Math
    [1,0,'Ch. 3 Test',              95,100, 18],
    [1,0,'Homework #11',            97,100, 12],
    [1,0,'Ch. 4 Quiz',              91,100, 10],
    [1,0,'Homework #12',            94,100,  8],
    [1,0,'Ch. 5 Quiz',              83,100,  4], // dip
    [1,0,'Homework #13',            88,100,  2],
    [1,0,'Homework #14',          null,100,  0, true], // first missing!
    [1,0,'Ch. 6 Test',            null,100, -3],
    // Science
    [1,1,'Lab Report #1',           94,100, 15],
    [1,1,'Quiz 3 — Ecosystems',     89,100,  7],
    [1,1,'Lab Report #2',           91,100,  1],
    [1,1,'Science Presentation',  null,100, -5],
    // English
    [1,2,'Essay Draft',             96,100, 14],
    [1,2,'Vocabulary Test',         92,100,  6],
    [1,2,'Book Report',           null,100, -2],

    // ── Devon [2] — model student, all A's ─────────────────────────────────────
    [2,0,'Ch. 3 Test',              98,100, 18],
    [2,0,'Homework #11',           100,100, 12],
    [2,0,'Ch. 4 Quiz',              96,100, 10],
    [2,0,'Homework #12',            99,100,  8],
    [2,0,'Ch. 5 Quiz',              94,100,  4],
    [2,0,'Homework #13',           100,100,  2],
    [2,0,'Homework #14',            97,100,  0],
    [2,1,'Lab Report #1',           99,100, 15],
    [2,1,'Quiz 3 — Ecosystems',     95,100,  7],
    [2,1,'Lab Report #2',           98,100,  1],
    [2,2,'Essay Draft',             97,100, 14],
    [2,2,'Vocabulary Test',        100,100,  6],

    // ── Zoe [3] — early warning, grades drifting down ─────────────────────────
    [3,0,'Ch. 3 Test',              87,100, 18],
    [3,0,'Ch. 4 Quiz',              82,100, 10],
    [3,0,'Ch. 5 Quiz',              79,100,  4],
    [3,0,'Homework #13',          null,100,  2, true],
    [3,0,'Homework #14',            85,100,  0],
    [3,1,'Lab Report #1',           85,100, 15],
    [3,1,'Quiz 3 — Ecosystems',     80,100,  7],
    [3,1,'Lab Report #2',           83,100,  1],
    [3,2,'Essay Draft',             88,100, 14],
    [3,2,'Vocabulary Test',         84,100,  6],

    // ── Jaylen [4] — recovering, trend is UP ─────────────────────────────────
    [4,0,'Ch. 3 Test',              72,100, 18],
    [4,0,'Ch. 4 Quiz',              81,100, 10], // improving
    [4,0,'Ch. 5 Quiz',              86,100,  4], // better
    [4,0,'Homework #13',            90,100,  2],
    [4,0,'Homework #14',            88,100,  0],
    [4,1,'Lab Report #1',           71,100, 15],
    [4,1,'Quiz 3 — Ecosystems',     80,100,  7],
    [4,1,'Lab Report #2',           85,100,  1],
    [4,2,'Essay Draft',             75,100, 14],
    [4,2,'Vocabulary Test',         82,100,  6],
  ];

  for (const [si, seci, title, score, max, daysBefore, isMissing] of gradeData) {
    const dueDate = daysAgo(daysBefore);
    const created = ts(daysAgo(Math.max(0, daysBefore)));
    const isUpcoming = daysBefore < 0;
    const missing = isMissing === true;
    const submittedAt = score !== null && !isUpcoming ? ts(dueDate, 16) : null;
    const ltr = score !== null ? letter(score / max * 100) : null;
    await db.query(`
      INSERT INTO grades
        (student_id, section_id, assignment_title, score, max_score, letter_grade,
         due_date, submitted_at, missing, source, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'demo',$10)
    `, [stuRows[si], secRows[seci], title, score, max, ltr, dueDate, submittedAt, missing, created]);
  }

  // ── 9. Behavior Events ─────────────────────────────────────────────────────
  const behaviors = [
    // Marcus — escalating concerns
    [0,0,0,'concern', 'Marcus refused to participate in the group activity and disrupted two other groups. Removed from classroom for 10 minutes. This is his third incident this month.', 0],
    [0,1,1,'concern', 'Marcus left Science class without permission during the lab setup. Found in the hallway. Second unauthorized absence from class this week.', 3],
    [0,2,0,'concern', 'Marcus arrived without homework materials and appeared withdrawn. Attempted to re-engage him but he put his head down. Recommend counselor follow-up.', 7],
    // Devon — positive
    [2,0,0,'positive', 'Devon tutored three classmates on the quadratic formula during free period without being asked. Exceptional peer leadership — recommend for Honor Roll recognition.', 0],
    // Jaylen — recovery
    [4,1,0,'positive', "Jaylen's improvement this week has been remarkable. Participated actively in every class discussion and scored 86 on the Chapter 5 quiz — up from 72 on Chapter 3. Keep encouraging him.", 1],
    // Aaliyah — neutral observation
    [1,0,0,'neutral', 'Aaliyah seemed distracted today and needed reminders to stay on task. Out of character for her — will monitor. No action needed yet.', 2],
  ];
  for (const [si, ti, seci, type, note, da] of behaviors) {
    await db.query(`
      INSERT INTO behavior_events (student_id, section_id, teacher_id, type, note, source, tier, created_at)
      VALUES ($1,$2,$3,$4,$5,'demo',2,$6)
    `, [stuRows[si], secRows[seci], teacherRows[ti].id, type, note, ts(daysAgo(da), 10)]);
  }

  // ── 10. Shadow Messages (Tier 3 — Remind / ClassDojo) ─────────────────────
  const shadows = [
    [0, 0, 'Remind',
     'Hi Sandra, this is Mr. Thompson (Period 1 Math). Marcus missed his quiz makeup today and his grade has dropped significantly. Can we schedule a call? I have office hours Tue & Thu 3–4pm. — D. Thompson, Lincoln MS',
     'grade', 0],
    [0, 0, 'ClassDojo',
     'ClassDojo Report for Marcus Johnson: Marcus received a behavior point today for disrupting class during the group project. He now has 3 behavior points this week. Tap to view the full report and leave a comment.',
     'behavior', 0],
    [0, 0, 'Remind',
     "Reminder from Ms. Rivera (Period 2 Science): Lab Report #2 was due yesterday and hasn't been submitted. This assignment counts for 15% of the quarter grade. Please have Marcus submit it by Friday to avoid a zero. — C. Rivera",
     'grade', 1],
  ];
  for (const [si, pi, platform, text, ptype, da] of shadows) {
    await db.query(`
      INSERT INTO shadow_messages (student_id, parent_id, platform, raw_text, parsed_type, tier, created_at)
      VALUES ($1,$2,$3,$4,$5,3,$6)
    `, [stuRows[si], parentRows[pi], platform, text, ptype, ts(daysAgo(da), 9)]);
  }

  // ── 11. Pre-seeded Alerts ─────────────────────────────────────────────────
  // Sandra (Marcus) — crisis-level alerts
  await db.query(`INSERT INTO alerts (parent_id, student_id, priority, type, message, channels, created_at) VALUES ($1,$2,'critical','intervention',$3,'{in-app,push,sms,email}',$4)`,
    [parentRows[0], stuRows[0],
     'URGENT: Marcus has been absent 4 of the last 8 school days and has 3 missing assignments across two classes. This pattern signals early chronic absenteeism. Counselor Ms. Okafor has been notified. Please call the school: (315) 555-0182.',
     ts(daysAgo(1), 8)]);

  await db.query(`INSERT INTO alerts (parent_id, student_id, priority, type, message, channels, created_at) VALUES ($1,$2,'high','intervention',$3,'{in-app,push}',$4)`,
    [parentRows[0], stuRows[0],
     "Marcus's Math grade has dropped from 89% to 67% in 8 days — a 22-point decline. Mr. Thompson has requested a parent-teacher conference. Please respond at your convenience.",
     ts(daysAgo(3), 8)]);

  // Rosa (Aaliyah) — early warning
  await db.query(`INSERT INTO alerts (parent_id, student_id, priority, type, message, channels, created_at) VALUES ($1,$2,'high','intervention',$3,'{in-app,push}',$4)`,
    [parentRows[1], stuRows[1],
     "Aaliyah has her first missing assignment this semester (Math Homework #14). Her Math average has declined from 95% to 83% over the past two weeks. A quick check-in may help get her back on track.",
     ts(daysAgo(0), 8)]);

  // ── 12. Messages (Inbox) ──────────────────────────────────────────────────
  await db.query(`INSERT INTO messages (from_id, to_id, student_id, content, created_at) VALUES ($1,$2,$3,$4,$5)`,
    [teacherRows[0].id, parentRows[0], stuRows[0],
     "Hi Sandra, I wanted to reach out personally about Marcus. His test scores have dropped significantly, he missed his quiz makeup yesterday, and the absences are really adding up. I've never seen him struggle like this. I'd love to connect before this gets worse — I have office hours Tuesday and Thursday 3–4pm. Would either work for a call? — David Thompson",
     ts(daysAgo(1), 14)]);

  await db.query(`INSERT INTO messages (from_id, to_id, student_id, content, created_at) VALUES ($1,$2,$3,$4,$5)`,
    [teacherRows[1].id, parentRows[0], stuRows[0],
     "Mrs. Johnson, this is Ms. Rivera from 7th Grade Science. Marcus's Lab Report #2 (worth 15% of his quarter grade) was due yesterday and hasn't been turned in. His current Science grade is 71%. I can accept the lab without penalty through Friday — please have him submit it. — C. Rivera",
     ts(daysAgo(2), 11)]);

  // ── 13. Sync Log ──────────────────────────────────────────────────────────
  const syncEntries = [
    ['Clever',    'students',   5, 'ok',  2],
    ['Clever',    'sections',   3, 'ok',  2],
    ['OneRoster', 'grades',    47, 'ok',  3],
    ['OneRoster', 'attendance',50, 'ok',  5],
    ['Clever',    'students',   5, 'ok', 17],
    ['OneRoster', 'grades',    44, 'ok', 18],
    ['OneRoster', 'attendance',48, 'ok', 20],
  ];
  for (const [source, type, records, status, minsAgo] of syncEntries) {
    await db.query(`
      INSERT INTO sync_log (school_id, source, type, records_synced, status, created_at)
      VALUES ($1,$2,$3,$4,$5, NOW() - $6 * INTERVAL '1 minute')
    `, [schoolId, source, type, records, status, minsAgo]);
  }

  // Demo bus data — Marcus is scanned on bus (on_bus status)
  const busRouteR = await db.query(`
    INSERT INTO bus_routes (school_id, route_name, am_arrival_expected, pm_departure_expected)
    VALUES ($1, 'Route 12 — East Side', '07:45', '15:30')
    ON CONFLICT DO NOTHING RETURNING id
  `, [schoolId]);

  if (busRouteR.rows.length > 0) {
    const routeId = busRouteR.rows[0].id;
    const stopR = await db.query(`
      INSERT INTO bus_stops (route_id, stop_name, stop_order, latitude, longitude)
      VALUES ($1, 'Cedar St & Salina St', 3, 43.0481, -76.1474)
      RETURNING id
    `, [routeId]);
    const stopId = stopR.rows[0].id;

    // Marcus scanned boarding the bus this morning
    await db.query(`
      INSERT INTO bus_scans (student_id, route_id, stop_id, scan_type, scanned_at)
      VALUES ($1, $2, $3, 'board', NOW() - INTERVAL '45 minutes')
    `, [stuRows[0], routeId, stopId]);

    await db.query(`UPDATE students SET transport_status='on_bus' WHERE id=$1`, [stuRows[0]]);
  }

  console.log('✓ Sandbox loaded — Lincoln Middle School demo ready');
  return schoolId;
}

module.exports = { syncStudents, syncTeachers, syncSections, loadSandboxData };
