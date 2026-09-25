const LOW_STOCK = 5;

let stock = [];
let orders = [];
let orderFilter = 'open';
let restockKey = null;
let dispatchOrderId = null;
let rights = {};   // what this login may do, set by the admin's Site editor

function esc(str){
  return String(str == null ? '' : str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(iso){
  return new Date(iso).toLocaleString([], { dateStyle:'medium', timeStyle:'short' });
}

// ---------- Auth ----------
async function checkSignedIn(){
  const res = await fetch('/api/logistics/me');
  const data = await res.json();
  document.getElementById('loginScreen').classList.toggle('hidden', data.signedIn);
  document.getElementById('portalShell').classList.toggle('hidden', !data.signedIn);
  if(data.signedIn){
    rights = data.rights || {};
    document.querySelector('.nav-btn[data-tab="orders"]').classList.toggle('hidden', !rights.viewOrders);
    document.querySelector('.nav-btn[data-tab="history"]').classList.toggle('hidden', !rights.viewHistory);
    await Promise.all([loadStock(), rights.viewOrders ? loadOrders() : Promise.resolve()]);
  }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('logisticsPassword').value;
  const res = await fetch('/api/logistics/login', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ password })
  });
  const data = await res.json();
  if(!res.ok){ document.getElementById('loginError').textContent = data.error; return; }
  document.getElementById('loginError').textContent = '';
  checkSignedIn();
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/logistics/logout', { method:'POST' });
  checkSignedIn();
});

// ---------- Tabs ----------
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== `tab-${btn.dataset.tab}`));
    if(btn.dataset.tab === 'stock') loadStock();
    if(btn.dataset.tab === 'orders') loadOrders();
    if(btn.dataset.tab === 'history') loadHistory();
  });
});

// ---------- Stock ----------
async function loadStock(){
  const res = await fetch('/api/logistics/stock');
  if(res.status === 401) return checkSignedIn();
  stock = (await res.json()).stock;
  renderStock();
}

function stockBadge(row){
  if(row.available <= 0) return '<span class="badge off">Out</span>';
  if(row.available <= LOW_STOCK) return '<span class="badge low">Low</span>';
  return '';
}

