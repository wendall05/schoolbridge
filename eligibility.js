/**
 * Operation Pivot — Game Day Eligibility Engine
 * Handles partial attendance events, SIS/GPS conflict resolution,
 * and real-time coach notifications.
 */

const { query } = require('./db');
const { decrypt } = require('./crypto');

// ── Core: Run full eligibility check for a game ───────────────────────────────
async function checkGameDayEligibility(gameEventId, schoolId, checkSource = 'manual') {
  const gameR = await query(`
    SELECT ge.*, st.name AS team_name, st.sport, st.coach_id,
           COALESCE(ge.periods_required, st.periods_required, 4) AS eff_required,
           COALESCE(ge.periods_total, st.periods_total, 7) AS eff_total
    FROM game_events ge
    JOIN sports_teams st ON st.id = ge.team_id
    WHERE ge.id = $1 AND ge.school_id = $2
  `, [gameEventId, schoolId]);

  if (!gameR.rows.length) throw new Error(`Game event ${gameEventId} not found`);
  const game = gameR.rows[0];

  const athletesR = await query(`
    SELECT ap.id, ap.student_id, ap.jersey_number, ap.position,
           s.name AS student_name, s.grade, s.has_iep, s.has_504
    FROM athlete_profiles ap
    JOIN students s ON s.id = ap.student_id
    WHERE ap.team_id = $1 AND ap.is_active = true
  `, [game.team_id]);

  const results = [];
  const redFlags = [];

  for (const athlete of athletesR.rows) {
    const result = await checkStudentEligibility(athlete, game, checkSource);
    results.push(result);
    if (result.is_cleared === false && !result.conflict_flag) {
      redFlags.push(result);
    }
  }

  if (redFlags.length > 0 && game.coach_id) {
    await bulkNotifyCoach(game.coach_id, redFlags, gameEventId);
  }

  const cleared = results.filter(r => r.is_cleared === true).length;
  const blocked = results.filter(r => r.is_cleared === false).length;
  const conflicts = results.filter(r => r.conflict_flag && !r.conflict_resolved).length;

  return {
    game_event_id: gameEventId,
    team: game.team_name,
    sport: game.sport,
    opponent: game.opponent,
    game_date: game.game_date,
    game_time: game.game_time,
    check_time: new Date().toISOString(),
    check_source: checkSource,
    total_athletes: results.length,
    cleared,
    blocked,
    conflicts,
    cleared_pct: results.length > 0 ? Math.round(cleared / results.length * 100) : 0,
    results,
  };
}

