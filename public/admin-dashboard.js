// ---------- Dashboard ----------
let dashDays = 30;
let dashData = null;

const rs = n => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;
const num = n => Number(n).toLocaleString('en-PK');
function escHtml(str){
  return String(str == null ? '' : str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function shortDate(key){
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { day:'numeric', month:'short' });
}

async function loadDashboard(){
  const res = await fetch(`/api/admin/dashboard?days=${dashDays}`);
  if(!res.ok) return;
  dashData = await res.json();
  renderDashboard();
}

document.querySelectorAll('#dashRange .filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    dashDays = Number(btn.dataset.days);
    document.querySelectorAll('#dashRange .filter-btn').forEach(b => b.classList.toggle('active', b === btn));
    loadDashboard();
  });
});

document.getElementById('revenueTableToggle').addEventListener('click', (e) => {
  const table = document.getElementById('revenueTable');
  const showing = table.classList.toggle('hidden');
  document.getElementById('revenueChart').classList.toggle('hidden', !showing);
  e.target.textContent = showing ? 'Show table' : 'Show chart';
});

function renderDashboard(){
  const d = dashData;
  renderKpis(d);
  renderRevenueChart(d.daily);
  renderRevenueTable(d.daily);
  renderFulfilment(d.fulfilment);
  document.getElementById('dashStatuses').innerHTML = hbars(d.statuses, num, 'No orders in this period.');
  document.getElementById('dashCategories').innerHTML = hbars(d.categories, rs, 'No sales in this period.');
  document.getElementById('dashPayments').innerHTML = hbars(d.payments, num, 'No sales in this period.');
  renderTopProducts(d.topProducts);
  renderCustomers(d.customers);
  renderStock(d.stock);
  renderPromotions(d.promotions, d.catalog);
  renderRecent(d.recentOrders);
  wireHbarTooltips();
}

// ---------- KPI tiles ----------
function delta(curr, prev){
  if(!prev) return curr ? '<span class="delta flat">New this period</span>' : '<span class="delta flat">&mdash;</span>';
  const pct = Math.round(((curr - prev) / prev) * 100);
  if(pct === 0) return '<span class="delta flat">&#9644; No change</span>';
  const up = pct > 0;
  return `<span class="delta ${up ? 'up' : 'down'}">${up ? '&#9650;' : '&#9660;'} ${Math.abs(pct)}% vs previous ${dashDays} days</span>`;
}

function renderKpis(d){
  const t = d.totals, p = d.previous;
  const tiles = [
    { label:'Revenue', value: rs(t.revenue), delta: delta(t.revenue, p.revenue) },
    { label:'Orders', value: num(t.orders), delta: delta(t.orders, p.orders) },
    { label:'Average order', value: rs(t.avgOrder), delta: delta(t.avgOrder, p.avgOrder) },
    { label:'Units sold', value: num(t.units), delta: delta(t.units, p.units) },
    { label:'Discounts given', value: rs(t.discounts), delta: '<span class="delta flat">Coupons applied at checkout</span>' },
    { label:'To dispatch', value: num(d.fulfilment.toDispatch), delta: '<span class="delta flat">Open orders, all time</span>' }
  ];
  document.getElementById('dashKpis').innerHTML = tiles.map(k => `
    <div class="kpi">
      <span class="kpi-label">${k.label}</span>
      <span class="kpi-value">${k.value}</span>
      ${k.delta}
    </div>
  `).join('');
}

