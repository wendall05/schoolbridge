const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const query = (text, params) => pool.query(text, params);

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schools (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      district TEXT,
      clever_id TEXT UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      school_id INT REFERENCES schools(id),
      clever_id TEXT UNIQUE,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL CHECK (role IN ('parent','teacher','admin')),
      phone TEXT,
      consent_tier INT DEFAULT 3,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      school_id INT REFERENCES schools(id),
      clever_id TEXT UNIQUE,
      name TEXT NOT NULL,
      grade TEXT,
      student_number TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS parent_students (
      parent_id INT REFERENCES users(id) ON DELETE CASCADE,
      student_id INT REFERENCES students(id) ON DELETE CASCADE,
      PRIMARY KEY (parent_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS sections (
      id SERIAL PRIMARY KEY,
      school_id INT REFERENCES schools(id),
      teacher_id INT REFERENCES users(id),
      clever_id TEXT UNIQUE,
      name TEXT NOT NULL,
      subject TEXT,
      grade TEXT,
      source TEXT DEFAULT 'oneroster',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS section_students (
      section_id INT REFERENCES sections(id) ON DELETE CASCADE,
      student_id INT REFERENCES students(id) ON DELETE CASCADE,
      PRIMARY KEY (section_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      student_id INT REFERENCES students(id) ON DELETE CASCADE,
      section_id INT REFERENCES sections(id),
      date DATE NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('present','absent','tardy','excused')),
      source TEXT DEFAULT 'oneroster',
      source_id TEXT,
      tier INT DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (student_id, date, section_id)
    );

    CREATE TABLE IF NOT EXISTS grades (
      id SERIAL PRIMARY KEY,
      student_id INT REFERENCES students(id) ON DELETE CASCADE,
      section_id INT REFERENCES sections(id) ON DELETE CASCADE,
      assignment_title TEXT,
      score NUMERIC,
      max_score NUMERIC,
      letter_grade TEXT,
      category TEXT,
      due_date DATE,
      submitted_at TIMESTAMPTZ,
      missing BOOLEAN DEFAULT FALSE,
      source TEXT DEFAULT 'oneroster',
      source_id TEXT,
      tier INT DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS behavior_events (
      id SERIAL PRIMARY KEY,
      student_id INT REFERENCES students(id) ON DELETE CASCADE,
      section_id INT REFERENCES sections(id),
      teacher_id INT REFERENCES users(id),
      type TEXT CHECK (type IN ('positive','neutral','concern')),
      note TEXT,
      source TEXT DEFAULT 'direct',
      source_id TEXT,
      tier INT DEFAULT 2,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS shadow_messages (
      id SERIAL PRIMARY KEY,
      student_id INT REFERENCES students(id),
      parent_id INT REFERENCES users(id),
      platform TEXT NOT NULL,
      raw_text TEXT,
      parsed_type TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      tier INT DEFAULT 3
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY,
      parent_id INT REFERENCES users(id) ON DELETE CASCADE,
      student_id INT REFERENCES students(id) ON DELETE CASCADE,
      priority TEXT NOT NULL CHECK (priority IN ('low','high','critical')),
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      channels TEXT[],
      read_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      from_id INT REFERENCES users(id),
      to_id INT REFERENCES users(id),
      student_id INT REFERENCES students(id),
      content TEXT NOT NULL,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS data_audit_log (
      id SERIAL PRIMARY KEY,
      parent_id INT REFERENCES users(id),
      action TEXT NOT NULL,
      source TEXT,
      tier INT,
      student_id INT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id SERIAL PRIMARY KEY,
      school_id INT REFERENCES schools(id),
      source TEXT NOT NULL,
      type TEXT NOT NULL,
      records_synced INT DEFAULT 0,
      status TEXT DEFAULT 'ok',
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('Database initialized');
}

module.exports = { query, pool, initDb };