// ── Per-student eligibility with partial attendance + conflict detection ───────
async function checkStudentEligibility(athlete, game, checkSource) {
  const periodsRequired = parseInt(game.eff_required);
  const periodsTotal = parseInt(game.eff_total);

  // IEP/504: lower threshold by 1 (accommodation)
  const effectiveRequired = (athlete.has_iep || athlete.has_504)
    ? Math.max(1, periodsRequired - 1)
    : periodsRequired;

  // Pull period-by-period attendance from SIS
  const periodsR = await query(`
    SELECT period_number, status FROM attendance_periods
    WHERE student_id = $1 AND date = $2
    ORDER BY period_number ASC
  `, [athlete.student_id, game.game_date]);

  // Fall back to daily attendance record if no period data yet
  const dailyR = await query(`
    SELECT status FROM attendance
    WHERE student_id = $1 AND date = $2
    ORDER BY created_at DESC LIMIT 1
  `, [athlete.student_id, game.game_date]);

  let periodsAttended = 0;
  let hasPeriodData = periodsR.rows.length > 0;

  if (hasPeriodData) {
    periodsAttended = periodsR.rows.filter(p =>
      p.status === 'present' || p.status === 'tardy'
    ).length;
  } else if (dailyR.rows.length > 0) {
    // No period data — treat daily present as full attendance, absent as 0
    const dailyStatus = dailyR.rows[0].status;
    periodsAttended = (dailyStatus === 'present' || dailyStatus === 'tardy')
      ? periodsTotal
      : 0;
  }

  // Detect SIS/GPS conflict
  const conflict = await detectAttendanceConflict(athlete.student_id, game.game_date);

  let isCleared = periodsAttended >= effectiveRequired;
  let blockedReason = null;

  // GPS override: student on bus = school-sanctioned activity = ADA protected
  if (conflict && conflict.type === 'sis_absent_gps_present') {
    isCleared = true;
    blockedReason = null;
  }

  if (!isCleared) {
    blockedReason = `${periodsAttended} of ${periodsTotal} periods attended — need ${effectiveRequired}`;
  }

  await query(`
    INSERT INTO game_day_eligibility
      (game_event_id, student_id, athlete_profile_id, is_cleared,
       periods_attended, periods_required, periods_total,
       conflict_flag, conflict_type, conflict_data,
       last_checked_at, check_source, cleared_at, blocked_reason)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),$11,$12,$13)
    ON CONFLICT (game_event_id, student_id) DO UPDATE SET
      is_cleared          = EXCLUDED.is_cleared,
      periods_attended    = EXCLUDED.periods_attended,
      conflict_flag       = EXCLUDED.conflict_flag,
      conflict_type       = EXCLUDED.conflict_type,
      conflict_data       = EXCLUDED.conflict_data,
      last_checked_at     = NOW(),
      check_source        = EXCLUDED.check_source,
      cleared_at          = CASE WHEN EXCLUDED.is_cleared THEN NOW() ELSE NULL END,
      blocked_reason      = EXCLUDED.blocked_reason
  `, [
    game.id, athlete.student_id, athlete.id, isCleared,
    periodsAttended, effectiveRequired, periodsTotal,
    !!conflict, conflict?.type || null,
    conflict ? JSON.stringify(conflict) : null,
    checkSource,
    isCleared ? new Date().toISOString() : null,
    blockedReason,
  ]);

  return {
    student_id: athlete.student_id,
    student_name: decrypt(athlete.student_name),
    grade: athlete.grade,
    jersey_number: athlete.jersey_number,
    position: athlete.position,
    is_cleared: isCleared,
    periods_attended: periodsAttended,
    periods_required: effectiveRequired,
    periods_total: periodsTotal,
    has_period_data: hasPeriodData,
    conflict_flag: !!conflict,
    conflict_type: conflict?.type || null,
    conflict_resolved: false,
    blocked_reason: blockedReason,
    iep_accommodation: athlete.has_iep || athlete.has_504,
  };
}

// ── Conflict Detection: SIS absent vs GPS present ─────────────────────────────
async function detectAttendanceConflict(studentId, gameDate) {
  const [busR, sisR] = await Promise.all([
    query(`
      SELECT bs.scanned_at, br.route_name FROM bus_scans bs
      JOIN bus_routes br ON br.id = bs.route_id
      WHERE bs.student_id = $1 AND bs.scanned_at::date = $2 AND bs.scan_type = 'board'
      ORDER BY bs.scanned_at DESC LIMIT 1
    `, [studentId, gameDate]),
    query(`
      SELECT status FROM attendance
      WHERE student_id = $1 AND date = $2
      ORDER BY created_at DESC LIMIT 1
    `, [studentId, gameDate]),
  ]);

  const onBus = busR.rows.length > 0;
  const sisStatus = sisR.rows[0]?.status;

  if (onBus && sisStatus === 'absent') {
    return {
      type: 'sis_absent_gps_present',
      bus_scan_time: busR.rows[0].scanned_at,
      route: busR.rows[0].route_name,
      sis_status: 'absent',
      resolution: 'auto_cleared',
      reason: 'Student scanned onto team bus — school-sanctioned activity (ADA Revenue protected)',
    };
  }

  return null;
}

