/**
 * Compliance module — FERPA, COPPA 2.0, SOPPA, CIPA, PPRA
 * Every function that touches student PII must log through here.
 */

const { query } = require('./db');

// ── FERPA ─────────────────────────────────────────────────────────────────────

async function logDataAccess(parentId, studentId, action, source, tier, ip) {
  await query(
    `INSERT INTO data_audit_log (parent_id, student_id, action, source, tier, ip_address)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [parentId, studentId, action, source, tier, ip || null]
  );
}

async function submitFerpaRequest(districtId, schoolId, studentId, requestType, requestedBy, regulation = 'FERPA') {
  const r = await query(
    `INSERT INTO ferpa_requests (district_id, school_id, student_id, request_type, requested_by, regulation)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [districtId, schoolId, studentId, requestType, requestedBy, regulation]
  );
  return r.rows[0].id;
}

// FERPA-compliant student deletion — cascades all PII across all tables
async function deleteStudentRecord(studentId, requestedBy) {
  const requestId = await submitFerpaRequest(null, null, studentId, 'deletion', requestedBy);

  await query(`UPDATE ferpa_requests SET status='in_progress' WHERE id=$1`, [requestId]);

  // Hard delete in dependency order (FKs cascade, but be explicit for audit)
  await query(`DELETE FROM bus_scans WHERE student_id=$1`, [studentId]);
  await query(`DELETE FROM shadow_messages WHERE student_id=$1`, [studentId]);
  await query(`DELETE FROM behavior_events WHERE student_id=$1`, [studentId]);
  await query(`DELETE FROM grades WHERE student_id=$1`, [studentId]);
  await query(`DELETE FROM attendance WHERE student_id=$1`, [studentId]);
  await query(`DELETE FROM alerts WHERE student_id=$1`, [studentId]);
  await query(`DELETE FROM section_students WHERE student_id=$1`, [studentId]);
  await query(`DELETE FROM parent_students WHERE student_id=$1`, [studentId]);
  await query(`DELETE FROM student_external_ids WHERE student_id=$1`, [studentId]);
  await query(`DELETE FROM coppa_consents WHERE student_id=$1`, [studentId]);
  await query(`DELETE FROM ppra_opt_outs WHERE student_id=$1`, [studentId]);
  await query(`DELETE FROM students WHERE id=$1`, [studentId]);

  await query(
    `UPDATE ferpa_requests SET status='completed', completed_at=NOW() WHERE id=$1`,
    [requestId]
  );

  console.log(`[compliance] FERPA deletion completed for student ${studentId} by ${requestedBy}`);
  return requestId;
}

// ── COPPA 2.0 ─────────────────────────────────────────────────────────────────

async function recordCoppaConsent(parentId, studentId, method, categories, ip) {
  await query(
    `INSERT INTO coppa_consents (parent_id, student_id, consent_given, consent_method, data_categories, ip_address, consented_at)
     VALUES ($1,$2,TRUE,$3,$4,$5,NOW())
     ON CONFLICT (parent_id, student_id) DO UPDATE
     SET consent_given=TRUE, consent_method=$3, data_categories=$4, consented_at=NOW(), withdrawn_at=NULL`,
    [parentId, studentId, method, categories, ip]
  );
}

async function withdrawCoppaConsent(parentId, studentId) {
  await query(
    `UPDATE coppa_consents SET consent_given=FALSE, withdrawn_at=NOW()
     WHERE parent_id=$1 AND student_id=$2`,
    [parentId, studentId]
  );
  // COPPA requires data deletion on consent withdrawal
  await query(`DELETE FROM shadow_messages WHERE parent_id=$1 AND student_id=$2`, [parentId, studentId]);
}

async function hasCoppaConsent(parentId, studentId) {
  const r = await query(
    `SELECT consent_given FROM coppa_consents
     WHERE parent_id=$1 AND student_id=$2 AND withdrawn_at IS NULL`,
    [parentId, studentId]
  );
  return r.rows[0]?.consent_given === true;
}

// ── SOPPA ─────────────────────────────────────────────────────────────────────

async function recordDataProcessingAgreement(districtId, signedBy, version = '1.0') {
  await query(
    `INSERT INTO data_processing_agreements
       (district_id, signed_by, signed_at, agreement_version,
        no_sell_confirmed, no_behavioral_ads_confirmed,
        security_program_confirmed, deletion_on_contract_end_confirmed)
     VALUES ($1,$2,NOW(),$3,TRUE,TRUE,TRUE,TRUE)`,
    [districtId, signedBy, version]
  );
}

