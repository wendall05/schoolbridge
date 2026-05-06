const { query } = require('./db');
const { decrypt } = require('./crypto');
const { sendCriticalAlert } = require('./sms');

async function runInterventionCheck(schoolId) {
  const today = new Date().toISOString().split('T')[0];
  const alerts = [];

  // Get district rules (fall back to platform defaults)
  const districtR = await query(`
    SELECT d.rule_absence_watch, d.rule_absence_high, d.rule_absence_critical,
           d.rule_missing_watch, d.rule_missing_high
    FROM districts d JOIN schools s ON s.district_id=d.id
    WHERE s.id=$1
  `, [schoolId]);
  const rules = districtR.rows[0] || {
    rule_absence_watch: 1, rule_absence_high: 2, rule_absence_critical: 3,
    rule_missing_watch: 1, rule_missing_high: 2,
  };

  const students = await query(`
    SELECT s.id, s.name, s.has_iep, s.has_504, ps.parent_id, u.consent_tier, u.phone
    FROM students s
    JOIN parent_students ps ON ps.student_id = s.id
    JOIN users u ON u.id = ps.parent_id
    WHERE s.school_id = $1
  `, [schoolId]);

  for (const row of students.rows) {
    const { id: stuId, name: encName, has_iep, has_504, parent_id, consent_tier, phone } = row;
    const name = decrypt(encName);

    // IEP/504: raise threshold by 1 absence before alerting (accommodation)
    const absenceAdjust = (has_iep || has_504) ? 1 : 0;

    const absToday = await query(`
      SELECT id FROM attendance
      WHERE student_id=$1 AND date=$2 AND status IN ('absent','tardy')
    `, [stuId, today]);

    const missing = await query(`
      SELECT id, assignment_title FROM grades
      WHERE student_id=$1 AND missing=true
      AND due_date >= NOW() - INTERVAL '48 hours'
    `, [stuId]);

    const recentAvg = await query(`
      SELECT AVG(score/NULLIF(max_score,0)*100) as avg FROM grades
      WHERE student_id=$1 AND score IS NOT NULL AND created_at >= NOW() - INTERVAL '7 days'
    `, [stuId]);
    const priorAvg = await query(`
      SELECT AVG(score/NULLIF(max_score,0)*100) as avg FROM grades
      WHERE student_id=$1 AND score IS NOT NULL
      AND created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
    `, [stuId]);
    const recent = parseFloat(recentAvg.rows[0]?.avg);
    const prior = parseFloat(priorAvg.rows[0]?.avg);
    const gradeDrop = prior > 0 && recent > 0 && (prior - recent) >= 10;

    const absCount = await query(`
      SELECT COUNT(*) FROM attendance
      WHERE student_id=$1 AND status='absent' AND date >= NOW() - INTERVAL '14 days'
    `, [stuId]);
    const absences = parseInt(absCount.rows[0].count);
    const chronicAbsent = absences >= (rules.rule_absence_critical + absenceAdjust);

    // Check for "Logistically Present" — on bus but not in class
    const busBoard = await query(`
      SELECT bs.id FROM bus_scans bs
      WHERE bs.student_id=$1 AND bs.scan_type='board'
      AND bs.scanned_at::date=$2
    `, [stuId, today]);
    const logisticallyPresent = busBoard.rows.length > 0 && absToday.rows.length > 0;

    const behavior = consent_tier >= 2 ? await query(`
      SELECT id FROM behavior_events
      WHERE student_id=$1 AND type='concern' AND created_at >= NOW() - INTERVAL '24 hours'
    `, [stuId]) : { rows: [] };

    let priority = null;
    let message = '';
    let channels = ['in-app'];

    if (logisticallyPresent) {
      priority = 'critical';
      message = `${name} was scanned onto their bus this morning but has not been marked present in class. Immediate follow-up required.`;
      channels = ['in-app', 'push', 'sms', 'email'];
    } else if (behavior.rows.length > 0 && absToday.rows.length > 0) {
      priority = 'critical';
      message = `${name} received a behavior flag and was absent today. Counselor has been notified.`;
      channels = ['in-app', 'push', 'sms', 'email'];
    } else if (chronicAbsent) {
      priority = 'critical';
      message = `${name} has been absent ${absences} times in the last 2 weeks.${has_iep || has_504 ? ' (Accommodation plan on file)' : ''}`;
      channels = ['in-app', 'push', 'sms', 'email'];
    } else if (absToday.rows.length > 0 && missing.rows.length > 0) {
      priority = 'high';
      message = `${name} was absent/tardy today and has ${missing.rows.length} missing assignment${missing.rows.length > 1 ? 's' : ''}.`;
      channels = ['in-app', 'push', 'sms'];
    } else if (gradeDrop) {
      priority = 'high';
      message = `${name}'s grades have dropped ${Math.round(prior - recent)}% this week.`;
      channels = ['in-app', 'push'];
    } else if (absToday.rows.length > 0) {
      priority = 'low';
      message = `${name} was marked absent or tardy today.`;
    } else if (missing.rows.length > 0) {
      priority = 'low';
      message = `${name} has ${missing.rows.length} missing assignment${missing.rows.length > 1 ? 's' : ''}.`;
    }

    if (priority) {
      const existing = await query(`
        SELECT id FROM alerts
        WHERE parent_id=$1 AND student_id=$2 AND priority=$3 AND created_at::date=$4::date
      `, [parent_id, stuId, priority, today]);

      if (!existing.rows.length) {
        await query(`
          INSERT INTO alerts (parent_id, student_id, priority, type, message, channels)
          VALUES ($1,$2,$3,'intervention',$4,$5)
        `, [parent_id, stuId, priority, message, channels]);

        // Fire SMS for critical and high alerts
        if ((priority === 'critical' || priority === 'high') && phone) {
          const parentPhone = decrypt(phone);
          await sendCriticalAlert(parentPhone, name, message).catch(e =>
            console.error(`[intervention] SMS failed for parent ${parent_id}: ${e.message}`)
          );
          await query(`UPDATE alerts SET sms_sent=TRUE WHERE parent_id=$1 AND student_id=$2 AND created_at::date=$3::date`, [parent_id, stuId, today]);
        }

        alerts.push({ student: name, priority, message });
      }
    }
  }

  return alerts;
}

module.exports = { runInterventionCheck };
