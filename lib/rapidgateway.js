// Rapid Gateway (rapidgateway.pk): hosted checkout for the "card" payment option.
//
// Flow: POST /api/orders saves the order as "Awaiting payment", creates a
// payment here and sends the customer to its checkout_url. Rapid Gateway
// returns them to PUBLIC_BASE_URL/?order=<orderNumber> and confirms the result
// separately with a signed webhook to PUBLIC_BASE_URL/webhooks/rg.

const crypto = require('crypto');

const API_URL = 'https://api.rapidgateway.pk/v1/payments';
const SECRET_KEY = process.env.RG_SECRET_KEY || '';
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

async function createPayment({ orderId, orderNumber, amount, phone }) {
  if (!SECRET_KEY) throw new Error('RG_SECRET_KEY is not set');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': String(orderId)
    },
    body: JSON.stringify({
      amount: Math.round(amount),
      currency: 'PKR',
      methods: ['easypaisa', 'jazzcash', 'card'],
      customer: { phone },
      return_url: `${PUBLIC_BASE_URL}/?order=${encodeURIComponent(orderNumber)}`,
      webhook_url: `${PUBLIC_BASE_URL}/webhooks/rg`
    }),
    signal: AbortSignal.timeout(15000)
  });
  let data = null;
  try { data = await res.json(); } catch { /* not json */ }
  if (!res.ok) {
    const msg = data && (data.message || data.error);
    throw new Error(`Rapid Gateway ${res.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg || data)}`);
  }
  if (!data || !data.id || !data.checkout_url) throw new Error('Rapid Gateway response had no id or checkout_url');
  return { id: data.id, checkoutUrl: data.checkout_url };
}

// X-RG-Signature must be the hex HMAC-SHA256 of the raw body with RG_WEBHOOK_SECRET.
function verifySignature(rawBody, header) {
  if (!WEBHOOK_SECRET || !header || !Buffer.isBuffer(rawBody)) return false;
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
  const given = String(header).trim().replace(/^sha256=/i, '').toLowerCase();
  const a = Buffer.from(given, 'utf8'), b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { configured: !!SECRET_KEY, PUBLIC_BASE_URL, toE164PK, createPayment, verifySignature };