async function logBreachNotification(districtId, affectedCount, dataTypes, description) {
  const r = await query(
    `INSERT INTO breach_notifications
       (district_id, detected_at, affected_records_count, data_types_affected, description)
     VALUES ($1,NOW(),$2,$3,$4) RETURNING id`,
    [districtId, affectedCount, dataTypes, description]
  );
  console.error(`[compliance] SOPPA breach logged — district ${districtId}, ${affectedCount} records affected`);
  // SOPPA requires notification within 30 days; GDPR-aligned target is 72 hours
  return r.rows[0].id;
}

// ── PPRA ──────────────────────────────────────────────────────────────────────

async function recordPpraOptOut(parentId, studentId, activityType) {
  await query(
    `INSERT INTO ppra_opt_outs (parent_id, student_id, activity_type)
     VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
    [parentId, studentId, activityType]
  );
}

async function isPpraOptedOut(parentId, studentId, activityType) {
  const r = await query(
    `SELECT id FROM ppra_opt_outs WHERE parent_id=$1 AND student_id=$2 AND activity_type=$3`,
    [parentId, studentId, activityType]
  );
  return r.rows.length > 0;
}

// ── CIPA ──────────────────────────────────────────────────────────────────────
// CIPA compliance is primarily a school network policy requirement.
// SchoolBridge confirms compliance via DPA acknowledgment and these controls:
const CIPA_CONTROLS = {
  noThirdPartyTracking: true,
  noExternalAdNetworks: true,
  contentFilteringRequired: true, // enforced at school network level, not app level
  minorDataNotSoldOrShared: true,
  internetSafetyPolicyAcknowledged: true,
};

function getCipaComplianceStatement() {
  return {
    compliant: Object.values(CIPA_CONTROLS).every(Boolean),
    controls: CIPA_CONTROLS,
    note: 'CIPA content filtering is enforced at the district network level. SchoolBridge does not host or serve unfiltered internet content.',
  };
}

// ── Data retention enforcement ─────────────────────────────────────────────────

async function enforceRetentionPolicies() {
  // Get all district retention configs
  const districts = await query(`SELECT id, retention_days_grades, retention_days_behavior, retention_days_shadow FROM districts`);

  for (const d of districts.rows) {
    const schoolIds = await query(`SELECT id FROM schools WHERE district_id=$1`, [d.id]);
    const ids = schoolIds.rows.map(s => s.id);
    if (!ids.length) continue;

    if (d.retention_days_grades > 0) {
      const r = await query(
        `DELETE FROM grades WHERE section_id IN (SELECT id FROM sections WHERE school_id=ANY($1))
         AND created_at < NOW() - make_interval(days => $2::int)`,
        [ids, d.retention_days_grades]
      );
      if (r.rowCount > 0) console.log(`[compliance] Purged ${r.rowCount} grade records for district ${d.id}`);
    }

    if (d.retention_days_behavior > 0) {
      const r = await query(
        `DELETE FROM behavior_events WHERE student_id IN (SELECT id FROM students WHERE school_id=ANY($1))
         AND created_at < NOW() - make_interval(days => $2::int)`,
        [ids, d.retention_days_behavior]
      );
      if (r.rowCount > 0) console.log(`[compliance] Purged ${r.rowCount} behavior records for district ${d.id}`);
    }

    if (d.retention_days_shadow > 0) {
      const r = await query(
        `DELETE FROM shadow_messages WHERE student_id IN (SELECT id FROM students WHERE school_id=ANY($1))
         AND created_at < NOW() - make_interval(days => $2::int)`,
        [ids, d.retention_days_shadow]
      );
      if (r.rowCount > 0) console.log(`[compliance] Purged ${r.rowCount} shadow messages for district ${d.id}`);
    }
  }
}

module.exports = {
  logDataAccess,
  submitFerpaRequest,
  deleteStudentRecord,
  recordCoppaConsent,
  withdrawCoppaConsent,
  hasCoppaConsent,
  recordDataProcessingAgreement,
  logBreachNotification,
  recordPpraOptOut,
  isPpraOptedOut,
  getCipaComplianceStatement,
  enforceRetentionPolicies,
};
