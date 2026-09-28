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
// Navigation uses real paths (History API). A redirect made while a page is
// rendering replaces the history entry, so Back doesn't bounce into it again.
let rendering = false;
const go = h => {
  if (h !== location.pathname + location.search) history[rendering ? 'replaceState' : 'pushState'](null, '', h);
  route();
};
const slug = t => String(t || '').toLowerCase().normalize('NFKD').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const productPath = p => `/product/${p.id}-${slug(p.name)}`;
// Old links used #/ routes (emails, bookmarks, the app's start page): map them to real paths
function legacyPath(h) {
  const qi = h.indexOf('?'), path = qi < 0 ? h : h.slice(0, qi), query = qi < 0 ? '' : h.slice(qi);
  const m = /^\/shop\/([\w-]+)$/.exec(path);
  return (m ? '/category/' + m[1] : path || '/') + query;
}

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
// Set when Rapid Gateway sends the customer back to /?order=<orderNumber>[&failed=1].
// The redirect alone doesn't prove payment: the banner only says "confirmed"
// once the server's order status is Confirmed (set by the webhook).
let returnedOrder = null;
let returnedFailed = false;
let payState = 'received';   // 'received' | 'confirmed' | 'failed'
let payPoll = null;
function payBannerHTML() {
  if (!returnedOrder) return '';
  const n = esc(returnedOrder);
  const track = SITE().customers.allowOrderTracking ? ` or <a class="link" href="/track?n=${n}">Track your order</a>` : '';
  const msg = payState === 'confirmed'
    ? `Your order <b>${n}</b> is confirmed. See it under <a class="link" href="/account">My orders</a>${track}.`
    : payState === 'failed'
      ? `The payment for order <b>${n}</b> didn't go through, and you haven't been charged. You can <a class="link" href="/cart">try again</a>${SITE().customers.cashOnDelivery ? ', or choose cash on delivery at checkout' : ''}.`
      : `Your order <b>${n}</b> has been received.`;
  return `<div class="pay-banner${payState === 'failed' ? ' is-failed' : ''}" id="pay-banner" role="status" aria-live="polite"><p>${msg}</p><button class="pay-banner-close" data-act="dismiss-pay-banner" aria-label="Dismiss">&times;</button></div>`;
}
function setPayState(state) {
  payState = state;
  const el = $('#pay-banner');
  if (el) el.outerHTML = payBannerHTML();
}
// Ask the server for the order's status now, then every 2 seconds for up to 20 seconds.
function watchReturnedOrder() {
  if (returnedFailed) { setPayState('failed'); return; }
  const started = Date.now();
  const check = async () => {
    payPoll = null;
    if (!returnedOrder) return;
    try {
      const o = (await api(`/api/order-status/${encodeURIComponent(returnedOrder)}?t=${encodeURIComponent(orderTokens.get(returnedOrder))}`)).order;
      if (o.status === 'Confirmed') return setPayState('confirmed');
      if (o.status === 'Payment failed') return setPayState('failed');
    } catch { /* not this customer's order, or offline: stay on "received" */ }
    if (Date.now() - started < 20000) payPoll = setTimeout(check, 2000);
  };
  check();
}

