(() => {
'use strict';

// ---------- state ----------
const S = { user: null, settings: {}, categories: [], products: [], bundles: [] };
let couponCode = '';

// ---------- utilities ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => 'Rs. ' + Math.round(Number(n) || 0).toLocaleString('en-US');
const fdate = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const go = h => { location.hash = h; };

async function api(url, opts = {}) {
  const o = { credentials: 'same-origin', method: opts.method || 'GET', headers: {} };
  if (opts.body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opts.body); }
  let r;
  try { r = await fetch(url, o); } catch { throw new Error('We cannot reach the store right now. Please check your connection and try again.'); }
  let data = null; try { data = await r.json(); } catch { /* not json */ }
  if (!r.ok) { const e = new Error((data && data.error) || 'Something went wrong. Please try again.'); e.status = r.status; e.data = data; throw e; }
  return data;
}
function toast(msg, opts = {}) {
  const el = document.createElement('div');
  el.className = 'toast' + (opts.err ? ' err' : '');
  el.innerHTML = `<span>${esc(msg)}</span>` + (opts.link ? `<a href="${esc(opts.link)}">${esc(opts.linkText)}</a>` : '');
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), opts.ms || 3800);
}

const BOTTLE = `<svg viewBox="0 0 48 48" fill="none" stroke="#0f1b2b" stroke-width="1.4" aria-hidden="true">
  <rect x="17" y="4" width="14" height="7" rx="1.5"/><path d="M19 11 L16 17 L16 41 Q16 44 19 44 H29 Q32 44 32 41 V17 L29 11"/><line x1="16" y1="24" x2="32" y2="24"/></svg>`;
const ICON = {
  truck: '<svg viewBox="0 0 24 24"><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/></svg>',
  cash: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="3"/><circle cx="12" cy="12" r="2.6"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
};
// Order access tokens let guests reopen their order page (e.g. after the card page)
const TOKENS_KEY = 'autique_order_tokens';
const orderTokens = {
  all() { try { return JSON.parse(localStorage.getItem(TOKENS_KEY) || '{}') || {}; } catch { return {}; } },
  get(n) { return this.all()[n] || ''; },
  set(n, t) { const a = this.all(); a[n] = t; try { localStorage.setItem(TOKENS_KEY, JSON.stringify(a)); } catch { /* private mode */ } }
};
const PAY_LABEL = { paid: 'Paid', pending: 'Awaiting payment', failed: 'Payment failed', unpaid: 'Pay on delivery' };
// Set when Rapid Gateway sends the customer back to /?order=<orderNumber>
let returnedOrder = null;

// Site editor settings (content, visible sections, customer rules)
const SITE = () => S.settings.site;
const paragraphs = text => String(text || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');

const imgOrIcon = src => src ? `<img src="${esc(src)}" alt="" loading="lazy">` : BOTTLE;
const variantLabel = v => [v.color, v.size].filter(Boolean).join(' / ') || 'Standard';

// ---------- cart (kept in the browser; the server re-prices every order) ----------
const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { return {}; } };
const cart = {
  products: load('autique_cart'),          // productId -> qty
  variants: load('autique_cart_variants'), // "productId:variantId" -> qty
  bundles: load('autique_cart_bundles'),   // bundleId -> qty
  save() {
    for (const bag of [this.products, this.variants, this.bundles]) for (const k of Object.keys(bag)) if (!(bag[k] > 0)) delete bag[k];
    try {
      localStorage.setItem('autique_cart', JSON.stringify(this.products));
      localStorage.setItem('autique_cart_variants', JSON.stringify(this.variants));
      localStorage.setItem('autique_cart_bundles', JSON.stringify(this.bundles));
    } catch { /* private mode */ }
    this.badge();
  },
  bag(type) { return type === 'variant' ? this.variants : type === 'bundle' ? this.bundles : this.products; },
  add(type, key, q = 1) { const b = this.bag(type); b[key] = (b[key] || 0) + q; this.save(); },
  set(type, key, q) { this.bag(type)[key] = Math.max(1, q); this.save(); },
  remove(type, key) { delete this.bag(type)[key]; this.save(); },
  clear() { this.products = {}; this.variants = {}; this.bundles = {}; this.save(); },
  count() { return [this.products, this.variants, this.bundles].reduce((n, b) => n + Object.values(b).reduce((a, q) => a + q, 0), 0); },
  badge() { const n = this.count(), b = $('#cart-count'); b.textContent = n; b.hidden = n === 0; },
  // Resolve cart keys against the live catalog, dropping anything no longer sold
  lines() {
    const out = [];
    Object.entries(this.products).forEach(([id, qty]) => {
      const p = S.products.find(x => x.id === Number(id));
      if (p && !p.hasVariants) out.push({ type: 'product', key: id, name: p.name, label: p.categoryTitle, image: p.image, href: `#/product/${p.id}`, price: p.price, was: p.originalPrice, qty });
    });
    Object.entries(this.variants).forEach(([key, qty]) => {
      const [pid, vid] = key.split(':').map(Number);
      const p = S.products.find(x => x.id === pid);
      const v = p && (p.variants || []).find(x => x.id === vid);
      if (v) out.push({ type: 'variant', key, name: p.name, label: variantLabel(v), image: v.image || p.image, href: `#/product/${p.id}?v=${v.id}`, price: v.price, was: v.originalPrice, qty });
    });
    Object.entries(this.bundles).forEach(([id, qty]) => {
      const b = S.bundles.find(x => x.id === Number(id));
      if (b) out.push({ type: 'bundle', key: id, name: b.title, label: 'Bundle: ' + b.items.map(i => i.name).join(', '), image: '', href: '#/bundles', price: b.bundlePrice, was: b.individualTotal, qty });
    });
    return out;
  },
  payload() {
    return {
      items: Object.entries(this.products).map(([productId, qty]) => ({ productId: Number(productId), qty })),
      variants: Object.entries(this.variants).map(([k, qty]) => { const [productId, variantId] = k.split(':').map(Number); return { productId, variantId, qty }; }),
      bundles: Object.entries(this.bundles).map(([bundleId, qty]) => ({ bundleId: Number(bundleId), qty }))
    };
  }
};

// ---------- data ----------
async function loadCatalog() {
  const [prod, bund, settings, me] = await Promise.all([
    api('/api/products'), api('/api/bundles'), api('/api/settings'), api('/api/me')
  ]);
  S.categories = prod.categories;
  S.products = prod.categories.flatMap(c => c.products.map(p => ({ ...p, categoryKey: c.key, categoryTitle: c.title })));
  S.bundles = bund.bundles;
  S.settings = settings;
  S.user = me.user;
}

