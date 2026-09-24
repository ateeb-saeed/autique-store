let categories = [];
let products = [];

// ---------- Auth ----------
async function checkAdmin(){
  const res = await fetch('/api/admin/me');
  const data = await res.json();
  if(data.isAdmin){
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('adminShell').classList.remove('hidden');
    loadEverything();
  } else {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('adminShell').classList.add('hidden');
  }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('adminPassword').value;
  const res = await fetch('/api/admin/login', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ password })
  });
  const data = await res.json();
  if(!res.ok){ document.getElementById('loginError').textContent = data.error; return; }
  document.getElementById('loginError').textContent = '';
  checkAdmin();
});

document.getElementById('adminLogoutBtn').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method:'POST' });
  checkAdmin();
});

// ---------- Tabs ----------
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
    if(btn.dataset.tab === 'dashboard') loadDashboard();
  });
});

function loadEverything(){
  loadDashboard();
  loadProducts();
  loadCoupons();
  loadBundles();
  loadSaleSettings();
  loadOrders();
}

// ---------- Products & categories ----------
const money = n => 'Rs. ' + Math.round(Number(n) || 0).toLocaleString('en-US');
function esc(str){
  return String(str == null ? '' : str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function toast(msg, err){
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
async function api(url, method = 'GET', body){
  const res = await fetch(url, { method, headers: body ? { 'Content-Type':'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch { /* not json */ }
  if(!res.ok) throw new Error((data && data.error) || 'Something went wrong.');
  return data;
}
const productStock = p => (p.variants || []).length ? p.variants.reduce((s, v) => s + (v.stock || 0), 0) : (p.stock || 0);

async function loadProducts(){
  const res = await fetch('/api/admin/products');
  const data = await res.json();
  products = data.products;
  categories = data.categories;
  renderCategoryFilter();
  renderProductsTable();
  renderCategoriesTable();
  renderBundleChecklist();
  renderSaleAppliesTo();
}

function renderCategoryFilter(){
  const sel = document.getElementById('productCatFilter');
  const cur = sel.value;
  sel.innerHTML = '<option value="">All categories</option>' + categories.map(c => `<option value="${esc(c.key)}">${esc(c.title)}</option>`).join('');
  sel.value = cur;
}

function renderProductsTable(){
  const q = document.getElementById('productSearch').value.trim().toLowerCase();
  const cat = document.getElementById('productCatFilter').value;
  const list = products.filter(p => (!cat || p.categoryKey === cat) && (!q || `${p.name} ${p.sku} ${(p.variants || []).map(v => v.sku).join(' ')}`.toLowerCase().includes(q)));
  document.getElementById('productsSub').textContent = `${products.length} product${products.length === 1 ? '' : 's'}${list.length !== products.length ? `, ${list.length} shown` : ''}`;
  const catTitle = key => (categories.find(c => c.key === key) || {}).title || '—';
  const tbody = document.querySelector('#productsTable tbody');
  tbody.innerHTML = list.map(p => {
    const stock = productStock(p), nv = (p.variants || []).length;
    return `<tr data-id="${p.id}">
      <td><input type="checkbox" class="sel" value="${p.id}" aria-label="Select ${esc(p.name)}"></td>
      <td>${p.image ? `<img class="thumb" src="${esc(p.image)}" alt="">` : '<div class="thumb-empty"></div>'}</td>
      <td><a class="name-link" href="#" data-edit="${p.id}">${esc(p.name)}</a><div class="sub">${nv ? `${nv} variant${nv === 1 ? '' : 's'}` : esc(p.sku || '')}</div></td>
      <td>${esc(catTitle(p.categoryKey))}</td>
      <td class="r">${money(p.price)}</td>
      <td class="r">${stock === 0 ? '<span class="badge off">0</span>' : stock}</td>
      <td><button class="pill-toggle ${p.active ? 'on' : ''}" data-toggle="${p.id}" aria-pressed="${!!p.active}">${p.active ? 'Visible' : 'Hidden'}</button></td>
      <td class="r"><div class="row-actions"><button class="btn btn-sm" data-edit="${p.id}">Edit</button><button class="btn btn-danger btn-sm" data-del="${p.id}">Delete</button></div></td>
    </tr>`;
  }).join('') || `<tr><td colspan="8" class="sub" style="padding:40px;text-align:center">${products.length ? 'No products match.' : 'No products yet. Add your first product, or import many at once.'}</td></tr>`;
  document.getElementById('selAll').checked = false;
  updateSelection();
}

function selectedIds(){ return [...document.querySelectorAll('#productsTable .sel:checked')].map(i => Number(i.value)); }
function updateSelection(){
  const n = selectedIds().length;
  document.getElementById('bulkBar').hidden = n === 0;
  document.getElementById('selCount').textContent = `${n} selected`;
}

document.getElementById('productSearch').addEventListener('input', renderProductsTable);
document.getElementById('productCatFilter').addEventListener('change', renderProductsTable);
document.getElementById('selAll').addEventListener('change', e => {
  document.querySelectorAll('#productsTable .sel').forEach(i => { i.checked = e.target.checked; });
  updateSelection();
});
document.querySelector('#productsTable tbody').addEventListener('change', e => { if(e.target.classList.contains('sel')) updateSelection(); });
document.querySelector('#productsTable tbody').addEventListener('click', async e => {
  const edit = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]'), tog = e.target.closest('[data-toggle]');
  try {
    if(edit){ e.preventDefault(); openProductEditor(Number(edit.dataset.edit)); }
    if(tog){
      const p = products.find(x => x.id === Number(tog.dataset.toggle));
      await api(`/api/admin/products/${p.id}`, 'PUT', { active: !p.active });
      await loadProducts();
    }
    if(del){
      const p = products.find(x => x.id === Number(del.dataset.del));
      if(!confirm(`Delete "${p.name}"?\n\nThis removes the product and all its variants. Past orders keep their details.`)) return;
      await api(`/api/admin/products/${p.id}`, 'DELETE');
      toast('Product deleted');
      await loadProducts();
    }
  } catch(err){ toast(err.message, true); }
});
document.querySelectorAll('#bulkBar [data-bulk]').forEach(btn => btn.addEventListener('click', async () => {
  const ids = selectedIds(), action = btn.dataset.bulk;
  if(action === 'delete' && !confirm(`Delete ${ids.length} product(s)? This cannot be undone.`)) return;
  try { await api('/api/admin/products/bulk-action', 'POST', { ids, action }); toast('Done'); await loadProducts(); }
  catch(err){ toast(err.message, true); }
}));

// ---------- Product editor (basics, photos, sizes/colours/stock) ----------
const editor = document.getElementById('productEditor');
let editorImages = [];

function showEditor(show){
  document.getElementById('productsList').classList.toggle('hidden', show);
  editor.classList.toggle('hidden', !show);
  window.scrollTo(0, 0);
}

function variantRowHtml(v){
  return `<tr data-id="${v.id || ''}">
    <td><input class="input" data-k="color" value="${esc(v.color)}" aria-label="Colour"></td>
    <td><input class="input" data-k="size" value="${esc(v.size)}" style="width:90px" aria-label="Size"></td>
    <td><input class="input" data-k="sku" value="${esc(v.sku)}" aria-label="SKU"></td>
    <td><input class="input" data-k="price" type="number" min="0" value="${v.priceSet === false || v.price === undefined ? '' : v.price}" style="width:120px" aria-label="Variant price"></td>
    <td><input class="input" data-k="stock" type="number" min="0" value="${v.stock || 0}" style="width:90px" aria-label="Stock"></td>
    <td><button class="btn btn-sm" type="button" data-rm-var aria-label="Remove row">&times;</button></td>
  </tr>`;
}

function paintImages(){
  document.getElementById('pf-imgs').innerHTML = editorImages.length
    ? editorImages.map((u, i) => `<figure><img src="${esc(u)}" alt=""><button type="button" data-rm-img="${i}" aria-label="Remove photo">&times;</button></figure>`).join('')
    : '<span class="hint" style="margin:0">No photos yet. A placeholder is shown until you add one.</span>';
}

function toggleSimpleStock(){
  const hasRows = editor.querySelectorAll('#pf-vars tr').length > 0;
  document.getElementById('pf-simple').classList.toggle('hidden', hasRows);
}

function openProductEditor(id){
  const isNew = !id;
  const p = isNew
    ? { name:'', price:'', desc:'', categoryKey: (categories[0] || {}).key, sku:'', stock:0, active:true, images:[], variants:[] }
    : products.find(x => x.id === id);
  editorImages = [...(p.images && p.images.length ? p.images : (p.image ? [p.image] : []))];
  editor.dataset.id = isNew ? '' : p.id;
  editor.innerHTML = `
    <div class="panel-head"><h2>${isNew ? 'Add product' : 'Edit product'}</h2><button type="button" class="btn btn-sm" data-cancel>&larr; Back to products</button></div>
    <p class="panel-sub">${isNew ? 'Fill in the details, add photos and set sizes, colours and stock.' : esc(p.name)}</p>
    <div class="box"><h3>Basics</h3><div class="form">
      <div class="field"><label for="pf-name">Product name</label><input class="input" id="pf-name" name="name" value="${esc(p.name)}" required></div>
      <div class="row">
        <div class="field"><label for="pf-cat">Category</label><select id="pf-cat" name="categoryKey">${categories.map(c => `<option value="${esc(c.key)}" ${c.key === p.categoryKey ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select></div>
        <div class="field"><label for="pf-price">Price (Rs.)</label><input class="input" id="pf-price" name="price" type="number" min="0" value="${esc(p.price)}" required><div class="hint">The default price. A variant can override it below.</div></div>
      </div>
      <div class="field"><label for="pf-desc">Description</label><textarea class="input" id="pf-desc" name="desc" rows="4">${esc(p.desc)}</textarea></div>
      <div class="row">
        <div class="field"><label for="pf-sku">SKU</label><input class="input" id="pf-sku" name="sku" value="${esc(p.sku)}"><div class="hint">Leave blank to create one automatically.</div></div>
        <div class="field" id="pf-simple"><label for="pf-stock">Stock</label><input class="input" id="pf-stock" name="stock" type="number" min="0" value="${p.stock || 0}"><div class="hint">Units on hand. With sizes or colours, set stock per row below instead.</div></div>
      </div>
      <label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Visible in the shop</label>
    </div></div>
    <div class="box"><h3>Photos</h3><div class="imgs" id="pf-imgs"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <label class="btn btn-sm" style="cursor:pointer">Upload photos<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden id="pf-upload"></label>
        <input class="input" id="pf-url" placeholder="or paste an image link" style="width:auto;flex:1;min-width:200px;border-radius:999px;padding:9px 16px">
        <button class="btn btn-sm" type="button" id="pf-add-url">Add link</button>
      </div>
      <p class="hint">The first photo is the main one shown in the shop.</p></div>
    <div class="box"><h3>Sizes, colours and stock</h3>
      <div class="note">Each row is one buyable option with its own SKU and stock. Use quick add to create every colour and size combination at once. Leave this empty for a product with no options.</div>
      <div class="form" style="margin-bottom:14px">
        <div class="row"><div class="field"><label for="qa-colors">Colours</label><input class="input" id="qa-colors" placeholder="Grey, Black"></div><div class="field"><label for="qa-sizes">Sizes</label><input class="input" id="qa-sizes" placeholder="250ml, 500ml"></div></div>
        <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap"><div class="field" style="width:140px"><label for="qa-stock">Stock each</label><input class="input" id="qa-stock" type="number" min="0" value="5"></div><button class="btn btn-sm" type="button" id="qa-add">Add combinations</button></div>
      </div>
      <div style="overflow-x:auto"><table class="vt"><thead><tr><th>Colour</th><th>Size</th><th>SKU</th><th>Price (optional)</th><th>Stock</th><th></th></tr></thead><tbody id="pf-vars">${(p.variants || []).map(variantRowHtml).join('')}</tbody></table></div>
      <button class="btn btn-sm" type="button" id="pf-add-row" style="margin-top:12px">Add a row</button></div>
    <p class="error-text" id="pf-error" style="margin-top:14px"></p>
    <div style="display:flex;gap:10px;margin-top:6px"><button class="btn btn-primary btn-lg" type="submit">${isNew ? 'Create product' : 'Save changes'}</button><button class="btn btn-lg" type="button" data-cancel>Cancel</button></div>`;
  paintImages();
  toggleSimpleStock();
  showEditor(true);
}

document.getElementById('addProductBtn').addEventListener('click', () => openProductEditor(null));

editor.addEventListener('click', e => {
  if(e.target.closest('[data-cancel]')){ showEditor(false); return; }
  const rmImg = e.target.closest('[data-rm-img]');
  if(rmImg){ editorImages.splice(Number(rmImg.dataset.rmImg), 1); paintImages(); return; }
  if(e.target.closest('[data-rm-var]')){ e.target.closest('tr').remove(); toggleSimpleStock(); return; }
  if(e.target.id === 'pf-add-row'){ document.getElementById('pf-vars').insertAdjacentHTML('beforeend', variantRowHtml({ stock:0 })); toggleSimpleStock(); return; }
  if(e.target.id === 'pf-add-url'){
    const i = document.getElementById('pf-url');
    if(i.value.trim()){ editorImages.push(i.value.trim()); i.value = ''; paintImages(); }
    return;
  }
  if(e.target.id === 'qa-add'){
    const split = id => document.getElementById(id).value.split(',').map(s => s.trim()).filter(Boolean);
    const colors = split('qa-colors'), sizes = split('qa-sizes'), stock = document.getElementById('qa-stock').value || 0;
    const rows = [...editor.querySelectorAll('#pf-vars tr')];
    const have = new Set(rows.map(tr => `${tr.querySelector('[data-k=color]').value.trim()}|${tr.querySelector('[data-k=size]').value.trim()}`));
    let n = 0;
    (colors.length ? colors : ['']).forEach(c => (sizes.length ? sizes : ['']).forEach(sz => {
      if(!c && !sz) return;
      if(!have.has(`${c}|${sz}`)){ document.getElementById('pf-vars').insertAdjacentHTML('beforeend', variantRowHtml({ color:c, size:sz, stock })); n++; }
    }));
    toggleSimpleStock();
    toast(`${n} option${n === 1 ? '' : 's'} added`);
  }
});

editor.addEventListener('change', async e => {
  if(e.target.id !== 'pf-upload') return;
  for(const file of e.target.files){
    if(file.size > 5 * 1024 * 1024){ toast(`${file.name} is larger than 5 MB.`, true); continue; }
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch('/api/admin/upload-image', { method:'POST', body: fd });
    const data = await res.json();
    if(res.ok){ editorImages.push(data.url); paintImages(); } else toast(data.error || 'Upload failed.', true);
  }
  e.target.value = '';
});

editor.addEventListener('submit', async e => {
  e.preventDefault();
  const f = editor;
  const variants = [...f.querySelectorAll('#pf-vars tr')].map(tr => {
    const o = { id: tr.dataset.id ? Number(tr.dataset.id) : undefined };
    tr.querySelectorAll('input').forEach(i => { o[i.dataset.k] = i.value; });
    return o;
  });
  const body = {
    name: f.name.value, categoryKey: f.categoryKey.value, price: f.price.value, desc: f.desc.value,
    sku: f.sku.value, stock: f.stock.value, active: f.active.checked, images: editorImages, variants
  };
  const id = f.dataset.id;
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    await api(id ? `/api/admin/products/${id}/full` : '/api/admin/products/full', id ? 'PUT' : 'POST', body);
    toast(id ? 'Product saved' : 'Product created');
    await loadProducts();
    showEditor(false);
  } catch(err){
    document.getElementById('pf-error').textContent = err.message;
  }
  btn.disabled = false;
});

function renderCategoriesTable(){
  const tbody = document.querySelector('#categoriesTable tbody');
  tbody.innerHTML = categories.map(c => `
    <tr data-key="${c.key}">
      <td><input class="input edit-field" data-field="title" value="${escapeAttr(c.title)}" style="width:220px"></td>
      <td><input class="input edit-field" data-field="tagline" value="${escapeAttr(c.tagline)}" style="width:360px"></td>
      <td><button class="icon-btn save-category">Save</button></td>
    </tr>
  `).join('');
  tbody.querySelectorAll('.save-category').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('tr');
      const key = row.dataset.key;
      const body = {};
      row.querySelectorAll('.edit-field').forEach(f => { body[f.dataset.field] = f.value; });
      await fetch(`/api/admin/categories/${key}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      toast('Category saved');
      loadProducts();
    });
  });
}

document.getElementById('showAddCategory').addEventListener('click', () => document.getElementById('addCategoryForm').classList.toggle('hidden'));
document.getElementById('addCategoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = { title: form.title.value, tagline: form.tagline.value };
  const res = await fetch('/api/admin/categories', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if(res.ok){ form.reset(); form.classList.add('hidden'); loadProducts(); }
  else { const d = await res.json(); alert(d.error); }
});

// ---------- Bulk CSV import ----------
document.getElementById('showBulkImport').addEventListener('click', () => {
  document.getElementById('bulkImportForm').classList.toggle('hidden');
});

function parseCSV(text){
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i], next = text[i+1];
    if(inQuotes){
      if(c === '"' && next === '"'){ field += '"'; i++; }
      else if(c === '"'){ inQuotes = false; }
      else { field += c; }
    } else {
      if(c === '"'){ inQuotes = true; }
      else if(c === ','){ row.push(field); field = ''; }
      else if(c === '\n' || c === '\r'){
        if(field !== '' || row.length){ row.push(field); rows.push(row); }
        field = ''; row = [];
        if(c === '\r' && next === '\n') i++;
      } else { field += c; }
    }
  }
  if(field !== '' || row.length){ row.push(field); rows.push(row); }
  if(rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).filter(r => r.some(v => v.trim() !== '')).map(r => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = r[idx] !== undefined ? r[idx].trim() : ''; });
    return obj;
  });
}

