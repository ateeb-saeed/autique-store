// Rapid Gateway (rapidgateway.pk) card payments, via its hosted checkout.
//
// Flow: the store creates a payment, sends the customer to the gateway's
// checkout_url, and the gateway sends them back to our callback URL. We never
// trust that redirect on its own: the payment status is always re-read from
// the gateway (or confirmed by a signed webhook) before an order is marked paid.
//
// Everything specific to Rapid Gateway's API lives in this file.
//
// !! VERIFY AGAINST RAPID GATEWAY'S MERCHANT DOCS BEFORE GOING LIVE !!
// Their public site only shows payments.create({ amount, currency, methods,
// customer, callback_url }) returning checkout_url. The pieces marked
// ASSUMPTION below (base URL, auth header, status names, webhook signature,
// amount units) come from common gateway conventions and must be checked
// against the docs you get with your sandbox account.
//
// With no RAPID_API_KEY set, the store runs in TEST MODE: a local page stands
// in for the gateway so the whole flow can be tried without real money.

const crypto = require('crypto');
const store = require('./store');

const API_BASE = (process.env.RAPID_API_BASE || 'https://api.rapidgateway.pk/v1').replace(/\/$/, ''); // ASSUMPTION
const API_KEY = process.env.RAPID_API_KEY || '';
const WEBHOOK_SECRET = process.env.RAPID_WEBHOOK_SECRET || '';
// ASSUMPTION: amount is in whole rupees (their example sends 5000 PKR).
// If the docs say paisa, set RAPID_AMOUNT_MULTIPLIER=100.
const AMOUNT_MULTIPLIER = Number(process.env.RAPID_AMOUNT_MULTIPLIER) || 1;
const SIGNATURE_HEADER = (process.env.RAPID_SIGNATURE_HEADER || 'x-rapid-signature').toLowerCase(); // ASSUMPTION

const mode = API_KEY ? 'live' : 'test';

// Map whatever status words the gateway uses onto ours: paid / failed / pending.
// ASSUMPTION: the exact status names; unknown values stay "pending".
function normalizeStatus(status) {
  const s = String(status || '').toLowerCase();
  if (['paid', 'succeeded', 'success', 'successful', 'captured', 'completed', 'approved'].includes(s)) return 'paid';
  if (['failed', 'declined', 'cancelled', 'canceled', 'expired', 'rejected', 'voided'].includes(s)) return 'failed';
  return 'pending';
}

async function request(method, urlPath, body) {
  const res = await fetch(`${API_BASE}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`, // ASSUMPTION
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch { /* not json */ }
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `Rapid Gateway responded ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

// ---------- test mode: a local stand-in for the gateway ----------
function testCreate({ order, callbackUrl, baseUrl }) {
  const payments = store.getPayments();
  const payment = {
    id: `test_${crypto.randomBytes(9).toString('hex')}`,
    orderNumber: order.orderNumber,
    amount: order.total,
    status: 'pending',
    callbackUrl,
    createdAt: new Date().toISOString()
  };
  payments.push(payment);
  store.savePayments(payments);
  return { id: payment.id, checkoutUrl: `${baseUrl}/pay/test/${payment.id}` };
}

function testFind(id) {
  return store.getPayments().find(p => p.id === id) || null;
}

function testComplete(id, approve) {
  const payments = store.getPayments();
  const payment = payments.find(p => p.id === id);
  if (!payment) return null;
  if (payment.status === 'pending') payment.status = approve ? 'paid' : 'failed';
  store.savePayments(payments);
  return payment;
}

// ---------- public interface ----------
async function createPayment({ order, callbackUrl, webhookUrl, baseUrl }) {
  if (mode === 'test') return testCreate({ order, callbackUrl, baseUrl });
  const payment = await request('POST', '/payments', {
    amount: order.total * AMOUNT_MULTIPLIER,
    currency: 'PKR',
    methods: ['card'],
    reference: order.orderNumber,          // ASSUMPTION: field name for our order id
    description: `Autique order ${order.orderNumber}`,
    customer: { name: order.customerName, email: order.customerEmail, phone: order.shipping.phone },
    callback_url: callbackUrl,
    webhook_url: webhookUrl                // ASSUMPTION: may instead be set once in the merchant dashboard
  });
  const id = payment.id || payment.payment_id;
  const checkoutUrl = payment.checkout_url;
  if (!id || !checkoutUrl) throw new Error('Rapid Gateway did not return a checkout link.');
  return { id, checkoutUrl };
}

async function getPaymentStatus(id) {
  if (mode === 'test') {
    const p = testFind(id);
    return p ? p.status : 'failed';
  }
  const payment = await request('GET', `/payments/${encodeURIComponent(id)}`); // ASSUMPTION
  return normalizeStatus(payment.status);
}

// Webhook body -> { paymentId, reference, status } or null if the signature is wrong.
// ASSUMPTION: hex HMAC-SHA256 of the raw body with the webhook secret.
function parseWebhook(rawBody, headers) {
  if (!WEBHOOK_SECRET) return null;
  const given = String(headers[SIGNATURE_HEADER] || '').replace(/^sha256=/, '');
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
  const a = Buffer.from(given, 'utf8'), b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let event;
  try { event = JSON.parse(rawBody.toString('utf8')); } catch { return null; }
  const data = event.data || event.payment || event;
  return {
    paymentId: data.id || data.payment_id || '',
    reference: data.reference || '',
    status: normalizeStatus(data.status)
  };
}

module.exports = { mode, createPayment, getPaymentStatus, parseWebhook, testFind, testComplete };