// ---------- chrome: drawer menu + footer ----------
function renderChrome() {
  const cur = location.hash.slice(1) || '/';
  const link = (href, label, extra = '') => `<a href="#${href}" class="${cur === href ? 'on' : ''}">${esc(label)}${extra}</a>`;
  $('#drawer-links').innerHTML =
    link('/', 'Home') + link('/shop', 'Shop all')
    + `<div class="label">Collections</div>`
    + S.categories.map(c => link('/shop/' + c.key, c.title, `<span class="count">${c.products.length}</span>`)).join('')
    + (SITE().sections.bundles && S.bundles.length ? link('/bundles', 'Bundles', `<span class="count">${S.bundles.length}</span>`) : '')
    + (S.settings.saleActive ? link('/shop?sale=1', 'Sale') : '')
    + `<div class="sep"></div>`
    + (SITE().customers.allowOrderTracking ? link('/track', 'Track your order') : '')
    + (SITE().sections.aboutPage ? link('/about', 'About us') : '')
    + `<div class="sep"></div>`
    + (S.user ? link('/account', 'My orders') : link('/login', 'Sign in'))
    + link('/cart', 'Shopping bag', `<span class="count">${cart.count()}</span>`)
    + (S.user ? '<button data-act="logout">Sign out</button>' : '');
  const announcement = S.settings.saleActive && S.settings.saleLabel ? S.settings.saleLabel : SITE().content.announcement;
  $('#announce').textContent = announcement;
  $('#announce').hidden = !announcement;
  $('#acct-btn').setAttribute('href', S.user ? '#/account' : '#/login');
  cart.badge();
  $('#footer').innerHTML = `<div class="container"><div class="foot">
    <div><a class="foot-logo" href="#/"><img src="logo.png" alt="autique."></a><p style="margin-top:14px;max-width:32ch">${esc(SITE().content.footerTagline)}</p></div>
    <div><h4>Shop</h4>${S.categories.slice(0, 5).map(c => `<a href="#/shop/${esc(c.key)}">${esc(c.title)}</a>`).join('')}</div>
    <div><h4>Account</h4><a href="#/account">My orders</a>${SITE().customers.allowOrderTracking ? '<a href="#/track">Track your order</a>' : ''}<a href="#/cart">Shopping bag</a>${S.user ? '' : '<a href="#/login">Sign in</a>'}</div>
    <div><h4>Help</h4>${SITE().sections.aboutPage ? '<a href="#/about">About us</a>' : ''}${SITE().content.footerHelp.map(h => `<p>${esc(h)}</p>`).join('')}</div>
  </div><div class="foot-bottom">&copy; ${new Date().getFullYear()} Autique. All rights reserved.</div></div>`;
}
function openMenu(open) {
  $('#drawer').classList.toggle('open', open);
  $('#drawer-bg').classList.toggle('open', open);
  $('#drawer').setAttribute('aria-hidden', String(!open));
  $('[data-act="menu"]').setAttribute('aria-expanded', String(open));
  if (open) $('#drawer .icon-btn').focus();
}

// ---------- product card + price ----------
function priceHTML(price, was, from) {
  const f = from ? '<small class="muted" style="font-weight:400">From </small>' : '';
  return was ? `<div class="price">${f}<span>${fmt(price)}</span><s>${fmt(was)}</s></div>` : `<div class="price">${f}<span>${fmt(price)}</span></div>`;
}
function cardHTML(p) {
  const pct = p.originalPrice ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;
  return `<a class="card" href="#/product/${p.id}"><div class="card-img">${pct ? `<span class="pill-badge">${pct}% off</span>` : ''}${imgOrIcon(p.image)}</div>
    <div class="card-body"><div class="card-cat">${esc(p.categoryTitle)}</div><h3>${esc(p.name)}</h3>${priceHTML(p.price, p.originalPrice, p.hasVariants && p.variants.length > 1)}</div></a>`;
}
const gridHTML = list => `<div class="grid">${list.map(cardHTML).join('')}</div>`;
function bundleHTML(b) {
  return `<div class="bundle"><h3>${esc(b.title)}</h3>${b.desc ? `<p class="muted">${esc(b.desc)}</p>` : ''}
    <ul>${b.items.map(i => `<li>${esc(i.name)}</li>`).join('')}</ul>
    ${priceHTML(b.bundlePrice, b.individualTotal > b.bundlePrice ? b.individualTotal : null)}
    <button class="btn btn-primary" data-act="add-bundle" data-id="${b.id}">Add bundle to bag</button></div>`;
}

// ---------- routes ----------
const routes = [];

