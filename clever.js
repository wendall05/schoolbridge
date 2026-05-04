// Clever API v3.0 integration
// Handles identity, relationships, SSO

const CLEVER_BASE = 'https://api.clever.com/v3.0';
const CLEVER_SANDBOX = 'https://api.clever.com/v3.0'; // sandbox uses same URL with sandbox token

async function cleverGet(path, token) {
  const res = await fetch(`${CLEVER_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Clever API ${res.status}: ${path}`);
  return res.json();
}

// Pull all students for a district token
async function syncStudents(token, db, schoolId) {
  const data = await cleverGet('/students?limit=100', token);
  const students = data.data || [];
  let count = 0;
  for (const s of students) {
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

// Pull teachers
async function syncTeachers(token, db, schoolId) {
  const data = await cleverGet('/teachers?limit=100', token);
  const teachers = data.data || [];
  let count = 0;
  for (const t of teachers) {
    const d = t.data;
    await db.query(`
      INSERT INTO users (school_id, clever_id, name, email, role)
      VALUES ($1,$2,$3,$4,'teacher')
      ON CONFLICT (clever_id) DO UPDATE SET name=$3, email=$4
      ON CONFLICT (email) DO NOTHING
    `, [schoolId, d.id, `${d.name.first} ${d.name.last}`, d.email]);
    count++;
  }
  return count;
}

// Pull sections (classes)
async function syncSections(token, db, schoolId) {
  const data = await cleverGet('/sections?limit=100', token);
  const sections = data.data || [];
  let count = 0;
  for (const s of sections) {
    const d = s.data;
    const teacher = await db.query('SELECT id FROM users WHERE clever_id=$1', [d.teacher]);
    const teacherId = teacher.rows[0]?.id || null;
    await db.query(`
      INSERT INTO sections (school_id, teacher_id, clever_id, name, subject, grade, source)
      VALUES ($1,$2,$3,$4,$5,$6,'clever')
      ON CONFLICT (clever_id) DO UPDATE SET name=$4, subject=$5
    `, [schoolId, teacherId, d.id, d.name, d.subject, d.grade]);

    // Enroll students
    for (const stuId of (d.students || [])) {
      const stu = await db.query('SELECT id FROM students WHERE clever_id=$1', [stuId]);
      if (stu.rows[0]) {
        const sec = await db.query('SELECT id FROM sections WHERE clever_id=$1', [d.id]);
        if (sec.rows[0]) {
          await db.query(`
            INSERT INTO section_students (section_id, student_id) VALUES ($1,$2)
            ON CONFLICT DO NOTHING
          `, [sec.rows[0].id, stu.rows[0].id]);
        }
      }
    }
    count++;
  }
  return count;
}

// Sandbox demo data for development (no real Clever token needed)
async function loadSandboxData(db) {
  // Insert demo school
  const school = await db.query(`
    INSERT INTO schools (name, district, clever_id)
    VALUES ('Lincoln Middle School', 'Syracuse City School District', 'sandbox_school_1')
    ON CONFLICT (clever_id) DO UPDATE SET name='Lincoln Middle School'
    RETURNING id
  `);
  const schoolId = school.rows[0].id;

  // Demo teachers
  const teachers = [
    { name: 'Mr. Thompson', email: 'thompson@lincoln.edu', subject: 'Math' },
    { name: 'Ms. Rivera', email: 'rivera@lincoln.edu', subject: 'Science' },
    { name: 'Mr. Johnson', email: 'johnson@lincoln.edu', subject: 'English' },
  ];
  const teacherIds = [];
  for (const t of teachers) {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('teacher123', 10);
    const r = await db.query(`
      INSERT INTO users (school_id, name, email, password_hash, role)
      VALUES ($1,$2,$3,$4,'teacher')
      ON CONFLICT (email) DO UPDATE SET name=$2 RETURNING id
    `, [schoolId, t.name, t.email, hash]);
    teacherIds.push({ id: r.rows[0].id, subject: t.subject });
  }

  // Demo students
  const studentNames = ['Marcus Johnson','Aaliyah Williams','Devon Carter','Zoe Martinez','Jaylen Brown'];
  const studentIds = [];
  for (const name of studentNames) {
    const r = await db.query(`
      INSERT INTO students (school_id, name, grade) VALUES ($1,$2,'7th')
      ON CONFLICT DO NOTHING RETURNING id
    `, [schoolId, name]);
    if (r.rows[0]) studentIds.push(r.rows[0].id);
  }

  // Demo parents
  const parentData = [
    { name: 'Sandra Johnson', email: 'parent@demo.com', child: 'Marcus Johnson' },
    { name: 'Rosa Williams', email: 'rosa@demo.com', child: 'Aaliyah Williams' },
  ];
  for (const p of parentData) {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('parent123', 10);
    const r = await db.query(`
      INSERT INTO users (school_id, name, email, password_hash, role)
      VALUES ($1,$2,$3,$4,'parent')
      ON CONFLICT (email) DO UPDATE SET name=$2 RETURNING id
    `, [schoolId, p.name, p.email, hash]);
    const parentId = r.rows[0].id;
    const stu = await db.query('SELECT id FROM students WHERE name=$1 AND school_id=$2', [p.child, schoolId]);
    if (stu.rows[0]) {
      await db.query('INSERT INTO parent_students VALUES ($1,$2) ON CONFLICT DO NOTHING', [parentId, stu.rows[0].id]);
    }
  }

  // Demo admin
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('admin123', 10);
  await db.query(`
    INSERT INTO users (school_id, name, email, password_hash, role)
    VALUES ($1,'Principal Davis','admin@lincoln.edu',$2,'admin')
    ON CONFLICT (email) DO NOTHING
  `, [schoolId, hash]);

  // Demo sections + attendance + grades
  const now = new Date();
  for (let i = 0; i < teacherIds.length; i++) {
    const sec = await db.query(`
      INSERT INTO sections (school_id, teacher_id, name, subject, grade, source)
      VALUES ($1,$2,$3,$4,'7th','demo')
      ON CONFLICT DO NOTHING RETURNING id
    `, [schoolId, teacherIds[i].id, `Period ${i+1} - ${teacherIds[i].subject}`, teacherIds[i].subject]);
    if (!sec.rows[0]) continue;
    const secId = sec.rows[0].id;

    for (const stuId of studentIds) {
      await db.query('INSERT INTO section_students VALUES ($1,$2) ON CONFLICT DO NOTHING', [secId, stuId]);

      // Last 10 days attendance
      for (let d = 9; d >= 0; d--) {
        const date = new Date(now); date.setDate(date.getDate() - d);
        if (date.getDay() === 0 || date.getDay() === 6) continue;
        const status = (stuId === studentIds[0] && d <= 2) ? (d === 1 ? 'absent' : d === 0 ? 'tardy' : 'present') : 'present';
        await db.query(`
          INSERT INTO attendance (student_id, section_id, date, status, source)
          VALUES ($1,$2,$3,$4,'demo') ON CONFLICT DO NOTHING
        `, [stuId, secId, date.toISOString().split('T')[0], status]);
      }

      // Demo grades
      const assignments = [
        { title: 'Chapter 5 Quiz', score: stuId === studentIds[0] ? 74 : 88, max: 100, days_ago: 1 },
        { title: 'Midterm Project', score: stuId === studentIds[0] ? 81 : 92, max: 100, days_ago: 5 },
        { title: 'Homework #12', score: stuId === studentIds[0] ? null : 95, max: 100, days_ago: 0, missing: stuId === studentIds[0] },
      ];
      for (const a of assignments) {
        const due = new Date(now); due.setDate(due.getDate() - a.days_ago);
        await db.query(`
          INSERT INTO grades (student_id, section_id, assignment_title, score, max_score, due_date, missing, source)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'demo') ON CONFLICT DO NOTHING
        `, [stuId, secId, a.title, a.score, a.max, due.toISOString().split('T')[0], a.missing || false]);
      }
    }
  }

  // Demo behavior for Marcus
  if (studentIds[0]) {
    await db.query(`
      INSERT INTO behavior_events (student_id, teacher_id, type, note, source, tier)
      VALUES ($1,$2,'concern','Disruptive in class, talking during instruction','classdojo',2)
      ON CONFLICT DO NOTHING
    `, [studentIds[0], teacherIds[0].id]);
  }

  console.log('Sandbox data loaded');
  return schoolId;
}

module.exports = { syncStudents, syncTeachers, syncSections, loadSandboxData };
