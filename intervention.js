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

  // Admin users for this school — they receive LP alerts directly
  const adminUsers = await query(`
    SELECT id, phone FROM users WHERE school_id=$1 AND role IN ('admin','district_admin')
  `, [schoolId]);

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

    // IEP/504: raise absence threshold by 1 (accommodation)
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

    // ── Logistically Present detection ──────────────────────────────────────────
    // Student scanned onto bus today 30+ min ago but has no present/LP attendance record
    const busBoard = await query(`
      SELECT id, scanned_at FROM bus_scans
      WHERE student_id=$1 AND scan_type='board'
      AND scanned_at::date=$2
      AND scanned_at <= NOW() - INTERVAL '30 minutes'
      ORDER BY scanned_at DESC LIMIT 1
    `, [stuId, today]);

    const presentToday = await query(`
      SELECT id FROM attendance
      WHERE student_id=$1 AND date=$2 AND status IN ('present','logistically_present')
    `, [stuId, today]);

    const logisticallyPresent = busBoard.rows.length > 0 && presentToday.rows.length === 0;

    if (logisticallyPresent) {
      // Record LP in attendance so the grid shows it (section_id NULL = school-level record)
      await query(`
        INSERT INTO attendance (student_id, date, status, tier, source)
        SELECT $1, $2, 'logistically_present', 1, 'system'
        WHERE NOT EXISTS (
          SELECT 1 FROM attendance
          WHERE student_id=$1 AND date=$2 AND status IN ('present','logistically_present') AND section_id IS NULL
        )
      `, [stuId, today]).catch(e =>
        console.error(`[intervention] LP attendance insert failed for ${stuId}: ${e.message}`)
      );

      // Flag on student record so bus card and feed can read it immediately
      await query(`
        UPDATE students SET transport_status='logistically_present' WHERE id=$1
      `, [stuId]).catch(e =>
        console.error(`[intervention] LP transport_status update failed for ${stuId}: ${e.message}`)
      );
    }

    const behavior = consent_tier >= 2 ? await query(`
      SELECT id FROM behavior_events
      WHERE student_id=$1 AND type='concern' AND created_at >= NOW() - INTERVAL '24 hours'
    `, [stuId]) : { rows: [] };

    let priority = null;
    let message = '';
    let alertType = 'intervention';
    let channels = ['in-app'];

    if (logisticallyPresent) {
      priority = 'critical';
      alertType = 'logistically_present';
      message = `${name} was scanned onto the bus this morning but has not been marked present in class. Immediate follow-up required.`;
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
        WHERE parent_id=$1 AND student_id=$2 AND type=$3 AND created_at::date=$4::date
      `, [parent_id, stuId, alertType, today]);

      if (!existing.rows.length) {
        await query(`
          INSERT INTO alerts (parent_id, student_id, priority, type, message, channels)
          VALUES ($1,$2,$3,$4,$5,$6)
        `, [parent_id, stuId, priority, alertType, message, channels]);

        // LP alerts also go to every admin for this school
        if (alertType === 'logistically_present') {
          for (const admin of adminUsers.rows) {
            const existingAdmin = await query(`
              SELECT id FROM alerts
              WHERE parent_id=$1 AND student_id=$2 AND type='logistically_present' AND created_at::date=$3::date
            `, [admin.id, stuId, today]);
            if (!existingAdmin.rows.length) {
              await query(`
                INSERT INTO alerts (parent_id, student_id, priority, type, message, channels)
                VALUES ($1,$2,'critical','logistically_present',$3,'{in-app,sms}')
              `, [admin.id, stuId, `🚨 ${name} scanned on bus but not in class — immediate follow-up required.`]);
            }
          }
        }

        // SMS for critical and high
        if ((priority === 'critical' || priority === 'high') && phone) {
          const parentPhone = decrypt(phone);
          await sendCriticalAlert(parentPhone, name, message).catch(e =>
            console.error(`[intervention] SMS failed for parent ${parent_id}: ${e.message}`)
          );
          await query(`
            UPDATE alerts SET sms_sent=TRUE
            WHERE parent_id=$1 AND student_id=$2 AND created_at::date=$3::date
          `, [parent_id, stuId, today]);
        }

        alerts.push({ student: name, priority, message });
      }
    }
  }

  return alerts;
}

module.exports = { runInterventionCheck };