// HOME
const TRUST_ICONS = () => [ICON.cash, ICON.truck, ICON.shield];
routes.push([/^\/?$/, () => {
  const { content: c, sections: on, customers } = SITE();
  const onSale = S.products.filter(p => p.originalPrice);
  const brands = c.brands;
  const trust = c.trust.filter(t => t.title || t.text);
  return `<div class="container">
    ${returnedOrder ? `<div class="pay-banner" role="status"><p>Thanks! We're confirming payment for order <b>${esc(returnedOrder)}</b>. This page will not update by itself, but you'll see the confirmed status under <a class="link" href="#/account">My orders</a>${customers.allowOrderTracking ? ` or <a class="link" href="#/track?n=${esc(returnedOrder)}">Track your order</a>` : ''} once it's processed.</p><button class="pay-banner-close" data-act="dismiss-pay-banner" aria-label="Dismiss">&times;</button></div>` : ''}
    ${on.logoBanner ? `<section class="about-hero home-hero" aria-label="autique. stands for auto-boutique">
      <div class="about-logo split-logo scroll-logo" aria-hidden="true"><span>aut</span><span class="al-grow al-mid"><span>o-bout</span></span><span>ique</span><span class="al-grow al-dot"><span>.</span></span></div>
      <p class="about-caption"><span>auto</span> + <span>boutique</span></p>
    </section>` : ''}
    <section class="stage">
      <div>
        ${c.heroEyebrow ? `<div class="eyebrow">${esc(c.heroEyebrow)}</div>` : ''}
        <h1>${esc(c.heroTitle)}</h1>
        ${c.heroText ? `<p class="lede">${esc(c.heroText)}</p>` : ''}
        <div class="cta"><a class="btn btn-primary btn-lg" href="#/shop">${esc(c.heroButton)}</a>${S.settings.saleActive ? '<a class="btn btn-outline btn-lg" href="#/shop?sale=1">See the sale</a>' : on.bundles && S.bundles.length ? '<a class="btn btn-outline btn-lg" href="#/bundles">View bundles</a>' : ''}</div>
      </div>
      <div class="stage-art"><div class="stage-ring">${BOTTLE}</div>
        ${brands.length ? `<div class="stage-brands">${brands.map(b => `<span>${esc(b)}</span>`).join('')}</div>` : ''}</div>
    </section>
    ${on.trustStrip && trust.length ? `<div class="trust">${trust.map((t, i) => `<div>${TRUST_ICONS()[i % 3]}<p><b>${esc(t.title)}</b><span>${esc(t.text)}</span></p></div>`).join('')}</div>` : ''}

    ${on.collections ? `<section class="section"><div class="section-head"><div><h2>Shop by collection</h2></div><a class="link" href="#/shop">View everything</a></div>
      <div class="tiles">${S.categories.map(cat => `<a class="tile" href="#/shop/${esc(cat.key)}"><div><h3>${esc(cat.title)}</h3><p>${esc(cat.tagline)}</p></div><span class="go">${cat.products.length} ${cat.products.length === 1 ? 'product' : 'products'} &rarr;</span></a>`).join('')}</div></section>` : ''}

    ${S.settings.saleActive ? `<section class="section"><div class="saleband"><div><h2>${esc(S.settings.saleLabel || 'Sale on now')}</h2><p>Sale prices are applied automatically in your bag.</p></div><a class="btn btn-primary btn-lg" href="#/shop?sale=1">Shop the sale</a></div>
      ${onSale.length ? `<div style="margin-top:34px">${gridHTML(onSale.slice(0, 4))}</div>` : ''}</section>` : ''}

    ${on.bundles && S.bundles.length ? `<section class="section"><div class="section-head"><div><h2>This month's bundles</h2><p>Save more when you pair products together.</p></div><a class="link" href="#/bundles">All bundles</a></div>
      <div class="bundles">${S.bundles.slice(0, 3).map(bundleHTML).join('')}</div></section>` : ''}

    ${on.bestsellers ? `<section class="section"><div class="section-head"><div><h2>${esc(c.bestsellersTitle)}</h2>${c.bestsellersText ? `<p>${esc(c.bestsellersText)}</p>` : ''}</div><a class="link" href="#/shop">Shop all</a></div>${gridHTML(S.products.slice(0, c.bestsellersCount))}</section>` : ''}

    ${on.brandPanel ? `<section class="section"><div class="split">
      <div class="panel"><h2>${esc(c.panelTitle)}</h2>${c.panelText ? `<p>${esc(c.panelText)}</p>` : ''}
        ${c.panelPoints.length ? `<ul class="facts">${c.panelPoints.map(pt => `<li>${ICON.check}<span>${esc(pt)}</span></li>`).join('')}</ul>` : ''}
        <a class="btn btn-primary" href="#/shop">Explore the collection</a></div>
      <div class="panel brands">${brands.map(b => `<div>${esc(b)}</div>`).join('')}</div>
    </div></section>` : ''}
  </div>`;
}]);

// SHOP
routes.push([/^\/shop(?:\/([\w-]+))?$/, (m, q) => {
  const key = m[1] || '';
  const cat = S.categories.find(c => c.key === key);
  const term = (q.get('q') || '').trim().toLowerCase();
  const sale = q.get('sale') === '1';
  const sort = q.get('sort') || '';
  let list = S.products.filter(p => (!key || p.categoryKey === key) && (!sale || p.originalPrice)
    && (!term || `${p.name} ${p.desc} ${p.sku} ${p.categoryTitle}`.toLowerCase().includes(term)));
  if (sort === 'price-asc') list = list.slice().sort((a, b) => a.price - b.price);
  if (sort === 'price-desc') list = list.slice().sort((a, b) => b.price - a.price);
  if (sort === 'name') list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
  const title = term ? `Results for "${q.get('q')}"` : sale ? 'Sale' : cat ? cat.title : 'Shop all';
  const sub = sale ? 'Everything currently on offer.' : cat ? cat.tagline : 'Exterior, interior and engine care from Gladiator, Sogo, Prato and WTB.';
  const opt = (v, label) => `<option value="${v}" ${v === sort ? 'selected' : ''}>${label}</option>`;
  return `<div class="container">
    <div class="page-head"><h1>${esc(title)}</h1><p>${esc(sub)}</p></div>
    <div class="cat-pills"><a class="pill ${!key && !sale ? 'on' : ''}" href="#/shop">All</a>${S.categories.map(c => `<a class="pill ${c.key === key ? 'on' : ''}" href="#/shop/${esc(c.key)}">${esc(c.title)}</a>`).join('')}${S.settings.saleActive ? `<a class="pill ${sale ? 'on' : ''}" href="#/shop?sale=1">On sale</a>` : ''}</div>
    <div class="filters" data-base="${esc(key ? '/shop/' + key : '/shop')}" data-q="${esc(q.get('q') || '')}" data-sale="${sale ? '1' : ''}">
      <select data-change="sort" aria-label="Sort">${opt('', 'Featured')}${opt('price-asc', 'Price: low to high')}${opt('price-desc', 'Price: high to low')}${opt('name', 'Name A-Z')}</select>
      <span class="count">${list.length} ${list.length === 1 ? 'product' : 'products'}</span>
    </div>
    ${list.length ? gridHTML(list) : `<div class="empty"><h3>Nothing matches yet</h3><p>Try another collection or search for something else.</p><p style="margin-top:18px"><a class="btn btn-outline" href="#/shop">Clear filters</a></p></div>`}
  </div>`;
}]);

// BUNDLES
routes.push([/^\/bundles$/, () => `<div class="container">
  <div class="page-head"><h1>Bundles</h1><p>Save more when you pair products together.</p></div>
  ${SITE().sections.bundles && S.bundles.length ? `<div class="bundles">${S.bundles.map(bundleHTML).join('')}</div>` : '<div class="empty"><h3>No bundles right now</h3><p>Check back soon.</p></div>'}
</div>`]);

// PRODUCT
routes.push([/^\/product\/(\d+)$/, (m, q) => {
  const p = S.products.find(x => x.id === Number(m[1]));
  if (!p) { const e = new Error('That product is no longer available.'); e.status = 404; throw e; }
  document.title = `${p.name} — Autique`;
  const sel = { v: p.hasVariants ? (p.variants.find(v => v.id === Number(q.get('v'))) || p.variants[0]) : null, qty: 1 };
  const related = S.products.filter(x => x.categoryKey === p.categoryKey && x.id !== p.id).slice(0, 4);
  const html = `<div class="container"><div class="crumbs"><a href="#/">Home</a> / <a href="#/shop">Shop</a> / <a href="#/shop/${esc(p.categoryKey)}">${esc(p.categoryTitle)}</a></div>
    <div class="pdp"><div class="main-img" id="pdp-img"></div>
    <div><h1>${esc(p.name)}</h1><div id="pdp-price"></div><div class="sku-line" id="pdp-sku"></div><p class="desc">${esc(p.desc)}</p><div id="pdp-opts"></div>
      <div class="details">
        ${p.hasVariants ? `<details open><summary>Variants and SKUs</summary><table class="vtable"><thead><tr><th>Variant</th><th>SKU</th><th>Price</th></tr></thead><tbody id="pdp-vtable"></tbody></table></details>` : ''}
        <details ${p.hasVariants ? '' : 'open'}><summary>Details</summary><p>Collection: ${esc(p.categoryTitle)}<br>SKU: ${esc(p.sku || '—')}</p></details>
        <details><summary>Delivery and payment</summary><p>We deliver across Pakistan. Pay cash on delivery when your order arrives.</p></details>
      </div></div></div>
    ${related.length ? `<section class="section"><div class="section-head"><h2>You may also like</h2></div>${gridHTML(related)}</section>` : ''}</div>`;
  const mount = root => {
    const paint = () => {
      const v = sel.v;
      $('#pdp-img', root).innerHTML = imgOrIcon((v && v.image) || p.image);
      const price = v ? v.price : p.price, was = v ? v.originalPrice : p.originalPrice;
      $('#pdp-price', root).innerHTML = `<div class="price"><span>${fmt(price)}</span>${was ? `<s>${fmt(was)}</s><span class="save-tag">Save ${Math.round((1 - price / was) * 100)}%</span>` : ''}</div>`;
      $('#pdp-sku', root).textContent = `SKU: ${(v ? v.sku : p.sku) || '—'}`;
      let o = '';
      if (p.hasVariants) o += `<div class="opt"><div class="opt-h"><b>Option</b><span>${esc(variantLabel(v))}</span></div><div class="sizes">${p.variants.map(x => `<button class="size ${x.id === v.id ? 'on' : ''}" data-act="pdp-variant" data-v="${x.id}" aria-pressed="${x.id === v.id}">${esc(variantLabel(x))}</button>`).join('')}</div></div>`;
      o += `<div class="buy"><div class="qty"><button data-act="pdp-qty" data-d="-1" aria-label="Fewer">&minus;</button><span>${sel.qty}</span><button data-act="pdp-qty" data-d="1" aria-label="More">+</button></div><button class="btn btn-primary btn-lg" data-act="pdp-add">Add to bag</button></div>`;
      $('#pdp-opts', root).innerHTML = o;
      const vt = $('#pdp-vtable', root);
      if (vt) vt.innerHTML = p.variants.map(x => `<tr class="${x.id === v.id ? 'on' : ''}"><td>${esc(variantLabel(x))}</td><td class="sku">${esc(x.sku || '—')}</td><td>${fmt(x.price)}</td></tr>`).join('');
    };
    actions['pdp-variant'] = el => { sel.v = p.variants.find(x => x.id === Number(el.dataset.v)); sel.qty = 1; paint(); };
    actions['pdp-qty'] = el => { sel.qty = Math.max(1, sel.qty + Number(el.dataset.d)); paint(); };
    actions['pdp-add'] = () => {
      if (sel.v) cart.add('variant', `${p.id}:${sel.v.id}`, sel.qty); else cart.add('product', String(p.id), sel.qty);
      toast('Added to your bag', { link: '#/cart', linkText: 'View bag' });
    };
    paint();
  };
  return { html, mount };
}]);

// CART
function summaryHTML(t, extra = '', lines = '') {
  return `<div class="summary"><h3>Order summary</h3>${lines}
    <div class="sum-row"><span>Subtotal</span><span>${fmt(t.subtotal)}</span></div>
    ${t.saleSavings > 0 ? `<div class="sum-row disc"><span>Sale savings (included)</span><span>${fmt(t.saleSavings)}</span></div>` : ''}
    ${t.discount > 0 ? `<div class="sum-row disc"><span>Code ${esc(t.code)}</span><span>&minus;${fmt(t.discount)}</span></div>` : ''}
    <div class="sum-row total"><span>Total</span><span>${fmt(t.total)}</span></div>${extra}</div>`;
}
async function totals(lines) {
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const saleSavings = lines.filter(l => l.type !== 'bundle' && l.was).reduce((s, l) => s + (l.was - l.price) * l.qty, 0);
  let discount = 0, code = '', error = '';
  if (couponCode) {
    const r = await api('/api/coupons/validate', { method: 'POST', body: { code: couponCode, subtotal } });
    if (r.valid) { discount = r.discount; code = r.code; } else { error = r.reason || 'That code is not valid.'; couponCode = ''; }
  }
  return { subtotal, saleSavings, discount, code, error, total: Math.max(0, subtotal - discount) };
}
const emptyBag = `<div class="container"><div class="empty" style="padding:120px 0"><h3>Your bag is empty</h3><p>Find something you like and it will show up here.</p><p style="margin-top:20px"><a class="btn btn-primary" href="#/shop">Start shopping</a></p></div></div>`;

routes.push([/^\/cart$/, async () => {
  const lines = cart.lines();
  if (!lines.length) return emptyBag;
  const t = await totals(lines);
  const extra = `<form class="coupon" data-form="coupon"><input class="input" name="code" placeholder="Discount code" value="${esc(t.code)}" aria-label="Discount code"><button class="btn btn-outline btn-sm" type="submit">Apply</button></form>
    ${t.error ? `<div class="small" style="color:var(--danger);margin-bottom:8px">${esc(t.error)}</div>` : ''}
    <a class="btn btn-primary btn-lg btn-block" href="#/checkout" style="margin-top:14px">Checkout</a>`;
  return `<div class="container"><div class="page-head"><h1>Your bag</h1></div><div class="two"><div>
    ${lines.map(l => `<div class="line"><a class="line-img" href="${l.href}">${imgOrIcon(l.image)}</a>
      <div><h3><a href="${l.href}">${esc(l.name)}</a></h3><div class="meta">${esc(l.label)}</div>
        <div class="qty"><button data-act="cart-qty" data-type="${l.type}" data-key="${esc(l.key)}" data-d="-1" aria-label="Fewer">&minus;</button><span>${l.qty}</span><button data-act="cart-qty" data-type="${l.type}" data-key="${esc(l.key)}" data-d="1" aria-label="More">+</button></div>
        <div style="margin-top:8px"><button class="link small" data-act="cart-remove" data-type="${l.type}" data-key="${esc(l.key)}">Remove</button></div></div>
      <div class="tot">${fmt(l.price * l.qty)}</div></div>`).join('')}
    </div>${summaryHTML(t, extra)}</div></div>`;
}]);

// CHECKOUT
const PROVINCES = ['Punjab', 'Sindh', 'Khyber Pakhtunkhwa', 'Balochistan', 'Islamabad Capital Territory', 'Azad Kashmir', 'Gilgit-Baltistan'];
routes.push([/^\/checkout$/, async () => {
  const lines = cart.lines();
  if (!lines.length) return go('/cart');
  if (!S.user) return `<div class="container"><div class="auth" style="text-align:center"><h1>Sign in to check out</h1>
    <p class="sub">An account lets you track every order, see its status and reorder in seconds. Your bag is saved.</p>
    <div class="box form"><a class="btn btn-primary btn-lg btn-block" href="#/login?next=/checkout">Sign in</a>
    ${SITE().customers.allowSignup ? '<a class="btn btn-outline btn-lg btn-block" href="#/register?next=/checkout">Create an account</a>' : ''}</div></div></div>`;
  const t = await totals(lines);
  const u = S.user;
  const itemRows = `<div style="margin:0 0 16px">${lines.map(l => `<div class="sum-row"><span>${esc(l.name)}${l.type === 'variant' ? ` <span class="muted">(${esc(l.label)})</span>` : ''} <span class="muted">&times; ${l.qty}</span></span><span>${fmt(l.price * l.qty)}</span></div>`).join('')}</div>`;
  return `<div class="container"><div class="page-head"><h1>Checkout</h1><p>Signed in as ${esc(u.email)}. You can track this order under My orders.</p></div>
  <form class="two" data-form="checkout"><div>
    <div class="box"><h3>Contact and delivery</h3><div class="form">
      <div class="row"><div class="field"><label for="c-name">Full name</label><input class="input" id="c-name" name="name" value="${esc(u.name || '')}" required autocomplete="name"></div>
      <div class="field"><label for="c-phone">Phone</label><input class="input" id="c-phone" name="phone" value="${esc(u.phone)}" required autocomplete="tel" placeholder="03xx xxxxxxx"></div></div>
      <div class="field"><label for="c-email">Email</label><input class="input" id="c-email" type="email" name="email" value="${esc(u.email)}" readonly></div>
      <div class="field"><label for="c-addr">Delivery address</label><input class="input" id="c-addr" name="address" value="${esc(u.address)}" required autocomplete="street-address" placeholder="House, street, area"></div>
      <div class="row"><div class="field"><label for="c-city">City</label><input class="input" id="c-city" name="city" value="${esc(u.city)}" required autocomplete="address-level2"></div>
      <div class="field"><label for="c-prov">Province</label><select id="c-prov" name="province"><option value="">Select</option>${PROVINCES.map(x => `<option ${x === u.province ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
      <div class="field"><label for="c-notes">Order notes (optional)</label><textarea class="input" id="c-notes" name="notes" rows="2" placeholder="Landmark, preferred delivery time..."></textarea></div>
    </div></div>
    <div class="box"><h3>Payment</h3>
      ${SITE().customers.cashOnDelivery ? `<label class="pay-opt on"><input type="radio" name="paymentMethod" value="cod" checked data-change="pay-pick"><div><b>Cash on delivery</b><span>Pay in cash when your order arrives.</span></div></label>` : ''}
      ${S.settings.cardPayments ? `<label class="pay-opt ${SITE().customers.cashOnDelivery ? '' : 'on'}"><input type="radio" name="paymentMethod" value="card" ${SITE().customers.cashOnDelivery ? '' : 'checked'} data-change="pay-pick"><div><b>Pay online</b><span>Card, JazzCash or Easypaisa, on Rapid Gateway's secure page. Use your Pakistani mobile number above.</span></div></label>` : ''}
      ${!SITE().customers.cashOnDelivery && !S.settings.cardPayments ? '<div class="note err">No payment option is available right now. Please try again later.</div>' : ''}
    </div>
  </div>
  <div>${summaryHTML(t, `<div id="co-err"></div><button class="btn btn-primary btn-lg btn-block" type="submit" style="margin-top:16px">Place order</button>${t.code ? `<p class="small muted" style="margin-top:12px;text-align:center">Code ${esc(t.code)} applied.</p>` : ''}`, itemRows)}</div></form></div>`;
}]);

// ORDER CONFIRMATION (live status from the server; guests use the token saved at checkout)
function paymentNote(o) {
  if (o.paymentMethod === 'cod') return `<div class="note">Please keep <b>${fmt(o.total)}</b> ready for the courier.</div>`;
  if (o.paymentStatus === 'paid') return `<div class="note ok">Payment of <b>${fmt(o.total)}</b> received by card. Thank you!</div>`;
  if (o.paymentStatus === 'failed') return `<div class="note err">This payment did not go through. You can place the order again, or choose cash on delivery.</div>`;
  return `<div class="note">We are waiting for Rapid Gateway to confirm your payment of <b>${fmt(o.total)}</b>. The status here updates once it's confirmed.</div>`;
}
routes.push([/^\/order\/([\w-]+)$/, async m => {
  let o;
  try { o = (await api(`/api/order-status/${encodeURIComponent(m[1])}?t=${encodeURIComponent(orderTokens.get(m[1]))}`)).order; }
  catch (e) {
    if (e.status !== 404) throw e;
    return `<div class="container"><div class="empty" style="padding:120px 0"><h3>Order ${esc(m[1])}</h3><p>Sign in to see your orders.</p><p style="margin-top:20px"><a class="btn btn-primary" href="#/login?next=/account">Sign in</a></p></div></div>`;
  }
  const heading = o.paymentMethod === 'card' && o.paymentStatus !== 'paid' ? 'Almost done' : `Thank you, ${esc(o.customerName.split(' ')[0])}`;
  return `<div class="container" style="max-width:820px"><div class="page-head"><h1>${heading}</h1><p>Order <b>${esc(o.orderNumber)}</b> &middot; placed ${fdate(o.createdAt)}. You can follow it any time under My orders or Track your order.</p></div>
    <div style="display:flex;gap:8px;margin-bottom:22px;flex-wrap:wrap"><span class="status">${esc(o.status)}</span><span class="status ${o.paymentStatus === 'failed' ? 'bad' : ''}">${PAY_LABEL[o.paymentStatus] || ''}</span></div>
    ${paymentNote(o)}
    ${o.trackingId ? `<a class="courier-link" href="https://postex.pk/tracking?cn=${encodeURIComponent(o.trackingId)}" target="_blank" rel="noopener noreferrer">Track your order with Call Courier / PostEx &rarr;</a>` : ''}
    <div class="box"><h3>Items</h3>${o.items.map(i => `<div class="sum-row"><span>${esc(i.name)} <span class="muted">&times; ${i.qty}</span></span><span>${fmt(i.price * i.qty)}</span></div>`).join('')}
      <div class="sum-row" style="margin-top:10px;border-top:1px solid var(--line);padding-top:14px"><span>Subtotal</span><span>${fmt(o.subtotal)}</span></div>
      ${o.discount ? `<div class="sum-row disc"><span>Code ${esc(o.couponCode)}</span><span>&minus;${fmt(o.discount)}</span></div>` : ''}
      <div class="sum-row total"><span>Total</span><span>${fmt(o.total)}</span></div></div>
    <div class="box"><h3>Delivering to</h3><p>${esc(o.shipping.name)}<br>${esc(o.shipping.address)}<br>${esc(o.shipping.city)}${o.shipping.province ? ', ' + esc(o.shipping.province) : ''}<br>${esc(o.shipping.phone)}</p></div>
    <p style="margin-top:26px"><a class="btn btn-outline" href="#/shop">Continue shopping</a></p></div>`;
}]);

// TRACK AN ORDER (order number + account email)
const STEPS = ['Order placed', 'Confirmed', 'Dispatched', 'Delivered'];
function trackStep(o) {
  if (o.status === 'Delivered') return 3;
  if (o.dispatchedAt || o.status === 'Dispatched' || o.status === 'Shipped') return 2;
  if (o.status === 'Confirmed' || o.paymentStatus === 'paid') return 1;
  return 0;
}
function trackResultHTML(o) {
  const cancelled = o.status === 'Cancelled';
  const step = trackStep(o);
  return `<div class="box track-result"><div class="order-top"><div><h3 style="margin:0">Order ${esc(o.orderNumber)}</h3><div class="muted small">Placed ${fdate(o.createdAt)}</div></div>
      <div><span class="status ${cancelled ? 'bad' : ''}">${esc(o.status)}</span> <span class="status ${o.paymentStatus === 'failed' ? 'bad' : ''}">${PAY_LABEL[o.paymentStatus] || ''}</span></div></div>
    ${cancelled ? '<div class="note err" style="margin-top:18px">This order was cancelled.</div>' : `<ol class="steps">${STEPS.map((l, i) => `<li class="${i <= step ? 'done' : ''} ${i === step ? 'now' : ''}"><span class="dot"></span><span>${l}</span></li>`).join('')}</ol>`}
    ${o.trackingId ? `<a class="courier-link" href="https://postex.pk/tracking?cn=${encodeURIComponent(o.trackingId)}" target="_blank" rel="noopener noreferrer">Track your order with Call Courier / PostEx &rarr;</a>` : ''}
    ${o.dispatchedAt ? `<p class="muted">Dispatched ${fdate(o.dispatchedAt)}${o.courier ? ` with <b>${esc(o.courier)}</b>` : ''}${o.trackingNumber ? `, tracking number <b>${esc(o.trackingNumber)}</b>` : ''}.</p>` : ''}
    <div style="margin-top:16px">${o.items.map(i => `<div class="sum-row"><span>${esc(i.name)} <span class="muted">&times; ${i.qty}</span></span><span>${fmt(i.price * i.qty)}</span></div>`).join('')}
    <div class="sum-row total"><span>Total</span><span>${fmt(o.total)}</span></div></div>
    <p class="small muted" style="margin-top:14px">Delivering to ${esc(o.shipping.city)}${o.shipping.province ? ', ' + esc(o.shipping.province) : ''}.</p></div>`;
}
routes.push([/^\/track$/, (m, q) => !SITE().customers.allowOrderTracking ? notAvailable('Order tracking is not available right now') : `<div class="container" style="max-width:720px"><div class="page-head"><h1>Track your order</h1><p>Enter the order number from your confirmation (it looks like AUT-1001) and the email on your account.</p></div>
  <form class="box form" data-form="track">
    <div class="row"><div class="field"><label for="t-num">Order number</label><input class="input" id="t-num" name="orderNumber" value="${esc(q.get('n') || '')}" placeholder="AUT-1001" required autocapitalize="characters"></div>
    <div class="field"><label for="t-email">Email</label><input class="input" id="t-email" type="email" name="email" value="${esc(S.user ? S.user.email : '')}" required autocomplete="email"></div></div>
    <div id="track-err"></div><button class="btn btn-primary btn-lg" type="submit">Track order</button></form>
  <div id="track-out" style="margin-top:20px"></div></div>`]);

// ABOUT
const notAvailable = title => `<div class="container"><div class="empty" style="padding:120px 0"><h3>${esc(title)}</h3><p style="margin-top:20px"><a class="btn btn-primary" href="#/">Back to the shop</a></p></div></div>`;
routes.push([/^\/about$/, () => {
  const { content: c, sections, customers } = SITE();
  if (!sections.aboutPage) return notAvailable('This page is not available');
  const html = `<div class="container">
    <section class="about-hero" aria-label="autique. stands for auto-boutique">
      <div class="about-logo split-logo" id="about-logo" aria-hidden="true"><span>aut</span><span class="al-grow al-mid"><span>o-bout</span></span><span>ique</span><span class="al-grow al-dot"><span>.</span></span></div>
      <p class="about-caption"><span>auto</span> + <span>boutique</span></p>
      <button class="about-replay" data-act="about-replay">Play again</button>
    </section>
    <section class="about-story">
      <h1>${esc(c.aboutTitle)}</h1>
      ${paragraphs(c.aboutStory)}
      ${c.aboutPoints.length ? `<ul class="facts">${c.aboutPoints.map(pt => `<li>${ICON.check}<span>${pt.title ? `<b>${esc(pt.title)}</b> ` : ''}${esc(pt.text)}</span></li>`).join('')}</ul>` : ''}
      <p style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap"><a class="btn btn-primary btn-lg" href="#/shop">Shop the collection</a>${customers.allowOrderTracking ? '<a class="btn btn-outline btn-lg" href="#/track">Track an order</a>' : ''}</p>
    </section></div>`;
  const mount = () => { setTimeout(() => { const l = $('#about-logo'); if (l) l.classList.add('is-split'); }, 700); };
  return { html, mount };
}]);

// AUTH + ACCOUNT
// Google's sign-in script, loaded only when an auth page is shown
let googleScript = null;
function loadGoogleScript() {
  if (!googleScript) googleScript = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => { googleScript = null; reject(new Error('Could not load Google sign-in.')); };
    document.head.appendChild(s);
  });
  return googleScript;
}
async function mountGoogleButton(root, reg, next) {
  const box = $('#google-btn', root);
  if (!box || !S.settings.googleClientId) return;
  try { await loadGoogleScript(); }
  catch (e) { box.innerHTML = `<p class="small muted">${esc(e.message)}</p>`; return; }
  if (!document.body.contains(box)) return; // the customer already moved on
  google.accounts.id.initialize({
    client_id: S.settings.googleClientId,
    ux_mode: 'popup',
    callback: async ({ credential }) => {
      try {
        const { user, created } = await api('/api/auth/google', { method: 'POST', body: { credential } });
        S.user = user; renderChrome();
        toast(created ? 'Account created. Welcome!' : 'Welcome back, ' + user.name.split(' ')[0]);
        go(next || '/account');
      } catch (e) { $('#auth-err').innerHTML = `<div class="note err">${esc(e.message)}</div>`; }
    }
  });
  google.accounts.id.renderButton(box, { theme: 'outline', size: 'large', shape: 'pill', text: reg ? 'signup_with' : 'continue_with', width: Math.min(box.clientWidth || 360, 400) });
}

const authPage = (mode, next) => {
  const reg = mode === 'register';
  const html = `<div class="container"><div class="auth"><h1>${reg ? 'Create your account' : 'Welcome back'}</h1><p class="sub">${reg ? 'Track orders and check out faster.' : 'Sign in to see your orders.'}</p>
    <form class="box form" data-form="${reg ? 'register' : 'login'}" data-next="${esc(next)}">
      <div id="auth-err"></div>
      ${S.settings.googleClientId ? `<div class="google-auth"><div id="google-btn"></div></div><div class="or-sep"><span>or ${reg ? 'sign up' : 'sign in'} with email</span></div>` : ''}
      ${reg ? '<div class="field"><label for="a-name">Full name</label><input class="input" id="a-name" name="name" required autocomplete="name"></div>' : ''}
      <div class="field"><label for="a-email">Email</label><input class="input" id="a-email" type="email" name="email" required autocomplete="email"></div>
      <div class="field"><label for="a-pass">Password</label><input class="input" id="a-pass" type="password" name="password" required minlength="${reg ? 6 : 1}" autocomplete="${reg ? 'new-password' : 'current-password'}">${reg ? '<div class="hint">At least 6 characters.</div>' : ''}</div>
      <button class="btn btn-primary btn-lg btn-block" type="submit">${reg ? 'Create account' : 'Sign in'}</button>
      <p class="small muted" style="text-align:center">${reg ? `Already have an account? <a class="link" href="#/login?next=${esc(next)}">Sign in</a>` : (SITE().customers.allowSignup ? `New here? <a class="link" href="#/register?next=${esc(next)}">Create an account</a>` : '')}</p></form></div></div>`;
  return { html, mount: root => { mountGoogleButton(root, reg, next); } };
};
routes.push([/^\/login$/, (m, q) => S.user ? go(q.get('next') || '/account') : authPage('login', q.get('next') || '/account')]);
routes.push([/^\/register$/, (m, q) => S.user ? go(q.get('next') || '/account')
  : !SITE().customers.allowSignup ? `<div class="container"><div class="auth" style="text-align:center"><h1>Sign-ups are closed</h1><p class="sub">We're not taking new accounts right now. Already have one?</p><a class="btn btn-primary btn-lg" href="#/login?next=${esc(q.get('next') || '/account')}">Sign in</a></div></div>`
  : authPage('register', q.get('next') || '/account')]);

function accountTabs(tab) {
  const t = (key, label) => `<a class="pill ${tab === key ? 'on' : ''}" href="#/account${key === 'orders' ? '' : '?tab=' + key}">${label}</a>`;
  return `<div class="tabs">${t('orders', 'Orders')}${t('profile', 'Profile')}${t('password', 'Password')}<button class="pill" data-act="logout">Sign out</button></div>`;
}
function profileHTML(u) {
  const googleOnly = !u.hasPassword;
  const emailLocked = googleOnly || !SITE().customers.allowEmailChange;
  return `<form class="box form account-form" data-form="profile">
    <div id="account-msg"></div>
    <h3>Your details</h3>
    <div class="row"><div class="field"><label for="p-name">Full name</label><input class="input" id="p-name" name="name" value="${esc(u.name)}" required maxlength="80" autocomplete="name"></div>
    <div class="field"><label for="p-phone">Phone</label><input class="input" id="p-phone" name="phone" value="${esc(u.phone)}" autocomplete="tel" placeholder="03xx xxxxxxx"></div></div>
    <div class="field"><label for="p-email">Email</label><input class="input" id="p-email" type="email" name="email" value="${esc(u.email)}" required autocomplete="email" ${emailLocked ? 'readonly' : ''}>
      <div class="hint">${!SITE().customers.allowEmailChange ? 'To change your email, please contact us.' : googleOnly ? 'Your email comes from your Google account. Set a password to be able to change it.' : 'Orders you already placed stay linked to the email they were placed with, for tracking.'}</div></div>
    ${emailLocked ? '' : `<div class="field" id="p-current-wrap" hidden><label for="p-current">Current password</label><input class="input" id="p-current" type="password" name="currentPassword" autocomplete="current-password"><div class="hint">Needed to change your email.</div></div>`}
    <h3 style="margin-top:8px">Saved delivery address</h3>
    <p class="hint" style="margin-top:-10px">Filled in for you at checkout.</p>
    <div class="field"><label for="p-addr">Address</label><input class="input" id="p-addr" name="address" value="${esc(u.address)}" maxlength="200" autocomplete="street-address" placeholder="House, street, area"></div>
    <div class="row"><div class="field"><label for="p-city">City</label><input class="input" id="p-city" name="city" value="${esc(u.city)}" maxlength="60" autocomplete="address-level2"></div>
    <div class="field"><label for="p-prov">Province</label><select id="p-prov" name="province"><option value="">Select</option>${PROVINCES.map(x => `<option ${x === u.province ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
    <div><button class="btn btn-primary" type="submit">Save changes</button></div>
  </form>`;
}
function passwordHTML(u) {
  return `<form class="box form account-form" data-form="password">
    <div id="account-msg"></div>
    <h3>${u.hasPassword ? 'Change password' : 'Set a password'}</h3>
    ${u.hasPassword
      ? `<div class="field"><label for="w-cur">Current password</label><input class="input" id="w-cur" type="password" name="currentPassword" required autocomplete="current-password"></div>`
      : '<p class="muted">You sign in with Google. Set a password to also be able to sign in with your email.</p>'}
    <div class="field"><label for="w-new">New password</label><input class="input" id="w-new" type="password" name="newPassword" required minlength="6" autocomplete="new-password"><div class="hint">At least 6 characters.</div></div>
    <div class="field"><label for="w-new2">Confirm new password</label><input class="input" id="w-new2" type="password" name="confirmPassword" required minlength="6" autocomplete="new-password"></div>
    <div><button class="btn btn-primary" type="submit">${u.hasPassword ? 'Change password' : 'Set password'}</button></div>
  </form>`;
}

routes.push([/^\/account$/, async (m, q) => {
  if (!S.user) return go('/login?next=/account');
  const tab = ['profile', 'password'].includes(q.get('tab')) ? q.get('tab') : 'orders';
  const head = `<div class="container"><div class="page-head"><h1>Hi, ${esc(S.user.name.split(' ')[0])}</h1><p>Your orders and account settings.</p></div>${accountTabs(tab)}`;
  if (tab === 'profile') return `${head}${profileHTML(S.user)}</div>`;
  if (tab === 'password') return `${head}${passwordHTML(S.user)}</div>`;
  const { orders } = await api('/api/my-orders');
  const body = orders.length ? orders.map(o => `<div class="order-card"><div class="order-top"><div><b>${esc(o.orderNumber)}</b> <span class="muted small">&middot; ${fdate(o.createdAt)}</span></div><span class="status ${o.status === 'Cancelled' ? 'bad' : ''}">${esc(o.status)}</span></div>
      <div class="order-lines">${o.items.map(i => `${i.qty}&times; ${esc(i.name)}`).join('<br>')}</div>
      ${o.trackingId ? `<a class="courier-link" href="https://postex.pk/tracking?cn=${encodeURIComponent(o.trackingId)}" target="_blank" rel="noopener noreferrer">Track your order with Call Courier / PostEx &rarr;</a>` : ''}
      ${SITE().customers.allowOrderTracking ? `<a class="link small" style="display:inline-block;margin-top:10px" href="#/track?n=${esc(o.orderNumber)}">Track this order</a>` : ''}
      ${o.trackingNumber ? `<div class="small muted" style="margin-top:8px">${esc(o.courier)} tracking: ${esc(o.trackingNumber)}</div>` : ''}
      <div style="margin-top:12px;font-weight:700">${fmt(o.total)} <span class="muted small" style="font-weight:400">&middot; ${o.paymentMethod === 'cod' ? 'Cash on delivery' : 'Card: ' + (PAY_LABEL[o.paymentStatus] || '')}</span></div>
      </div>`).join('')
    : '<div class="empty"><h3>No orders yet</h3><p>When you place an order it will appear here.</p><p style="margin-top:18px"><a class="btn btn-primary" href="#/shop">Start shopping</a></p></div>';
  return `${head}${body}</div>`;
}]);

// ---------- actions, forms, changes ----------
const actions = {
  menu: () => openMenu(!$('#drawer').classList.contains('open')),
  'menu-close': () => openMenu(false),
  search: () => { const b = $('#searchbar'); b.classList.toggle('open'); if (b.classList.contains('open')) $('#search-input').focus(); },
  'add-bundle': el => { cart.add('bundle', el.dataset.id, 1); toast('Bundle added to your bag', { link: '#/cart', linkText: 'View bag' }); },
  'cart-qty': async el => {
    const b = cart.bag(el.dataset.type), q = (b[el.dataset.key] || 0) + Number(el.dataset.d);
    if (q < 1) return;
    cart.set(el.dataset.type, el.dataset.key, q); await route();
  },
  'dismiss-pay-banner': el => {
    returnedOrder = null;
    el.closest('.pay-banner').remove();
    history.replaceState(null, '', location.pathname + location.hash);
  },
  'about-replay': () => { const l = $('#about-logo'); l.classList.remove('is-split'); setTimeout(() => l.classList.add('is-split'), 900); },
  'cart-remove': async el => { cart.remove(el.dataset.type, el.dataset.key); await route(); },
  logout: async () => { await api('/api/logout', { method: 'POST' }); S.user = null; openMenu(false); toast('Signed out'); go('/'); renderChrome(); }
};
const forms = {
  search: form => { const q = $('input', form).value.trim(); $('#searchbar').classList.remove('open'); if (q) go('/shop?q=' + encodeURIComponent(q)); },
  coupon: async form => { couponCode = new FormData(form).get('code').trim(); await route(); },
  profile: async form => {
    const btn = $('button[type=submit]', form), msg = $('#account-msg', form);
    btn.disabled = true; msg.innerHTML = '';
    try {
      const { user } = await api('/api/account/profile', { method: 'PUT', body: Object.fromEntries(new FormData(form)) });
      S.user = user; renderChrome();
      msg.innerHTML = '<div class="note ok">Your details are saved.</div>';
      const cur = $('#p-current', form); if (cur) { cur.value = ''; $('#p-current-wrap', form).hidden = true; }
    } catch (e) { msg.innerHTML = `<div class="note err">${esc(e.message)}</div>`; }
    btn.disabled = false;
  },
  password: async form => {
    const btn = $('button[type=submit]', form), msg = $('#account-msg', form);
    const f = Object.fromEntries(new FormData(form));
    msg.innerHTML = '';
    if (f.newPassword !== f.confirmPassword) { msg.innerHTML = '<div class="note err">The new passwords don\'t match.</div>'; return; }
    btn.disabled = true;
    try {
      const had = S.user.hasPassword;
      const { user } = await api('/api/account/password', { method: 'PUT', body: { currentPassword: f.currentPassword, newPassword: f.newPassword } });
      S.user = user;
      if (had) { form.reset(); msg.innerHTML = '<div class="note ok">Your password has been changed.</div>'; }
      else { toast('Password set. You can now also sign in with your email.'); await route(); return; }
    } catch (e) { msg.innerHTML = `<div class="note err">${esc(e.message)}</div>`; }
    btn.disabled = false;
  },
  track: async form => {
    const btn = $('button[type=submit]', form); btn.disabled = true;
    $('#track-err').innerHTML = ''; $('#track-out').innerHTML = '';
    try {
      const { order } = await api('/api/track', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
      $('#track-out').innerHTML = trackResultHTML(order);
    } catch (e) { $('#track-err').innerHTML = `<div class="note err">${esc(e.message)}</div>`; }
    btn.disabled = false;
  },
  checkout: async form => {
    const btn = $('button[type=submit]', form), err = $('#co-err');
    err.innerHTML = ''; btn.disabled = true; btn.textContent = 'Placing order...';
    const f = Object.fromEntries(new FormData(form));
    try {
      const { order, checkoutUrl } = await api('/api/orders', { method: 'POST', body: {
        ...cart.payload(), couponCode, paymentMethod: f.paymentMethod,
        shipping: { name: f.name, phone: f.phone, email: f.email, address: f.address, city: f.city, province: f.province, notes: f.notes }
      } });
      if (checkoutUrl) {
        cart.clear(); couponCode = '';
        btn.textContent = 'Opening secure payment...';
        window.location.href = checkoutUrl;
        return;
      }
      orderTokens.set(order.orderNumber, order.accessToken);
      cart.clear(); couponCode = '';
      go('/order/' + order.orderNumber);
    } catch (e) {
      err.innerHTML = `<div class="note err">${esc(e.message)}</div>`;
      btn.disabled = false; btn.textContent = 'Place order';
    }
  }
};
const authSubmit = kind => async form => {
  const btn = $('button[type=submit]', form); btn.disabled = true;
  try {
    const { user } = await api(kind === 'login' ? '/api/login' : '/api/signup', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
    S.user = user; renderChrome();
    toast(kind === 'login' ? 'Welcome back, ' + user.name.split(' ')[0] : 'Account created. Welcome!');
    go(form.dataset.next || '/account');
  } catch (e) { $('#auth-err', form).innerHTML = `<div class="note err">${esc(e.message)}</div>`; btn.disabled = false; }
};
forms.login = authSubmit('login'); forms.register = authSubmit('register');
const changes = {
  sort: el => {
    const box = el.closest('.filters'), p = new URLSearchParams();
    if (el.value) p.set('sort', el.value);
    if (box.dataset.q) p.set('q', box.dataset.q);
    if (box.dataset.sale) p.set('sale', box.dataset.sale);
    const s = p.toString();
    go(box.dataset.base + (s ? '?' + s : ''));
  },
  'pay-pick': () => $$('.pay-opt').forEach(o => o.classList.toggle('on', $('input', o).checked))
};
document.addEventListener('input', ev => {
  if (ev.target.id !== 'p-email' || !S.user) return;
  const wrap = $('#p-current-wrap');
  if (wrap) wrap.hidden = ev.target.value.trim().toLowerCase() === S.user.email;
});

// ---------- animated wordmark: open (auto-boutique) at the top, closed (autique.) once scrolling ----------
let logosReady = false;
function syncScrollLogos() {
  if (!logosReady) return;
  const open = window.scrollY < 24;
  $$('.scroll-logo').forEach(l => l.classList.toggle('is-split', open));
}
window.addEventListener('scroll', syncScrollLogos, { passive: true });

// ---------- router ----------
let routeId = 0;
async function route() {
  const id = ++routeId;
  const h = location.hash.slice(1) || '/';
  const qi = h.indexOf('?'), path = qi < 0 ? h : h.slice(0, qi), q = new URLSearchParams(qi < 0 ? '' : h.slice(qi + 1));
  openMenu(false);
  document.title = 'Autique — Car Care';
  const setApp = html => { $('#app').innerHTML = html; };
  for (const [re, fn] of routes) {
    const m = re.exec(path);
    if (!m) continue;
    try {
      const out = await fn(m, q);
      if (id !== routeId || out === undefined) return;
      if (typeof out === 'string') setApp(out); else { setApp(out.html); out.mount($('#app')); }
    } catch (e) {
      if (id !== routeId) return;
      if (e.status === 401) return go('/login?next=' + encodeURIComponent(path));
      setApp(`<div class="container"><div class="empty" style="padding:120px 0"><h3>${e.status === 404 ? 'We could not find that' : 'Something went wrong'}</h3><p>${esc(e.message)}</p><p style="margin-top:20px"><a class="btn btn-primary" href="#/">Back to the shop</a></p></div></div>`);
    }
    renderChrome();
    if (!routeKeepsScroll) window.scrollTo(0, 0);
    routeKeepsScroll = false;
    setTimeout(syncScrollLogos, 60); // newly rendered wordmarks animate open
    return;
  }
  setApp('<div class="container"><div class="empty" style="padding:120px 0"><h3>Page not found</h3><p style="margin-top:20px"><a class="btn btn-primary" href="#/">Back to the shop</a></p></div></div>');
  renderChrome();
}
let routeKeepsScroll = false;

// ---------- global event delegation ----------
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  if (['cart-qty', 'cart-remove'].includes(el.dataset.act)) routeKeepsScroll = true;
  Promise.resolve(fn(el, ev)).catch(e => toast(e.message, { err: true }));
});
document.addEventListener('change', ev => {
  const el = ev.target.closest('[data-change]');
  if (el && changes[el.dataset.change]) Promise.resolve(changes[el.dataset.change](el, ev)).catch(e => toast(e.message, { err: true }));
});
document.addEventListener('submit', ev => {
  const form = ev.target.closest('[data-form]');
  if (!form || !forms[form.dataset.form]) return;
  ev.preventDefault();
  if (form.dataset.form === 'coupon') routeKeepsScroll = true;
  Promise.resolve(forms[form.dataset.form](form, ev)).catch(e => toast(e.message, { err: true }));
});
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { openMenu(false); $('#searchbar').classList.remove('open'); } });
window.addEventListener('hashchange', route);

(async function boot() {
  try { await loadCatalog(); }
  catch (e) { $('#app').innerHTML = `<div class="container"><div class="empty" style="padding:120px 0"><h3>Something went wrong</h3><p>${esc(e.message)}</p></div></div>`; return; }
  cart.save();
  const back = new URLSearchParams(location.search).get('order');
  if (back && /^AUT-\d+$/i.test(back)) returnedOrder = back.toUpperCase();
  await route();
  // open the wordmark shortly after the site loads, so the split is seen
  setTimeout(() => { logosReady = true; syncScrollLogos(); }, 500);
})();
})();
