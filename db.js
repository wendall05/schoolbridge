const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const query = (text, params) => pool.query(text, params);

async function initDb() {
  await pool.query(`
    -- ── Districts (top-level tenant isolation) ───────────────────────────────
    CREATE TABLE IF NOT EXISTS districts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      state TEXT,
      nces_id TEXT UNIQUE,
      contact_email TEXT,
      -- Intervention rule overrides (null = use platform defaults)
      rule_absence_watch INT DEFAULT 1,
      rule_absence_high INT DEFAULT 2,
      rule_absence_critical INT DEFAULT 3,
      rule_missing_watch INT DEFAULT 1,
      rule_missing_high INT DEFAULT 2,
      -- Retention policy (days; 0 = keep forever)
      retention_days_grades INT DEFAULT 1825,
      retention_days_behavior INT DEFAULT 365,
      retention_days_shadow INT DEFAULT 90,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ── Schools ───────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS schools (
      id SERIAL PRIMARY KEY,
      district_id INT REFERENCES districts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      district TEXT,
      clever_id TEXT UNIQUE,
      oneroster_base_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ── Users (name/email/phone stored encrypted) ────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      school_id INT REFERENCES schools(id),
      clever_id TEXT UNIQUE,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL CHECK (role IN ('parent','teacher','admin','district_admin')),
      phone TEXT,
      consent_tier INT DEFAULT 3,
      iep_access BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ── Students (name stored encrypted) ─────────────────────────────────────
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      school_id INT REFERENCES schools(id),
      clever_id TEXT UNIQUE,
      name TEXT NOT NULL,
      grade TEXT,
      student_number TEXT,
      -- IEP/504 flags
      has_iep BOOLEAN DEFAULT FALSE,
      has_504 BOOLEAN DEFAULT FALSE,
      accommodation_notes TEXT,
      -- Logistically Present state
      transport_status TEXT CHECK (transport_status IN ('home','on_bus','at_school','unknown')) DEFAULT 'unknown',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ── External IDs (maps students to legacy SIS IDs) ───────────────────────
    CREATE TABLE IF NOT EXISTS student_external_ids (
      id SERIAL PRIMARY KEY,
      student_id INT REFERENCES students(id) ON DELETE CASCADE,
      system TEXT NOT NULL CHECK (system IN ('powerschool','infinite_campus','skyward','aeries','synergy','edfi','clever','oneroster')),
      external_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (student_id, system)
    );

    -- ── Parent-Student links ──────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS parent_students (
      parent_id INT REFERENCES users(id) ON DELETE CASCADE,
      student_id INT REFERENCES students(id) ON DELETE CASCADE,
      PRIMARY KEY (parent_id, student_id)
    );

    -- ── Sections ──────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS sections (
      id SERIAL PRIMARY KEY,
      school_id INT REFERENCES schools(id),
      teacher_id INT REFERENCES users(id),
      clever_id TEXT UNIQUE,
      name TEXT NOT NULL,
      subject TEXT,
      grade TEXT,
      source TEXT DEFAULT 'oneroster',
      lms_course_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS section_students (
      section_id INT REFERENCES sections(id) ON DELETE CASCADE,
      student_id INT REFERENCES students(id) ON DELETE CASCADE,
      PRIMARY KEY (section_id, student_id)
    );

    -- ── Attendance ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      student_id INT REFERENCES students(id) ON DELETE CASCADE,
      section_id INT REFERENCES sections(id),
      date DATE NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('present','absent','tardy','excused','logistically_present')),
      source TEXT DEFAULT 'oneroster',
      source_id TEXT,
      tier INT DEFAULT 1,
      justification TEXT,
      justification_submitted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (student_id, date, section_id)
    );

    -- ── Grades ────────────────────────────────────────────────────────────────
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

    -- ── Behavior ──────────────────────────────────────────────────────────────
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

    -- ── Shadow messages ───────────────────────────────────────────────────────
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

    -- ── Alerts ────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY,
      parent_id INT REFERENCES users(id) ON DELETE CASCADE,
      student_id INT REFERENCES students(id) ON DELETE CASCADE,
      priority TEXT NOT NULL CHECK (priority IN ('low','high','critical')),
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      channels TEXT[],
      sms_sent BOOLEAN DEFAULT FALSE,
      read_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ── Messages ──────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      from_id INT REFERENCES users(id),
      to_id INT REFERENCES users(id),
      student_id INT REFERENCES students(id),
      content TEXT NOT NULL,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ── Audit / FERPA ─────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS data_audit_log (
      id SERIAL PRIMARY KEY,
      parent_id INT REFERENCES users(id),
      action TEXT NOT NULL,
      source TEXT,
      tier INT,
      student_id INT,
      ip_address TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- FERPA / SOPPA / PPRA: rights requests and student deletion records
    CREATE TABLE IF NOT EXISTS ferpa_requests (
      id SERIAL PRIMARY KEY,
      district_id INT REFERENCES districts(id),
      school_id INT REFERENCES schools(id),
      student_id INT,
      request_type TEXT NOT NULL CHECK (request_type IN ('disclosure','deletion','correction','portability','inspection','opt_out')),
      regulation TEXT DEFAULT 'FERPA' CHECK (regulation IN ('FERPA','SOPPA','COPPA','PPRA','CIPA')),
      requested_by TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','denied')),
      notes TEXT,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- COPPA 2.0: parental consent records for users under 16
    CREATE TABLE IF NOT EXISTS coppa_consents (
      id SERIAL PRIMARY KEY,
      parent_id INT REFERENCES users(id) ON DELETE CASCADE,
      student_id INT REFERENCES students(id) ON DELETE CASCADE,
      consent_given BOOLEAN NOT NULL DEFAULT FALSE,
      consent_method TEXT CHECK (consent_method IN ('email','signed_form','digital_signature','school_verified')),
      data_categories TEXT[], -- what data types were consented to
      ip_address TEXT,
      consented_at TIMESTAMPTZ,
      withdrawn_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (parent_id, student_id)
    );

    -- SOPPA: Data Processing Agreements with districts
    CREATE TABLE IF NOT EXISTS data_processing_agreements (
      id SERIAL PRIMARY KEY,
      district_id INT REFERENCES districts(id),
      signed_by TEXT NOT NULL,
      signed_at TIMESTAMPTZ NOT NULL,
      agreement_version TEXT NOT NULL DEFAULT '1.0',
      -- Key SOPPA provisions
      no_sell_confirmed BOOLEAN DEFAULT TRUE,
      no_behavioral_ads_confirmed BOOLEAN DEFAULT TRUE,
      security_program_confirmed BOOLEAN DEFAULT TRUE,
      deletion_on_contract_end_confirmed BOOLEAN DEFAULT TRUE,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- SOPPA / FERPA: Breach notification tracking (72-hour requirement)
    CREATE TABLE IF NOT EXISTS breach_notifications (
      id SERIAL PRIMARY KEY,
      district_id INT REFERENCES districts(id),
      detected_at TIMESTAMPTZ NOT NULL,
      notified_at TIMESTAMPTZ,
      affected_records_count INT,
      data_types_affected TEXT[],
      description TEXT,
      remediation TEXT,
      status TEXT DEFAULT 'detected' CHECK (status IN ('detected','investigating','notified','resolved')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- PPRA: Parental opt-out tracking for surveys/evaluations
    CREATE TABLE IF NOT EXISTS ppra_opt_outs (
      id SERIAL PRIMARY KEY,
      parent_id INT REFERENCES users(id) ON DELETE CASCADE,
      student_id INT REFERENCES students(id) ON DELETE CASCADE,
      activity_type TEXT NOT NULL CHECK (activity_type IN ('survey','evaluation','analysis','marketing')),
      opted_out_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (parent_id, student_id, activity_type)
    );

    -- Encryption key rotation log (NIST SP 800-57 compliance)
    CREATE TABLE IF NOT EXISTS encryption_key_rotations (
      id SERIAL PRIMARY KEY,
      key_version INT NOT NULL,
      rotated_at TIMESTAMPTZ DEFAULT NOW(),
      rotated_by TEXT,
      records_re_encrypted INT DEFAULT 0,
      status TEXT DEFAULT 'completed'
    );

    -- ── Transportation (Bus-to-Classroom) ─────────────────────────────────────
    CREATE TABLE IF NOT EXISTS bus_routes (
      id SERIAL PRIMARY KEY,
      school_id INT REFERENCES schools(id),
      route_name TEXT NOT NULL,
      am_arrival_expected TIME,
      pm_departure_expected TIME,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bus_stops (
      id SERIAL PRIMARY KEY,
      route_id INT REFERENCES bus_routes(id) ON DELETE CASCADE,
      stop_name TEXT NOT NULL,
      stop_order INT NOT NULL,
      latitude NUMERIC(10,7),
      longitude NUMERIC(10,7),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transportation_events (
      id SERIAL PRIMARY KEY,
      route_id INT REFERENCES bus_routes(id),
      event_type TEXT NOT NULL CHECK (event_type IN ('gps_ping','arrived_stop','departed_stop','arrived_school','departed_school')),
      latitude NUMERIC(10,7),
      longitude NUMERIC(10,7),
      stop_id INT REFERENCES bus_stops(id),
      speed_mph NUMERIC(5,1),
      heading INT,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bus_scans (
      id SERIAL PRIMARY KEY,
      student_id INT REFERENCES students(id) ON DELETE CASCADE,
      route_id INT REFERENCES bus_routes(id),
      stop_id INT REFERENCES bus_stops(id),
      scan_type TEXT NOT NULL CHECK (scan_type IN ('board','alight')),
      scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ── LTI 1.3 platform registry ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS lti_platforms (
      id SERIAL PRIMARY KEY,
      district_id INT REFERENCES districts(id),
      platform_name TEXT NOT NULL,
      issuer TEXT NOT NULL,
      client_id TEXT NOT NULL,
      auth_endpoint TEXT NOT NULL,
      jwks_uri TEXT NOT NULL,
      token_endpoint TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (issuer, client_id)
    );

    -- ── Sync log ──────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS sync_log (
      id SERIAL PRIMARY KEY,
      school_id INT REFERENCES schools(id),
      source TEXT NOT NULL,
      type TEXT NOT NULL,
      records_synced INT DEFAULT 0,
      last_synced_at TIMESTAMPTZ,
      status TEXT DEFAULT 'ok',
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ── Session ───────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS session (
      sid TEXT NOT NULL PRIMARY KEY,
      sess JSON NOT NULL,
      expire TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_session_expire ON session(expire);

    -- ── Indexes for performance ───────────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance(student_id, date);
    CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_parent ON alerts(parent_id, read_at);
    CREATE INDEX IF NOT EXISTS idx_bus_scans_student ON bus_scans(student_id, scanned_at);
    CREATE INDEX IF NOT EXISTS idx_transport_events_route ON transportation_events(route_id, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_students_school ON students(school_id);
    CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id);
  `);
  console.log('Database initialized');
}

module.exports = { query, pool, initDb };
