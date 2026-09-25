// Customer emails at each stage of an order: placed, confirmed, dispatched
// (with the invoice / dispatch note PDF attached) and delivered.
//
// Each stage is sent at most once per order. order.emails[stage] records it:
// { status: 'queued' | 'sent' | 'saved' | 'off' | 'failed', at, error? }.
// 'off' (no mail server set up) and 'failed' may be sent again on a later
// status change; the others never repeat.

const store = require('./store');
const site = require('./siteConfig');
const mailer = require('./mailer');
const { buildInvoicePdf, pkDay } = require('./invoice');

const BASE = (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const DONE = ['queued', 'sent', 'saved'];
const STAGE_TEMPLATES = ['placed', 'confirmed', 'dispatched', 'delivered'];

// Which email a new order status triggers.
const STAGE_FOR_STATUS = { Confirmed: 'confirmed', Dispatched: 'dispatched', Shipped: 'dispatched', Delivered: 'delivered' };

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rs = n => 'Rs. ' + Math.round(Number(n) || 0).toLocaleString('en-US');
const trackUrl = o => `${BASE}/#/track?n=${encodeURIComponent(o.orderNumber)}`;
const postexUrl = o => o.trackingId ? `https://postex.pk/tracking?cn=${encodeURIComponent(o.trackingId)}` : '';
const firstName = o => String((o.shipping && o.shipping.name) || o.customerName || '').trim().split(/\s+/)[0] || 'there';

function copyFor(stage, o) {
  const cod = o.paymentMethod === 'cod';
  const tracking = o.trackingId || o.trackingNumber;
  switch (stage) {
    case 'placed':
      return cod ? {
        subject: `We've received your order ${o.orderNumber}`,
        heading: 'Thank you for your order!',
        lines: [
          `We've received your order <b>${esc(o.orderNumber)}</b>. We'll confirm it shortly and email you again when it's on its way.`,
          `You're paying <b>cash on delivery</b>: please keep <b>${rs(o.total)}</b> ready for the PostEx courier.`
        ]
      } : {
        subject: `Your order ${o.orderNumber}: complete your payment`,
        heading: 'Thank you for your order!',
        lines: [
          `We've received your order <b>${esc(o.orderNumber)}</b> and opened the Rapid Gateway payment page for <b>${rs(o.total)}</b>.`,
          `As soon as your payment is confirmed, we'll email you and start packing. If the payment didn't go through, nothing was charged; you can order again and choose cash on delivery.`
        ]
      };
    case 'confirmed':
      return {
        subject: `Order ${o.orderNumber} confirmed`,
        heading: 'Your order is confirmed',
        lines: [
          cod ? `Good news: your order <b>${esc(o.orderNumber)}</b> is confirmed and we're packing it now.`
              : `We've received your payment of <b>${rs(o.total)}</b>. Your order <b>${esc(o.orderNumber)}</b> is confirmed and we're packing it now.`,
          `Orders are usually handed to PostEx (Call Courier) within 1 to 2 working days. We'll email you the tracking number when it's dispatched.`
        ]
      };
    case 'dispatched':
      return {
        subject: `Order ${o.orderNumber} is on its way`,
        heading: 'Your order is on its way',
        lines: [
          `Your order <b>${esc(o.orderNumber)}</b> was handed to <b>${esc(o.courier || 'PostEx (Call Courier)')}</b>${o.dispatchedAt ? ` on ${esc(pkDay(o.dispatchedAt))}` : ''}.` +
            (tracking ? ` Tracking number: <b>${esc(tracking)}</b>.` : ''),
          `Delivery usually takes 1 to 3 working days in Lahore, 2 to 4 in other major cities and 3 to 7 in smaller cities.`,
          cod ? `Please keep <b>${rs(o.total)}</b> in cash ready for the courier.` : `Your order is prepaid: there is nothing to pay on delivery.`,
          `Your invoice is attached as a PDF. A printed copy is in the parcel.`
        ],
        button: postexUrl(o) ? { href: postexUrl(o), label: 'Track with PostEx' } : null
      };
    case 'delivered':
      return {
        subject: `Order ${o.orderNumber} delivered`,
        heading: 'Your order has been delivered',
        lines: [
          `Your order <b>${esc(o.orderNumber)}</b> has been delivered. We hope your car loves it!`,
          `If anything arrived damaged or defective, or you've changed your mind, reply to this email within <b>7 days of delivery</b> and we'll sort it out. See our <a href="${BASE}/#/policies/refund" style="color:#c8601c">Refund &amp; Returns Policy</a>.`
        ]
      };
  }
  return null;
}

function itemsTable(o) {
  const rows = (o.items || []).map(i => `
    <tr><td style="padding:8px 0;border-bottom:1px solid #e3e7ec">${esc(i.name)} <span style="color:#5b6677">&times; ${i.qty}</span></td>
    <td style="padding:8px 0;border-bottom:1px solid #e3e7ec;text-align:right;white-space:nowrap">${rs(i.price * i.qty)}</td></tr>`).join('');
  const line = (label, value, bold) => `<tr><td style="padding:4px 0;${bold ? 'font-weight:700' : 'color:#5b6677'}">${label}</td><td style="padding:4px 0;text-align:right;${bold ? 'font-weight:700' : ''}">${value}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-top:8px">${rows}
    ${line('Subtotal', rs(o.subtotal))}
    ${o.discount ? line(`Discount${o.couponCode ? ` (${esc(o.couponCode)})` : ''}`, '- ' + rs(o.discount)) : ''}
    ${line('Delivery', 'Free')}
    ${line('Total', rs(o.total), true)}
    ${line('Payment', o.paymentMethod === 'cod' ? 'Cash on delivery' : 'Online (Rapid Gateway)')}</table>`;
}

function render(stage, o, business) {
  const c = copyFor(stage, o);
  if (!c) return null;
  const sh = o.shipping || {};
  const button = c.button || (site.get().customers.allowOrderTracking ? { href: trackUrl(o), label: 'Track your order' } : null);
  const contact = [business.email, business.phone].filter(Boolean).map(esc).join(' &middot; ');
  const html = `<!doctype html><html><body style="margin:0;background:#f3f5f8;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#0f1b2b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e7ec">
  <tr><td style="background:#0f1b2b;padding:20px 28px;text-align:center"><img src="${BASE}/logo.png" alt="autique." height="44" style="height:44px;border:0"></td></tr>
  <tr><td style="padding:28px">
    <p style="margin:0 0 6px;font-size:14px;color:#5b6677">Hi ${esc(firstName(o))},</p>
    <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700">${esc(c.heading)}</h1>
    ${c.lines.map(l => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">${l}</p>`).join('')}
    ${button ? `<p style="margin:20px 0"><a href="${esc(button.href)}" style="display:inline-block;background:#0f1b2b;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;font-size:14px">${esc(button.label)}</a></p>` : ''}
    <h2 style="margin:24px 0 4px;font-size:15px">Order ${esc(o.orderNumber)}</h2>
    ${itemsTable(o)}
    <h2 style="margin:22px 0 4px;font-size:15px">Delivering to</h2>
    <p style="margin:0;font-size:14px;line-height:1.5;color:#33404f">${esc(sh.name)}<br>${esc(sh.address)}<br>${esc([sh.city, sh.province].filter(Boolean).join(', '))}<br>${esc(sh.phone)}</p>
  </td></tr>
  <tr><td style="background:#f8f9fb;padding:18px 28px;font-size:12px;line-height:1.6;color:#5b6677;border-top:1px solid #e3e7ec">
    Questions? Just reply to this email${contact ? ` or contact us: ${contact}` : ''}.<br>
    ${esc(business.tradingName || 'Autique')} &middot; ${esc(business.address || '')}${business.city ? ', ' + esc(business.city) : ''}
  </td></tr>
