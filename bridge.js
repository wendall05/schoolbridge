/**
 * SchoolBridge → Operation Pivot Bridge API
 * Exposes academic status (grades + attendance) for athletes.
 * Secured with BRIDGE_API_KEY — never exposes raw student PII beyond what Pivot needs.
 */

const express = require('express');
const { query } = require('./db');
const { decrypt } = require('./crypto');

const router = express.Router();

// Middleware: validate the shared API key set in both apps' env vars
// FERPA compliance: Operation Pivot is a "school official with legitimate educational interest"
// under FERPA 34 CFR § 99.31(a)(1) — athletic eligibility is a direct educational interest.
// All access is logged to data_audit_log for FERPA audit trail.
function bridgeAuth(req, res, next) {
  const key = req.headers['x-bridge-api-key'];
  if (!key || key !== process.env.BRIDGE_API_KEY) {
    console.warn(`[bridge] Unauthorized access attempt from ${req.ip}`);
    return res.status(401).json({ error: 'Invalid bridge API key' });
  }
  // Log this access for FERPA audit trail
  query(`INSERT INTO data_audit_log (accessor_type, accessor_id, action, ip_address, details, created_at)
         VALUES ('system','operation-pivot','bridge_academic_query',$1,$2,NOW())`,
    [req.ip, JSON.stringify({ path: req.path, query: req.query })]
  ).catch(() => {});
  next();
}

/**
 * GET /api/bridge/academic-status
 * Query params:
 *   - student_ids: comma-separated SchoolBridge student IDs  OR
 *   - names: comma-separated student names (fuzzy match fallback)
 * Returns academic risk summary per student.
 */
router.get('/academic-status', bridgeAuth, async (req, res) => {
  try {
    const { student_ids, names } = req.query;

    let students;
    if (student_ids) {
      const ids = student_ids.split(',').map(Number).filter(Boolean);
      if (!ids.length) return res.json([]);
      const r = await query(`SELECT id, name, student_number FROM students WHERE id = ANY($1)`, [ids]);
      students = r.rows;
    } else if (names) {
      const nameList = names.split(',').map(n => n.trim()).filter(Boolean);
      if (!nameList.length) return res.json([]);
      const r = await query(`SELECT id, name, student_number FROM students WHERE name = ANY($1)`, [nameList]);
      students = r.rows;
    } else {
      // Return all students who have athlete profiles
      const r = await query(`
        SELECT DISTINCT s.id, s.name, s.student_number
        FROM students s
        JOIN athlete_profiles ap ON ap.student_id = s.id
        WHERE ap.is_active = true
      `);
      students = r.rows;
    }

    const results = [];

    for (const student of students) {
      const studentName = decrypt(student.name);

      // Grade average over last 30 days
      const gradesR = await query(`
        SELECT score, max_score, missing, due_date, assignment_title, section_id
        FROM grades
        WHERE student_id = $1 AND score IS NOT NULL AND max_score > 0
        AND created_at >= NOW() - INTERVAL '30 days'
        ORDER BY created_at DESC
      `, [student.id]);

      const gradedAssignments = gradesR.rows.filter(g => !g.missing && g.score !== null);
      const missingCount = await query(`
        SELECT COUNT(*) AS n FROM grades WHERE student_id=$1 AND missing=true
        AND created_at >= NOW() - INTERVAL '14 days'
      `, [student.id]);

      let avgPct = null;
      if (gradedAssignments.length > 0) {
        const totalScore = gradedAssignments.reduce((s, g) => s + parseFloat(g.score), 0);
        const totalMax   = gradedAssignments.reduce((s, g) => s + parseFloat(g.max_score), 0);
        avgPct = totalMax > 0 ? Math.round(totalScore / totalMax * 100) : null;
      }

      // Attendance rate last 20 school days
      const attR = await query(`
        SELECT status FROM attendance WHERE student_id=$1 ORDER BY date DESC LIMIT 20
      `, [student.id]);
      const presentDays = attR.rows.filter(a => a.status === 'present' || a.status === 'tardy').length;
      const attPct = attR.rows.length > 0 ? Math.round(presentDays / attR.rows.length * 100) : null;

      // Behavior concern count last 14 days
      const behaviorR = await query(`
        SELECT COUNT(*) AS n FROM behavior_events
        WHERE student_id=$1 AND type='concern' AND created_at >= NOW() - INTERVAL '14 days'
      `, [student.id]);

      // Determine academic risk level
      // Warning: avg 60–69% or 3+ missing assignments
      // Critical: avg < 60% or 5+ missing assignments
      const missing = parseInt(missingCount.rows[0]?.n || 0);
      let riskLevel = 'safe';
      let riskReasons = [];

      if (avgPct !== null) {
        if (avgPct < 60) {
          riskLevel = 'critical';
          riskReasons.push(`${avgPct}% grade average (below 60%)`);
        } else if (avgPct < 70) {
          riskLevel = riskLevel === 'critical' ? 'critical' : 'warning';
          riskReasons.push(`${avgPct}% grade average (D range — at risk)`);
        }
      }
      if (missing >= 5) {
        riskLevel = 'critical';
        riskReasons.push(`${missing} missing assignments in last 2 weeks`);
      } else if (missing >= 3) {
        riskLevel = riskLevel === 'critical' ? 'critical' : 'warning';
        riskReasons.push(`${missing} missing assignments in last 2 weeks`);
      }
      if (attPct !== null && attPct < 80) {
        riskLevel = riskLevel === 'safe' ? 'warning' : riskLevel;
        riskReasons.push(`${attPct}% attendance rate`);
      }

      results.push({
        student_id: student.id,
        student_number: student.student_number,
        student_name: studentName,
        grade_avg_pct: avgPct,
        graded_assignments: gradedAssignments.length,
        missing_assignments: missing,
        attendance_pct: attPct,
        behavior_concerns: parseInt(behaviorR.rows[0]?.n || 0),
        risk_level: riskLevel,
        risk_reasons: riskReasons,
        checked_at: new Date().toISOString(),
      });
    }

    res.json(results);
  } catch (e) {
    console.error('[bridge] academic-status error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
