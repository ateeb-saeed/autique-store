// Invoice & dispatch note (A4 PDF), printed at dispatch and packed with the
// order for the courier and customer. Also attached to the "dispatched" email.

const path = require('path');
const PDFDocument = require('pdfkit');

const NAVY = '#0f1b2b';
const COPPER = '#c8601c';
const INK = '#0f1b2b';
const MUTED = '#5b6677';
const LINE = '#d5dae1';
const LOGO = path.join(__dirname, '..', 'public', 'logo.png');

const rs = n => 'Rs. ' + Math.round(Number(n) || 0).toLocaleString('en-US');
const pkDate = iso => iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const pkDay = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// order: the stored order. business: site content.business. skuFor(item) -> SKU text.
function buildInvoicePdf(order, business, skuFor = () => '') {
  return new Promise((resolve, reject) => {
    // no bottom margin: the footer sits at the page edge, and page breaks are handled below
    const doc = new PDFDocument({ size: 'A4', margins: { top: 40, left: 40, right: 40, bottom: 0 }, info: { Title: `Invoice ${order.orderNumber}`, Author: business.tradingName || 'Autique' } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width, M = 40, CW = W - M * 2;
    const sh = order.shipping || {};
    const cod = order.paymentMethod === 'cod';

    // ---- header band ----
    doc.rect(0, 0, W, 86).fill(NAVY);
    try { doc.image(LOGO, M, 22, { height: 42 }); } catch { doc.fillColor(COPPER).font('Helvetica-Bold').fontSize(26).text('autique.', M, 28); }
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(17).text('INVOICE & DISPATCH NOTE', M, 26, { width: CW, align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor('#c9d1dc').text(order.orderNumber, M, 50, { width: CW, align: 'right' });

    // ---- seller + order details ----
    let y = 106;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(business.tradingName || 'Autique', M, y);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    const seller = [business.address, business.city, business.email && `Email: ${business.email}`, business.phone && `Phone: ${business.phone}`, business.ntn && `NTN: ${business.ntn}`, business.website].filter(Boolean);
    doc.text(seller.join('\n'), M, y + 15, { width: CW / 2 - 10, lineGap: 1.5 });

    const details = [
      ['Invoice / order no.', order.orderNumber],
      ['Order date', pkDate(order.createdAt)],
      ['Dispatch date', pkDate(order.dispatchedAt)],
      ['Courier', order.courier || 'PostEx (Call Courier)'],
      ['Tracking no.', order.trackingId || order.trackingNumber || '—'],
      ['Payment', cod ? 'Cash on delivery' : 'Paid online (Rapid Gateway)']
    ];
    let dy = y;
    for (const [k, v] of details) {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(k, W / 2 + 10, dy, { width: 95 });
      doc.font('Helvetica-Bold').fillColor(INK).text(String(v), W / 2 + 105, dy, { width: CW / 2 - 105 });
      dy += 15;
    }
    y = Math.max(doc.y, dy) + 14;

    // ---- ship to + amount to collect ----
    const boxH = 104;
    doc.roundedRect(M, y, CW * 0.58, boxH, 6).lineWidth(1.2).strokeColor(NAVY).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED).text('SHIP TO', M + 12, y + 10);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(sh.name || order.customerName || '', M + 12, y + 24, { width: CW * 0.58 - 24 });
    doc.font('Helvetica').fontSize(10.5).text([sh.address, [sh.city, sh.province].filter(Boolean).join(', ')].filter(Boolean).join('\n'), { width: CW * 0.58 - 24 });
    doc.font('Helvetica-Bold').fontSize(11).text(`Phone: ${sh.phone || ''}`, { width: CW * 0.58 - 24 });

    const cx = M + CW * 0.58 + 12, cw = CW * 0.42 - 12;
    doc.roundedRect(cx, y, cw, boxH, 6).fill(cod ? COPPER : NAVY);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text(cod ? 'COLLECT CASH ON DELIVERY' : 'PREPAID ORDER', cx + 12, y + 12, { width: cw - 24 });
    doc.fontSize(24).text(cod ? rs(order.total) : 'Rs. 0', cx + 12, y + 32, { width: cw - 24 });
    doc.font('Helvetica').fontSize(9).text(cod ? 'Collect this amount in cash from the customer.' : 'Already paid online. Do not collect any payment.', cx + 12, y + 66, { width: cw - 24 });
    y += boxH + 22;

    // ---- items ----
    const cols = [
      { t: '#', w: 22, a: 'left' }, { t: 'Item', w: CW - 22 - 100 - 36 - 70 - 70, a: 'left' }, { t: 'SKU', w: 100, a: 'left' },
      { t: 'Qty', w: 36, a: 'right' }, { t: 'Unit price', w: 70, a: 'right' }, { t: 'Amount', w: 70, a: 'right' }
    ];
    const row = (cells, bold, top) => {
      let x = M, h = 0;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5);
      cells.forEach((c, i) => { h = Math.max(h, doc.heightOfString(String(c), { width: cols[i].w - 8 })); });
      cells.forEach((c, i) => {
        doc.fillColor(bold ? '#ffffff' : INK).text(String(c), x + 4, top + 6, { width: cols[i].w - 8, align: cols[i].a });
        x += cols[i].w;
      });
      return h + 12;
    };
    doc.rect(M, y, CW, 22).fill(NAVY);
    y += row(cols.map(c => c.t), true, y);
    (order.items || []).forEach((it, i) => {
      if (y > doc.page.height - 190) { doc.addPage(); y = M; }
      const h = row([i + 1, it.name, skuFor(it) || '—', it.qty, rs(it.price), rs(it.price * it.qty)], false, y);
      doc.moveTo(M, y + h).lineTo(M + CW, y + h).lineWidth(0.6).strokeColor(LINE).stroke();
      y += h;
    });

    // ---- totals ----
    y += 10;
    const tot = (label, value, strong) => {
      doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(strong ? 12 : 10).fillColor(INK)
        .text(label, M + CW - 250, y, { width: 150, align: 'right' })
        .text(value, M + CW - 100, y, { width: 100, align: 'right' });
      y += strong ? 20 : 16;
    };
    tot('Subtotal', rs(order.subtotal));
    if (order.discount) tot(`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`, '- ' + rs(order.discount));
    tot('Delivery', 'Free');
    doc.moveTo(M + CW - 250, y).lineTo(M + CW, y).lineWidth(1).strokeColor(NAVY).stroke(); y += 6;
    tot('Total', rs(order.total), true);
    tot('Amount to collect', cod ? rs(order.total) : 'Rs. 0 (prepaid)', true);

    if (sh.notes) {
      y += 6;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('Customer notes', M, y);
      doc.font('Helvetica').fontSize(10).fillColor(INK).text(sh.notes, M, y + 12, { width: CW });
      y = doc.y + 6;
    }

    // ---- receipt + footer ----
    const fy = doc.page.height - 150;
    if (y > fy - 10) { doc.addPage(); }
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text('Received in good condition by (name & signature):', M, fy)
      .text('Date:', M + CW * 0.66, fy);
    doc.moveTo(M, fy + 34).lineTo(M + CW * 0.6, fy + 34).lineWidth(0.8).strokeColor(MUTED).stroke();
    doc.moveTo(M + CW * 0.66, fy + 34).lineTo(M + CW, fy + 34).stroke();

    doc.rect(0, doc.page.height - 86, W, 86).fill('#f3f5f8');
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text('Thank you for shopping with Autique.', M, doc.page.height - 74, { width: CW });
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(
      `Damaged or defective? Contact us within 7 days of delivery for a refund or replacement. Change of mind: unused items can be returned within 7 days (return delivery paid by the customer). ` +
      `Questions: ${[business.email, business.phone].filter(Boolean).join(' · ')}. Track your order: ${business.website || 'autique.pk'}.`,
      M, doc.page.height - 58, { width: CW, lineGap: 1.5 });
    doc.fontSize(7.5).text(`Printed ${pkDate(new Date().toISOString())} · ${order.orderNumber}`, M, doc.page.height - 22, { width: CW, align: 'right' });
    doc.end();
  });
}

module.exports = { buildInvoicePdf, pkDate, pkDay };
