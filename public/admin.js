let categories = [];
let products = [];
let currentVariantsProductId = null;

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

// ---------- Shared: image upload wiring ----------
// Wires a file input + hidden field + <img> preview inside `container` to upload
// immediately on file selection, so the form just submits the resulting URL.
function wireImageUpload(container){
  const fileInput = container.querySelector('.image-file-input');
  const hiddenInput = container.querySelector('input[type="hidden"][name="image"]') || container.querySelector('input[name="image"]');
  const preview = container.querySelector('.image-preview');
  if(!fileInput) return;

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if(!file) return;
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/admin/upload-image', { method:'POST', body: formData });
    const data = await res.json();
    if(!res.ok){ alert(data.error || 'Upload failed.'); return; }
    hiddenInput.value = data.url;
    preview.src = data.url;
    preview.classList.remove('hidden');
  });
}

// ---------- Products & categories ----------
async function loadProducts(){
  const res = await fetch('/api/admin/products');
  const data = await res.json();
  products = data.products;
  categories = data.categories;
  renderCategorySelect();
  renderProductsTable();
  renderCategoriesTable();
  renderBundleChecklist();
  renderSaleAppliesTo();
}

function renderCategorySelect(){
  const sel = document.getElementById('productCategorySelect');
  sel.innerHTML = categories.map(c => `<option value="${c.key}">${c.title}</option>`).join('');
}

function thumbHtml(url){
  return url ? `<img class="thumb" src="${url}">` : `<div class="thumb-empty"></div>`;
}

function renderProductsTable(){
  const tbody = document.querySelector('#productsTable tbody');
  tbody.innerHTML = products.map(p => `
    <tr data-id="${p.id}">
      <td>${thumbHtml(p.image)}</td>
      <td><input class="edit-field" data-field="name" value="${escapeAttr(p.name)}" style="width:160px"></td>
      <td><input class="edit-field" data-field="sku" value="${escapeAttr(p.sku || '')}" style="width:90px"></td>
      <td>
        <select class="edit-field" data-field="categoryKey">
          ${categories.map(c => `<option value="${c.key}" ${c.key===p.categoryKey?'selected':''}>${c.title}</option>`).join('')}
        </select>
      </td>
      <td><input class="edit-field" data-field="price" type="number" value="${p.price}" style="width:75px"></td>
      <td><input class="edit-field" data-field="active" type="checkbox" ${p.active?'checked':''}></td>
      <td><input class="edit-field" data-field="desc" value="${escapeAttr(p.desc)}" style="width:180px"></td>
      <td>
        <button class="icon-btn save-product">Save</button>
        <button class="icon-btn manage-variants">Variants (${(p.variants||[]).length})</button>
        <button class="icon-btn danger delete-product">Delete</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.save-product').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('tr');
      const id = row.dataset.id;
      const body = {};
      row.querySelectorAll('.edit-field').forEach(f => {
        body[f.dataset.field] = f.type === 'checkbox' ? f.checked : f.value;
      });
      await fetch(`/api/admin/products/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      loadProducts();
    });
  });
  tbody.querySelectorAll('.delete-product').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('tr').dataset.id;
      if(!confirm('Delete this product?')) return;
      await fetch(`/api/admin/products/${id}`, { method:'DELETE' });
      loadProducts();
    });
  });
  tbody.querySelectorAll('.manage-variants').forEach(btn => {
    btn.addEventListener('click', () => openVariantsModal(Number(btn.closest('tr').dataset.id)));
  });
}

function renderCategoriesTable(){
  const tbody = document.querySelector('#categoriesTable tbody');
  tbody.innerHTML = categories.map(c => `
    <tr data-key="${c.key}">
      <td><input class="edit-field" data-field="title" value="${escapeAttr(c.title)}" style="width:200px"></td>
      <td><input class="edit-field" data-field="tagline" value="${escapeAttr(c.tagline)}" style="width:320px"></td>
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
      loadProducts();
    });
  });
}

document.getElementById('showAddProduct').addEventListener('click', () => {
  document.getElementById('addProductForm').classList.toggle('hidden');
  document.getElementById('bulkImportForm').classList.add('hidden');
});
const addProductForm = document.getElementById('addProductForm');
wireImageUpload(addProductForm);
addProductForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = {
    name: form.name.value, price: form.price.value, categoryKey: form.categoryKey.value,
    sku: form.sku.value, desc: form.desc.value, image: form.image.value
  };
  await fetch('/api/admin/products', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  form.reset();
  form.querySelector('.image-preview').classList.add('hidden');
  form.classList.add('hidden');
  loadProducts();
});

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
  document.getElementById('addProductForm').classList.add('hidden');
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

// ---------- Variants modal ----------
function openVariantsModal(productId){
  currentVariantsProductId = productId;
  const product = products.find(p => p.id === productId);
  document.getElementById('variantsProductName').textContent = product ? product.name : '';
  document.getElementById('addVariantForm').reset();
  document.querySelectorAll('#addVariantForm .image-preview').forEach(img => img.classList.add('hidden'));
  renderVariantsTable();
  document.getElementById('variantsModal').classList.add('open');
  document.getElementById('variantsOverlay').classList.add('open');
}
function closeVariantsModal(){
  document.getElementById('variantsModal').classList.remove('open');
  document.getElementById('variantsOverlay').classList.remove('open');
  currentVariantsProductId = null;
}
document.getElementById('closeVariantsBtn').addEventListener('click', closeVariantsModal);
document.getElementById('variantsOverlay').addEventListener('click', closeVariantsModal);
wireImageUpload(document.getElementById('addVariantForm'));

function renderVariantsTable(){
  const product = products.find(p => p.id === currentVariantsProductId);
  const tbody = document.querySelector('#variantsTable tbody');
  const variants = product ? (product.variants || []) : [];
  tbody.innerHTML = variants.map(v => `
    <tr data-id="${v.id}">
      <td>${thumbHtml(v.image)}</td>
      <td>${escapeAttr(v.color) || '&mdash;'}</td>
      <td>${escapeAttr(v.size) || '&mdash;'}</td>
      <td>Rs. ${v.price}</td>
      <td>${escapeAttr(v.sku)}</td>
      <td><span class="badge ${v.active !== false ? 'on' : 'off'}">${v.active !== false ? 'Active' : 'Off'}</span></td>
      <td>
        <button class="icon-btn toggle-variant">${v.active !== false ? 'Deactivate' : 'Activate'}</button>
        <button class="icon-btn danger delete-variant">Delete</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7" style="color:var(--copper-dim)">No variants yet — this product sells at its base price.</td></tr>';

  tbody.querySelectorAll('.toggle-variant').forEach(btn => {
    btn.addEventListener('click', async () => {
      const vid = btn.closest('tr').dataset.id;
      const variant = variants.find(v => v.id === Number(vid));
      await fetch(`/api/admin/products/${currentVariantsProductId}/variants/${vid}`, {
        method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ active: !(variant.active !== false) })
      });
      await loadProducts();
      renderVariantsTable();
    });
  });
  tbody.querySelectorAll('.delete-variant').forEach(btn => {
    btn.addEventListener('click', async () => {
      if(!confirm('Delete this variant?')) return;
      const vid = btn.closest('tr').dataset.id;
      await fetch(`/api/admin/products/${currentVariantsProductId}/variants/${vid}`, { method:'DELETE' });
      await loadProducts();
      renderVariantsTable();
    });
  });
}

