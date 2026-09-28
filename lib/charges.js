// Delivery charges and the advance (online) payment discount, both set in
// admin → Delivery & payment and applied automatically to every order.
//
// Delivery charges come in rate schedules. Each schedule has an "effective
// from" date and time and a list of delivery options (e.g. Standard, Express),
// each with tiers by order value: "from Rs. 0 → Rs. 250, from Rs. 3,000 → free".
// The schedule in force is the latest one whose start time has passed, so a new
// schedule can be set up in advance and switches on by itself.
//
// Order value for the tiers = items subtotal minus any discount code (before the
// online-payment discount, so choosing to pay online never raises the delivery fee).
//
// Stored in data/charges.json. With nothing saved, delivery is free and there is
// no online-payment discount (how the store worked before).

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'charges.json');
const DEFAULTS = {
  delivery: { schedules: [] },
  prepaid: { enabled: false, type: 'percent', value: 0, maxDiscount: 0, minOrder: 0, headline: '', startsAt: '', endsAt: '' }
};
const FREE_OPTION = { key: 'standard', name: 'Standard delivery', description: 'PostEx (Call Courier), across Pakistan', tiers: [{ min: 0, fee: 0 }] };

function load() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch { /* nothing saved yet */ }
  return {
    delivery: { schedules: Array.isArray(saved.delivery && saved.delivery.schedules) ? saved.delivery.schedules : [] },
    prepaid: { ...DEFAULTS.prepaid, ...(saved.prepaid || {}) }
  };
}
function save(cfg) { fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2)); }

const money = v => Math.max(0, Math.round(Number(v) || 0));
const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const validDate = v => v && !isNaN(Date.parse(v));
const slugKey = s => clean(s, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'option';

// The schedule in force at `now` (null when none has started yet)
function scheduleAt(cfg, now = new Date()) {
  return cfg.delivery.schedules
    .filter(s => validDate(s.effectiveFrom) && Date.parse(s.effectiveFrom) <= now.getTime())
    .sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom))[0] || null;
}
function feeFor(option, orderValue) {
  const tiers = option.tiers.slice().sort((a, b) => a.min - b.min);
  const tier = tiers.filter(t => orderValue >= t.min).pop() || tiers[0];
  return tier ? money(tier.fee) : 0;
}
// Delivery options open to customers now, with the fee for this order value.
// `next` tells the customer how much more to spend to reach a cheaper tier.
function deliveryOptions(orderValue, now = new Date(), cfg = load()) {
  const sched = scheduleAt(cfg, now);
  const options = sched ? sched.options.filter(o => o.active !== false) : [];
  return (options.length ? options : [FREE_OPTION]).map(o => {
    const fee = feeFor(o, orderValue);
    const cheaper = o.tiers.filter(t => t.min > orderValue && money(t.fee) < fee).sort((a, b) => a.min - b.min)[0];
    return { key: o.key, name: o.name, description: o.description || '', fee, next: cheaper ? { spend: cheaper.min - orderValue, fee: money(cheaper.fee) } : null };
  });
}

function prepaidActive(p, now = new Date()) {
  if (!p.enabled || !(Number(p.value) > 0)) return false;
  if (validDate(p.startsAt) && Date.parse(p.startsAt) > now.getTime()) return false;
  if (validDate(p.endsAt) && Date.parse(p.endsAt) <= now.getTime()) return false;
  return true;
}
function prepaidAmount(p, goods) {
  if (goods < (Number(p.minOrder) || 0)) return 0;
  let amount = p.type === 'fixed' ? money(p.value) : Math.round(goods * Math.min(Number(p.value), 90) / 100);
  if (p.type !== 'fixed' && Number(p.maxDiscount) > 0) amount = Math.min(amount, money(p.maxDiscount));
  return Math.min(amount, goods);
}
// What customers are told about the online-payment discount (null when off)
function prepaidOffer(now = new Date(), cfg = load()) {
  const p = cfg.prepaid;
  if (!prepaidActive(p, now)) return null;
  const what = p.type === 'fixed' ? `Rs. ${money(p.value).toLocaleString('en-US')} off` : `${Number(p.value)}% off`;
  return {
    type: p.type, value: Number(p.value), maxDiscount: money(p.maxDiscount), minOrder: money(p.minOrder),
    label: what,
    headline: p.headline || `Pay online and get ${what} your order`,
    endsAt: validDate(p.endsAt) ? p.endsAt : ''
  };
}

