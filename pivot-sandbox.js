/**
 * Operation Pivot — Demo Data Seeder
 * Seeds realistic game-day data so the AD Command Center is fully visible on boot.
 * Safe to call on every restart — all inserts guard against duplicates explicitly.
 */

const bcrypt = require('bcryptjs');
const { runEligibilityPulse } = require('./eligibility');

async function loadPivotSandboxData(db, schoolId) {
  console.log('[pivot-sandbox] Seeding Operation Pivot demo data...');
  const today = new Date().toISOString().split('T')[0];
  const pw = await bcrypt.hash('pivot123', 10);

  // ── Demo users ──────────────────────────────────────────────────────────────
  const adR = await db.query(`
    INSERT INTO users (school_id, name, email, password_hash, role)
    VALUES ($1,'Coach Davis','ad@lincoln.edu',$2,'athletic_director')
    ON CONFLICT (email) DO UPDATE SET role='athletic_director', school_id=$1
    RETURNING id
  `, [schoolId, pw]);
  const adId = adR.rows[0].id;

  const fbCoachR = await db.query(`
    INSERT INTO users (school_id, name, email, password_hash, role)
    VALUES ($1,'Coach Williams','coach.football@lincoln.edu',$2,'coach')
    ON CONFLICT (email) DO UPDATE SET role='coach', school_id=$1
    RETURNING id
  `, [schoolId, pw]);
  const fbCoachId = fbCoachR.rows[0].id;

  const vbCoachR = await db.query(`
    INSERT INTO users (school_id, name, email, password_hash, role)
    VALUES ($1,'Coach Rivera','coach.volleyball@lincoln.edu',$2,'coach')
    ON CONFLICT (email) DO UPDATE SET role='coach', school_id=$1
    RETURNING id
  `, [schoolId, pw]);
  const vbCoachId = vbCoachR.rows[0].id;

  await db.query(`
    INSERT INTO users (school_id, name, email, password_hash, role)
    VALUES ($1,'Coach Thompson','coach.soccer@lincoln.edu',$2,'coach')
    ON CONFLICT (email) DO UPDATE SET role='coach', school_id=$1
  `, [schoolId, pw]);
  const socCoachR = await db.query(`SELECT id FROM users WHERE email='coach.soccer@lincoln.edu'`);
  const socCoachId = socCoachR.rows[0].id;

  // ── Sports teams ────────────────────────────────────────────────────────────
  async function upsertTeam(name, sport, coachId) {
    const existing = await db.query(`SELECT id FROM sports_teams WHERE school_id=$1 AND sport=$2`, [schoolId, sport]);
    if (existing.rows.length) return existing.rows[0].id;
    const r = await db.query(`
      INSERT INTO sports_teams (school_id, name, sport, season, coach_id, periods_required, periods_total)
      VALUES ($1,$2,$3,'fall_2026',$4,4,7) RETURNING id
    `, [schoolId, name, sport, coachId]);
    return r.rows[0].id;
  }

  const fbTeamId  = await upsertTeam('Varsity Football', 'football',   fbCoachId);
  const vbTeamId  = await upsertTeam('JV Volleyball',    'volleyball',  vbCoachId);
  const socTeamId = await upsertTeam('Girls Soccer',     'soccer',      socCoachId);

  // ── Game events for today ────────────────────────────────────────────────────
  // Roll forward any stale game dates from previous days to today
  await db.query(`UPDATE game_events SET game_date=$1 WHERE school_id=$2 AND game_date < $1`, [today, schoolId]);

  async function upsertGame(teamId, opponent, time, location, isHome) {
    const existing = await db.query(`SELECT id FROM game_events WHERE school_id=$1 AND team_id=$2 AND game_date=$3`, [schoolId, teamId, today]);
    if (existing.rows.length) return existing.rows[0].id;
    const r = await db.query(`
      INSERT INTO game_events (school_id, team_id, opponent, game_date, game_time, location, is_home, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled') RETURNING id
    `, [schoolId, teamId, opponent, today, time, location, isHome]);
    return r.rows[0].id;
  }

  const fbGameId  = await upsertGame(fbTeamId,  'Riverside High',    '16:00', 'Riverside Stadium', false);
  const vbGameId  = await upsertGame(vbTeamId,  'Central Middle',    '17:30', 'Lincoln Gymnasium',  true);
  const socGameId = await upsertGame(socTeamId, 'East Side Academy', '15:30', 'Lincoln Field',      true);

  // ── Period schedules ────────────────────────────────────────────────────────
  function periods(statuses) {
    return statuses.map((status, i) => ({ period: i + 1, label: `Period ${i + 1}`, status }));
  }
  const ALL     = periods(['present','present','present','present','present','present','present']);
  const THREE   = periods(['present','present','present','absent', 'absent', 'absent', 'absent']);
  const TWO     = periods(['present','present','absent', 'absent', 'absent', 'absent', 'absent']);
  const ONE     = periods(['present','absent', 'absent', 'absent', 'absent', 'absent', 'absent']);
  const ABSENT  = periods(['absent', 'absent', 'absent', 'absent', 'absent', 'absent', 'absent']);

  // ── Roster definitions ──────────────────────────────────────────────────────
  // scenario: cleared = 7/7, blocked variants, conflict = SIS absent but GPS on bus
  const footballRoster = [
    { name:'Marcus Johnson',  jersey:'12', pos:'QB',  schedule: ABSENT  }, // conflict: bus scan overrides
    { name:'Darius Cole',     jersey:'22', pos:'RB',  schedule: ALL     },
    { name:'Elijah Brooks',   jersey:'55', pos:'LB',  schedule: ALL     },
    { name:'Jaylen Brown',    jersey:'7',  pos:'WR',  schedule: ALL     },
    { name:'Devon Carter',    jersey:'88', pos:'TE',  schedule: ALL     },
    { name:'Malik Thompson',  jersey:'33', pos:'CB',  schedule: ALL     },
    { name:'Isaiah Grant',    jersey:'44', pos:'DE',  schedule: ALL     },
    { name:'Tariq Mason',     jersey:'91', pos:'DT',  schedule: ALL     },
    { name:'Cameron Ellis',   jersey:'10', pos:'S',   schedule: ALL     },
    { name:'Jordan Pierce',   jersey:'18', pos:'WR',  schedule: TWO     }, // 2/7 → blocked
    { name:'Brandon Scott',   jersey:'75', pos:'OL',  schedule: THREE   }, // 3/7 → blocked
    { name:'Tre Washington',  jersey:'1',  pos:'K',   schedule: ALL     },
  ];
  const volleyballRoster = [
    { name:'Aaliyah Williams', jersey:'2',  pos:'S',   schedule: ALL   },
    { name:'Zoe Martinez',     jersey:'10', pos:'MB',  schedule: ALL   },
    { name:'Brianna Hayes',    jersey:'14', pos:'OH',  schedule: ALL   },
    { name:'Destiny Ford',     jersey:'5',  pos:'L',   schedule: ALL   },
    { name:'Jasmine Reed',     jersey:'21', pos:'OH',  schedule: ALL   },
    { name:'Maya Simmons',     jersey:'8',  pos:'MB',  schedule: ALL   },
    { name:'Imani Foster',     jersey:'3',  pos:'RS',  schedule: ALL   },
    { name:'Kylie Torres',     jersey:'15', pos:'OH',  schedule: ALL   },
    { name:'Taylor Nguyen',    jersey:'11', pos:'DS',  schedule: ONE   }, // 1/7 → blocked
    { name:'Priya Patel',      jersey:'6',  pos:'MB',  schedule: THREE }, // 3/7 → blocked
  ];
  const soccerRoster = [
    { name:'Sofia Reyes',     jersey:'9',  pos:'F',  schedule: ALL },
    { name:'Emma Wilson',     jersey:'4',  pos:'MF', schedule: ALL },
    { name:'Chloe Jackson',   jersey:'17', pos:'D',  schedule: ALL },
    { name:'Naomi Baker',     jersey:'23', pos:'GK', schedule: ALL },
    { name:'Layla Hernandez', jersey:'11', pos:'F',  schedule: ALL },
    { name:'Amara Okafor',    jersey:'6',  pos:'MF', schedule: ALL },
    { name:'Grace Kim',       jersey:'13', pos:'D',  schedule: ALL },
    { name:'Riley Chen',      jersey:'1',  pos:'GK', schedule: ALL },
  ];

  // ── Upsert one athlete ────────────────────────────────────────────────────
  async function upsertAthlete(player, teamId) {
    // Get or create student
    const existingS = await db.query(`SELECT id FROM students WHERE name=$1 AND school_id=$2`, [player.name, schoolId]);
    let stuId;
    if (existingS.rows.length) {
      stuId = existingS.rows[0].id;
    } else {
      const r = await db.query(`
        INSERT INTO students (school_id, name, grade, student_number)
        VALUES ($1,$2,'7th',$3) RETURNING id
      `, [schoolId, player.name, `ATH${Math.floor(Math.random() * 9000) + 1000}`]);
      stuId = r.rows[0].id;
    }

    // Upsert athlete profile
    await db.query(`
      INSERT INTO athlete_profiles (student_id, team_id, athlete_id, jersey_number, position, is_active)
      VALUES ($1,$2,$3,$4,$5,true)
      ON CONFLICT (student_id, team_id) DO UPDATE SET jersey_number=$4, position=$5, is_active=true
    `, [stuId, teamId, `PIV-${schoolId}-${stuId}-${teamId}`, player.jersey, player.pos]);

    // Seed attendance periods for today
    for (const p of player.schedule) {
      await db.query(`
        INSERT INTO attendance_periods (student_id, date, period_number, period_name, status, source)
        VALUES ($1,$2,$3,$4,$5,'sandbox')
        ON CONFLICT (student_id, date, period_number) DO UPDATE SET status=$5
      `, [stuId, today, p.period, p.label, p.status]);
    }

    return stuId;
  }

  // Seed all rosters
  const fbIds  = [];
  for (const p of footballRoster)   fbIds.push(await upsertAthlete(p, fbTeamId));
  for (const p of volleyballRoster) await upsertAthlete(p, vbTeamId);
  for (const p of soccerRoster)     await upsertAthlete(p, socTeamId);

  // ── Conflict: Marcus (QB, jersey #12) — SIS absent, but scanned on team bus ──
  const marcusId = fbIds[0]; // Marcus is always first in footballRoster
  if (marcusId) {
    // Get or create team bus route
    let teamBusId;
    const busExisting = await db.query(`SELECT id FROM bus_routes WHERE school_id=$1 AND route_name='Team Bus — Away Game'`, [schoolId]);
    if (busExisting.rows.length) {
      teamBusId = busExisting.rows[0].id;
    } else {
      const r = await db.query(`
        INSERT INTO bus_routes (school_id, route_name, am_arrival_expected, pm_departure_expected)
        VALUES ($1,'Team Bus — Away Game','14:30','23:59') RETURNING id
      `, [schoolId]);
      teamBusId = r.rows[0].id;
    }

    // Only insert bus scan if one doesn't already exist today
    const scanExists = await db.query(`
      SELECT id FROM bus_scans WHERE student_id=$1 AND route_id=$2 AND scanned_at::date=$3
    `, [marcusId, teamBusId, today]);

    if (!scanExists.rows.length) {
      const scanTime = new Date();
      scanTime.setHours(14, 35, 0, 0); // 2:35 PM — boarding team bus after school
      await db.query(`
        INSERT INTO bus_scans (student_id, route_id, scan_type, scanned_at)
        VALUES ($1,$2,'board',$3)
      `, [marcusId, teamBusId, scanTime.toISOString()]);
    }
  }

  // ── Run eligibility check — populates game_day_eligibility for all 3 games ──
  await runEligibilityPulse('sandbox').catch(e =>
    console.error('[pivot-sandbox] eligibility pulse error:', e.message)
  );

  console.log(`[pivot-sandbox] ✓ 3 games live for ${today} — Football (1 conflict, 2 blocked), Volleyball (2 blocked), Soccer (all clear)`);
  console.log('[pivot-sandbox] Demo logins: ad@lincoln.edu / pivot123  |  coach.football@lincoln.edu / pivot123');

  return { adId, fbCoachId, fbGameId, vbGameId, socGameId };
}

module.exports = { loadPivotSandboxData };
