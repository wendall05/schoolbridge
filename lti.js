/**
 * LTI 1.3 Advantage — full OIDC login + launch flow
 * Allows SchoolBridge to embed inside Canvas, Schoology, Blackboard, D2L
 * as a trusted tool without requiring separate login.
 *
 * Flow:
 *   1. Platform → GET/POST /lti/login  (OIDC login initiation)
 *   2. We        → redirect to platform auth endpoint with state + nonce
 *   3. Platform  → POST /lti/launch    (id_token in body)
 *   4. We        → validate JWT via platform JWKs, establish session
 */

const { createRemoteJWKSet, jwtVerify } = require('jose');
const { query } = require('./db');
const { encrypt, decrypt } = require('./crypto');

// In-memory nonce/state store (replace with Redis in production)
const pendingLaunches = new Map();

function generateState() {
  return require('crypto').randomBytes(16).toString('hex');
}

// ── Platform registry ─────────────────────────────────────────────────────────

async function getPlatform(issuer, clientId) {
  const r = await query(
    `SELECT * FROM lti_platforms WHERE issuer=$1 AND client_id=$2`,
    [issuer, clientId]
  );
  return r.rows[0] || null;
}

async function registerPlatform({ districtId, platformName, issuer, clientId, authEndpoint, jwksUri, tokenEndpoint }) {
  const r = await query(`
    INSERT INTO lti_platforms (district_id, platform_name, issuer, client_id, auth_endpoint, jwks_uri, token_endpoint)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (issuer, client_id) DO UPDATE
      SET platform_name=$2, auth_endpoint=$5, jwks_uri=$6, token_endpoint=$7
    RETURNING id
  `, [districtId, platformName, issuer, clientId, authEndpoint, jwksUri, tokenEndpoint]);
  return r.rows[0].id;
}

// ── OIDC Login Initiation (Step 1 → 2) ───────────────────────────────────────

async function handleOidcLogin(req, res) {
  try {
    const { iss, login_hint, target_link_uri, lti_message_hint, client_id } = {
      ...req.query,
      ...req.body,
    };

    if (!iss || !login_hint) {
      return res.status(400).send('Missing iss or login_hint');
    }

    const platform = await getPlatform(iss, client_id || process.env.LTI_CLIENT_ID);
    if (!platform) {
      return res.status(400).send(`Unknown LTI platform: ${iss}`);
    }

    const state = generateState();
    const nonce = generateState();
    const redirectUri = `${process.env.APP_URL}/lti/launch`;

    // Store state → nonce mapping (expires in 5 min)
    pendingLaunches.set(state, { nonce, platformId: platform.id, iss, expiresAt: Date.now() + 5 * 60 * 1000 });

    const params = new URLSearchParams({
      scope: 'openid',
      response_type: 'id_token',
      client_id: platform.client_id,
      redirect_uri: redirectUri,
      login_hint,
      state,
      nonce,
      response_mode: 'form_post',
      prompt: 'none',
    });

    if (lti_message_hint) params.set('lti_message_hint', lti_message_hint);

    console.log(`[lti] OIDC login initiated for platform: ${platform.platform_name}`);
    res.redirect(`${platform.auth_endpoint}?${params.toString()}`);
  } catch (e) {
    console.error('[lti] OIDC login error:', e.message);
    res.status(500).send('LTI login failed');
  }
}

// ── LTI Launch (Step 3 → 4) ──────────────────────────────────────────────────