document.getElementById('addVariantForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = { color: form.color.value, size: form.size.value, price: form.price.value, sku: form.sku.value, image: form.image.value };
  const res = await fetch(`/api/admin/products/${currentVariantsProductId}/variants`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
  if(res.ok){
    form.reset();
    form.querySelector('.image-preview').classList.add('hidden');
    await loadProducts();
    renderVariantsTable();
  } else {
    const d = await res.json(); alert(d.error);
  }
});

// ---------- Coupons ----------
async function loadCoupons(){
  const res = await fetch('/api/admin/coupons');
  const data = await res.json();
  const tbody = document.querySelector('#couponsTable tbody');
  tbody.innerHTML = data.coupons.map(c => `
    <tr data-id="${c.id}">
      <td>${c.code}</td>
      <td>${c.type === 'percent' ? c.value + '% off' : 'Rs. ' + c.value + ' off'}</td>
      <td>${c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : 'Never'}</td>
      <td><span class="badge ${c.active ? 'on' : 'off'}">${c.active ? 'Active' : 'Off'}</span></td>
      <td>
        <button class="icon-btn toggle-coupon">${c.active ? 'Deactivate' : 'Activate'}</button>
        <button class="icon-btn danger delete-coupon">Delete</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="color:var(--copper-dim)">No coupons yet.</td></tr>';

  tbody.querySelectorAll('.toggle-coupon').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('tr').dataset.id;
      const coupon = data.coupons.find(c => c.id === Number(id));
      await fetch(`/api/admin/coupons/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ active: !coupon.active }) });
      loadCoupons();
    });
  });
  tbody.querySelectorAll('.delete-coupon').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('tr').dataset.id;
      if(!confirm('Delete this coupon?')) return;
      await fetch(`/api/admin/coupons/${id}`, { method:'DELETE' });
      loadCoupons();
    });
  });
}

document.getElementById('showAddCoupon').addEventListener('click', () => document.getElementById('addCouponForm').classList.toggle('hidden'));
document.getElementById('addCouponForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = { code: form.code.value, type: form.type.value, value: form.value.value, expiresAt: form.expiresAt.value || null };
  const res = await fetch('/api/admin/coupons', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if(res.ok){ form.reset(); form.classList.add('hidden'); loadCoupons(); }
  else { const d = await res.json(); alert(d.error); }
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
  const statuses = ['Pending (COD)', 'Pending payment', 'Confirmed', 'Dispatched', 'Shipped', 'Delivered', 'Cancelled'];
  tbody.innerHTML = data.orders.map(o => `
    <tr data-id="${o.id}">
      <td>${o.orderNumber}</td>
      <td>${o.customerName}<br><span style="color:var(--copper-dim);font-size:0.8rem">${o.customerEmail}</span></td>
      <td>${o.items.map(i => `${i.qty}&times; ${i.name}`).join('<br>')}</td>
      <td>Rs. ${o.total}${o.discount ? `<br><span style="color:var(--copper-dim);font-size:0.8rem">(${o.couponCode} &minus;Rs. ${o.discount})</span>` : ''}</td>
      <td>${o.paymentMethod === 'cod' ? 'Cash on delivery' : `Card<br><span style="color:var(--copper-dim);font-size:0.8rem">${o.paymentStatus === 'paid' ? 'Paid' : o.paymentStatus === 'failed' ? 'Payment failed' : 'Awaiting payment'}${o.paymentId ? ` &middot; ${o.paymentId}` : ''}</span>`}</td>
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