// ── Ingest a partial attendance event from SIS webhook ────────────────────────
async function ingestPartialAttendanceEvent(event) {
  const { student_id, date, period_number, period_name, status, source, source_id } = event;

  if (!student_id || !date || period_number == null || !status) {
    throw new Error('Invalid partial attendance event: missing required fields');
  }

  await query(`
    INSERT INTO attendance_periods (student_id, date, period_number, period_name, status, source, source_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (student_id, date, period_number) DO UPDATE SET
      status    = EXCLUDED.status,
      source    = EXCLUDED.source,
      source_id = EXCLUDED.source_id
  `, [student_id, date, period_number, period_name || `Period ${period_number}`, status, source || 'sis', source_id || null]);

  // Re-run eligibility check for any game today
  const gamesR = await query(`
    SELECT ge.id, ge.school_id FROM game_events ge
    JOIN athlete_profiles ap ON ap.team_id = ge.team_id
    WHERE ap.student_id = $1 AND ge.game_date = $2 AND ge.status != 'cancelled'
  `, [student_id, date]);

  const reEvaluated = [];
  for (const game of gamesR.rows) {
    const studentR = await query(`
      SELECT ap.id, ap.student_id, ap.jersey_number, ap.position,
             s.name AS student_name, s.grade, s.has_iep, s.has_504
      FROM athlete_profiles ap
      JOIN students s ON s.id = ap.student_id
      WHERE ap.student_id = $1 AND ap.team_id = (SELECT team_id FROM game_events WHERE id=$2)
    `, [student_id, game.id]);

    if (studentR.rows.length) {
      const gameR = await query(`
        SELECT ge.*, st.name AS team_name, st.sport, st.coach_id,
               COALESCE(ge.periods_required, st.periods_required, 4) AS eff_required,
               COALESCE(ge.periods_total, st.periods_total, 7) AS eff_total
        FROM game_events ge JOIN sports_teams st ON st.id = ge.team_id WHERE ge.id = $1
      `, [game.id]);

      const result = await checkStudentEligibility(studentR.rows[0], gameR.rows[0], 'real_time');
      reEvaluated.push({ game_event_id: game.id, ...result });

      if (result.is_cleared === false && gameR.rows[0].coach_id) {
        await bulkNotifyCoach(gameR.rows[0].coach_id, [result], game.id);
      }
    }
  }

  return { ingested: true, re_evaluated: reEvaluated };
}

// ── Red Flag: notify coach ────────────────────────────────────────────────────
async function bulkNotifyCoach(coachId, redFlags, gameEventId) {
  for (const athlete of redFlags) {
    const message = `⚠️ ${athlete.student_name} (#${athlete.jersey_number || '?'}) NOT cleared — ${athlete.blocked_reason}`;
    await query(`
      INSERT INTO coach_notifications (coach_id, student_id, game_event_id, type, message)
      VALUES ($1,$2,$3,'red_flag',$4)
      ON CONFLICT DO NOTHING
    `, [coachId, athlete.student_id, gameEventId, message]).catch(() => {});
  }
}

// ── AD Readiness Board: all games today across all teams ──────────────────────
async function getTeamReadiness(schoolId, date) {
  const targetDate = date || new Date().toISOString().split('T')[0];

  const r = await query(`
    SELECT
      ge.id AS game_event_id,
      ge.opponent,
      ge.game_time,
      ge.location,
      ge.is_home,
      ge.status,
      st.id AS team_id,
      st.name AS team_name,
      st.sport,
      st.coach_id,
      COUNT(DISTINCT ap.student_id)                                                   AS total_athletes,
      COUNT(DISTINCT ap.student_id) FILTER (WHERE gde.is_cleared = true)              AS cleared,
      COUNT(DISTINCT ap.student_id) FILTER (WHERE gde.is_cleared = false)             AS blocked,
      COUNT(DISTINCT ap.student_id) FILTER (WHERE gde.conflict_flag AND NOT COALESCE(gde.conflict_resolved,false)) AS conflicts,
      COUNT(DISTINCT ap.student_id) FILTER (WHERE gde.is_cleared IS NULL)             AS unchecked,
      MAX(gde.last_checked_at)                                                        AS last_checked_at
    FROM game_events ge
    JOIN sports_teams st ON st.id = ge.team_id
    LEFT JOIN athlete_profiles ap ON ap.team_id = st.id AND ap.is_active = true
    LEFT JOIN game_day_eligibility gde ON gde.game_event_id = ge.id AND gde.student_id = ap.student_id
    WHERE ge.school_id = $1 AND ge.game_date = $2 AND ge.status != 'cancelled'
    GROUP BY ge.id, st.id
    ORDER BY ge.game_time ASC NULLS LAST
  `, [schoolId, targetDate]);

  return r.rows.map(row => ({
    ...row,
    total_athletes: parseInt(row.total_athletes),
    cleared: parseInt(row.cleared),
    blocked: parseInt(row.blocked),
    conflicts: parseInt(row.conflicts),
    unchecked: parseInt(row.unchecked),
    cleared_pct: parseInt(row.total_athletes) > 0
      ? Math.round(parseInt(row.cleared) / parseInt(row.total_athletes) * 100)
      : 0,
  }));
}

