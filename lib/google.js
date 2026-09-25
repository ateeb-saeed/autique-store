// "Continue with Google": verifies the ID token that Google's sign-in button
// gives the browser. The token is a JWT signed by Google; we check its RS256
// signature against Google's published keys, then its issuer, audience (our
// client id), expiry and that the email is verified. No extra npm packages.

const crypto = require('crypto');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const CLOCK_SKEW_SECONDS = 60;

// Google's signing keys, cached for as long as its Cache-Control header allows
let keys = null;          // { kid: KeyObject }
let keysExpireAt = 0;

async function loadKeys(forceRefresh) {
  if (keys && !forceRefresh && Date.now() < keysExpireAt) return keys;
  const res = await fetch(CERTS_URL, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Google certs ${res.status}`);
  const { keys: jwks } = await res.json();
  keys = Object.fromEntries(jwks.map(jwk => [jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' })]));
  const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  keysExpireAt = Date.now() + (maxAge ? Number(maxAge[1]) : 3600) * 1000;
  return keys;
}

const b64json = part => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

// Returns { sub, email, name } for a valid token, or throws.
async function verifyIdToken(idToken) {
  if (!CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID is not set');
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const header = b64json(parts[0]);
  const payload = b64json(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unexpected token algorithm');

  let key = (await loadKeys(false))[header.kid];
  if (!key) key = (await loadKeys(true))[header.kid]; // Google rotated its keys
  if (!key) throw new Error('Unknown signing key');
  const signedPart = Buffer.from(`${parts[0]}.${parts[1]}`);
  if (!crypto.verify('RSA-SHA256', signedPart, key, Buffer.from(parts[2], 'base64url'))) throw new Error('Bad signature');

  const now = Math.floor(Date.now() / 1000);
  if (!ISSUERS.includes(payload.iss)) throw new Error('Wrong issuer');
  if (payload.aud !== CLIENT_ID) throw new Error('Token is for a different app');
  if (!(payload.exp > now - CLOCK_SKEW_SECONDS)) throw new Error('Token expired');
  if (payload.iat && payload.iat > now + CLOCK_SKEW_SECONDS) throw new Error('Token issued in the future');
  if (!payload.sub || !payload.email || payload.email_verified !== true) throw new Error('Google email is not verified');

  return { sub: String(payload.sub), email: String(payload.email).toLowerCase(), name: String(payload.name || payload.given_name || payload.email.split('@')[0]) };
}

module.exports = { configured: !!CLIENT_ID, clientId: CLIENT_ID, verifyIdToken };