async function handleLaunch(req, res) {
  try {
    const { id_token, state } = req.body;

    if (!id_token || !state) {
      return res.status(400).send('Missing id_token or state');
    }

    // Validate state and retrieve nonce
    const pending = pendingLaunches.get(state);
    if (!pending || Date.now() > pending.expiresAt) {
      pendingLaunches.delete(state);
      return res.status(400).send('Invalid or expired state');
    }
    pendingLaunches.delete(state);

    // Load platform config
    const r = await query('SELECT * FROM lti_platforms WHERE id=$1', [pending.platformId]);
    const platform = r.rows[0];
    if (!platform) return res.status(400).send('Platform not found');

    // Verify JWT using platform's public JWKs
    const JWKS = createRemoteJWKSet(new URL(platform.jwks_uri));
    const { payload } = await jwtVerify(id_token, JWKS, {
      issuer: platform.issuer,
      audience: platform.client_id,
    });

    // Validate nonce
    if (payload.nonce !== pending.nonce) {
      return res.status(400).send('Nonce mismatch');
    }

    // Extract LTI claims
    const claims = extractClaims(payload);
    console.log(`[lti] Launch from ${platform.platform_name} — role: ${claims.role}, email: ${claims.email}`);

    // Find or provision user
    const user = await findOrProvisionUser(claims, platform);
    if (!user) return res.status(403).send('Unable to provision user from LTI launch');

    // Establish session
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.schoolId = user.school_id;
    req.session.consentTier = user.consent_tier || 3;
    req.session.ltiLaunch = {
      platformName: platform.platform_name,
      contextTitle: claims.contextTitle,
      launchedAt: new Date().toISOString(),
    };

    // Redirect to appropriate dashboard
    const dest = user.role === 'parent' ? '/#feed'
      : user.role === 'teacher' ? '/#attendance'
      : '/#admin';

    res.redirect(dest);
  } catch (e) {
    console.error('[lti] Launch error:', e.message);
    res.status(500).send(`LTI launch failed: ${e.message}`);
  }
}

// ── Claims extraction ─────────────────────────────────────────────────────────

function extractClaims(payload) {
  const ROLES_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/roles';
  const CONTEXT_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/context';
  const NAME_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/lis';

  const rawRoles = payload[ROLES_CLAIM] || [];
  let role = 'parent';
  if (rawRoles.some(r => r.includes('Instructor') || r.includes('TeachingAssistant'))) role = 'teacher';
  if (rawRoles.some(r => r.includes('Administrator') || r.includes('SysAdmin'))) role = 'admin';

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name || `${payload.given_name || ''} ${payload.family_name || ''}`.trim(),
    role,
    contextTitle: payload[CONTEXT_CLAIM]?.title || null,
    lisPersonSourcedId: payload[NAME_CLAIM]?.person_sourcedid || null,
  };
}

// ── User provisioning ─────────────────────────────────────────────────────────

async function findOrProvisionUser(claims, platform) {
  // Try to find existing user by email
  if (claims.email) {
    const r = await query('SELECT * FROM users WHERE email=$1', [encrypt(claims.email)]);
    if (r.rows[0]) return r.rows[0];
  }

  // Try by clever_id (reuse field for LTI sub)
  const bySub = await query('SELECT * FROM users WHERE clever_id=$1', [`lti:${claims.sub}`]);
  if (bySub.rows[0]) return bySub.rows[0];

  // Provision new user — find school linked to district
  const schoolR = await query('SELECT id FROM schools WHERE district_id=$1 LIMIT 1', [platform.district_id]);
  if (!schoolR.rows[0]) {
    console.error(`[lti] No school found for district ${platform.district_id}`);
    return null;
  }

  const r = await query(`
    INSERT INTO users (school_id, clever_id, name, email, role, consent_tier)
    VALUES ($1,$2,$3,$4,$5,3)
    RETURNING *
  `, [
    schoolR.rows[0].id,
    `lti:${claims.sub}`,
    encrypt(claims.name || 'LTI User'),
    claims.email ? encrypt(claims.email) : null,
    claims.role,
  ]);

  console.log(`[lti] Provisioned new user: ${claims.email} as ${claims.role}`);
  return r.rows[0];
}

// ── Deep linking (LTI Advantage) ─────────────────────────────────────────────
// Allows district admins to embed specific SchoolBridge views inside their LMS

async function handleDeepLink(req, res) {
  res.json({
    content_items: [
      {
        type: 'ltiResourceLink',
        title: 'SchoolBridge Parent Feed',
        url: `${process.env.APP_URL}/lti/launch`,
        custom: { target: 'feed' },
      },
      {
        type: 'ltiResourceLink',
        title: 'SchoolBridge Attendance',
        url: `${process.env.APP_URL}/lti/launch`,
        custom: { target: 'attendance' },
      },
    ],
  });
}

module.exports = { handleOidcLogin, handleLaunch, handleDeepLink, registerPlatform, getPlatform };