// ---------- Revenue chart (SVG bars, hover tooltip) ----------
function niceMax(v){
  if(v <= 0) return 1000;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

function barPath(x, y, w, h, r){
  const base = y + h;
  r = Math.min(r, w / 2, h);
  if(h <= 0) return '';
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

function renderRevenueChart(daily){
  const wrap = document.getElementById('revenueChart');
  const W = Math.max(wrap.clientWidth, 280), H = 220;
  const m = { top:12, right:8, bottom:26, left:64 };
  const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
  const max = niceMax(Math.max(...daily.map(x => x.revenue)));
  const ticks = [0, max / 2, max];
  const step = iw / daily.length;
  const gap = 2;
  const bw = Math.max(step - gap, 1);
  const labelEvery = Math.ceil(daily.length / 6);

  const grid = ticks.map(t => {
    const y = m.top + ih - (t / max) * ih;
    return `<line x1="${m.left}" x2="${W - m.right}" y1="${y}" y2="${y}" class="grid-line"/>
            <text x="${m.left - 8}" y="${y + 4}" class="axis-text" text-anchor="end">${t >= 1000 ? `${Math.round(t / 1000)}k` : Math.round(t)}</text>`;
  }).join('');

  const bars = daily.map((day, i) => {
    const h = (day.revenue / max) * ih;
    const x = m.left + i * step + gap / 2;
    return `<path d="${barPath(x, m.top + ih - h, bw, h, 4)}" class="bar"/>`;
  }).join('');

  const labels = daily.map((day, i) => i % labelEvery === 0
    ? `<text x="${m.left + i * step + step / 2}" y="${H - 6}" class="axis-text" text-anchor="middle">${shortDate(day.date)}</text>` : '').join('');

  const hits = daily.map((day, i) =>
    `<rect x="${m.left + i * step}" y="${m.top}" width="${step}" height="${ih}" class="hit" data-i="${i}"/>`).join('');

  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Revenue per day, last ${daily.length} days">
      ${grid}
      <line x1="${m.left}" x2="${W - m.right}" y1="${m.top + ih}" y2="${m.top + ih}" class="base-line"/>
      <g class="bars">${bars}</g>
      <rect class="hover-col hidden" y="${m.top}" width="${step}" height="${ih}"/>
      ${labels}
      <g>${hits}</g>
    </svg>`;

  const hover = wrap.querySelector('.hover-col');
  wrap.querySelectorAll('.hit').forEach(rect => {
    rect.addEventListener('mousemove', e => {
      const day = daily[Number(rect.dataset.i)];
      hover.setAttribute('x', rect.getAttribute('x'));
      hover.classList.remove('hidden');
      showTooltip(e, `<strong>${shortDate(day.date)}</strong><br>${rs(day.revenue)}<br>${day.orders} order${day.orders === 1 ? '' : 's'}`);
    });
    rect.addEventListener('mouseleave', () => { hover.classList.add('hidden'); hideTooltip(); });
  });
}

function renderRevenueTable(daily){
  document.getElementById('revenueTable').innerHTML = `
    <table class="data-table">
      <thead><tr><th>Date</th><th class="num">Orders</th><th class="num">Revenue</th></tr></thead>
      <tbody>${daily.slice().reverse().map(d => `
        <tr><td>${shortDate(d.date)}</td><td class="num">${d.orders}</td><td class="num">${rs(d.revenue)}</td></tr>`).join('')}
      </tbody>
    </table>`;
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if(dashData) renderRevenueChart(dashData.daily); }, 150);
});

// ---------- Horizontal bar lists ----------
function hbars(rows, fmt, empty){
  if(!rows.length) return `<p class="empty-note">${empty}</p>`;
  const max = Math.max(...rows.map(r => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0);
  return `<div class="hbars">${rows.map(r => `
    <div class="hbar-row" data-tip="${escHtml(`<strong>${escHtml(r.label)}</strong><br>${fmt(r.value)} &middot; ${Math.round((r.value / total) * 100)}% of total`)}">
      <span class="hbar-label">${escHtml(r.label)}</span>
      <span class="hbar-track"><span class="hbar-fill" style="width:${Math.max((r.value / max) * 100, 1.5)}%"></span></span>
      <span class="hbar-value">${fmt(r.value)}</span>
    </div>`).join('')}</div>`;
}

function wireHbarTooltips(){
  document.querySelectorAll('#tab-dashboard [data-tip]').forEach(row => {
    row.addEventListener('mousemove', e => showTooltip(e, row.dataset.tip));
    row.addEventListener('mouseleave', hideTooltip);
  });
}

// ---------- Cards ----------
function statList(items){
  return `<dl class="stat-list">${items.map(([k, v, note]) => `
    <div><dt>${k}</dt><dd>${v}${note ? `<span class="stat-note">${note}</span>` : ''}</dd></div>`).join('')}</dl>`;
}

function renderFulfilment(f){
  document.getElementById('dashFulfilment').innerHTML = statList([
    ['Waiting to dispatch', num(f.toDispatch), 'all time'],
    ['Dispatched', num(f.dispatched), `last ${dashDays} days`],
    ['Cancelled', num(f.cancelled), `last ${dashDays} days`]
  ]);
}

function renderCustomers(c){
  document.getElementById('dashCustomers').innerHTML = statList([
    ['Registered customers', num(c.total)],
    ['New sign-ups', num(c.newInRange), `last ${dashDays} days`],
    ['Customers who ordered', num(c.buyersInRange), `last ${dashDays} days`]
  ]);
}

function renderPromotions(p, cat){
  document.getElementById('dashPromotions').innerHTML = statList([
    ['Storewide sale', p.sale ? `On &middot; ${p.sale.percent}% off` : 'Off', p.sale && p.sale.label ? escHtml(p.sale.label) : ''],
    ['Active coupons', num(p.coupons)],
    ['Active bundles', num(p.bundles)],
    ['Products live', `${num(cat.active)} of ${num(cat.products)}`, cat.variants ? `${num(cat.variants)} variants` : '']
  ]);
}

function renderTopProducts(rows){
  const el = document.getElementById('dashTopProducts');
  if(!rows.length){ el.innerHTML = '<p class="empty-note">No sales in this period.</p>'; return; }
  const max = rows[0].revenue;
  el.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Product</th><th class="num">Units</th><th class="num">Revenue</th><th class="bar-col"></th></tr></thead>
      <tbody>${rows.map(r => `
        <tr>
          <td>${escHtml(r.name)}</td>
          <td class="num">${num(r.units)}</td>
          <td class="num">${rs(r.revenue)}</td>
          <td class="bar-col"><span class="hbar-track"><span class="hbar-fill" style="width:${Math.max((r.revenue / max) * 100, 1.5)}%"></span></span></td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p class="empty-note">Line totals before coupon discounts.</p>`;
}

function renderStock(s){
  const summary = `
    <div class="mini-stats">
      <span><strong>${num(s.skus)}</strong> SKUs</span>
      <span><strong>${num(s.units)}</strong> units on hand</span>
      <span class="${s.low ? 'warn' : ''}"><strong>${num(s.low)}</strong> low</span>
      <span class="${s.out ? 'crit' : ''}"><strong>${num(s.out)}</strong> out of stock</span>
    </div>`;
  if(!s.attention.length){
    document.getElementById('dashStock').innerHTML = summary + '<p class="empty-note">Everything is well stocked.</p>';
    return;
  }
  document.getElementById('dashStock').innerHTML = summary + `
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Product</th><th>SKU</th><th class="num">On hand</th><th class="num">Reserved</th><th class="num">Available</th></tr></thead>
      <tbody>${s.attention.map(r => `
        <tr>
          <td>${escHtml(r.name)}${r.variant ? `<br><span class="sub">${escHtml(r.variant)}</span>` : ''}</td>
          <td class="mono">${escHtml(r.sku) || '&mdash;'}</td>
          <td class="num">${r.onHand}</td>
          <td class="num">${r.reserved || '&mdash;'}</td>
          <td class="num">${r.available} ${r.available <= 0 ? '<span class="badge off">Out</span>' : '<span class="badge low">Low</span>'}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>
    ${s.out + s.low > s.attention.length ? `<p class="empty-note">Showing ${s.attention.length} of ${s.out + s.low}, ordered items first.</p>` : ''}`;
}

function renderRecent(rows){
  document.getElementById('dashRecent').innerHTML = rows.length ? `
    <table class="data-table">
      <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Placed</th><th class="num">Total</th></tr></thead>
      <tbody>${rows.map(o => `
        <tr>
          <td>${escHtml(o.orderNumber)}</td>
          <td>${escHtml(o.customerName)}</td>
          <td>${escHtml(o.status)}</td>
          <td>${new Date(o.createdAt).toLocaleString([], { dateStyle:'medium', timeStyle:'short' })}</td>
          <td class="num">${rs(o.total)}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : '<p class="empty-note">No orders yet.</p>';
}

// ---------- Tooltip ----------
function showTooltip(e, html){
  const tip = document.getElementById('chartTooltip');
  tip.innerHTML = html;
  tip.classList.remove('hidden');
  const pad = 14;
  let x = e.clientX + pad, y = e.clientY + pad;
  const r = tip.getBoundingClientRect();
  if(x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
  if(y + r.height > window.innerHeight - 8) y = e.clientY - r.height - pad;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}
function hideTooltip(){
  document.getElementById('chartTooltip').classList.add('hidden');
}
