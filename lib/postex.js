// PostEx (Call Courier) merchant API: booking, tracking, cancelling and the
// merchant's pickup addresses. Switched on by POSTEX_TOKEN; without it the
// store works exactly as before (tracking IDs are typed in by hand).
//
//   POSTEX_TOKEN                 merchant API token (sent as the "token" header; never logged)
//   POSTEX_PICKUP_ADDRESS_CODE   which pickup address bookings use (admin → Admin settings lists them)
//   POSTEX_WEBHOOK_SECRET        shared secret PostEx sends with status pushes to /webhooks/postex
//   POSTEX_WEBHOOK_HEADER        header that carries it (default X-PostEx-Secret)

const crypto = require('crypto');

const API = 'https://api.postex.pk/services/integration/api/order';
const TOKEN = process.env.POSTEX_TOKEN || '';
const PICKUP_ADDRESS_CODE = process.env.POSTEX_PICKUP_ADDRESS_CODE || '';
const WEBHOOK_SECRET = process.env.POSTEX_WEBHOOK_SECRET || '';
const WEBHOOK_HEADER = (process.env.POSTEX_WEBHOOK_HEADER || 'X-PostEx-Secret').trim();
const TIMEOUT_MS = 15000;

class PostexError extends Error {
  constructor(message, status, body) { super(message); this.status = status; this.body = body; }
}

// Calls API + path. Throws (with PostEx's own message and the response body) on a
// network error, a timeout, a non-2xx reply, or a statusCode other than "200".
async function sendPostex(path, method = 'GET', body) {
  if (!TOKEN) throw new PostexError('PostEx is not set up (POSTEX_TOKEN is missing).', 0, '');
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: { token: TOKEN, Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (e) {
    throw new PostexError(e.name === 'TimeoutError' ? `PostEx did not answer within ${TIMEOUT_MS / 1000} seconds.` : `Could not reach PostEx: ${e.cause ? e.cause.message || e.cause.code : e.message}`, 0, '');
  }
  const text = await res.text().catch(() => '');
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  const code = json && json.statusCode !== undefined ? String(json.statusCode) : null;
  if (!res.ok || (code !== null && code !== '200')) {
    const said = json && (json.statusMessage || json.message || json.error);
    throw new PostexError(`PostEx: ${said || `HTTP ${res.status}`}`, res.status, text.slice(0, 1000));
  }
  return json || {};
}

// PostEx wants a local mobile number like 03211234567
function localPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('0092')) d = '0' + d.slice(4);
  else if (d.startsWith('92') && d.length === 12) d = '0' + d.slice(2);
  else if (d.length === 10 && d.startsWith('3')) d = '0' + d;
  return d;
}

// The booking request for a store order. invoicePayment is what the rider collects:
// the order total for cash on delivery, nothing for an order already paid online.
function bookingFor(order) {
  const sh = order.shipping || {};
  const items = order.items || [];
  return {
    cityName: String(sh.city || '').trim(),
    customerName: String(sh.name || order.customerName || '').trim(),
    customerPhone: localPhone(sh.phone),
    deliveryAddress: [sh.address, sh.city, sh.province].map(x => String(x || '').trim()).filter(Boolean).join(', '),
    invoicePayment: order.paymentMethod === 'cod' ? Math.round(Number(order.total) || 0) : 0,
    orderDetail: items.map(i => `${i.qty}x ${i.name}`).join(', ').slice(0, 250),
    items: items.reduce((n, i) => n + (Number(i.qty) || 0), 0),
    invoiceDivision: 1,
    orderRefNumber: order.orderNumber,
    orderType: 'Normal',
    pickupAddressCode: PICKUP_ADDRESS_CODE
  };
}

async function createOrder(order) {
  if (!PICKUP_ADDRESS_CODE) throw new PostexError('Set POSTEX_PICKUP_ADDRESS_CODE first. Admin settings → PostEx lists your pickup address codes.', 0, '');
  const r = await sendPostex('/v3/create-order', 'POST', bookingFor(order));
  const trackingNumber = String((r.dist && r.dist.trackingNumber) || r.trackingNumber || '').trim();
  if (!trackingNumber) throw new PostexError('PostEx accepted the request but sent back no tracking number. Check the PostEx portal before booking again.', 200, JSON.stringify(r).slice(0, 1000));
  return { trackingNumber, response: r };
}

// The latest status PostEx reports for a tracking number
function statusFrom(obj) {
  if (!obj || typeof obj !== 'object') return '';
  for (const k of ['transactionStatus', 'orderStatus', 'status']) {
    if (typeof obj[k] === 'string' && obj[k].trim()) return obj[k].trim();
  }
  return '';
}
async function trackOrder(trackingNumber) {
  const r = await sendPostex(`/v1/track-order/${encodeURIComponent(trackingNumber)}`, 'GET');
  const d = Array.isArray(r.dist) ? r.dist[0] : r.dist;
  let status = statusFrom(d) || statusFrom(r);
  if (!status && d && Array.isArray(d.transactionStatusHistory) && d.transactionStatusHistory.length) {
    status = statusFrom(d.transactionStatusHistory[d.transactionStatusHistory.length - 1]) || String(d.transactionStatusHistory[d.transactionStatusHistory.length - 1].transactionStatusMessage || '');
  }
  if (!status) throw new PostexError('PostEx answered but the reply had no status in it.', 200, JSON.stringify(r).slice(0, 1000));
  return { status, response: r };
}

async function cancelOrder(trackingNumber) {
  return sendPostex('/v1/cancel-order', 'PUT', { trackingNumber });
}

async function merchantAddresses() {
  const r = await sendPostex('/v1/get-merchant-address', 'GET');
  const list = Array.isArray(r.dist) ? r.dist : Array.isArray(r.data) ? r.data : [];
  return list.map(a => ({
    addressCode: String(a.addressCode || a.address_code || ''),
    address: String(a.address || a.pickupAddress || ''),
    city: String(a.cityName || a.city || ''),
    type: String(a.addressType || a.type || '')
  }));
}

// ---------- status pushes (/webhooks/postex) ----------
function webhookAuthorized(headerValue) {
  if (!WEBHOOK_SECRET || typeof headerValue !== 'string') return false;
  // hash both sides so the compare is constant-time whatever the lengths
  const a = crypto.createHash('sha256').update(headerValue).digest();
  const b = crypto.createHash('sha256').update(WEBHOOK_SECRET).digest();
  return crypto.timingSafeEqual(a, b);
}
// There is no published payload format, so look in the body and one level down.
function pickFirst(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (const k of keys) {
    const v = obj[k];
    if ((typeof v === 'string' && v.trim()) || typeof v === 'number') return String(v).trim();
  }
  return '';
}
function readWebhook(payload) {
  const places = [payload, payload && payload.dist, payload && payload.data, payload && payload.order].filter(p => p && typeof p === 'object' && !Array.isArray(p));
  let trackingNumber = '', status = '';
  for (const p of places) {
    trackingNumber = trackingNumber || pickFirst(p, ['trackingNumber', 'tracking_number', 'CN']);
    status = status || pickFirst(p, ['transactionStatus', 'status', 'orderStatus']);
  }
  return { trackingNumber, status };
}

module.exports = {
  configured: !!TOKEN, pickupAddressCode: PICKUP_ADDRESS_CODE, webhookHeader: WEBHOOK_HEADER, webhookConfigured: !!WEBHOOK_SECRET,
  sendPostex, bookingFor, createOrder, trackOrder, cancelOrder, merchantAddresses, webhookAuthorized, readWebhook, PostexError
};