function renderStock(){
  const q = document.getElementById('stockSearch').value.trim().toLowerCase();
  const rows = stock.filter(r => !q || `${r.name} ${r.variant} ${r.sku}`.toLowerCase().includes(q));

  const out = stock.filter(r => r.available <= 0).length;
  const low = stock.filter(r => r.available > 0 && r.available <= LOW_STOCK).length;
  const units = stock.reduce((s, r) => s + r.onHand, 0);
  document.getElementById('stockStats').innerHTML = `
    <div class="stat"><span class="stat-val">${stock.length}</span><span class="stat-label">SKUs</span></div>
    <div class="stat"><span class="stat-val">${units}</span><span class="stat-label">Units on hand</span></div>
    <div class="stat"><span class="stat-val">${low}</span><span class="stat-label">Low stock</span></div>
    <div class="stat"><span class="stat-val">${out}</span><span class="stat-label">Out of stock</span></div>
  `;

  const tbody = document.querySelector('#stockTable tbody');
  tbody.innerHTML = rows.map(r => `
    <tr class="${r.active ? '' : 'inactive'}">
      <td>${esc(r.name)}${r.variant ? `<br><span class="sub">${esc(r.variant)}</span>` : ''}${r.active ? '' : '<br><span class="sub">Hidden from store</span>'}</td>
      <td class="mono">${esc(r.sku) || '—'}</td>
      <td>${esc(r.category)}</td>
      <td class="num">${r.onHand}</td>
      <td class="num">${r.reserved || '—'}</td>
      <td class="num"><strong>${r.available}</strong> ${stockBadge(r)}</td>
      <td>${rights.restock ? `<button class="icon-btn" data-restock="${esc(r.key)}">Restock</button>` : ''}</td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="sub">No products match.</td></tr>';

  tbody.querySelectorAll('[data-restock]').forEach(btn => {
    btn.addEventListener('click', () => openRestock(btn.dataset.restock));
  });
}
document.getElementById('stockSearch').addEventListener('input', renderStock);

function openRestock(key){
  const row = stock.find(r => r.key === key);
  restockKey = key;
  document.getElementById('restockItem').innerHTML =
    `${esc(row.name)}${row.variant ? ` — ${esc(row.variant)}` : ''} &middot; SKU ${esc(row.sku) || '—'} &middot; ${row.onHand} on hand`;
  document.getElementById('restockForm').reset();
  document.getElementById('restockError').textContent = '';
  openModal('restock');
  document.querySelector('#restockForm [name=qty]').focus();
}

document.getElementById('restockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const res = await fetch('/api/logistics/restock', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ key: restockKey, qty: form.qty.value, note: form.note.value })
  });
  const data = await res.json();
  if(!res.ok){ document.getElementById('restockError').textContent = data.error; return; }
  closeModal('restock');
  loadStock();
});

// ---------- Orders ----------
async function loadOrders(){
  const res = await fetch('/api/logistics/orders');
  if(res.status === 401) return checkSignedIn();
  orders = (await res.json()).orders;
  renderOrders();
}

function renderOrders(){
  const openCount = orders.filter(o => o.open).length;
  const countEl = document.getElementById('openOrdersCount');
  countEl.textContent = openCount;
  countEl.classList.toggle('hidden', openCount === 0);

  const rows = orders.filter(o =>
    orderFilter === 'all' ? true : orderFilter === 'open' ? o.open : !!o.dispatchedAt);

  const tbody = document.querySelector('#ordersTable tbody');
  tbody.innerHTML = rows.map(o => `
    <tr>
      <td><strong>${esc(o.orderNumber)}</strong><br><span class="sub">${fmtDate(o.createdAt)}</span></td>
      <td>${esc(o.customerName)}<br><span class="sub">${rights.seeCustomerContact ? `${esc(o.phone)}<br>${esc(o.address)}, ` : ''}${esc(o.city)}</span></td>
      <td>${o.items.map(i => `
        ${i.qty}&times; ${esc(i.name)}${i.sku ? ` <span class="mono sub">${esc(i.sku)}</span>` : ''}
        ${i.contents.length ? `<br><span class="sub">&nbsp;&nbsp;contains: ${i.contents.map(esc).join(', ')}</span>` : ''}
      `).join('<br>')}</td>
      <td>${o.paymentMethod === 'cod' ? `COD${o.codAmount != null ? `<br><span class="sub">Collect Rs. ${o.codAmount}</span>` : ''}` : `Online<br><span class="sub">${o.paymentStatus === 'paid' ? 'Paid' : o.paymentStatus === 'failed' ? 'Payment failed' : 'Awaiting payment'}</span>`}</td>
      <td>${esc(o.status)}${o.dispatchedAt ? `<br><span class="sub">${fmtDate(o.dispatchedAt)}${o.courier ? `<br>${esc(o.courier)}` : ''}${o.trackingNumber ? ` &middot; ${esc(o.trackingNumber)}` : ''}</span>` : ''}</td>
      <td>${o.open && rights.dispatch ? `<button class="btn-primary btn-small" data-dispatch="${o.id}">Dispatch</button>` : ''}${o.dispatchedAt ? `<a class="btn-secondary btn-small" href="/api/logistics/orders/${o.id}/invoice.pdf" target="_blank" rel="noopener">Invoice</a>` : ''}</td>
    </tr>
  `).join('') || `<tr><td colspan="6" class="sub">${orderFilter === 'open' ? 'Nothing waiting to be dispatched.' : 'No orders here yet.'}</td></tr>`;

  tbody.querySelectorAll('[data-dispatch]').forEach(btn => {
    btn.addEventListener('click', () => openDispatch(Number(btn.dataset.dispatch)));
  });
}

document.querySelectorAll('#orderFilters .filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    orderFilter = btn.dataset.filter;
    document.querySelectorAll('#orderFilters .filter-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderOrders();
  });
});

function openDispatch(id){
  const o = orders.find(x => x.id === id);
  dispatchOrderId = id;
  document.getElementById('dispatchOrderNumber').textContent = o.orderNumber;
  document.getElementById('dispatchSummary').innerHTML = `
    ${esc(o.customerName)}${o.phone ? ` &middot; ${esc(o.phone)}` : ''}<br>${o.address ? `${esc(o.address)}, ` : ''}${esc(o.city)}<br>
    ${o.items.map(i => `${i.qty}&times; ${esc(i.name)}`).join('<br>')}
    ${o.codAmount != null ? `<br><strong>Collect Rs. ${o.codAmount} on delivery</strong>` : ''}
    <br><br>Dispatching takes these items off the stock count.
  `;
  document.getElementById('dispatchForm').reset();
  document.getElementById('dispatchForm').classList.remove('hidden');
  document.getElementById('dispatchDone').classList.add('hidden');
  document.getElementById('dispatchError').innerHTML = '';
  openModal('dispatch');
}

document.getElementById('dispatchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const res = await fetch(`/api/logistics/orders/${dispatchOrderId}/dispatch`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ courier: form.courier.value, trackingNumber: form.trackingNumber.value })
  });
  const data = await res.json();
  if(!res.ok){
    document.getElementById('dispatchError').innerHTML =
      esc(data.error) + (data.short ? '<br>' + data.short.map(esc).join('<br>') + '<br>Restock first, then dispatch.' : '');
    return;
  }
  // keep the modal open with the invoice to print and pack with the parcel
  form.classList.add('hidden');
  document.getElementById('dispatchInvoiceLink').href = data.invoiceUrl;
  document.getElementById('dispatchDone').classList.remove('hidden');
  await Promise.all([loadOrders(), loadStock()]);
});

// ---------- History ----------
async function loadHistory(){
  const res = await fetch('/api/logistics/stock-log');
  if(res.status === 401) return checkSignedIn();
  const log = (await res.json()).log;
  document.querySelector('#historyTable tbody').innerHTML = log.map(l => `
    <tr>
      <td>${fmtDate(l.at)}<br><span class="sub">${esc(l.by)}</span></td>
      <td>${l.type === 'restock' ? '<span class="badge on">Restock</span>' : l.type === 'adjust' ? '<span class="badge low">Admin edit</span>' : '<span class="badge neutral">Dispatch</span>'}</td>
      <td>${esc(l.name)}</td>
      <td class="mono">${esc(l.sku) || '—'}</td>
      <td class="num">${l.qty > 0 ? '+' : ''}${l.qty}</td>
      <td class="num">${l.balance}</td>
      <td>${esc(l.note)}</td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="sub">No stock movements yet.</td></tr>';
}

// ---------- Modals ----------
function openModal(name){
  document.getElementById(`${name}Modal`).classList.add('open');
  document.getElementById(`${name}Overlay`).classList.add('open');
}
function closeModal(name){
  document.getElementById(`${name}Modal`).classList.remove('open');
  document.getElementById(`${name}Overlay`).classList.remove('open');
}
['restock', 'dispatch'].forEach(name => {
  document.getElementById(`${name}Overlay`).addEventListener('click', () => closeModal(name));
  document.querySelector(`[data-close="${name}"]`).addEventListener('click', () => closeModal(name));
});
document.addEventListener('keydown', e => {
  if(e.key === 'Escape'){ closeModal('restock'); closeModal('dispatch'); }
});

checkSignedIn();
