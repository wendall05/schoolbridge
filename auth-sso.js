/**
 * SSO module — Clever OAuth2, ClassLink OAuth2, SAML 2.0
 * Covers ~90% of US districts via these three providers.
 */

const { encrypt, decrypt } = require('./crypto');
const { query } = require('./db');

// ── Shared OAuth2 helpers ─────────────────────────────────────────────────────

async function exchangeCodeForToken(tokenUrl, code, clientId, clientSecret, redirectUri) {
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return res.json();
}

async function findOrCreateUser(providerKey, providerId, name, email, role, schoolId) {
  // Try by provider ID
  const existing = await query('SELECT * FROM users WHERE clever_id=$1', [`${providerKey}:${providerId}`]);
  if (existing.rows[0]) return existing.rows[0];

  // Try by email
  if (email) {
    const byEmail = await query('SELECT * FROM users WHERE email=$1', [encrypt(email)]);
    if (byEmail.rows[0]) {
      // Link provider ID
      await query('UPDATE users SET clever_id=$1 WHERE id=$2', [`${providerKey}:${providerId}`, byEmail.rows[0].id]);
      return byEmail.rows[0];
    }
  }

  // Provision
  const r = await query(`
    INSERT INTO users (school_id, clever_id, name, email, role, consent_tier)
    VALUES ($1,$2,$3,$4,$5,3) RETURNING *
  `, [schoolId, `${providerKey}:${providerId}`, encrypt(name || 'User'), email ? encrypt(email) : null, role || 'parent']);

  console.log(`[sso] Provisioned ${providerKey} user: ${email} as ${role}`);
  return r.rows[0];
}

// ── Clever OAuth2 ─────────────────────────────────────────────────────────────

const CLEVER_TOKEN_URL = 'https://clever.com/oauth/tokens';
const CLEVER_API = 'https://api.clever.com/v3.0';

async function cleverAuthUrl(redirectUri) {
  const clientId = process.env.CLEVER_CLIENT_ID;
  if (!clientId) throw new Error('CLEVER_CLIENT_ID not configured');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:user_id read:students read:teachers read:sections read:school_admin',
  });
  return `https://clever.com/oauth/authorize?${params}`;
}

async function cleverCallback(code, redirectUri) {
  const clientId = process.env.CLEVER_CLIENT_ID;
  const clientSecret = process.env.CLEVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Clever credentials not configured');

  const tokens = await exchangeCodeForToken(CLEVER_TOKEN_URL, code, clientId, clientSecret, redirectUri);

  const meRes = await fetch(`${CLEVER_API}/me`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!meRes.ok) throw new Error(`Clever /me failed: ${meRes.status}`);
  const me = await meRes.json();

  // Determine role from Clever type
  const cleverType = me.data?.type;
  const role = cleverType === 'teacher' ? 'teacher'
    : cleverType === 'school_admin' || cleverType === 'district_admin' ? 'admin'
    : 'parent';

  // Fetch profile details
  const profilePath = cleverType === 'teacher' ? `/teachers/${me.data.id}`
    : cleverType === 'student' ? `/students/${me.data.id}`
    : `/school_admins/${me.data.id}`;

  const profileRes = await fetch(`${CLEVER_API}${profilePath}`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = profileRes.ok ? (await profileRes.json()).data : {};

  // Find school
  const schoolCleverIdPath = profile.school || profile.schools?.[0];
  let schoolId = null;
  if (schoolCleverIdPath) {
    const schoolR = await query('SELECT id FROM schools WHERE clever_id=$1', [schoolCleverIdPath]);
    schoolId = schoolR.rows[0]?.id || null;
  }

  const name = [profile.name?.first, profile.name?.last].filter(Boolean).join(' ') || 'Clever User';
  return findOrCreateUser('clever', me.data.id, name, profile.email, role, schoolId);
}

// ── ClassLink OAuth2 ──────────────────────────────────────────────────────────

const CLASSLINK_TOKEN_URL = 'https://launchpad.classlink.com/oauth2/v2/token';
const CLASSLINK_API = 'https://nodeapi.classlink.com/v2';

async function classLinkAuthUrl(redirectUri) {
  const clientId = process.env.CLASSLINK_CLIENT_ID;
  if (!clientId) throw new Error('CLASSLINK_CLIENT_ID not configured');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'profile',
  });
  return `https://launchpad.classlink.com/oauth2/v2/auth?${params}`;
}

async function classLinkCallback(code, redirectUri) {
  const clientId = process.env.CLASSLINK_CLIENT_ID;
  const clientSecret = process.env.CLASSLINK_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('ClassLink credentials not configured');

  const tokens = await exchangeCodeForToken(CLASSLINK_TOKEN_URL, code, clientId, clientSecret, redirectUri);

  const meRes = await fetch(`${CLASSLINK_API}/my/info`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!meRes.ok) throw new Error(`ClassLink /my/info failed: ${meRes.status}`);
  const me = await meRes.json();

  const role = me.Role === 'Teacher' ? 'teacher'
    : me.Role === 'Administrator' ? 'admin'
    : 'parent';

  const schoolR = await query('SELECT id FROM schools WHERE name ILIKE $1 LIMIT 1', [`%${me.School || ''}%`]);
  const schoolId = schoolR.rows[0]?.id || null;

  const name = [me.FirstName, me.LastName].filter(Boolean).join(' ') || 'ClassLink User';
  return findOrCreateUser('classlink', me.UserId, name, me.Email, role, schoolId);
}

// ── SAML 2.0 (Google Workspace for Education + Microsoft Education) ───────────

let _saml = null;

function getSaml() {
  if (_saml) return _saml;
  const { SAML } = require('@node-saml/node-saml');
  _saml = new SAML({
    callbackUrl: `${process.env.APP_URL}/auth/saml/callback`,
    entryPoint: process.env.SAML_ENTRY_POINT,
    issuer: process.env.APP_URL || 'schoolbridge',
    cert: process.env.SAML_IDP_CERT,
    privateKey: process.env.SAML_PRIVATE_KEY,
    signatureAlgorithm: 'sha256',
    digestAlgorithm: 'sha256',
    wantAssertionsSigned: true,
    identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  });
  return _saml;
}

async function samlAuthUrl(req) {
  if (!process.env.SAML_ENTRY_POINT) throw new Error('SAML_ENTRY_POINT not configured');
  return new Promise((resolve, reject) => {
    getSaml().getAuthorizeUrl({ req }, (err, url) => {
      if (err) reject(err); else resolve(url);
    });
  });
}

async function samlCallback(req) {
  if (!process.env.SAML_ENTRY_POINT) throw new Error('SAML not configured');
  return new Promise((resolve, reject) => {
    getSaml().validatePostResponse(req.body, async (err, profile) => {
      if (err) return reject(err);

      const email = profile.nameID || profile.email || profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'];
      const name = profile.displayName || profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] || email;
      const rawRole = profile['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] || profile.role || '';
      const role = /teacher/i.test(rawRole) ? 'teacher' : /admin/i.test(rawRole) ? 'admin' : 'parent';

      const schoolR = await query('SELECT id FROM schools LIMIT 1');
      const schoolId = schoolR.rows[0]?.id || null;

      try {
        const user = await findOrCreateUser('saml', email, name, email, role, schoolId);
        resolve(user);
      } catch (e) { reject(e); }
    });
  });
}

module.exports = {
  cleverAuthUrl, cleverCallback,
  classLinkAuthUrl, classLinkCallback,
  samlAuthUrl, samlCallback,
};