// The full price of an order. subtotal and couponDiscount are the goods; the
// result adds delivery and takes off the online-payment discount when paying online.
function quote({ subtotal, couponDiscount = 0, paymentMethod = 'cod', deliveryKey = '' }, now = new Date()) {
  const cfg = load();
  const goods = Math.max(0, money(subtotal) - money(couponDiscount));
  const options = deliveryOptions(goods, now, cfg);
  const chosen = options.find(o => o.key === deliveryKey) || options[0];
  const offer = prepaidOffer(now, cfg);
  const onlineDiscount = offer ? prepaidAmount(cfg.prepaid, goods) : 0;
  const prepaidDiscount = paymentMethod === 'card' ? onlineDiscount : 0;
  return {
    goods, options, delivery: chosen, deliveryFee: chosen.fee,
    offer, onlineDiscount, prepaidDiscount,
    total: Math.max(0, goods - prepaidDiscount + chosen.fee)
  };
}

// Check and tidy what the admin sends. Returns { cfg } or { error }.
function sanitize(body) {
  const b = body || {};
  const schedules = [];
  const inSchedules = (b.delivery && Array.isArray(b.delivery.schedules)) ? b.delivery.schedules.slice(0, 50) : [];
  for (const [i, s] of inSchedules.entries()) {
    if (!validDate(s.effectiveFrom)) return { error: `Rate schedule ${i + 1}: choose the date and time it takes effect.` };
    const options = [], keys = new Set();
    for (const o of (Array.isArray(s.options) ? s.options : []).slice(0, 10)) {
      const name = clean(o.name, 60);
      if (!name) return { error: `Rate schedule ${i + 1}: every delivery option needs a name.` };
      let key = clean(o.key, 40) || slugKey(name);
      while (keys.has(key)) key += '-2';
      keys.add(key);
      const tiers = (Array.isArray(o.tiers) ? o.tiers : []).slice(0, 12)
        .map(t => ({ min: money(t.min), fee: money(t.fee) }))
        .sort((a, b) => a.min - b.min)
        .filter((t, k, arr) => k === 0 || t.min !== arr[k - 1].min);
      if (!tiers.length) return { error: `"${name}": add at least one charge.` };
      tiers[0].min = 0;   // every order value is covered
      options.push({ key, name, description: clean(o.description, 140), active: o.active !== false, tiers });
    }
    if (!options.length) return { error: `Rate schedule ${i + 1}: add at least one delivery option.` };
    if (!options.some(o => o.active)) return { error: `Rate schedule ${i + 1}: switch on at least one delivery option.` };
    schedules.push({ id: clean(s.id, 40) || `s${Date.now().toString(36)}${i}`, label: clean(s.label, 80), effectiveFrom: new Date(s.effectiveFrom).toISOString(), options });
  }
  const p = b.prepaid || {};
  const prepaid = {
    enabled: p.enabled === true,
    type: p.type === 'fixed' ? 'fixed' : 'percent',
    value: p.type === 'fixed' ? money(p.value) : Math.min(90, Math.max(0, Math.round((Number(p.value) || 0) * 10) / 10)),
    maxDiscount: money(p.maxDiscount), minOrder: money(p.minOrder),
    headline: clean(p.headline, 120),
    startsAt: validDate(p.startsAt) ? new Date(p.startsAt).toISOString() : '',
    endsAt: validDate(p.endsAt) ? new Date(p.endsAt).toISOString() : ''
  };
  if (prepaid.enabled && !(prepaid.value > 0)) return { error: 'Enter the online-payment discount (above 0), or switch it off.' };
  if (prepaid.startsAt && prepaid.endsAt && prepaid.endsAt <= prepaid.startsAt) return { error: 'The discount must end after it starts.' };
  return { cfg: { delivery: { schedules: schedules.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)) }, prepaid } };
}

module.exports = { load, save, sanitize, quote, deliveryOptions, prepaidOffer, scheduleAt };