</table></td></tr></table></body></html>`;

  const strip = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&times;/g, 'x').replace(/&[a-z#0-9]+;/g, '');
  const text = [
    `Hi ${firstName(o)},`, '', c.heading, '', ...c.lines.map(strip).flatMap(l => [l, '']),
    button ? `${button.label}: ${button.href}\n` : '',
    `Order ${o.orderNumber}`,
    ...(o.items || []).map(i => `- ${i.name} x ${i.qty}: ${rs(i.price * i.qty)}`),
    o.discount ? `Discount: -${rs(o.discount)}` : '', `Total: ${rs(o.total)}`, '',
    `Delivering to: ${sh.name}, ${sh.address}, ${[sh.city, sh.province].filter(Boolean).join(', ')}, ${sh.phone}`, '',
    `Questions? Reply to this email${business.email || business.phone ? ` or contact us: ${[business.email, business.phone].filter(Boolean).join(' / ')}` : ''}.`,
    business.tradingName || 'Autique'
  ].filter(l => l !== null).join('\n');
  return { subject: c.subject, html, text };
}

function recipient(o) {
  const to = String(o.customerEmail || (o.shipping && o.shipping.email) || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) ? to : '';
}

// skuFor(item) gives the SKU shown on the invoice; set by the server.
let skuFor = () => '';
function setSkuLookup(fn) { skuFor = fn; }

function invoicePdf(order) {
  return buildInvoicePdf(order, site.get().content.business, item => skuFor(item));
}

function record(orderId, stage, entry) {
  const orders = store.getOrders();
  const o = orders.find(x => x.id === orderId);
  if (!o) return;
  o.emails = { ...(o.emails || {}), [stage]: { ...((o.emails || {})[stage] || {}), ...entry } };
  store.saveOrders(orders);
}

// Send one stage's email for an order, unless it has already gone. Call it after
// the order's own changes are saved. Never throws; sending happens in the background.
function notify(orderId, stage) {
  try {
    const orders = store.getOrders();
    const o = orders.find(x => x.id === orderId);
    if (!o || !STAGE_TEMPLATES.includes(stage)) return;
    const prev = (o.emails || {})[stage];
    if (prev && DONE.includes(prev.status)) return;
    const to = recipient(o);
    if (!to) return;
    // mark it before sending, so a second trigger right after can't send it twice
    o.emails = { ...(o.emails || {}), [stage]: { status: 'queued', at: new Date().toISOString(), to } };
    store.saveOrders(orders);

    (async () => {
      try {
        const business = site.get().content.business;
        const msg = render(stage, o, business);
        const attachments = stage === 'dispatched'
          ? [{ filename: `Autique-invoice-${o.orderNumber}.pdf`, content: await invoicePdf(o), contentType: 'application/pdf' }]
          : undefined;
        const result = await mailer.send({ to, ...msg, attachments });
        record(orderId, stage, { status: result.status, at: new Date().toISOString() });
      } catch (e) {
        console.error(`Email "${stage}" for ${o.orderNumber} failed:`, e.message);
        record(orderId, stage, { status: 'failed', at: new Date().toISOString(), error: String(e.message).slice(0, 200) });
      }
    })();
  } catch (e) {
    console.error(`Email "${stage}" for order ${orderId} could not be queued:`, e.message);
  }
}
// After an order's status changes (and is saved), email the matching stage.
function statusChanged(order, previousStatus) {
  if (!order || order.status === previousStatus) return;
  const stage = STAGE_FOR_STATUS[order.status];
  if (stage) notify(order.id, stage);
}

module.exports = { notify, statusChanged, invoicePdf, setSkuLookup, render, STAGES: STAGE_TEMPLATES };