// ── Game Roster: full player list with eligibility status ─────────────────────
async function getGameRoster(gameEventId, schoolId) {
  const r = await query(`
    SELECT
      s.id AS student_id,
      s.name AS student_name,
      s.grade,
      s.has_iep,
      s.has_504,
      ap.jersey_number,
      ap.position,
      ap.eligibility_status,
      gde.id AS eligibility_id,
      gde.is_cleared,
      gde.periods_attended,
      gde.periods_required,
      gde.periods_total,
      gde.conflict_flag,
      gde.conflict_type,
      gde.conflict_resolved,
      gde.conflict_resolution,
      gde.conflict_data,
      gde.blocked_reason,
      gde.last_checked_at
    FROM athlete_profiles ap
    JOIN students s ON s.id = ap.student_id
    JOIN game_events ge ON ge.team_id = ap.team_id
    LEFT JOIN game_day_eligibility gde ON gde.game_event_id = ge.id AND gde.student_id = s.id
    WHERE ge.id = $1 AND ge.school_id = $2 AND ap.is_active = true
    ORDER BY
      CASE WHEN gde.is_cleared = false AND NOT COALESCE(gde.conflict_flag,false) THEN 0
           WHEN gde.conflict_flag AND NOT COALESCE(gde.conflict_resolved,false) THEN 1
           WHEN gde.is_cleared = true THEN 2
           ELSE 3 END,
      ap.jersey_number ASC NULLS LAST
  `, [gameEventId, schoolId]);

  return r.rows.map(row => ({
    ...row,
    student_name: decrypt(row.student_name),
  }));
}

// ── Conflict Resolution: AD manually overrides ────────────────────────────────
async function resolveConflict(eligibilityId, resolution, resolvedByUserId) {
  const isCleared = resolution === 'override_cleared';

  const r = await query(`
    UPDATE game_day_eligibility SET
      conflict_resolved       = true,
      conflict_resolved_by    = $1,
      conflict_resolved_at    = NOW(),
      conflict_resolution     = $2,
      is_cleared              = $3,
      cleared_at              = $4,
      blocked_reason          = CASE WHEN $3 THEN NULL ELSE blocked_reason END
    WHERE id = $5
    RETURNING game_event_id, student_id
  `, [resolvedByUserId, resolution, isCleared, isCleared ? new Date() : null, eligibilityId]);

  return { id: eligibilityId, resolved: true, is_cleared: isCleared, ...r.rows[0] };
}

// ── Run eligibility pulse for all today's games ───────────────────────────────
async function runEligibilityPulse(source) {
  const today = new Date().toISOString().split('T')[0];
  const gamesR = await query(`
    SELECT ge.id, ge.school_id FROM game_events ge
    WHERE ge.game_date = $1 AND ge.status IN ('scheduled','active')
  `, [today]);

  const results = [];
  for (const game of gamesR.rows) {
    try {
      const r = await checkGameDayEligibility(game.id, game.school_id, source);
      results.push({ game_id: game.id, ok: true, summary: r });
      console.log(`[eligibility] ${source} pulse — Game ${game.id}: ${r.cleared}/${r.total_athletes} cleared`);
    } catch (e) {
      console.error(`[eligibility] ${source} pulse failed for game ${game.id}:`, e.message);
      results.push({ game_id: game.id, ok: false, error: e.message });
    }
  }
  return results;
}

module.exports = {
  checkGameDayEligibility,
  ingestPartialAttendanceEvent,
  getTeamReadiness,
  getGameRoster,
  resolveConflict,
  runEligibilityPulse,
};
