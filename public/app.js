const BOTTLE_ICON = `
  <svg viewBox="0 0 48 48" fill="none" stroke="#c8601c" stroke-width="1.6">
    <rect x="17" y="4" width="14" height="7" rx="1.5"/>
    <path d="M19 11 L16 17 L16 41 Q16 44 19 44 H29 Q32 44 32 41 V17 L29 11" />
    <line x1="16" y1="24" x2="32" y2="24" />
  </svg>
`;

let currentUser = null;
let allProducts = [];
let allBundles = [];
let cart = JSON.parse(localStorage.getItem('autique_cart') || '{}');           // productId -> qty (no-variant products)
let cartBundles = JSON.parse(localStorage.getItem('autique_cart_bundles') || '{}'); // bundleId -> qty
let cartVariants = JSON.parse(localStorage.getItem('autique_cart_variants') || '{}'); // "productId:variantId" -> qty
let appliedCoupon = null; // { code, discount }

function saveCart(){
  localStorage.setItem('autique_cart', JSON.stringify(cart));
  localStorage.setItem('autique_cart_bundles', JSON.stringify(cartBundles));
  localStorage.setItem('autique_cart_variants', JSON.stringify(cartVariants));
}

// ---------- Sale banner ----------
async function loadSaleBanner(){
  const res = await fetch('/api/settings');
  const s = await res.json();
  const banner = document.getElementById('saleBanner');
  if(s.saleActive && s.saleLabel){
    banner.textContent = s.saleLabel;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

// ---------- Products ----------
async function loadProducts(){
  const res = await fetch('/api/products');
  const data = await res.json();
  const categories = data.categories;
  allProducts = categories.flatMap(c => c.products);

  document.getElementById('topnav').innerHTML = categories
    .map(c => `<a href="#${c.key}">${c.title}</a>`)
    .join('');

  document.getElementById('categories').innerHTML = categories.map(cat => `
    <section class="category" id="${cat.key}">
      <div class="category-head">
        <h2>${cat.title}</h2>
        <p>${cat.tagline}</p>
      </div>
      <div class="grid">
        ${cat.products.map(p => `
          <div class="card" data-product-id="${p.id}">
            <div class="card-thumb">${p.image ? `<img src="${p.image}" class="thumb-img">` : BOTTLE_ICON}</div>
            <div class="card-body">
              <h3>${p.name}</h3>
              ${p.hasVariants ? `
                <select class="variant-select" data-product-id="${p.id}">
                  ${p.variants.map(v => `<option value="${v.id}">${[v.color, v.size].filter(Boolean).join(' / ') || 'Standard'} — Rs. ${v.price}</option>`).join('')}
                </select>
              ` : ''}
              <div class="price-row">
                <div class="price">Rs. ${p.price}</div>
                ${p.originalPrice ? `<div class="price-was">Rs. ${p.originalPrice}</div>` : ''}
              </div>
              <p class="desc">${p.desc}</p>
              <button class="add-btn" data-id="${p.id}">Add to cart</button>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `).join('');

  // Variant selection updates the shown price (and image, if the variant has one)
  document.querySelectorAll('.variant-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const card = sel.closest('.card');
      const p = allProducts.find(x => x.id === Number(sel.dataset.productId));
      const v = p.variants.find(x => x.id === Number(sel.value));
      card.querySelector('.price').textContent = `Rs. ${v.price}`;
      const wasEl = card.querySelector('.price-was');
      if(v.originalPrice){
        if(wasEl) wasEl.textContent = `Rs. ${v.originalPrice}`;
        else card.querySelector('.price-row').insertAdjacentHTML('beforeend', `<div class="price-was">Rs. ${v.originalPrice}</div>`);
      } else if(wasEl){
        wasEl.remove();
      }
      if(v.image){
        card.querySelector('.card-thumb').innerHTML = `<img src="${v.image}" class="thumb-img">`;
      }
    });
  });

  document.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const p = allProducts.find(x => x.id === id);
      if(p.hasVariants){
        const sel = btn.closest('.card').querySelector('.variant-select');
        const key = `${id}:${sel.value}`;
        cartVariants[key] = (cartVariants[key] || 0) + 1;
      } else {
        cart[id] = (cart[id] || 0) + 1;
      }
      saveCart();
      renderCart();
      btn.textContent = 'Added';
      btn.classList.add('added');
      setTimeout(() => { btn.textContent = 'Add to cart'; btn.classList.remove('added'); }, 900);
    });
  });
}

// ---------- Bundles ----------
async function loadBundles(){
  const res = await fetch('/api/bundles');
  const data = await res.json();
  allBundles = data.bundles;
  const section = document.getElementById('bundlesSection');
  const grid = document.getElementById('bundlesGrid');

  if(allBundles.length === 0){
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  grid.innerHTML = allBundles.map(b => `
    <div class="bundle-card">
      <h3>${b.title}</h3>
      ${b.desc ? `<p class="desc">${b.desc}</p>` : ''}
      <ul>${b.items.map(i => `<li>${i.name}</li>`).join('')}</ul>
      <div class="bundle-price-row">
        <span class="bundle-price">Rs. ${b.bundlePrice}</span>
        <span class="bundle-was">Rs. ${b.individualTotal}</span>
      </div>
      <button class="add-btn" data-bundle-id="${b.id}">Add bundle to cart</button>
    </div>
  `).join('');

  grid.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.bundleId);
      cartBundles[id] = (cartBundles[id] || 0) + 1;
      saveCart();
      renderCart();
      btn.textContent = 'Added';
      setTimeout(() => { btn.textContent = 'Add bundle to cart'; }, 900);
    });
  });
}

// ---------- Cart totals ----------
function computeSubtotal(){
  let subtotal = 0;
  Object.entries(cart).filter(([,qty]) => qty > 0).forEach(([id, qty]) => {
    const p = allProducts.find(x => x.id === Number(id));
    if(p) subtotal += p.price * qty;
  });
  Object.entries(cartVariants).filter(([,qty]) => qty > 0).forEach(([key, qty]) => {
    const [pid, vid] = key.split(':').map(Number);
    const p = allProducts.find(x => x.id === pid);
    const v = p && p.variants && p.variants.find(x => x.id === vid);
    if(v) subtotal += v.price * qty;
  });
  Object.entries(cartBundles).filter(([,qty]) => qty > 0).forEach(([id, qty]) => {
    const b = allBundles.find(x => x.id === Number(id));
    if(b) subtotal += b.bundlePrice * qty;
  });
  return subtotal;
}

function renderCart(){
  const productEntries = Object.entries(cart).filter(([, qty]) => qty > 0);
  const variantEntries = Object.entries(cartVariants).filter(([, qty]) => qty > 0);
  const bundleEntries = Object.entries(cartBundles).filter(([, qty]) => qty > 0);
  const countEl = document.getElementById('cartCount');
  const itemsEl = document.getElementById('drawerItems');
  const totalEl = document.getElementById('totalVal');
  const subtotalRowEl = document.getElementById('subtotalRow');
  const signedInAsEl = document.getElementById('signedInAs');

  const totalCount = productEntries.reduce((s,[,q]) => s+q, 0)
    + variantEntries.reduce((s,[,q]) => s+q, 0)
    + bundleEntries.reduce((s,[,q]) => s+q, 0);
  countEl.textContent = totalCount;
  signedInAsEl.textContent = currentUser ? `Signed in as ${currentUser.name}` : 'Sign in to complete checkout';

  if(totalCount === 0){
    itemsEl.innerHTML = '<div class="drawer-empty">Your cart is empty. Add something from the collections.</div>';
    subtotalRowEl.innerHTML = '';
    totalEl.textContent = 'Rs. 0';
    appliedCoupon = null;
    document.getElementById('couponMsg').textContent = '';
    return;
  }

  let productsHtml = productEntries.map(([id, qty]) => {
    const p = allProducts.find(x => x.id === Number(id));
    if(!p) return '';
    return `
      <div class="line-item">
        <div>
          <div class="li-name">${p.name}</div>
          <div class="li-price">Rs. ${p.price} each</div>
        </div>
        <div class="qty-controls">
          <button class="qty-btn" data-type="product" data-action="dec" data-id="${p.id}" aria-label="Decrease quantity">&minus;</button>
          <span class="qty-val">${qty}</span>
          <button class="qty-btn" data-type="product" data-action="inc" data-id="${p.id}" aria-label="Increase quantity">+</button>
          <button class="remove-btn" data-type="product" data-action="remove" data-id="${p.id}">Remove</button>
        </div>
      </div>
    `;
  }).join('');

  let variantsHtml = variantEntries.map(([key, qty]) => {
    const [pid, vid] = key.split(':').map(Number);
    const p = allProducts.find(x => x.id === pid);
    const v = p && p.variants && p.variants.find(x => x.id === vid);
    if(!p || !v) return '';
    const label = [v.color, v.size].filter(Boolean).join(' / ') || 'Standard';
    return `
      <div class="line-item">
        <div>
          <div class="li-name">${p.name} — ${label}</div>
          <div class="li-price">Rs. ${v.price} each</div>
        </div>
        <div class="qty-controls">
          <button class="qty-btn" data-type="variant" data-action="dec" data-id="${key}" aria-label="Decrease quantity">&minus;</button>
          <span class="qty-val">${qty}</span>
          <button class="qty-btn" data-type="variant" data-action="inc" data-id="${key}" aria-label="Increase quantity">+</button>
          <button class="remove-btn" data-type="variant" data-action="remove" data-id="${key}">Remove</button>
        </div>
      </div>
    `;
  }).join('');

  let bundlesHtml = bundleEntries.map(([id, qty]) => {
    const b = allBundles.find(x => x.id === Number(id));
    if(!b) return '';
    return `
      <div class="line-item">
        <div>
          <div class="li-name">${b.title} (bundle)</div>
          <div class="li-price">Rs. ${b.bundlePrice} each</div>
        </div>
        <div class="qty-controls">
          <button class="qty-btn" data-type="bundle" data-action="dec" data-id="${b.id}" aria-label="Decrease quantity">&minus;</button>
          <span class="qty-val">${qty}</span>
          <button class="qty-btn" data-type="bundle" data-action="inc" data-id="${b.id}" aria-label="Increase quantity">+</button>
          <button class="remove-btn" data-type="bundle" data-action="remove" data-id="${b.id}">Remove</button>
        </div>
      </div>
    `;
  }).join('');

  itemsEl.innerHTML = productsHtml + variantsHtml + bundlesHtml;

  itemsEl.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const target = type === 'bundle' ? cartBundles : type === 'variant' ? cartVariants : cart;
      const id = type === 'variant' ? btn.dataset.id : Number(btn.dataset.id);
      const action = btn.dataset.action;
      if(action === 'inc') target[id]++;
      if(action === 'dec') target[id] = Math.max(0, target[id] - 1);
      if(action === 'remove') target[id] = 0;
      saveCart();
      renderCart();
    });
  });

  const subtotal = computeSubtotal();
  let total = subtotal;

  if(appliedCoupon){
    total = Math.max(0, subtotal - appliedCoupon.discount);
    subtotalRowEl.innerHTML = `<span>Subtotal</span><span>Rs. ${subtotal}</span>` +
      `<br><span style="color:var(--copper-bright)">${appliedCoupon.code}</span><span style="color:var(--copper-bright)">&minus;Rs. ${appliedCoupon.discount}</span>`;
  } else {
    subtotalRowEl.innerHTML = '';
  }
  totalEl.textContent = `Rs. ${total}`;
}

// ---------- Coupon ----------
document.getElementById('applyCouponBtn').addEventListener('click', async () => {
  const code = document.getElementById('couponInput').value.trim();
  const msgEl = document.getElementById('couponMsg');
  if(!code){ return; }
  const subtotal = computeSubtotal();
  const res = await fetch('/api/coupons/validate', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ code, subtotal })
  });
  const data = await res.json();
  if(data.valid){
    appliedCoupon = { code: data.code, discount: data.discount };
    msgEl.textContent = `Applied ${data.code} — you saved Rs. ${data.discount}.`;
    msgEl.className = 'coupon-msg ok';
  } else {
    appliedCoupon = null;
    msgEl.textContent = data.reason || 'That code is not valid.';
    msgEl.className = 'coupon-msg bad';
  }
  renderCart();
});

// ---------- Drawer open/close ----------
function openDrawer(){
  document.getElementById('drawer').classList.add('open');
  document.getElementById('overlay').classList.add('open');
}
function closeDrawer(){
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
}

// ---------- Auth ----------
async function refreshAccount(){
  const res = await fetch('/api/me');
  const data = await res.json();
  currentUser = data.user;
  const btn = document.getElementById('accountBtn');
  btn.textContent = currentUser ? `Hi, ${currentUser.name.split(' ')[0]} (sign out)` : 'Sign in';
  renderCart();
}

function openAuth(message){
  document.getElementById('authModal').classList.add('open');
  document.getElementById('authOverlay').classList.add('open');
  document.getElementById('authNote').textContent = message || '';
}
function closeAuth(){
  document.getElementById('authModal').classList.remove('open');
  document.getElementById('authOverlay').classList.remove('open');
  document.getElementById('signinError').textContent = '';
  document.getElementById('signupError').textContent = '';
}

function setAuthTab(tab){
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('signinForm').classList.toggle('hidden', tab !== 'signin');
  document.getElementById('signupForm').classList.toggle('hidden', tab !== 'signup');
}
document.querySelectorAll('.auth-tab').forEach(tab => tab.addEventListener('click', () => setAuthTab(tab.dataset.tab)));

document.getElementById('accountBtn').addEventListener('click', async () => {
  if(currentUser){
    await fetch('/api/logout', { method: 'POST' });
    await refreshAccount();
  } else {
    setAuthTab('signin');
    openAuth('');
  }
});

document.getElementById('signinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = { email: form.email.value, password: form.password.value };
  const res = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const data = await res.json();
  if(!res.ok){ document.getElementById('signinError').textContent = data.error; return; }
  await refreshAccount();
  closeAuth();
});

document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = { name: form.name.value, email: form.email.value, password: form.password.value };
  const res = await fetch('/api/signup', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const data = await res.json();
  if(!res.ok){ document.getElementById('signupError').textContent = data.error; return; }
  await refreshAccount();
  closeAuth();
});

// ---------- Checkout modal ----------
function openCheckout(){
  document.getElementById('checkoutModal').classList.add('open');
  document.getElementById('checkoutOverlay').classList.add('open');
}
function closeCheckout(){
  document.getElementById('checkoutModal').classList.remove('open');
  document.getElementById('checkoutOverlay').classList.remove('open');
}
document.getElementById('closeCheckoutBtn').addEventListener('click', closeCheckout);
document.getElementById('checkoutOverlay').addEventListener('click', closeCheckout);

document.querySelectorAll('input[name="paymentMethod"]').forEach(radio => {
  radio.addEventListener('change', () => {
    document.getElementById('cardFields').classList.toggle('hidden', radio.value !== 'card' || !radio.checked);
  });
});

document.getElementById('checkoutBtn').addEventListener('click', () => {
  const totalCount = Object.values(cart).reduce((a,b)=>a+b,0)
    + Object.values(cartVariants).reduce((a,b)=>a+b,0)
    + Object.values(cartBundles).reduce((a,b)=>a+b,0);
  if(totalCount === 0){ alert('Your cart is empty — add a product first.'); return; }
  if(!currentUser){
    closeDrawer();
    setAuthTab('signin');
    openAuth('Sign in to complete your order.');
    return;
  }
  closeDrawer();
  openCheckout();
});

document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const items = Object.entries(cart).filter(([,q]) => q > 0).map(([productId, qty]) => ({ productId: Number(productId), qty }));
  const variants = Object.entries(cartVariants).filter(([,q]) => q > 0).map(([key, qty]) => {
    const [productId, variantId] = key.split(':').map(Number);
    return { productId, variantId, qty };
  });
  const bundles = Object.entries(cartBundles).filter(([,q]) => q > 0).map(([bundleId, qty]) => ({ bundleId: Number(bundleId), qty }));
  const body = {
    items, variants, bundles,
    couponCode: appliedCoupon ? appliedCoupon.code : null,
    paymentMethod: form.paymentMethod.value,
    shipping: { name: form.name.value, phone: form.phone.value, address: form.address.value, city: form.city.value }
  };
  const res = await fetch('/api/orders', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const data = await res.json();
  if(!res.ok){ document.getElementById('checkoutError').textContent = data.error; return; }

  document.getElementById('checkoutError').textContent = '';
  closeCheckout();
  showConfirmation(data.order);

  cart = {}; cartVariants = {}; cartBundles = {}; appliedCoupon = null;
  saveCart();
  renderCart();
  form.reset();
});

// ---------- Order confirmation ----------
function showConfirmation(order){
  const content = document.getElementById('confirmContent');
  const paymentNote = order.paymentMethod === 'cod'
    ? `Pay <strong>Rs. ${order.total}</strong> in cash when your order arrives.`
    : `We'll confirm once payment is verified. (This is a local demo — no real card charge has been made.)`;

  content.innerHTML = `
    <p>Thanks, ${order.customerName.split(' ')[0]}! Your order <strong>${order.orderNumber}</strong> has been placed.</p>
    <p>${order.items.map(i => `${i.qty}&times; ${i.name}`).join('<br>')}</p>
    ${order.discount ? `<p>Discount (${order.couponCode}): &minus;Rs. ${order.discount}</p>` : ''}
    <p class="confirm-total">Total: Rs. ${order.total}</p>
    <p>${paymentNote}</p>
  `;
  document.getElementById('confirmModal').classList.add('open');
  document.getElementById('confirmOverlay').classList.add('open');
}
document.getElementById('continueShoppingBtn').addEventListener('click', () => {
  document.getElementById('confirmModal').classList.remove('open');
  document.getElementById('confirmOverlay').classList.remove('open');
});

// ---------- Wiring ----------
document.getElementById('cartBtn').addEventListener('click', openDrawer);
document.getElementById('closeCartBtn').addEventListener('click', closeDrawer);
document.getElementById('overlay').addEventListener('click', closeDrawer);
document.getElementById('closeAuthBtn').addEventListener('click', closeAuth);
document.getElementById('authOverlay').addEventListener('click', closeAuth);

(async function init(){
  await loadSaleBanner();
  await loadProducts();
  await loadBundles();
  await refreshAccount();
  renderCart();
})();
