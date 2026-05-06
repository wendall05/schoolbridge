/**
 * Reporting module — Chronic Absenteeism (ESSA), Weekly Summary
 * ESSA mandates reporting students missing 10%+ of school days.
 */

const { query } = require('./db');

const ESSA_THRESHOLD_PCT = 10; // 10% of school days = chronically absent

// ── Chronic Absenteeism (ESSA-compliant) ──────────────────────────────────────

async function getChronicAbsenteeismReport(schoolId, schoolYearStart) {
  const startDate = schoolYearStart || getSchoolYearStart();

  // Count total school days (days where any attendance was recorded)
  const schoolDaysR = await query(`
    SELECT COUNT(DISTINCT date) as total_days
    FROM attendance
    WHERE student_id IN (SELECT id FROM students WHERE school_id=$1)
    AND date >= $2
  `, [schoolId, startDate]);
  const totalDays = parseInt(schoolDaysR.rows[0]?.total_days) || 0;
  const threshold = Math.ceil(totalDays * ESSA_THRESHOLD_PCT / 100);

  // Get all students with absence counts
  const r = await query(`
    SELECT
      s.id, s.name, s.grade, s.has_iep, s.has_504,
      COUNT(a.id) FILTER (WHERE a.status='absent') as absent_days,
      COUNT(a.id) FILTER (WHERE a.status='tardy') as tardy_days,
      COUNT(a.id) FILTER (WHERE a.status='excused') as excused_days,
      COUNT(a.id) as total_recorded
    FROM students s
    LEFT JOIN attendance a ON a.student_id=s.id AND a.date >= $2
    WHERE s.school_id=$1
    GROUP BY s.id
    ORDER BY absent_days DESC
  `, [schoolId, startDate]);

  const students = r.rows.map(row => {
    const absentDays = parseInt(row.absent_days) || 0;
    const pct = totalDays > 0 ? Math.round(absentDays / totalDays * 100) : 0;
    return {
      ...row,
      absent_days: absentDays,
      absence_pct: pct,
      chronically_absent: absentDays >= threshold,
      at_risk: absentDays >= Math.ceil(threshold * 0.75) && absentDays < threshold,
      essa_flag: absentDays >= threshold,
    };
  });

  const chronicallyAbsent = students.filter(s => s.chronically_absent);
  const atRisk = students.filter(s => s.at_risk);

  return {
    school_id: schoolId,
    report_date: new Date().toISOString().split('T')[0],
    school_year_start: startDate,
    total_school_days: totalDays,
    essa_threshold_days: threshold,
    essa_threshold_pct: ESSA_THRESHOLD_PCT,
    total_students: students.length,
    chronically_absent_count: chronicallyAbsent.length,
    chronically_absent_pct: students.length > 0 ? Math.round(chronicallyAbsent.length / students.length * 100) : 0,
    at_risk_count: atRisk.length,
    students,
    chronically_absent: chronicallyAbsent,
    at_risk: atRisk,
  };
}

// District-wide chronic absenteeism (for district_admin role)
async function getDistrictAbsenteeismReport(districtId, schoolYearStart) {
  const startDate = schoolYearStart || getSchoolYearStart();
  const schools = await query('SELECT id, name FROM schools WHERE district_id=$1', [districtId]);
  const reports = [];

  for (const school of schools.rows) {
    const report = await getChronicAbsenteeismReport(school.id, startDate);
    reports.push({ school_name: school.name, ...report });
  }

  const totalStudents = reports.reduce((s, r) => s + r.total_students, 0);
  const totalChronic  = reports.reduce((s, r) => s + r.chronically_absent_count, 0);

  return {
    district_id: districtId,
    report_date: new Date().toISOString().split('T')[0],
    school_year_start: startDate,
    essa_threshold_pct: ESSA_THRESHOLD_PCT,
    total_students: totalStudents,
    total_chronically_absent: totalChronic,
    district_chronic_pct: totalStudents > 0 ? Math.round(totalChronic / totalStudents * 100) : 0,
    schools: reports,
  };
}

// ── Weekly summary report ─────────────────────────────────────────────────────

async function getWeeklyReport(schoolId) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const today   = new Date().toISOString().split('T')[0];

  const [
    totalStudents,
    totalAbsences,
    totalAlerts,
    criticalAlerts,
    missingAssignments,
    behaviorConcerns,
    syncLog,
    newMessages,
  ] = await Promise.all([
    query('SELECT COUNT(*) FROM students WHERE school_id=$1', [schoolId]),
    query(`SELECT COUNT(*) FROM attendance WHERE student_id IN (SELECT id FROM students WHERE school_id=$1) AND status='absent' AND date >= $2`, [schoolId, weekAgo]),
    query(`SELECT COUNT(*) FROM alerts WHERE student_id IN (SELECT id FROM students WHERE school_id=$1) AND created_at >= $2`, [schoolId, weekAgo]),
    query(`SELECT COUNT(*) FROM alerts WHERE student_id IN (SELECT id FROM students WHERE school_id=$1) AND priority='critical' AND created_at >= $2`, [schoolId, weekAgo]),
    query(`SELECT COUNT(*) FROM grades WHERE student_id IN (SELECT id FROM students WHERE school_id=$1) AND missing=true AND due_date >= $2`, [schoolId, weekAgo]),
    query(`SELECT COUNT(*) FROM behavior_events WHERE student_id IN (SELECT id FROM students WHERE school_id=$1) AND type='concern' AND created_at >= $2`, [schoolId, weekAgo]),
    query(`SELECT source, type, records_synced, status, created_at FROM sync_log WHERE school_id=$1 AND created_at >= $2 ORDER BY created_at DESC LIMIT 20`, [schoolId, weekAgo]),
    query(`SELECT COUNT(*) FROM messages WHERE (from_id IN (SELECT id FROM users WHERE school_id=$1) OR to_id IN (SELECT id FROM users WHERE school_id=$1)) AND created_at >= $2`, [schoolId, weekAgo]),
  ]);

  // Top 5 most absent students this week
  const topAbsent = await query(`
    SELECT s.name, COUNT(a.id) as absences
    FROM attendance a
    JOIN students s ON s.id=a.student_id
    WHERE s.school_id=$1 AND a.status='absent' AND a.date >= $2
    GROUP BY s.id, s.name
    ORDER BY absences DESC LIMIT 5
  `, [schoolId, weekAgo]);

  return {
    period: `${weekAgo} to ${today}`,
    school_id: schoolId,
    total_students: parseInt(totalStudents.rows[0].count),
    total_absences: parseInt(totalAbsences.rows[0].count),
    total_alerts: parseInt(totalAlerts.rows[0].count),
    critical_alerts: parseInt(criticalAlerts.rows[0].count),
    missing_assignments: parseInt(missingAssignments.rows[0].count),
    behavior_concerns: parseInt(behaviorConcerns.rows[0].count),
    new_messages: parseInt(newMessages.rows[0].count),
    sync_log: syncLog.rows,
    top_absent_students: topAbsent.rows,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSchoolYearStart() {
  const now = new Date();
  // School year starts in August; if before August use previous year
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-08-01`;
}

module.exports = { getChronicAbsenteeismReport, getDistrictAbsenteeismReport, getWeeklyReport };
