// Rapid Gateway: hosted checkout for the "Pay online" option.
//
// Flow: POST /api/orders saves the order as "Awaiting payment", then:
//   1. gets an OAuth2 access token (cached in memory until it expires),
//   2. posts the order to process-transaction, which answers with a 3xx
//      redirect; its Location header is the checkout URL we send the customer to.
// Rapid Gateway returns the customer to success_url / failure_url and confirms
// the result separately with a signed webhook to PUBLIC_BASE_URL/webhooks/rg.

const crypto = require('crypto');

const RG_BASE = 'https://secure.rapid-gateway.com';
const TOKEN_URL = `${RG_BASE}/oauth2/token`;
const PROCESS_URL = `${RG_BASE}/sandbox/process-transaction`;
const CLIENT_ID = process.env.RG_SANDBOX_CLIENT_ID || 'client';
const CLIENT_SECRET = process.env.RG_SANDBOX_CLIENT_SECRET || 'secret';
const MERCHANT_ID = process.env.RG_MERCHANT_ID || '';
const WEBHOOK_SECRET = process.env.RG_WEBHOOK_SECRET || '';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

// Pakistani mobile number -> E.164 (+923XXXXXXXXX), or null if it isn't one.
// Accepts 03XX XXXXXXX, 3XXXXXXXXX, 923XXXXXXXXX, +92 3XX..., 0092 3XX...
function toE164PK(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('0092')) d = d.slice(4);
  else if (d.startsWith('92')) d = d.slice(2);
  else if (d.startsWith('0')) d = d.slice(1);
  return /^3\d{9}$/.test(d) ? `+92${d}` : null;
}

// ---------- OAuth2 access token, cached until shortly before it expires ----------
let cachedToken = null;      // { value, expiresAt }
let tokenRequest = null;     // shared while a fetch is in flight

async function fetchToken() {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
    signal: AbortSignal.timeout(15000)
  });
  let data = null;
  try { data = await res.json(); } catch { /* not json */ }
  if (!res.ok || !data || !data.access_token) {
    throw new Error(`Rapid Gateway token ${res.status}: ${JSON.stringify(data)}`);
  }
  const lifetime = Number(data.expires_in) > 0 ? Number(data.expires_in) : 300;
  // refresh a minute early (or at half-life for very short tokens)
  const margin = Math.min(60, lifetime / 2);
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (lifetime - margin) * 1000 };
  return cachedToken.value;
}

async function getToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  if (!tokenRequest) tokenRequest = fetchToken().finally(() => { tokenRequest = null; });
  return tokenRequest;
}

// ---------- launch the hosted checkout ----------
async function postTransaction(token, form) {
  return fetch(PROCESS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    redirect: 'manual',          // capture the redirect, don't follow it
    signal: AbortSignal.timeout(15000)
  });
}

async function createPayment({ orderNumber, amount, phone }) {
  if (!MERCHANT_ID) throw new Error('RG_MERCHANT_ID is not set');
  const order = encodeURIComponent(orderNumber);
  const form = new URLSearchParams({
    merchant_id: MERCHANT_ID,
    merchant_name: 'Autique',
    amount: String(Math.round(amount)),
    customer_mobile: String(phone || '').replace(/\D/g, ''),
    basket_id: orderNumber,
    success_url: `${PUBLIC_BASE_URL}/?order=${order}`,
    failure_url: `${PUBLIC_BASE_URL}/?order=${order}&failed=1`
  });

  let res = await postTransaction(await getToken(), form);
  if (res.status === 401) {
    // token revoked or expired early: fetch a fresh one and try once more
    cachedToken = null;
    res = await postTransaction(await getToken(), form);
  }
  const location = res.headers.get('location');
  if (res.status < 300 || res.status >= 400 || !location) {
    let body = '';
    try { body = (await res.text()).slice(0, 300); } catch { /* ignore */ }
    throw new Error(`Rapid Gateway process-transaction ${res.status} without a redirect: ${body}`);
  }
  return { checkoutUrl: new URL(location, PROCESS_URL).toString() };
}

// Webhook verification, per rapidgateway.pk/resources/payment-webhooks-guide:
//   X-RapidGateway-Signature = uppercase hex HMAC-SHA256(salt, timestamp + "." + rawBody)
//   X-RapidGateway-Timestamp = Unix seconds; reject if more than 5 minutes from now.
// The salt is the webhook signing secret from Dashboard → Settings → Webhooks. While
// it is being rotated, both the new and the previous salt must verify, so set
// RG_WEBHOOK_SECRET_PREVIOUS to the old one until the rotation window ends.
const WEBHOOK_SALTS = [WEBHOOK_SECRET, process.env.RG_WEBHOOK_SECRET_PREVIOUS || ''].filter(Boolean);
const TIMESTAMP_TOLERANCE_SECONDS = 300;

function verifyWebhook(rawBody, timestamp, signature) {
  if (!WEBHOOK_SALTS.length || !Buffer.isBuffer(rawBody) || !timestamp || !signature) return false;
  if (!/^\d+$/.test(String(timestamp))) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > TIMESTAMP_TOLERANCE_SECONDS) return false;
  const given = Buffer.from(String(signature).trim().toUpperCase(), 'utf8');
  const signed = Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), rawBody]);
  return WEBHOOK_SALTS.some(salt => {
    const expected = Buffer.from(crypto.createHmac('sha256', salt).update(signed).digest('hex').toUpperCase(), 'utf8');
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  });
}

module.exports = { configured: !!MERCHANT_ID, PUBLIC_BASE_URL, toE164PK, createPayment, verifyWebhook };
