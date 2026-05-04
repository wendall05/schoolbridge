// Predictive Intervention Engine
// Detects risk signals and triggers parent alerts

const { query } = require('./db');

async function runInterventionCheck(schoolId) {
  const today = new Date().toISOString().split('T')[0];
  const alerts = [];

  // Get all students at this school with their parents
  const students = await query(`
    SELECT s.id, s.name, ps.parent_id, u.consent_tier
    FROM students s
    JOIN parent_students ps ON ps.student_id = s.id
    JOIN users u ON u.id = ps.parent_id
    WHERE s.school_id = $1
  `, [schoolId]);

  for (const row of students.rows) {
    const { id: stuId, name, parent_id, consent_tier } = row;
    const triggered = [];

    // Signal 1: Absent today
    const absToday = await query(`
      SELECT id FROM attendance
      WHERE student_id=$1 AND date=$2 AND status IN ('absent','tardy')
    `, [stuId, today]);

    // Signal 2: Missing assignment due today or yesterday
    const missing = await query(`
      SELECT id, assignment_title, section_id FROM grades
      WHERE student_id=$1 AND missing=true
      AND due_date >= NOW() - INTERVAL '48 hours'
    `, [stuId]);

    // Signal 3: Grade drop (avg dropped 10%+ in last 7 days vs prior 7)
    const recentAvg = await query(`
      SELECT AVG(score/NULLIF(max_score,0)*100) as avg
      FROM grades WHERE student_id=$1 AND score IS NOT NULL
      AND created_at >= NOW() - INTERVAL '7 days'
    `, [stuId]);
    const priorAvg = await query(`
      SELECT AVG(score/NULLIF(max_score,0)*100) as avg
      FROM grades WHERE student_id=$1 AND score IS NOT NULL
      AND created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
    `, [stuId]);
    const recent = parseFloat(recentAvg.rows[0]?.avg);
    const prior = parseFloat(priorAvg.rows[0]?.avg);
    const gradeDrop = prior > 0 && recent > 0 && (prior - recent) >= 10;

    // Signal 4: 3+ absences in last 14 days
    const absCount = await query(`
      SELECT COUNT(*) FROM attendance
      WHERE student_id=$1 AND status='absent'
      AND date >= NOW() - INTERVAL '14 days'
    `, [stuId]);
    const chronicAbsent = parseInt(absCount.rows[0].count) >= 3;

    // Signal 5: Behavior concern (tier 2 only if consent allows)
    const behavior = consent_tier >= 2 ? await query(`
      SELECT id FROM behavior_events
      WHERE student_id=$1 AND type='concern'
      AND created_at >= NOW() - INTERVAL '24 hours'
    `, [stuId]) : { rows: [] };

    // Determine priority and build alert
    let priority = null;
    let message = '';
    let channels = ['in-app'];

    if (absToday.rows.length > 0 && missing.rows.length > 0) {
      priority = 'high';
      message = `${name} was ${absToday.rows[0] ? 'absent/tardy' : ''} today and has ${missing.rows.length} missing assignment${missing.rows.length > 1 ? 's' : ''} due.`;
      channels = ['in-app', 'push', 'sms'];
    }

    if (chronicAbsent) {
      priority = 'critical';
      message = `${name} has been absent ${absCount.rows[0].count} times in the last 2 weeks.`;
      channels = ['in-app', 'push', 'sms', 'email'];
    }

    if (behavior.rows.length > 0 && absToday.rows.length > 0) {
      priority = 'critical';
      message = `${name} received a behavior flag and was absent today. Counselor has been notified.`;
      channels = ['in-app', 'push', 'sms', 'email'];
    }

    if (gradeDrop && !priority) {
      priority = 'high';
      message = `${name}'s grades have dropped ${Math.round(prior - recent)}% this week.`;
      channels = ['in-app', 'push'];
    }

    if (absToday.rows.length > 0 && !priority) {
      priority = 'low';
      message = `${name} was marked absent or tardy today.`;
    }

    if (missing.rows.length > 0 && !priority) {
      priority = 'low';
      message = `${name} has ${missing.rows.length} missing assignment${missing.rows.length > 1 ? 's' : ''}.`;
    }

    if (priority) {
      // Don't duplicate alerts from same day
      const existing = await query(`
        SELECT id FROM alerts
        WHERE parent_id=$1 AND student_id=$2 AND priority=$3
        AND created_at::date = $4::date
      `, [parent_id, stuId, priority, today]);

      if (!existing.rows.length) {
        await query(`
          INSERT INTO alerts (parent_id, student_id, priority, type, message, channels)
          VALUES ($1,$2,$3,'intervention',$4,$5)
        `, [parent_id, stuId, priority, message, channels]);
        alerts.push({ student: name, priority, message });
      }
    }
  }

  return alerts;
}

module.exports = { runInterventionCheck };