document.getElementById('runBulkImport').addEventListener('click', async () => {
  const fileInput = document.getElementById('bulkCsvFile');
  const resultEl = document.getElementById('bulkImportResult');
  const file = fileInput.files[0];
  if(!file){ resultEl.innerHTML = '<span class="fail">Choose a CSV file first.</span>'; return; }

  const text = await file.text();
  const rows = parseCSV(text);
  if(rows.length === 0){ resultEl.innerHTML = '<span class="fail">No rows found in that file.</span>'; return; }

  const res = await fetch('/api/admin/products/bulk-import', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ rows })
  });
  const data = await res.json();
  let html = `<span class="ok">${data.created} created, ${data.updated} updated.</span>`;
  if(data.skipped.length){
    html += '<br><span class="fail">Skipped: ' + data.skipped.map(s => `row ${s.row} (${s.reason})`).join(', ') + '</span>';
  }
  resultEl.innerHTML = html;
  fileInput.value = '';
  loadProducts();
});

// ---------- Coupons ----------
let coupons = [];
let editingCouponId = null;
const pad = n => String(n).padStart(2, '0');
const toLocalInput = iso => { if(!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

async function loadCoupons(){
  coupons = (await api('/api/admin/coupons')).coupons;
  const tbody = document.querySelector('#couponsTable tbody');
  tbody.innerHTML = coupons.map(c => {
    const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
    const usedUp = c.usageLimit && (c.usedCount || 0) >= c.usageLimit;
    const state = !c.active ? ['Off', ''] : expired ? ['Expired', 'off'] : usedUp ? ['Used up', 'off'] : ['Active', 'on'];
    return `<tr>
      <td><b>${esc(c.code)}</b></td>
      <td>${c.type === 'percent' ? `${c.value}%` : money(c.value)}</td>
      <td>${c.minOrder ? money(c.minOrder) : '—'}</td>
      <td>${c.usedCount || 0}${c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
      <td>${c.expiresAt ? new Date(c.expiresAt).toLocaleString([], { dateStyle:'medium', timeStyle:'short' }) : 'Never'}</td>
      <td><span class="badge ${state[1]}">${state[0]}</span></td>
      <td class="r"><div class="row-actions"><button class="btn btn-sm" data-coupon-edit="${c.id}">Edit</button><button class="btn btn-danger btn-sm" data-coupon-del="${c.id}">Delete</button></div></td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" class="sub" style="padding:40px;text-align:center">No coupons yet.</td></tr>';
}

function openCouponModal(id){
  const c = coupons.find(x => x.id === id) || { code:'', type:'percent', value:10, minOrder:0, usageLimit:'', expiresAt:null, active:true };
  editingCouponId = id || null;
  const f = document.getElementById('couponForm');
  document.getElementById('couponModalTitle').textContent = id ? 'Edit coupon' : 'New coupon';
  f.code.value = c.code; f.type.value = c.type; f.value.value = c.value;
  f.minOrder.value = c.minOrder || ''; f.usageLimit.value = c.usageLimit || '';
  f.expiresAt.value = toLocalInput(c.expiresAt); f.active.checked = !!c.active;
  document.getElementById('couponError').textContent = '';
  document.getElementById('couponModal').classList.add('open');
  document.getElementById('couponOverlay').classList.add('open');
  f.code.focus();
}
function closeCouponModal(){
  document.getElementById('couponModal').classList.remove('open');
  document.getElementById('couponOverlay').classList.remove('open');
}
document.getElementById('newCouponBtn').addEventListener('click', () => openCouponModal(null));
document.getElementById('couponOverlay').addEventListener('click', closeCouponModal);
document.querySelectorAll('[data-close-coupon]').forEach(b => b.addEventListener('click', closeCouponModal));
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeCouponModal(); });
document.querySelector('#couponsTable tbody').addEventListener('click', async e => {
  const edit = e.target.closest('[data-coupon-edit]'), del = e.target.closest('[data-coupon-del]');
  if(edit) openCouponModal(Number(edit.dataset.couponEdit));
  if(del){
    const c = coupons.find(x => x.id === Number(del.dataset.couponDel));
    if(!confirm(`Delete coupon ${c.code}? Customers will no longer be able to use it.`)) return;
    await api(`/api/admin/coupons/${c.id}`, 'DELETE');
    toast('Coupon deleted');
    loadCoupons();
  }
});
document.getElementById('couponForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  const body = {
    code: f.code.value, type: f.type.value, value: f.value.value, minOrder: f.minOrder.value || 0,
    usageLimit: f.usageLimit.value || null, expiresAt: f.expiresAt.value ? new Date(f.expiresAt.value).toISOString() : null, active: f.active.checked
  };
  try {
    await api(editingCouponId ? `/api/admin/coupons/${editingCouponId}` : '/api/admin/coupons', editingCouponId ? 'PUT' : 'POST', body);
    closeCouponModal();
    toast('Coupon saved');
    loadCoupons();
  } catch(err){ document.getElementById('couponError').textContent = err.message; }
});

// ---------- Bundles ----------
function renderBundleChecklist(){
  const wrap = document.getElementById('bundleProductChecks');
  wrap.innerHTML = products.map(p => `
    <label><input type="checkbox" value="${p.id}"> ${p.name} (Rs. ${p.price})</label>
  `).join('');
}

async function loadBundles(){
  const res = await fetch('/api/admin/bundles');
  const data = await res.json();
  const tbody = document.querySelector('#bundlesTable tbody');
  tbody.innerHTML = data.bundles.map(b => {
    const names = b.productIds.map(id => {
      const p = data.products.find(x => x.id === id);
      return p ? p.name : '';
    }).filter(Boolean).join(', ');
    const individualTotal = b.productIds.reduce((sum, id) => {
      const p = data.products.find(x => x.id === id);
      return sum + (p ? p.price : 0);
    }, 0);
    return `
      <tr data-id="${b.id}">
        <td>${b.title}</td>
        <td>${names}</td>
        <td>Rs. ${b.bundlePrice}</td>
        <td>Rs. ${individualTotal}</td>
        <td><span class="badge ${b.active ? 'on' : 'off'}">${b.active ? 'Active' : 'Off'}</span></td>
        <td>
          <button class="icon-btn toggle-bundle">${b.active ? 'Deactivate' : 'Activate'}</button>
          <button class="icon-btn danger delete-bundle">Delete</button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="6" style="color:var(--copper-dim)">No bundles yet.</td></tr>';

  tbody.querySelectorAll('.toggle-bundle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('tr').dataset.id;
      const bundle = data.bundles.find(b => b.id === Number(id));
      await fetch(`/api/admin/bundles/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ active: !bundle.active }) });
      loadBundles();
    });
  });
  tbody.querySelectorAll('.delete-bundle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('tr').dataset.id;
      if(!confirm('Delete this bundle?')) return;
      await fetch(`/api/admin/bundles/${id}`, { method:'DELETE' });
      loadBundles();
    });
  });
}

document.getElementById('showAddBundle').addEventListener('click', () => document.getElementById('addBundleForm').classList.toggle('hidden'));
document.getElementById('addBundleForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const productIds = Array.from(document.querySelectorAll('#bundleProductChecks input:checked')).map(c => c.value);
  if(productIds.length < 2){ alert('Pick at least two products for a bundle.'); return; }
  const body = { title: form.title.value, desc: form.desc.value, productIds, bundlePrice: form.bundlePrice.value };
  const res = await fetch('/api/admin/bundles', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if(res.ok){ form.reset(); form.classList.add('hidden'); loadBundles(); }
  else { const d = await res.json(); alert(d.error); }
});

// ---------- Sale ----------
function renderSaleAppliesTo(){
  const sel = document.getElementById('saleAppliesTo');
  const current = sel.value;
  sel.innerHTML = `<option value="all">All products</option>` +
    categories.map(c => `<option value="${c.key}">${c.title} only</option>`).join('');
  if(current) sel.value = current;
}

async function loadSaleSettings(){
  const res = await fetch('/api/admin/settings');
  const data = await res.json();
  document.getElementById('saleActive').checked = data.settings.saleActive;
  document.getElementById('saleLabel').value = data.settings.saleLabel;
  document.getElementById('saleDiscountPercent').value = data.settings.saleDiscountPercent;
  renderSaleAppliesTo();
  document.getElementById('saleAppliesTo').value = data.settings.saleAppliesTo;
}

document.getElementById('saleForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = {
    saleActive: form.saleActive.checked,
    saleLabel: form.saleLabel.value,
    saleDiscountPercent: form.saleDiscountPercent.value,
    saleAppliesTo: form.saleAppliesTo.value
  };
  await fetch('/api/admin/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const note = document.getElementById('saleSaved');
  note.textContent = 'Saved.';
  setTimeout(() => note.textContent = '', 2000);
});

// ---------- Orders ----------
async function loadOrders(){
  const res = await fetch('/api/admin/orders');
  const data = await res.json();
  const tbody = document.querySelector('#ordersTable tbody');
  const statuses = ['Pending (COD)', 'Awaiting payment', 'Payment failed', 'Pending payment', 'Confirmed', 'Dispatched', 'Shipped', 'Delivered', 'Cancelled'];
  tbody.innerHTML = data.orders.map(o => `
    <tr data-id="${o.id}">
      <td>${o.orderNumber}</td>
      <td>${o.customerName}<br><span style="color:var(--copper-dim);font-size:0.8rem">${o.customerEmail}</span></td>
      <td>${o.items.map(i => `${i.qty}&times; ${i.name}`).join('<br>')}</td>
      <td>Rs. ${o.total}${o.discount ? `<br><span style="color:var(--copper-dim);font-size:0.8rem">(${o.couponCode} &minus;Rs. ${o.discount})</span>` : ''}</td>
      <td>${o.paymentMethod === 'cod' ? 'Cash on delivery' : `Online (Rapid Gateway)${o.rgPaymentId ? `<br><span class="mono" style="color:var(--copper-dim);font-size:0.78rem">${o.rgPaymentId}</span>` : ''}`}</td>
      <td>
        <select class="status-select">
          ${statuses.map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
      <td>${new Date(o.createdAt).toLocaleDateString()}${o.dispatchedAt ? `<br><span style="color:var(--copper-dim);font-size:0.8rem">Dispatched ${new Date(o.dispatchedAt).toLocaleDateString()}${o.courier ? ` via ${o.courier}` : ''}${o.trackingNumber ? ` (${o.trackingNumber})` : ''}</span>` : ''}</td>
    </tr>
  `).join('') || '<tr><td colspan="7" style="color:var(--copper-dim)">No orders yet.</td></tr>';

  tbody.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const id = sel.closest('tr').dataset.id;
      await fetch(`/api/admin/orders/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status: sel.value }) });
    });
  });
}

// ---------- Admin password ----------
document.getElementById('passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = { currentPassword: form.currentPassword.value, newPassword: form.newPassword.value };
  const res = await fetch('/api/admin/change-password', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const data = await res.json();
  if(!res.ok){
    document.getElementById('passwordError').textContent = data.error;
    document.getElementById('passwordSuccess').textContent = '';
    return;
  }
  document.getElementById('passwordError').textContent = '';
  document.getElementById('passwordSuccess').textContent = 'Password changed.';
  form.reset();
});

// ---------- Logistics password ----------
document.getElementById('logisticsPasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const res = await fetch('/api/admin/logistics-password', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ newPassword: form.newPassword.value }) });
  const data = await res.json();
  document.getElementById('logisticsPasswordError').textContent = res.ok ? '' : data.error;
  document.getElementById('logisticsPasswordSuccess').textContent = res.ok ? 'Logistics password set.' : '';
  if(res.ok) form.reset();
});

function escapeAttr(str){
  return String(str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;');
}

checkAdmin();