// Site editor settings (content, visible sections, customer rules)
const SITE = () => S.settings.site;
// "## Heading", "### Sub", "- bullet", **bold**, blank line = new paragraph. Everything is escaped first.
function md(text) {
  const inline = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const out = [];
  let list = null;
  const flush = () => { if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; } };
  for (const block of String(text || '').split(/\n\s*\n/)) {
    for (const raw of block.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('- ')) { (list = list || []).push(`<li>${inline(line.slice(2))}</li>`); continue; }
      flush();
      if (line.startsWith('### ')) out.push(`<h3>${inline(line.slice(4))}</h3>`);
      else if (line.startsWith('## ')) out.push(`<h2>${inline(line.slice(3))}</h2>`);
      else out.push(`<p>${inline(line)}</p>`);
    }
    flush();
  }
  return out.join('');
}
const POLICY_PAGES = { refund: 'Refund & Returns Policy', shipping: 'Shipping Policy', privacy: 'Privacy Policy', terms: 'Terms & Conditions' };
const telHref = n => 'tel:' + String(n).replace(/[^\d+]/g, '');
function galleryHTML(title, intro) {
  const g = SITE().content.gallery;
  if (!g.length) return '';
  return `<section class="section"><div class="section-head"><div><h2>${esc(title)}</h2>${intro ? `<p>${esc(intro)}</p>` : ''}</div></div>
    <div class="gallery-grid">${g.map(p => `<figure><a href="${esc(p.src)}" target="_blank" rel="noopener"><img src="${esc(p.src)}" alt="${esc(p.caption || 'Autique')}" loading="lazy"></a>${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}</figure>`).join('')}</div></section>`;
}
const paragraphs = text => String(text || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');

const imgOrIcon = (src, alt = '', eager = false) => src ? `<img src="${esc(src)}" alt="${esc(alt)}" width="800" height="800"${eager ? '' : ' loading="lazy"'} decoding="async">` : BOTTLE;
const altOf = name => `${name} – Autique`;
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
      if (p && !p.hasVariants) out.push({ type: 'product', key: id, name: p.name, label: p.categoryTitle, image: p.image, href: productPath(p), price: p.price, was: p.originalPrice, qty });
    });
    Object.entries(this.variants).forEach(([key, qty]) => {
      const [pid, vid] = key.split(':').map(Number);
      const p = S.products.find(x => x.id === pid);
      const v = p && (p.variants || []).find(x => x.id === vid);
      if (v) out.push({ type: 'variant', key, name: p.name, label: variantLabel(v), image: v.image || p.image, href: `${productPath(p)}?v=${v.id}`, price: v.price, was: v.originalPrice, qty });
    });
    Object.entries(this.bundles).forEach(([id, qty]) => {
      const b = S.bundles.find(x => x.id === Number(id));
      if (b) out.push({ type: 'bundle', key: id, name: b.title, label: 'Bundle: ' + b.items.map(i => i.name).join(', '), image: '', href: '/bundles', price: b.bundlePrice, was: b.individualTotal, qty });
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
  S.types = prod.types || [];
  S.products = prod.categories.flatMap(c => c.products.map(p => ({ ...p, categoryKey: c.key, categoryTitle: c.title })));
  S.bundles = bund.bundles;
  S.settings = settings;
  S.user = me.user;
}

// ---------- chrome: drawer menu + footer ----------
function renderChrome() {
  const cur = location.pathname + location.search;
  const link = (href, label, extra = '') => `<a href="#${href}" class="${cur === href ? 'on' : ''}">${esc(label)}${extra}</a>`;
  $('#drawer-links').innerHTML =
    link('/', 'Home') + link('/shop', 'Shop all')
    + `<div class="label">Shop by need</div>`
    + S.categories.map(c => link('/category/' + c.key, c.title, `<span class="count">${c.products.length}</span>`)).join('')
    + (S.types.length ? `<div class="label">Shop by type</div>` + S.types.map(t => link('/shop?type=' + t.key, t.title, `<span class="count">${S.products.filter(p => p.type === t.key).length}</span>`)).join('') : '')
    + (SITE().sections.bundles && S.bundles.length ? link('/bundles', 'Bundles', `<span class="count">${S.bundles.length}</span>`) : '')
    + (S.settings.saleActive ? link('/shop?sale=1', 'Sale') : '')
    + `<div class="sep"></div>`
    + (SITE().customers.allowOrderTracking ? link('/track', 'Track your order') : '')
    + (SITE().sections.aboutPage ? link('/about', 'About us') : '')
    + link('/how-it-works', 'How Autique works') + link('/contact', 'Contact us')
    + `<div class="label">Policies</div>`
    + Object.entries(POLICY_PAGES).map(([k, t]) => link('/policies/' + k, t)).join('')
    + `<div class="sep"></div>`
    + (S.user ? link('/account', 'My orders') : link('/login', 'Sign in'))
    + link('/cart', 'Shopping bag', `<span class="count">${cart.count()}</span>`)
    + (S.user ? '<button data-act="logout">Sign out</button>' : '')
    + (isStandalone() ? '' : '<div class="sep"></div><button data-act="install-app">Install the autique. app</button>');
  const announcement = S.settings.saleActive && S.settings.saleLabel ? S.settings.saleLabel : SITE().content.announcement;
  $('#announce').textContent = announcement;
  $('#announce').hidden = !announcement;
  $('#acct-btn').setAttribute('href', S.user ? '/account' : '/login');
  cart.badge();
  const biz = SITE().content.business;
  $('#footer').innerHTML = `<div class="container"><div class="foot">
    <div><a class="foot-logo" href="/"><img src="/icons/car-mark.png" alt="" class="foot-car" width="480" height="115" loading="lazy"><img src="/logo.png" alt="Autique" width="142" height="44" loading="lazy"></a><p style="margin-top:14px;max-width:34ch">${esc(SITE().content.footerTagline)}</p>
      <address class="foot-contact">
        ${biz.email ? `<a href="mailto:${esc(biz.email)}"><b>Email:</b> ${esc(biz.email)}</a>` : ''}
        ${biz.phone ? `<a href="${telHref(biz.phone)}"><b>Phone:</b> ${esc(biz.phone)}</a>` : ''}
        ${biz.address ? `<p><b>Address:</b> ${esc(biz.address)}</p>` : ''}
        ${biz.hours ? `<p><b>Hours:</b> ${esc(biz.hours)}</p>` : ''}
      </address></div>
    <div><h4>Shop</h4>${S.categories.slice(0, 6).map(c => `<a href="/category/${esc(c.key)}">${esc(c.title)}</a>`).join('')}<a href="/shop">All products</a></div>
    <div><h4>Customer care</h4><a href="/how-it-works">How Autique works</a>${SITE().customers.allowOrderTracking ? '<a href="/track">Track your order</a>' : ''}<a href="/account">My orders</a><a href="/contact">Contact us</a>${SITE().sections.aboutPage ? '<a href="/about">About us</a>' : ''}${isStandalone() ? '' : '<a href="#" data-act="install-app">Install the app</a>'}${SITE().content.footerHelp.map(h => `<p>${esc(h)}</p>`).join('')}</div>
    <div><h4>Policies</h4>${Object.entries(POLICY_PAGES).map(([k, t]) => `<a href="/policies/${k}">${t}</a>`).join('')}</div>
  </div><div class="foot-bottom">&copy; ${new Date().getFullYear()} ${esc(biz.tradingName || 'Autique')}${biz.address ? ` &middot; ${esc(biz.address)}` : ''}. All rights reserved.</div></div>`;
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
  return `<a class="card" href="${productPath(p)}"><div class="card-img">${pct ? `<span class="pill-badge">${pct}% off</span>` : ''}${imgOrIcon(p.image, altOf(p.name))}</div>
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
// Small line icons for the category list and tiles (by category key; anything else gets the bottle)
const CAT_ICON = {
  cleaning: '<svg viewBox="0 0 24 24"><path d="M7 3h6v4l3 3v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V10l2-3z"/><path d="M13 5h4l1 2"/><circle cx="19" cy="4" r=".6"/><circle cx="21" cy="6.5" r=".6"/></svg>',
  shining: '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/></svg>',
  polishing: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="7"/><circle cx="12" cy="13" r="3"/><path d="M12 6V3M9 3h6"/></svg>',
  protection: ICON.shield,
  engine: '<svg viewBox="0 0 24 24"><path d="M4 10h3l2-3h6v3h3l2 2v5h-2v2h-4l-2-2H9l-2 2H4z"/><path d="M11 4h4"/></svg>'
};
const catIcon = key => CAT_ICON[key] || BOTTLE;
const CHEVRON = '<svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
// A brand's products: the product name starts with the brand name
const brandProducts = b => S.products.filter(p => p.name.toLowerCase().startsWith(String(b).toLowerCase()));
const firstImage = list => (list.find(p => p && p.image) || {}).image || '';
const HOME_TRUST = [
  [ICON.cash, 'Cash on delivery', 'Across Pakistan'],
  [ICON.shield, 'Secure online payment', 'Through Rapid Gateway'],
  ['<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/></svg>', '7-day returns', 'For damaged or defective items'],
  [ICON.truck, 'Tracked delivery', 'Via PostEx (Call Courier)']
];
const rowHTML = list => `<div class="row-scroll">${list.map(cardHTML).join('')}</div>`;

// Hero slides, built from real data; the sale and bundle slides only appear when there is one.
function heroSlides(c, on) {
  const slides = [];
  if (on.logoBanner) slides.push(`<div class="slide slide-logo"><section class="about-hero home-hero" aria-label="autique. stands for auto-boutique">
      <div class="about-logo split-logo scroll-logo" aria-hidden="true"><span>aut</span><span class="al-grow al-mid"><span>o-bout</span></span><span>ique</span><span class="al-grow al-dot"><span>.</span></span></div>
      <p class="about-caption"><span>auto</span> + <span>boutique</span></p>
      <a class="btn btn-light" href="/shop">Shop now</a>
    </section></div>`);
  if (S.settings.saleActive) {
    const pct = Number(S.settings.saleDiscountPercent) || 0;
    slides.push(`<div class="slide slide-sale"><div class="slide-in">
      <div class="eyebrow">${esc(S.settings.saleLabel || 'Sale on now')}</div>
      <h2>${pct ? `${pct}% off` : 'Sale on now'}</h2>
      <p>Sale prices are applied automatically in your bag.</p>
      <a class="btn btn-primary" href="/shop?sale=1">Shop the sale</a></div></div>`);
  }
  if (on.bundles && S.bundles.length) {
    const b = S.bundles[0];
    const save = b.individualTotal - b.bundlePrice;
    slides.push(`<div class="slide slide-bundle"><div class="slide-in">
      <div class="eyebrow">This month's ${S.bundles.length === 1 ? 'bundle' : 'bundles'}</div>
      <h2>${esc(b.title)}</h2>
      <p>${esc(b.items.map(i => i.name).join(' + '))} for ${fmt(b.bundlePrice)}${save > 0 ? `, save ${fmt(save)}` : ''}.</p>
      <a class="btn btn-primary" href="/bundles">${S.bundles.length === 1 ? 'See the bundle' : `See all ${S.bundles.length} bundles`}</a></div></div>`);
  }
  if (c.brands.length) slides.push(`<div class="slide slide-brands"><div class="slide-in">
      <div class="eyebrow">Genuine brands</div>
      <h2>The names detailers trust.</h2>
      <p>${esc(c.brands.join(', '))}, in one place.</p>
      <div class="slide-brand-list">${c.brands.map(b => `<a href="/shop?brand=${encodeURIComponent(b)}">${esc(b)}</a>`).join('')}</div></div></div>`);
  return slides;
}

// 2x2 promo tiles: an on-sale product, a bundle, a category and a brand, topped up with
// more categories and brands. Only real products, bundles, categories and brands.
function promoTiles(c, on, onSale) {
  // prefer a photo not already used by another tile
  const used = new Set();
  const pick = list => { const ps = list.filter(p => p && p.image); const p = ps.find(x => !used.has(x.image)) || ps[0]; if (p) used.add(p.image); return p ? p.image : ''; };
  const tile = (href, img, kicker, label) => ({ href, img, kicker, label });
  const cats = S.categories.filter(cat => cat.products.length);
  const catTile = cat => tile(`/category/${cat.key}`, pick(S.products.filter(p => p.categoryKey === cat.key)), `${cat.products.length} ${cat.products.length === 1 ? 'product' : 'products'}`, cat.title);
  const brands = c.brands.filter(b => brandProducts(b).length);
  const brandTile = b => tile(`/shop?brand=${encodeURIComponent(b)}`, pick(brandProducts(b)), 'Brand', b);
  const out = [];
  if (onSale[0]) { const p = onSale[0]; if (p.image) used.add(p.image); out.push(tile(productPath(p), p.image, `${Math.round((1 - p.price / p.originalPrice) * 100)}% off`, p.name)); }
  if (on.bundles && S.bundles[0]) { const b = S.bundles[0]; out.push(tile('/bundles', pick(b.items.map(i => S.products.find(p => p.id === i.id))), 'Bundle', b.title)); }
  if (cats[0]) out.push(catTile(cats[0]));
  if (brands[0]) out.push(brandTile(brands[0]));
  for (const cat of cats.slice(1)) if (out.length < 4) out.push(catTile(cat));
  for (const b of brands.slice(1)) if (out.length < 4) out.push(brandTile(b));
  return out.slice(0, 4);
}

routes.push([/^\/?$/, () => {
  const { content: c, sections: on } = SITE();
  const onSale = S.products.filter(p => p.originalPrice);
  const slides = heroSlides(c, on);
  const promos = promoTiles(c, on, onSale);
  const newest = S.products.slice().sort((a, b) => b.id - a.id).slice(0, 12);
  const brands = c.brands.map(b => ({ name: b, list: brandProducts(b) })).filter(b => b.list.length);
  const html = `<div class="container">
    <h1 class="sr-only">Autique – premium car care in Pakistan</h1>
    ${payBannerHTML()}
    <section class="home-top${on.collections ? '' : ' no-cats'}">
      ${on.collections ? `<nav class="cat-menu" aria-label="Shop by category">
        <button class="cat-toggle" data-act="toggle-cats" aria-expanded="false" aria-controls="cat-list"><span class="burger" aria-hidden="true"><i></i><i></i><i></i></span><span>Shop by category</span>${CHEVRON}</button>
        <div class="cat-head">Shop by category</div>
        <ul id="cat-list">${S.categories.map(cat => `<li>
          <button class="cat-item" data-act="scroll-cat" data-key="${esc(cat.key)}"><span class="cat-ic">${catIcon(cat.key)}</span><span class="cat-name">${esc(cat.title)}</span>${CHEVRON}</button>
          ${cat.products.length ? `<div class="cat-fly">
            <div class="cat-fly-head"><b>${esc(cat.title)}</b><a class="link" href="/category/${esc(cat.key)}">View all ${cat.products.length}</a></div>
            <div class="cat-fly-grid">${S.products.filter(p => p.categoryKey === cat.key).slice(0, 8).map(p => `<a href="${productPath(p)}"><span class="fly-img">${imgOrIcon(p.image, altOf(p.name))}</span><span class="fly-txt"><b>${esc(p.name)}</b>${priceHTML(p.price, p.originalPrice, p.hasVariants && p.variants.length > 1)}</span></a>`).join('')}</div>
          </div>` : ''}
        </li>`).join('')}</ul>
      </nav>` : ''}
      <div class="hero" data-slider aria-roledescription="carousel" aria-label="Highlights">
        <div class="hero-track">${slides.map((s, i) => s.replace('<div class="slide', `<div role="group" aria-roledescription="slide" aria-label="${i + 1} of ${slides.length}" class="slide`)).join('')}</div>
        ${slides.length > 1 ? `<button class="hero-arrow prev" data-slide="-1" aria-label="Previous slide"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <button class="hero-arrow next" data-slide="1" aria-label="Next slide"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
        <div class="hero-dots">${slides.map((_, i) => `<button data-dot="${i}" aria-label="Go to slide ${i + 1}"></button>`).join('')}</div>` : ''}
      </div>
      ${promos.length ? `<div class="promos">${promos.map(t => `<a class="promo" href="${esc(t.href)}"><span class="promo-img">${imgOrIcon(t.img, altOf(t.label), true)}</span><span class="promo-txt"><small>${esc(t.kicker)}</small><b>${esc(t.label)}</b><span class="go">Shop now &rarr;</span></span></a>`).join('')}</div>` : ''}
    </section>

    ${on.trustStrip ? `<div class="trust trust-4">${HOME_TRUST.map(([ic, t, s]) => `<div>${ic}<p><b>${t}</b><span>${s}</span></p></div>`).join('')}</div>` : ''}

    ${S.settings.saleActive || onSale.length ? `<section class="section"><div class="section-head"><div><h2>On sale</h2><p>${esc(S.settings.saleActive && S.settings.saleLabel ? S.settings.saleLabel : 'Sale prices are applied automatically in your bag.')}</p></div><a class="link" href="/shop?sale=1">See all offers</a></div>
      ${onSale.length ? rowHTML(onSale) : '<p class="muted">Sale prices are applied automatically in your bag.</p>'}</section>` : ''}

    ${on.collections ? `<section class="section" id="home-cats"><div class="section-head"><div><h2>Shop by category</h2><p>Cleaning, shining, polishing and more.</p></div><a class="link" href="/shop">View everything</a></div>
      <div class="cat-tiles">${S.categories.map(cat => { const img = firstImage(S.products.filter(p => p.categoryKey === cat.key)); return `<a class="cat-tile" id="home-cat-${esc(cat.key)}" href="/category/${esc(cat.key)}">
        <span class="cat-tile-img">${img ? `<img src="${esc(img)}" alt="${esc(altOf(cat.title))}" width="800" height="800" loading="lazy" decoding="async">` : `<span class="cat-ic">${catIcon(cat.key)}</span>`}</span>
        <span class="cat-tile-txt"><h3>${esc(cat.title)}</h3><p>${esc(cat.tagline)}</p><span class="go">${cat.products.length} ${cat.products.length === 1 ? 'product' : 'products'} &rarr;</span></span></a>`; }).join('')}</div></section>` : ''}

    ${on.bundles && S.bundles.length ? `<section class="section"><div class="section-head"><div><h2>This month's bundles</h2><p>Save more when you pair products together.</p></div><a class="link" href="/bundles">All bundles</a></div>
      <div class="bundles">${S.bundles.slice(0, 3).map(bundleHTML).join('')}</div></section>` : ''}

    ${on.brandPanel && brands.length ? `<section class="section"><div class="section-head"><div><h2>Top brands</h2><p>Genuine products from the names detailers trust.</p></div></div>
      <div class="brand-tiles">${brands.map(b => `<a class="brand-tile" href="/shop?brand=${encodeURIComponent(b.name)}"><span class="brand-img">${imgOrIcon(firstImage(b.list), altOf(b.name))}</span><span class="brand-txt"><b>${esc(b.name)}</b><span class="go">${b.list.length} ${b.list.length === 1 ? 'product' : 'products'} &rarr;</span></span></a>`).join('')}</div></section>` : ''}

    ${on.bestsellers && newest.length ? `<section class="section"><div class="section-head"><div><h2>New arrivals</h2><p>The latest additions to the shelf.</p></div><a class="link" href="/shop">Shop all</a></div>${rowHTML(newest)}</section>` : ''}

    ${galleryHTML('Inside Autique', 'Real photos of our inventory, packaging and setup.')}
  </div>`;
  return { html, mount: mountHero };
}]);

// Hero slider: arrows, dots and swipe. Advances every 6 seconds, pauses on hover or
// keyboard focus, and never autoplays when the visitor prefers reduced motion.
let heroTimer = null;
function mountHero(root) {
  clearInterval(heroTimer);
  const box = $('[data-slider]', root);
  if (!box) return;
  const track = $('.hero-track', box), slides = $$('.slide', box), dots = $$('[data-dot]', box);
  let i = 0, paused = false;
  const show = n => {
    i = (n + slides.length) % slides.length;
    track.style.transform = `translateX(${-i * 100}%)`;
    slides.forEach((s, k) => { s.setAttribute('aria-hidden', String(k !== i)); s.inert = k !== i; });
    dots.forEach((d, k) => d.setAttribute('aria-current', String(k === i)));
  };
  show(0);
  if (slides.length < 2) return;
  box.addEventListener('click', ev => {
    const a = ev.target.closest('[data-slide]'), d = ev.target.closest('[data-dot]');
    if (a) show(i + Number(a.dataset.slide));
    if (d) show(Number(d.dataset.dot));
  });
  box.addEventListener('mouseenter', () => { paused = true; });
  box.addEventListener('mouseleave', () => { paused = false; });
  box.addEventListener('focusin', () => { paused = true; });
  box.addEventListener('focusout', () => { paused = false; });
  let x0 = null, y0 = 0;
  box.addEventListener('touchstart', ev => { x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY; }, { passive: true });
  box.addEventListener('touchend', ev => {
    if (x0 === null) return;
    const dx = ev.changedTouches[0].clientX - x0, dy = ev.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) show(i + (dx < 0 ? 1 : -1));
    x0 = null;
  });
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  heroTimer = setInterval(() => {
    if (!box.isConnected) return clearInterval(heroTimer);
    if (!paused && !document.hidden) show(i + 1);
  }, 6000);
}

// SHOP
routes.push([/^\/(?:shop|category\/([\w-]+))$/, (m, q) => {
  const key = m[1] || '';
  const cat = S.categories.find(c => c.key === key);
  const term = (q.get('q') || '').trim().toLowerCase();
  const sale = q.get('sale') === '1';
  const sort = q.get('sort') || '';
  const typeKey = q.get('type') || '';
  const type = S.types.find(t => t.key === typeKey);
  const brand = (q.get('brand') || '').trim();
  let list = S.products.filter(p => (!key || p.categoryKey === key) && (!sale || p.originalPrice) && (!typeKey || p.type === typeKey)
    && (!brand || p.name.toLowerCase().startsWith(brand.toLowerCase()))
    && (!term || `${p.name} ${p.desc} ${p.sku} ${p.brand} ${p.categoryTitle} ${(S.types.find(t => t.key === p.type) || {}).title || ''} ${(p.variants || []).map(v => `${v.color} ${v.size} ${v.sku}`).join(' ')}`.toLowerCase().includes(term)));
  if (sort === 'price-asc') list = list.slice().sort((a, b) => a.price - b.price);
  if (sort === 'price-desc') list = list.slice().sort((a, b) => b.price - a.price);
  if (sort === 'name') list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
  const title = term ? `Results for "${q.get('q')}"` : sale ? 'Sale' : brand ? brand : cat && type ? `${cat.title}: ${type.title}` : cat ? cat.title : type ? type.title : 'Shop all';
  const sub = sale ? 'Everything currently on offer.' : brand ? `Every ${brand} product we stock.` : cat ? cat.tagline : type ? `All our ${type.title.toLowerCase()} products.` : 'Car care from Gladiator, Prato, Sogo and WTB: cleaning, shining, polishing and engine care.';
  const shopHref = (k, t) => `${k ? '/category/' + k : '/shop'}${t ? '?type=' + t : ''}`;
  const opt = (v, label) => `<option value="${v}" ${v === sort ? 'selected' : ''}>${label}</option>`;
  return `<div class="container">
    <div class="page-head"><h1>${esc(title)}</h1><p>${esc(sub)}</p></div>
    <div class="pill-row"><span class="pill-label">By need</span><div class="cat-pills"><a class="pill ${!key && !sale ? 'on' : ''}" href="${shopHref('', typeKey)}">All</a>${S.categories.map(c => `<a class="pill ${c.key === key ? 'on' : ''}" href="${shopHref(c.key, typeKey)}">${esc(c.title)}</a>`).join('')}${S.settings.saleActive ? `<a class="pill ${sale ? 'on' : ''}" href="/shop?sale=1">On sale</a>` : ''}</div></div>
    ${S.types.length ? `<div class="pill-row"><span class="pill-label">By type</span><div class="cat-pills"><a class="pill ${!typeKey ? 'on' : ''}" href="${shopHref(key, '')}">All types</a>${S.types.map(t => `<a class="pill ${t.key === typeKey ? 'on' : ''}" href="${shopHref(key, t.key)}">${esc(t.title)}</a>`).join('')}</div></div>` : ''}
    <div class="filters" data-base="${esc(key ? '/category/' + key : '/shop')}" data-q="${esc(q.get('q') || '')}" data-sale="${sale ? '1' : ''}" data-type="${esc(typeKey)}" data-brand="${esc(brand)}">
      <select data-change="sort" aria-label="Sort">${opt('', 'Featured')}${opt('price-asc', 'Price: low to high')}${opt('price-desc', 'Price: high to low')}${opt('name', 'Name A-Z')}</select>
      <span class="count">${list.length} ${list.length === 1 ? 'product' : 'products'}</span>
    </div>
    ${list.length ? gridHTML(list) : `<div class="empty"><h3>Nothing matches yet</h3><p>Try another collection or search for something else.</p><p style="margin-top:18px"><a class="btn btn-outline" href="/shop">Clear filters</a></p></div>`}
  </div>`;
}]);

// BUNDLES
routes.push([/^\/bundles$/, () => `<div class="container">
  <div class="page-head"><h1>Bundles</h1><p>Save more when you pair products together.</p></div>
  ${SITE().sections.bundles && S.bundles.length ? `<div class="bundles">${S.bundles.map(bundleHTML).join('')}</div>` : '<div class="empty"><h3>No bundles right now</h3><p>Check back soon.</p></div>'}
</div>`]);

// PRODUCT
routes.push([/^\/product\/(\d+)(?:-[\w-]*)?$/, (m, q) => {
  const p = S.products.find(x => x.id === Number(m[1]));
  if (!p) { const e = new Error('That product is no longer available.'); e.status = 404; throw e; }
  const sel = { v: p.hasVariants ? (p.variants.find(v => v.id === Number(q.get('v'))) || p.variants[0]) : null, qty: 1 };
  const related = S.products.filter(x => x.categoryKey === p.categoryKey && x.id !== p.id).slice(0, 4);
  const html = `<div class="container"><div class="crumbs"><a href="/">Home</a> / <a href="/shop">Shop</a> / <a href="/category/${esc(p.categoryKey)}">${esc(p.categoryTitle)}</a></div>
    <div class="pdp"><div class="pdp-gallery"><div class="main-img" id="pdp-img"></div>${p.images.length > 1 ? `<div class="pdp-thumbs">${p.images.map((u, i) => `<button class="pdp-thumb ${i === 0 ? 'on' : ''}" data-act="pdp-img" data-i="${i}" aria-label="Photo ${i + 1} of ${p.images.length}"><img src="${esc(u)}" alt="${esc(altOf(p.name))} photo ${i + 1}" width="800" height="800" loading="lazy"></button>`).join('')}</div>` : ''}</div>
    <div><h1>${esc(p.name)}</h1><div id="pdp-price"></div><div class="sku-line" id="pdp-sku"></div>${p.brand || p.size ? `<p class="pdp-meta">${p.brand ? `<span><b>Brand:</b> ${esc(p.brand)}</span>` : ''}${p.size ? `<span><b>Size:</b> ${esc(p.size)}</span>` : ''}</p>` : ''}<p class="desc">${esc(p.desc)}</p><div id="pdp-opts"></div>
      <div class="details">
        ${p.hasVariants ? `<details open><summary>Variants and SKUs</summary><table class="vtable"><thead><tr><th>Variant</th><th>SKU</th><th>Price</th></tr></thead><tbody id="pdp-vtable"></tbody></table></details>` : ''}
        <details ${p.hasVariants ? '' : 'open'}><summary>Product details</summary>
          <table class="vtable spec-table"><tbody>
            ${p.brand ? `<tr><th>Brand</th><td>${esc(p.brand)}</td></tr>` : ''}
            <tr><th>Category</th><td>${esc(p.categoryTitle)}</td></tr>
            ${(S.types.find(t => t.key === p.type) || {}).title ? `<tr><th>Type</th><td>${esc(S.types.find(t => t.key === p.type).title)}</td></tr>` : ''}
            ${p.size ? `<tr><th>Size</th><td>${esc(p.size)}</td></tr>` : ''}
            <tr><th>SKU</th><td class="sku">${esc(p.sku || '—')}</td></tr>
            <tr><th>Price</th><td>${p.hasVariants && p.variants.length > 1 ? `From ${fmt(p.price)}` : fmt(p.price)} (PKR)</td></tr>
            ${String(p.specs || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => { const i = l.indexOf(':'); return i > 0 ? `<tr><th>${esc(l.slice(0, i).trim())}</th><td>${esc(l.slice(i + 1).trim())}</td></tr>` : `<tr><td colspan="2">${esc(l)}</td></tr>`; }).join('')}
          </tbody></table></details>
        ${p.usage ? `<details><summary>How to use</summary>${md(p.usage)}</details>` : ''}
        <details><summary>Delivery and payment</summary><p>Delivered across Pakistan by PostEx (Call Courier), usually within 1 to 7 working days depending on your city. Pay cash on delivery${S.settings.cardPayments ? ', or pay online by card, JazzCash or Easypaisa' : ''}. <a class="link" href="/policies/shipping">Shipping Policy</a></p></details>
        <details><summary>Returns</summary><p>Damaged or defective? Refund or replacement within 7 days of delivery. Change of mind? Return it unused within 7 days (you pay return delivery). <a class="link" href="/policies/refund">Refund & Returns Policy</a></p></details>
      </div></div></div>
    ${related.length ? `<section class="section"><div class="section-head"><h2>You may also like</h2></div>${gridHTML(related)}</section>` : ''}</div>`;
  const mount = root => {
    const paint = () => {
      const v = sel.v;
      $('#pdp-img', root).innerHTML = imgOrIcon((v && v.image) || p.images[sel.img || 0] || p.image, altOf(p.name), true);
      $$('.pdp-thumb', root).forEach((t, i) => t.classList.toggle('on', i === (sel.img || 0)));
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
    actions['pdp-img'] = el => { sel.img = Number(el.dataset.i); if (sel.v) sel.v = { ...sel.v, image: '' }; paint(); };
    actions['pdp-qty'] = el => { sel.qty = Math.max(1, sel.qty + Number(el.dataset.d)); paint(); };
    actions['pdp-add'] = () => {
      if (sel.v) cart.add('variant', `${p.id}:${sel.v.id}`, sel.qty); else cart.add('product', String(p.id), sel.qty);
      toast('Added to your bag', { link: '/cart', linkText: 'View bag' });
    };
    paint();
  };
  return { html, mount };
}]);

// CART
// The customer's picks at checkout (kept while they move between bag and checkout)
const pick = { payment: '', delivery: '' };
const defaultPayment = () => SITE().customers.cashOnDelivery ? 'cod' : 'card';
const feeText = fee => fee > 0 ? fmt(fee) : 'Free';
// Eye-catching "pay online and save" callout; on the checkout page it also switches to online payment
function offerHTML(t, where) {
  if (!t.offer || !(t.onlineDiscount > 0)) return '';
  if (t.prepaidDiscount > 0) return `<div class="offer-callout on" role="status"><b>You're saving ${fmt(t.prepaidDiscount)}</b><span>${esc(t.offer.label)} for paying online, applied below.</span></div>`;
  return `<div class="offer-callout"><b>${esc(t.offer.headline)}</b><span>Save <strong>${fmt(t.onlineDiscount)}</strong> on this order when you pay online${where === 'cart' ? ' at checkout' : ''}.${t.offer.endsAt ? ` Offer ends ${fdate(t.offer.endsAt)}.` : ''}</span>
    ${where === 'checkout' ? '<button type="button" class="btn btn-primary btn-sm" data-act="pick-online">Pay online and save</button>' : ''}</div>`;
}
function summaryHTML(t, extra = '', lines = '') {
  const d = t.delivery;
  return `<div class="summary" id="order-summary"><h3>Order summary</h3>${lines}
    <div class="sum-row"><span>Subtotal</span><span>${fmt(t.subtotal)}</span></div>
    ${t.saleSavings > 0 ? `<div class="sum-row disc"><span>Sale savings (included)</span><span>${fmt(t.saleSavings)}</span></div>` : ''}
    ${t.discount > 0 ? `<div class="sum-row disc"><span>Code ${esc(t.code)}</span><span>&minus;${fmt(t.discount)}</span></div>` : ''}
    ${d ? `<div class="sum-row"><span>Delivery${t.deliveryOptions.length > 1 ? ` <span class="muted">&middot; ${esc(d.name)}</span>` : ''}</span><span>${feeText(d.fee)}</span></div>
      ${d.next ? `<div class="sum-hint">Add ${fmt(d.next.spend)} more for ${d.next.fee > 0 ? `${fmt(d.next.fee)} delivery` : 'free delivery'}.</div>` : ''}` : ''}
    ${t.prepaidDiscount > 0 ? `<div class="sum-row disc"><span>Online payment discount</span><span>&minus;${fmt(t.prepaidDiscount)}</span></div>` : ''}
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
  const payment = pick.payment || defaultPayment();
  const q = await api('/api/checkout/quote', { method: 'POST', body: { subtotal, discount, paymentMethod: payment, delivery: pick.delivery } });
  return { subtotal, saleSavings, discount, code, error, payment, delivery: q.delivery, deliveryOptions: q.options,
    offer: q.offer, onlineDiscount: q.onlineDiscount, prepaidDiscount: q.prepaidDiscount, total: q.total };
}
const emptyBag = `<div class="container"><div class="empty" style="padding:120px 0"><h3>Your bag is empty</h3><p>Find something you like and it will show up here.</p><p style="margin-top:20px"><a class="btn btn-primary" href="/shop">Start shopping</a></p></div></div>`;

routes.push([/^\/cart$/, async () => {
  const lines = cart.lines();
  if (!lines.length) return emptyBag;
  const t = await totals(lines);
  const extra = `<form class="coupon" data-form="coupon"><input class="input" name="code" placeholder="Discount code" value="${esc(t.code)}" aria-label="Discount code"><button class="btn btn-outline btn-sm" type="submit">Apply</button></form>
    ${t.error ? `<div class="small" style="color:var(--danger);margin-bottom:8px">${esc(t.error)}</div>` : ''}
    ${offerHTML(t, 'cart')}
    <a class="btn btn-primary btn-lg btn-block" href="/checkout" style="margin-top:14px">Checkout</a>`;
  return `<div class="container"><div class="page-head"><h1>Your bag</h1></div><div class="two"><div>
    ${lines.map(l => `<div class="line"><a class="line-img" href="${l.href}">${imgOrIcon(l.image, altOf(l.name))}</a>
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
  const t = await totals(lines);
  const u = S.user || { name: '', email: '', phone: '', address: '', city: '', province: '' };
  const itemRows = `<div style="margin:0 0 16px">${lines.map(l => `<div class="sum-row"><span>${esc(l.name)}${l.type === 'variant' ? ` <span class="muted">(${esc(l.label)})</span>` : ''} <span class="muted">&times; ${l.qty}</span></span><span>${fmt(l.price * l.qty)}</span></div>`).join('')}</div>`;
  return `<div class="container"><div class="page-head"><h1>Checkout</h1><p>${S.user ? `Signed in as ${esc(u.email)}. This order will be saved under My orders.` : 'No account needed. Check out as a guest, and create an account afterwards if you like. Already have one? <a class="link" href="/login?next=/checkout">Sign in</a>'}</p></div>
  <form class="two" data-form="checkout"><div>
    <div class="box"><h3>Contact and delivery</h3><div class="form">
      <div class="row"><div class="field"><label for="c-name">Full name</label><input class="input" id="c-name" name="name" value="${esc(u.name || '')}" required autocomplete="name"></div>
      <div class="field"><label for="c-phone">Phone</label><input class="input" id="c-phone" name="phone" value="${esc(u.phone)}" required autocomplete="tel" placeholder="03xx xxxxxxx"></div></div>
      <div class="field"><label for="c-email">Email</label><input class="input" id="c-email" type="email" name="email" value="${esc(u.email)}" ${S.user ? 'readonly' : 'required autocomplete="email"'}></div>
      <div class="field"><label for="c-addr">Delivery address</label><input class="input" id="c-addr" name="address" value="${esc(u.address)}" required autocomplete="street-address" placeholder="House, street, area"></div>
      <div class="row"><div class="field"><label for="c-city">City</label><input class="input" id="c-city" name="city" value="${esc(u.city)}" required autocomplete="address-level2"></div>
      <div class="field"><label for="c-prov">Province</label><select id="c-prov" name="province"><option value="">Select</option>${PROVINCES.map(x => `<option ${x === u.province ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
      <div class="field"><label for="c-notes">Order notes (optional)</label><textarea class="input" id="c-notes" name="notes" rows="2" placeholder="Landmark, preferred delivery time..."></textarea></div>
    </div></div>
    <div class="box"><h3>Delivery</h3>
      ${t.deliveryOptions.map(o => `<label class="pay-opt ${o.key === t.delivery.key ? 'on' : ''}"><input type="radio" name="delivery" value="${esc(o.key)}" ${o.key === t.delivery.key ? 'checked' : ''} data-change="delivery-pick"><div class="opt-main"><b>${esc(o.name)}</b>${o.description ? `<span>${esc(o.description)}</span>` : ''}</div><strong class="opt-fee">${feeText(o.fee)}</strong></label>`).join('')}
    </div>
    <div class="box"><h3>Payment</h3>
      ${S.settings.cardPayments ? `<div id="co-offer">${offerHTML(t, 'checkout')}</div>` : ''}
      ${SITE().customers.cashOnDelivery ? `<label class="pay-opt ${t.payment === 'cod' ? 'on' : ''}"><input type="radio" name="paymentMethod" value="cod" ${t.payment === 'cod' ? 'checked' : ''} data-change="pay-pick"><div><b>Cash on delivery</b><span>Pay in cash when your order arrives.</span></div></label>` : ''}
      ${S.settings.cardPayments ? `<label class="pay-opt ${t.payment === 'card' ? 'on' : ''}"><input type="radio" name="paymentMethod" value="card" ${t.payment === 'card' ? 'checked' : ''} data-change="pay-pick"><div class="opt-main"><b>Pay online${t.offer && t.onlineDiscount > 0 ? ` <span class="save-badge">Save ${fmt(t.onlineDiscount)}</span>` : ''}</b><span>Card, JazzCash or Easypaisa, on Rapid Gateway's secure page. Use your Pakistani mobile number above.</span></div></label>` : ''}
      ${!SITE().customers.cashOnDelivery && !S.settings.cardPayments ? '<div class="note err">No payment option is available right now. Please try again later.</div>' : ''}
    </div>
  </div>
  <div id="co-summary">${checkoutSummary(t, itemRows)}</div></form></div>`;
}]);
const checkoutSummary = (t, itemRows) => summaryHTML(t, `<div id="co-err"></div><button class="btn btn-primary btn-lg btn-block" type="submit" style="margin-top:16px">Place order &middot; ${fmt(t.total)}</button>${t.code ? `<p class="small muted" style="margin-top:12px;text-align:center">Code ${esc(t.code)} applied.</p>` : ''}`, itemRows);
// Re-price the checkout after the customer changes delivery or payment, without losing what they typed
async function refreshCheckout() {
  const lines = cart.lines();
  const box = $('#co-summary');
  if (!box || !lines.length) return;
  const t = await totals(lines);
  const itemRows = $('#order-summary > div', box) ? $('#order-summary > div', box).outerHTML : '';
  box.innerHTML = checkoutSummary(t, itemRows);
  const offer = $('#co-offer');
  if (offer) offer.innerHTML = offerHTML(t, 'checkout');
  $$('input[name="delivery"]').forEach(i => { const o = t.deliveryOptions.find(x => x.key === i.value); if (o) $('.opt-fee', i.closest('label')).textContent = feeText(o.fee); });
}

// ORDER CONFIRMATION (live status from the server; guests use the token saved at checkout)
function paymentNote(o) {
  if (o.paymentMethod === 'cod') return `<div class="note">Please keep <b>${fmt(o.total)}</b> ready for the courier.</div>`;
  if (o.paymentStatus === 'paid') return `<div class="note ok">Payment of <b>${fmt(o.total)}</b> received online. Thank you!</div>`;
  if (o.paymentStatus === 'failed') return `<div class="note err">This payment did not go through. You can place the order again, or choose cash on delivery.</div>`;
  return `<div class="note">We are waiting for Rapid Gateway to confirm your payment of <b>${fmt(o.total)}</b>. The status here updates once it's confirmed.</div>`;
}
routes.push([/^\/order\/([\w-]+)$/, async m => {
  let o;
  try { o = (await api(`/api/order-status/${encodeURIComponent(m[1])}?t=${encodeURIComponent(orderTokens.get(m[1]))}`)).order; }
  catch (e) {
    if (e.status !== 404) throw e;
    return `<div class="container"><div class="empty" style="padding:120px 0"><h3>Order ${esc(m[1])}</h3><p>Sign in to see your orders.</p><p style="margin-top:20px"><a class="btn btn-primary" href="/login?next=/account">Sign in</a></p></div></div>`;
  }
  const heading = o.paymentMethod === 'card' && o.paymentStatus !== 'paid' ? 'Almost done' : `Thank you, ${esc(o.customerName.split(' ')[0])}`;
  return `<div class="container" style="max-width:820px"><div class="page-head"><h1>${heading}</h1><p>Order <b>${esc(o.orderNumber)}</b> &middot; placed ${fdate(o.createdAt)}. Keep your order number: you can follow the order any time on Track your order with it and ${esc(o.customerEmail)}.${S.settings.emailUpdates ? ` We'll email you at each step: when it's confirmed, dispatched (with your invoice) and delivered.` : ''}</p></div>
    <div style="display:flex;gap:8px;margin-bottom:22px;flex-wrap:wrap"><span class="status">${esc(o.status)}</span><span class="status ${o.paymentStatus === 'failed' ? 'bad' : ''}">${PAY_LABEL[o.paymentStatus] || ''}</span></div>
    ${paymentNote(o)}
    ${o.trackingId ? `<a class="courier-link" href="https://postex.pk/tracking?cn=${encodeURIComponent(o.trackingId)}" target="_blank" rel="noopener noreferrer">Track your order with Call Courier / PostEx &rarr;</a>` : ''}
    <div class="box"><h3>Items</h3>${o.items.map(i => `<div class="sum-row"><span>${esc(i.name)} <span class="muted">&times; ${i.qty}</span></span><span>${fmt(i.price * i.qty)}</span></div>`).join('')}
      <div class="sum-row" style="margin-top:10px;border-top:1px solid var(--line);padding-top:14px"><span>Subtotal</span><span>${fmt(o.subtotal)}</span></div>
      ${o.discount ? `<div class="sum-row disc"><span>Code ${esc(o.couponCode)}</span><span>&minus;${fmt(o.discount)}</span></div>` : ''}
      <div class="sum-row"><span>Delivery${o.deliveryName ? ` <span class="muted">&middot; ${esc(o.deliveryName)}</span>` : ''}</span><span>${feeText(o.deliveryFee)}</span></div>
      ${o.prepaidDiscount ? `<div class="sum-row disc"><span>Online payment discount</span><span>&minus;${fmt(o.prepaidDiscount)}</span></div>` : ''}
      <div class="sum-row total"><span>Total</span><span>${fmt(o.total)}</span></div></div>
    <div class="box"><h3>Delivering to</h3><p>${esc(o.shipping.name)}<br>${esc(o.shipping.address)}<br>${esc(o.shipping.city)}${o.shipping.province ? ', ' + esc(o.shipping.province) : ''}<br>${esc(o.shipping.phone)}</p></div>
    <div class="box"><h3>What happens next</h3><ol class="next-steps">
      <li>We confirm your order and pack it, usually within 1 to 2 working days.</li>
      <li>We hand it to PostEx (Call Courier) and add the tracking number to your order.</li>
      <li>The courier delivers to your door${o.paymentMethod === 'cod' ? `, and you pay <b>${fmt(o.total)}</b> in cash` : ''}.</li>
      <li>Something wrong? You have 7 days after delivery. See our <a class="link" href="/policies/refund">Refund & Returns Policy</a>.</li>
    </ol></div>
    ${o.hasAccount ? '' : S.user
      ? `<div class="box"><h3>Save this order to your account</h3><p class="muted">Add it to My orders to find it easily later.</p><div id="acct-msg"></div><button class="btn btn-primary" data-act="claim-order" data-n="${esc(o.orderNumber)}">Add to my account</button></div>`
      : SITE().customers.allowSignup ? `<form class="box form" data-form="order-account" data-n="${esc(o.orderNumber)}"><h3>Create an account (optional)</h3>
          <p class="muted">Choose a password to save this order and your delivery details. Your account will use ${esc(o.customerEmail)}.</p>
          <div id="acct-msg"></div>
          <div class="field"><label for="oa-pass">Password</label><input class="input" id="oa-pass" type="password" name="password" minlength="6" required autocomplete="new-password"><div class="hint">At least 6 characters.</div></div>
          <div><button class="btn btn-primary" type="submit">Create account</button></div></form>` : ''}
    <p style="margin-top:26px"><a class="btn btn-outline" href="/shop">Continue shopping</a></p></div>`;
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
    ${o.discount ? `<div class="sum-row disc"><span>Code ${esc(o.couponCode)}</span><span>&minus;${fmt(o.discount)}</span></div>` : ''}
    ${o.deliveryFee ? `<div class="sum-row"><span>Delivery</span><span>${fmt(o.deliveryFee)}</span></div>` : ''}
    ${o.prepaidDiscount ? `<div class="sum-row disc"><span>Online payment discount</span><span>&minus;${fmt(o.prepaidDiscount)}</span></div>` : ''}
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
const notAvailable = title => `<div class="container"><div class="empty" style="padding:120px 0"><h3>${esc(title)}</h3><p style="margin-top:20px"><a class="btn btn-primary" href="/">Back to the shop</a></p></div></div>`;
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
      <p style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap"><a class="btn btn-primary btn-lg" href="/shop">Shop the collection</a><a class="btn btn-outline btn-lg" href="/how-it-works">How Autique works</a></p>
    </section>
    ${galleryHTML('Inside Autique', 'Our inventory, packaging and setup.')}</div>`;
  const mount = () => { setTimeout(() => { const l = $('#about-logo'); if (l) l.classList.add('is-split'); }, 700); };
  return { html, mount };
}]);

// POLICIES
routes.push([/^\/policies\/(refund|shipping|privacy|terms)$/, m => {
  document.title = `${POLICY_PAGES[m[1]]} — Autique`;
  return `<div class="container"><article class="doc-page">
    <div class="page-head"><h1>${POLICY_PAGES[m[1]]}</h1></div>
    <div class="doc">${md(SITE().content.policies[m[1]])}</div>
    <nav class="doc-links" aria-label="Other policies">${Object.entries(POLICY_PAGES).filter(([k]) => k !== m[1]).map(([k, t]) => `<a class="pill" href="/policies/${k}">${t}</a>`).join('')}<a class="pill" href="/contact">Contact us</a></nav>
  </article></div>`;
}]);

// CONTACT
routes.push([/^\/contact$/, () => {
  const b = SITE().content.business;
  document.title = 'Contact us — Autique';
  return `<div class="container"><article class="doc-page">
    <div class="page-head"><h1>Contact us</h1><p>Questions about a product, an order, delivery or a return? We're happy to help.</p></div>
    <div class="contact-grid">
      ${b.email ? `<a class="contact-card" href="mailto:${esc(b.email)}"><span>Email</span><b>${esc(b.email)}</b></a>` : ''}
      ${b.phone ? `<a class="contact-card" href="${telHref(b.phone)}"><span>Phone</span><b>${esc(b.phone)}</b></a>` : ''}
      ${b.address ? `<div class="contact-card"><span>Business address</span><b>${esc(b.address)}</b>${b.city ? `<small>${esc(b.city)}</small>` : ''}</div>` : ''}
      ${b.hours ? `<div class="contact-card"><span>Hours</span><b>${esc(b.hours)}</b></div>` : ''}
    </div>
    <div class="box" style="margin-top:22px"><h3>Business details</h3>
      <dl class="biz-dl">
        <div><dt>Trading name</dt><dd>${esc(b.tradingName)}</dd></div>
        ${b.legalStructure ? `<div><dt>Legal structure</dt><dd>${esc(b.legalStructure)}</dd></div>` : ''}
        ${b.owner ? `<div><dt>Proprietor</dt><dd>${esc(b.owner)}</dd></div>` : ''}
        ${b.ntn ? `<div><dt>NTN</dt><dd>${esc(b.ntn)}</dd></div>` : ''}
        ${b.address ? `<div><dt>Registered address</dt><dd>${esc(b.address)}</dd></div>` : ''}
        ${b.website ? `<div><dt>Website</dt><dd>${esc(b.website)}</dd></div>` : ''}
      </dl></div>
    <p class="muted" style="margin-top:18px">Returning a product? Please read our <a class="link" href="/policies/refund">Refund & Returns Policy</a> and include your order number when you contact us.</p>
  </article></div>`;
}]);

// HOW AUTIQUE WORKS: business model + the complete customer journey
routes.push([/^\/how-it-works$/, () => {
  const c = SITE().content;
  document.title = 'How Autique works — Autique';
  return `<div class="container"><article class="doc-page wide">
    <div class="page-head"><h1>How Autique works</h1><p>Our business model, how we operate, and every step from choosing a product to it arriving at your door.</p></div>
    <div class="doc">${md(c.businessModel)}</div>
    <h2 class="journey-title" id="journey">Your journey with Autique</h2>
    <ol class="journey">${c.journey.map((j, i) => `<li><span class="journey-num">${i + 1}</span><div><b>${esc(j.title)}</b><p>${esc(j.text)}</p></div></li>`).join('')}</ol>
    <div class="journey-cta"><a class="btn btn-primary btn-lg" href="/shop">Start shopping</a>${SITE().customers.allowOrderTracking ? '<a class="btn btn-outline btn-lg" href="/track">Track an order</a>' : ''}<a class="btn btn-outline btn-lg" href="/policies/shipping">Shipping Policy</a><a class="btn btn-outline btn-lg" href="/policies/refund">Refunds & Returns</a></div>
    ${galleryHTML('Inside Autique', 'Our inventory, packaging and setup in Lahore.')}
  </article></div>`;
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
      <p class="small muted" style="text-align:center">${reg ? `Already have an account? <a class="link" href="/login?next=${esc(next)}">Sign in</a>` : (SITE().customers.allowSignup ? `New here? <a class="link" href="/register?next=${esc(next)}">Create an account</a>` : '')}</p></form></div></div>`;
  return { html, mount: root => { mountGoogleButton(root, reg, next); } };
};
routes.push([/^\/login$/, (m, q) => S.user ? go(q.get('next') || '/account') : authPage('login', q.get('next') || '/account')]);
routes.push([/^\/register$/, (m, q) => S.user ? go(q.get('next') || '/account')
  : !SITE().customers.allowSignup ? `<div class="container"><div class="auth" style="text-align:center"><h1>Sign-ups are closed</h1><p class="sub">We're not taking new accounts right now. Already have one?</p><a class="btn btn-primary btn-lg" href="/login?next=${esc(q.get('next') || '/account')}">Sign in</a></div></div>`
  : authPage('register', q.get('next') || '/account')]);

function accountTabs(tab) {
  const t = (key, label) => `<a class="pill ${tab === key ? 'on' : ''}" href="/account${key === 'orders' ? '' : '?tab=' + key}">${label}</a>`;
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
      ${SITE().customers.allowOrderTracking ? `<a class="link small" style="display:inline-block;margin-top:10px" href="/track?n=${esc(o.orderNumber)}">Track this order</a>` : ''}
      ${o.trackingNumber ? `<div class="small muted" style="margin-top:8px">${esc(o.courier)} tracking: ${esc(o.trackingNumber)}</div>` : ''}
      <div style="margin-top:12px;font-weight:700">${fmt(o.total)} <span class="muted small" style="font-weight:400">&middot; ${o.paymentMethod === 'cod' ? 'Cash on delivery' : 'Card: ' + (PAY_LABEL[o.paymentStatus] || '')}</span></div>
      </div>`).join('')
    : '<div class="empty"><h3>No orders yet</h3><p>When you place an order it will appear here.</p><p style="margin-top:18px"><a class="btn btn-primary" href="/shop">Start shopping</a></p></div>';
  return `${head}${body}</div>`;
}]);

// ---------- actions, forms, changes ----------
const actions = {
  menu: () => openMenu(!$('#drawer').classList.contains('open')),
  'menu-close': () => openMenu(false),
  search: () => { const b = $('#searchbar'); b.classList.toggle('open'); if (b.classList.contains('open')) $('#search-input').focus(); },
  'toggle-cats': el => {
    const open = el.getAttribute('aria-expanded') !== 'true';
    el.setAttribute('aria-expanded', String(open));
    el.closest('.cat-menu').classList.toggle('open', open);
  },
  'scroll-cat': el => {
    const menu = el.closest('.cat-menu');
    if (menu.classList.contains('open')) actions['toggle-cats']($('.cat-toggle', menu));
    const tile = document.getElementById('home-cat-' + el.dataset.key);
    if (!tile) return go('/category/' + el.dataset.key);
    tile.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    tile.classList.remove('flash'); void tile.offsetWidth; tile.classList.add('flash');
  },
  'pick-online': () => {
    const card = $('input[name="paymentMethod"][value="card"]');
    if (!card) return;
    card.checked = true;
    return changes['pay-pick'](card);
  },
  'add-bundle': el => { cart.add('bundle', el.dataset.id, 1); toast('Bundle added to your bag', { link: '/cart', linkText: 'View bag' }); },
  'cart-qty': async el => {
    const b = cart.bag(el.dataset.type), q = (b[el.dataset.key] || 0) + Number(el.dataset.d);
    if (q < 1) return;
    cart.set(el.dataset.type, el.dataset.key, q); await route();
  },
  'install-app': (el, ev) => { if (ev) ev.preventDefault(); openMenu(false); showInstallHelp(); },
  'install-now': async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; closeAppModal(); },
  'close-app-modal': () => closeAppModal(),
  'claim-order': async el => {
    el.disabled = true;
    try {
      const { user } = await api(`/api/orders/${encodeURIComponent(el.dataset.n)}/account`, { method: 'POST', body: { t: orderTokens.get(el.dataset.n) } });
      S.user = user; renderChrome(); toast('Order saved to your account'); await route();
    } catch (e) { $('#acct-msg').innerHTML = `<div class="note err">${esc(e.message)}</div>`; el.disabled = false; }
  },
  'dismiss-pay-banner': el => {
    returnedOrder = null;
    clearTimeout(payPoll);
    el.closest('.pay-banner').remove();
    history.replaceState(null, '', location.pathname);
  },
  'about-replay': () => { const l = $('#about-logo'); l.classList.remove('is-split'); setTimeout(() => l.classList.add('is-split'), 900); },
  'cart-remove': async el => { cart.remove(el.dataset.type, el.dataset.key); await route(); },
  logout: async () => { await api('/api/logout', { method: 'POST' }); S.user = null; openMenu(false); toast('Signed out'); go('/'); renderChrome(); }
};
const forms = {
  search: form => { const q = $('input', form).value.trim(); $('#searchbar').classList.remove('open'); if (q) go('/shop?q=' + encodeURIComponent(q)); },
  coupon: async form => { couponCode = new FormData(form).get('code').trim(); await route(); },
  'order-account': async form => {
    const btn = $('button[type=submit]', form), msg = $('#acct-msg', form), n = form.dataset.n;
    btn.disabled = true; msg.innerHTML = '';
    try {
      const { user } = await api(`/api/orders/${encodeURIComponent(n)}/account`, { method: 'POST', body: { t: orderTokens.get(n), password: new FormData(form).get('password') } });
      S.user = user; renderChrome(); toast('Account created. Welcome!'); await route();
    } catch (e) {
      msg.innerHTML = `<div class="note err">${esc(e.message)}${e.data && e.data.signIn ? ` <a class="link" href="/login?next=${encodeURIComponent('/order/' + n)}">Sign in</a>` : ''}</div>`;
      btn.disabled = false;
    }
  },
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
        ...cart.payload(), couponCode, paymentMethod: f.paymentMethod, delivery: f.delivery,
        shipping: { name: f.name, phone: f.phone, email: f.email, address: f.address, city: f.city, province: f.province, notes: f.notes }
      } });
      if (checkoutUrl) {
        cart.clear(); couponCode = ''; pick.payment = ''; pick.delivery = '';
        btn.textContent = 'Opening secure payment...';
        window.location.href = checkoutUrl;
        return;
      }
      orderTokens.set(order.orderNumber, order.accessToken);
      cart.clear(); couponCode = ''; pick.payment = ''; pick.delivery = '';
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
    if (box.dataset.type) p.set('type', box.dataset.type);
    if (box.dataset.brand) p.set('brand', box.dataset.brand);
    const s = p.toString();
    go(box.dataset.base + (s ? '?' + s : ''));
  },
  'pay-pick': el => {
    $$('input[name="paymentMethod"]').forEach(i => i.closest('.pay-opt').classList.toggle('on', i.checked));
    pick.payment = el.value;
    return refreshCheckout();
  },
  'delivery-pick': el => {
    $$('input[name="delivery"]').forEach(i => i.closest('.pay-opt').classList.toggle('on', i.checked));
    pick.delivery = el.value;
    return refreshCheckout();
  }
};
document.addEventListener('input', ev => {
  if (ev.target.id !== 'p-email' || !S.user) return;
  const wrap = $('#p-current-wrap');
  if (wrap) wrap.hidden = ev.target.value.trim().toLowerCase() === S.user.email;
});

// ---------- installable app (Windows, Android, iPhone/iPad) ----------
let installPrompt = null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });
window.addEventListener('appinstalled', () => { installPrompt = null; closeAppModal(); toast('autique. is installed on this device'); renderChrome(); });
function closeAppModal() { const m = $('#app-modal'); if (m) m.remove(); }
function showInstallHelp() {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /android/i.test(ua);
  const block = (mine, title, steps) => `<div class="app-steps ${mine ? 'mine' : ''}"><b>${title}${mine ? ' (this device)' : ''}</b><ol>${steps.map(x => `<li>${x}</li>`).join('')}</ol></div>`;
  const el = document.createElement('div');
  el.id = 'app-modal';
  el.className = 'app-modal-bg';
  el.innerHTML = `<div class="app-modal" role="dialog" aria-modal="true" aria-labelledby="app-modal-title">
    <div class="app-modal-head"><img src="/icons/icon-192.png" alt=""><div><h3 id="app-modal-title">Install autique.</h3><p class="small muted">Opens like a normal app from your home screen or desktop. No app store needed.</p></div></div>
    ${block(ios, 'iPhone or iPad', ['Open this site in <b>Safari</b>.', 'Tap the <b>Share</b> button (a square with an arrow).', 'Tap <b>Add to Home Screen</b>, then <b>Add</b>.'])}
    ${block(android, 'Android', ['Open this site in <b>Chrome</b>.', 'Tap the <b>three dots</b> menu at the top right.', 'Tap <b>Install app</b> (or <b>Add to Home screen</b>).'])}
    ${block(!ios && !android, 'Windows or Mac', ['Open this site in <b>Chrome</b> or <b>Edge</b>.', 'Click the <b>install icon</b> at the right end of the address bar (or the menu, then <b>Install autique.</b>).'])}
    <div class="actions"><button class="btn btn-outline" data-act="close-app-modal">Close</button>${installPrompt ? '<button class="btn btn-primary" data-act="install-now">Install now</button>' : ''}</div>
  </div>`;
  el.addEventListener('click', ev => { if (ev.target === el) closeAppModal(); });
  document.body.appendChild(el);
  $('#app-modal .btn').focus();
}

// ---------- animated wordmark: open (auto-boutique) at the top, closed (autique.) once scrolling ----------
let logosReady = false;
function syncScrollLogos() {
  if (!logosReady) return;
  const open = window.scrollY < 24;
  $$('.scroll-logo').forEach(l => l.classList.toggle('is-split', open));
}
window.addEventListener('scroll', syncScrollLogos, { passive: true });

// ---------- page title, description, canonical ----------
const BASE_TITLE = 'Autique | Car Care in Pakistan: Gladiator, Sogo, Prato, WTB';
function clip(t, max) { t = String(t || '').replace(/\s+/g, ' ').trim(); if (t.length < max) return t; const c = t.slice(0, max - 1); return c.slice(0, Math.max(c.lastIndexOf(' '), max - 20)).replace(/[\s,.;:–-]+$/, '') + '…'; }
const PRIVATE_TITLES = { '/cart': 'Your Bag | Autique', '/checkout': 'Checkout | Autique', '/account': 'My Account | Autique', '/track': 'Track Your Order | Autique', '/login': 'Sign In | Autique', '/register': 'Create an Account | Autique' };
function setMeta(path) {
  let title = null, desc = null, canonical = path;
  let m;
  if (path === '/') { title = BASE_TITLE; desc = `${SITE().content.heroText} ${SITE().content.announcement}.`; }
  else if ((m = /^\/product\/(\d+)/.exec(path))) {
    const p = S.products.find(x => x.id === Number(m[1]));
    if (p) {
      const many = p.hasVariants && new Set(p.variants.map(v => v.price)).size > 1;
      const suffix = ` - ${many ? 'from ' : ''}${fmt(p.price)} | Autique`;
      title = clip(p.name, 60 - suffix.length) + suffix; desc = p.desc; canonical = productPath(p);
      if (location.pathname !== canonical) history.replaceState(null, '', canonical + location.search);
    }
  }
  else if ((m = /^\/category\/([\w-]+)/.exec(path))) { const c = S.categories.find(x => x.key === m[1]); if (c) { title = `${c.title} | Car Care | Autique`; desc = c.tagline; } }
  else if (path === '/shop') title = 'Shop All Car Care Products | Autique';
  else if (path === '/bundles') title = 'Car Care Bundles | Autique';
  else if (path === '/about') title = 'About Autique | Car Care from Lahore';
  else if (PRIVATE_TITLES[path]) title = PRIVATE_TITLES[path];
  document.title = clip(title || (document.title.includes('Autique') ? document.title : 'Autique | Car Care'), 60);
  if (desc) { const d = $('meta[name="description"]'); if (d) d.setAttribute('content', clip(desc, 160)); }
  const link = $('link[rel="canonical"]');
  if (link) link.setAttribute('href', new URL(link.href).origin + canonical);
}

// ---------- router ----------
let routeId = 0;
async function route() {
  const id = ++routeId;
  const h = location.pathname + location.search;
  const qi = h.indexOf('?'), path = qi < 0 ? h : h.slice(0, qi), q = new URLSearchParams(qi < 0 ? '' : h.slice(qi + 1));
  openMenu(false);
  const setApp = html => { $('#app').innerHTML = html; };
  for (const [re, fn] of routes) {
    const m = re.exec(path);
    if (!m) continue;
    try {
      document.title = 'Autique | Car Care';
      rendering = true;
      let out;
      try { out = await fn(m, q); } finally { rendering = false; }
      if (id !== routeId || out === undefined) return;
      if (typeof out === 'string') setApp(out); else { setApp(out.html); out.mount($('#app')); }
      setMeta(path);
    } catch (e) {
      if (id !== routeId) return;
      if (e.status === 401) return go('/login?next=' + encodeURIComponent(path));
      setApp(`<div class="container"><div class="empty" style="padding:120px 0"><h3>${e.status === 404 ? 'We could not find that' : 'Something went wrong'}</h3><p>${esc(e.message)}</p><p style="margin-top:20px"><a class="btn btn-primary" href="/">Back to the shop</a></p></div></div>`);
    }
    renderChrome();
    if (!routeKeepsScroll) window.scrollTo(0, 0);
    routeKeepsScroll = false;
    setTimeout(syncScrollLogos, 60); // newly rendered wordmarks animate open
    return;
  }
  setApp('<div class="container"><div class="empty" style="padding:120px 0"><h3>Page not found</h3><p style="margin-top:20px"><a class="btn btn-primary" href="/">Back to the shop</a></p></div></div>');
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
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { openMenu(false); closeAppModal(); $('#searchbar').classList.remove('open'); } });
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(err => console.warn('Service worker not registered:', err.message)); });
}
window.addEventListener('popstate', route);
window.addEventListener('hashchange', () => {
  if (!location.hash.startsWith('#/')) return;
  history.replaceState(null, '', legacyPath(location.hash.slice(1)));
  route();
});
// Same-site links are handled in the page instead of reloading it
document.addEventListener('click', ev => {
  if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  const a = ev.target.closest('a[href]');
  if (!a || a.dataset.act || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
  const href = a.getAttribute('href');
  if (!href.startsWith('/') || href.startsWith('//')) return;
  const url = new URL(href, location.href);
  if (/^\/(api|admin|logistics|uploads|webhooks)(\/|$)/.test(url.pathname) || /\.[a-z0-9]+$/i.test(url.pathname)) return;
  ev.preventDefault();
  go(url.pathname + url.search);
});

(async function boot() {
  try { await loadCatalog(); }
  catch (e) { $('#app').innerHTML = `<div class="container"><div class="empty" style="padding:120px 0"><h3>Something went wrong</h3><p>${esc(e.message)}</p></div></div>`; return; }
  cart.save();
  if (location.hash.startsWith('#/')) history.replaceState(null, '', legacyPath(location.hash.slice(1)) + (location.hash.includes('?') ? '' : location.search));
  const back = new URLSearchParams(location.search).get('order');
  if (back && /^AUT-\d+$/i.test(back)) {
    returnedOrder = back.toUpperCase();
    returnedFailed = new URLSearchParams(location.search).get('failed') === '1';
  }
  await route();
  if (returnedOrder) watchReturnedOrder();
  // open the wordmark shortly after the site loads, so the split is seen
  setTimeout(() => { logosReady = true; syncScrollLogos(); }, 500);
})();
})();
