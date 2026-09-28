// Storefront page routes. Each one sends public/index.html with real content for
// search engines and no-JavaScript visitors already inside <main> and <footer>;
// app.js then renders the interactive page over it. Also /sitemap.xml and /robots.txt.

const fs = require('fs');
const path = require('path');
const store = require('./store');
const site = require('./siteConfig');
const seo = require('./seo');

const { esc, fmt, clip, productPath, categoryPath, crumbs, img } = seo;

const POLICY_PAGES = { refund: 'Refund & Returns Policy', shipping: 'Shipping Policy', privacy: 'Privacy Policy', terms: 'Terms & Conditions' };
// Pages only for the customer themselves: kept out of search results
const PRIVATE = { '/cart': 'Your Bag', '/checkout': 'Checkout', '/account': 'My Account', '/track': 'Track Your Order', '/login': 'Sign In', '/register': 'Create an Account' };

// "## Heading", "### Sub", "- bullet", **bold**; blank line = new paragraph (same rules as the app)
function md(text) {
  const inline = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const out = [];
  for (const block of String(text || '').split(/\n\s*\n/)) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (lines.every(l => l.startsWith('- '))) { out.push(`<ul>${lines.map(l => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`); continue; }
    for (const l of lines) {
      if (l.startsWith('### ')) out.push(`<h3>${inline(l.slice(4))}</h3>`);
      else if (l.startsWith('## ')) out.push(`<h2>${inline(l.slice(3))}</h2>`);
      else if (l.startsWith('- ')) out.push(`<ul><li>${inline(l.slice(2))}</li></ul>`);
      else out.push(`<p>${inline(l)}</p>`);
    }
  }
  return out.join('');
}

const mtimeOf = (...files) => {
  const times = files.map(f => { try { return fs.statSync(path.join(seo.DATA_DIR, f)).mtime; } catch { return null; } }).filter(Boolean);
  return (times.length ? new Date(Math.max(...times)) : new Date()).toISOString().slice(0, 10);
};

module.exports = function mountPages(app, { publicCatalog, publicBundles }) {
  function data() {
    const { categories } = publicCatalog();
    const products = categories.flatMap(c => c.products.map(p => ({ ...p, categoryKey: c.key, categoryTitle: c.title })));
    return { categories, products, bundles: publicBundles(), cfg: site.get() };
  }
  const catTitle = p => p.categoryTitle;

  function footerHTML(cfg, categories) {
    const b = cfg.content.business;
    return `<div class="container"><div class="foot">
      <div><a class="foot-logo" href="/"><img src="/icons/car-mark.png" alt="" class="foot-car" width="480" height="115" loading="lazy"><img src="/logo.png" alt="Autique" width="142" height="44" loading="lazy"></a>
        <p style="margin-top:14px;max-width:34ch">Autique car care. ${esc(cfg.content.footerTagline)}</p>
        <address class="foot-contact">${b.email ? `<a href="mailto:${esc(b.email)}"><b>Email:</b> ${esc(b.email)}</a>` : ''}${b.phone ? `<p><b>Phone:</b> ${esc(b.phone)}</p>` : ''}${b.address ? `<p><b>Address:</b> ${esc(b.address)}</p>` : ''}${b.hours ? `<p><b>Hours:</b> ${esc(b.hours)}</p>` : ''}</address></div>
      <div><h4>Shop</h4>${categories.map(c => `<a href="${categoryPath(c.key)}">${esc(c.title)}</a>`).join('')}<a href="/shop">All products</a><a href="/bundles">Bundles</a></div>
      <div><h4>Customer care</h4><a href="/how-it-works">How Autique works</a><a href="/track">Track your order</a><a href="/contact">Contact us</a><a href="/about">About Autique</a></div>
      <div><h4>Policies</h4>${Object.entries(POLICY_PAGES).map(([k, t]) => `<a href="/policies/${k}">${t}</a>`).join('')}</div>
    </div><div class="foot-bottom">&copy; ${new Date().getFullYear()} ${esc(b.tradingName || 'Autique')}${b.address ? ` &middot; ${esc(b.address)}` : ''}. All rights reserved.</div></div>`;
  }

  function send(res, d, page, status = 200) {
    if (page.noindex) res.set('X-Robots-Tag', 'noindex');
    res.status(status).set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
      .send(seo.render({ ...page, footer: footerHTML(d.cfg, d.categories) }, d.cfg.content.business));
  }
  const notFound = (res, d, what = 'Page') => send(res, d, {
    title: `${what} Not Found | Autique`, description: 'This page does not exist on Autique.', noindex: true,
    body: `<div class="container"><div class="empty" style="padding:100px 0"><h1>${esc(what)} not found</h1><p>It may have been removed or the link is wrong.</p><p style="margin-top:20px"><a class="btn btn-primary" href="/">Back to the Autique shop</a> <a class="btn btn-outline" href="/shop">All products</a></p></div></div>`
  }, 404);
  const shell = (h1, text) => `<div class="container"><div class="page-head"><h1>${esc(h1)}</h1>${text ? `<p>${esc(text)}</p>` : ''}</div><noscript><p class="muted">This page needs JavaScript. You can still <a class="link" href="/shop">browse all products</a>.</p></noscript><div class="spinner" aria-label="Loading"></div></div>`;

  // HOME
  app.get('/', (req, res) => {
    const d = data(), c = d.cfg.content, on = d.cfg.sections;
    const brands = c.brands.map(b => ({ b, n: d.products.filter(p => seo.brandOf(p.name) === b || p.name.toLowerCase().startsWith(b.toLowerCase())).length })).filter(x => x.n);
    send(res, d, {
      title: 'Autique | Car Care in Pakistan: Gladiator, Sogo, Prato, WTB',
      description: `${c.heroText} ${c.announcement}.`.replace(/\.\.$/, '.'),
      canonical: '/',
      body: `<div class="container">
        <section class="page-head"><h1>Autique – premium car care in Pakistan</h1><p>${esc(c.heroText)}</p></section>
        <section class="section"><div class="section-head"><h2>Shop by category</h2></div>
          <ul class="ssr-list">${d.categories.map(cat => `<li><a href="${categoryPath(cat.key)}"><b>${esc(cat.title)}</b></a> – ${esc(cat.tagline)} (${cat.products.length} ${cat.products.length === 1 ? 'product' : 'products'})</li>`).join('')}</ul></section>
        ${d.categories.map(cat => `<section class="section"><div class="section-head"><div><h2><a href="${categoryPath(cat.key)}">${esc(cat.title)}</a></h2><p>${esc(cat.tagline)}</p></div><a class="link" href="${categoryPath(cat.key)}">View all ${cat.products.length}</a></div>
          ${seo.gridHTML(d.products.filter(p => p.categoryKey === cat.key).slice(0, 8), catTitle)}</section>`).join('')}
        ${on.bundles && d.bundles.length ? `<section class="section"><div class="section-head"><h2><a href="/bundles">This month's bundles</a></h2></div><ul class="ssr-list">${d.bundles.map(b => `<li><b>${esc(b.title)}</b>: ${b.items.map(i => esc(i.name)).join(' + ')}, ${fmt(b.bundlePrice)}</li>`).join('')}</ul></section>` : ''}
        ${brands.length ? `<section class="section"><div class="section-head"><h2>Top brands</h2></div><ul class="ssr-list">${brands.map(x => `<li><a href="/shop?brand=${encodeURIComponent(x.b)}">${esc(x.b)}</a> (${x.n} products)</li>`).join('')}</ul></section>` : ''}
      </div>`
    });
  });

  // SHOP (all products; filters and search are handled in the browser)
  app.get('/shop', (req, res) => {
    const d = data();
    send(res, d, {
      title: 'Shop All Car Care Products | Autique',
      description: 'Car care from Gladiator, Prato, Sogo and WTB: cleaning, shining, polishing and engine care. Cash on delivery across Pakistan.',
      canonical: '/shop',
      ld: [seo.breadcrumbLD([['/', 'Home'], ['/shop', 'Shop']])],
      body: `<div class="container">${crumbs([['/', 'Home'], ['/shop', 'Shop']])}<div class="page-head"><h1>Shop all</h1><p>Car care from Gladiator, Prato, Sogo and WTB: cleaning, shining, polishing and engine care.</p></div>
        <div class="cat-pills">${d.categories.map(c => `<a class="pill" href="${categoryPath(c.key)}">${esc(c.title)}</a>`).join('')}</div>
        ${seo.gridHTML(d.products, catTitle, 4)}</div>`
    });
  });
  app.get('/shop/:key', (req, res) => res.redirect(301, categoryPath(req.params.key) + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')));

  // CATEGORY
  app.get('/category/:key', (req, res) => {
    const d = data();
    const cat = d.categories.find(c => c.key === req.params.key);
    if (!cat) return notFound(res, d, 'Category');
    const list = d.products.filter(p => p.categoryKey === cat.key);
    const trail = [['/', 'Home'], ['/shop', 'Shop'], [categoryPath(cat.key), cat.title]];
    send(res, d, {
      title: `${cat.title} | Car Care | Autique`,
      description: cat.tagline,
      canonical: categoryPath(cat.key),
      image: (list.find(p => p.image) || {}).image,
      imageAlt: `${cat.title} – Autique`,
      ld: [seo.breadcrumbLD(trail)],
      body: `<div class="container">${crumbs(trail)}<div class="page-head"><h1>${esc(cat.title)}</h1><p>${esc(cat.tagline)}</p></div>
        ${seo.gridHTML(list, catTitle, 4)}
        <section class="section"><div class="section-head"><h2>More categories</h2></div><div class="cat-pills">${d.categories.filter(c => c.key !== cat.key).map(c => `<a class="pill" href="${categoryPath(c.key)}">${esc(c.title)}</a>`).join('')}</div></section></div>`
    });
  });

  // PRODUCT: /product/<id>-<slug>; a missing or wrong slug redirects to the right one
  app.get('/product/:ref', (req, res) => {
    const d = data();
    const m = /^(\d+)(?:-[\w-]*)?$/.exec(req.params.ref);
    const p = m && d.products.find(x => x.id === Number(m[1]));
    if (!p) return notFound(res, d, 'Product');
    const canonical = productPath(p);
    if (req.path !== canonical) return res.redirect(301, canonical + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''));
    const raw = store.getProducts().find(x => x.id === p.id);
    const many = p.hasVariants && p.variants.length > 1 && new Set(p.variants.map(v => v.price)).size > 1;
    const priceText = `${many ? 'from ' : ''}${fmt(p.price)}`;
    const suffix = ` - ${priceText} | Autique`;
    const trail = [['/', 'Home'], ['/shop', 'Shop'], [categoryPath(p.categoryKey), p.categoryTitle], [canonical, p.name]];
    const related = d.products.filter(x => x.categoryKey === p.categoryKey && x.id !== p.id).slice(0, 4);
    send(res, d, {
      title: clip(p.name, 60 - suffix.length) + suffix,
      description: p.desc,
      canonical,
      image: p.image,
      imageAlt: `${p.name} – Autique`,
      ogType: 'product',
      ld: [seo.productLD(p, raw, p.categoryTitle), seo.breadcrumbLD(trail)],
      body: `<div class="container">${crumbs(trail)}
        <div class="pdp"><div class="pdp-gallery"><div class="main-img">${img(p.image, `${p.name} – Autique`, true)}</div></div>
        <div><h1>${esc(p.name)}</h1>${seo.priceHTML(p.price, p.originalPrice, many)}<div class="sku-line">SKU: ${esc(p.sku || '—')}</div>
          <p class="desc">${esc(p.desc)}</p>
          <table class="vtable spec-table"><tbody>
            ${seo.brandOf(p.name) ? `<tr><th>Brand</th><td>${esc(seo.brandOf(p.name))}</td></tr>` : ''}
            <tr><th>Category</th><td><a class="link" href="${categoryPath(p.categoryKey)}">${esc(p.categoryTitle)}</a></td></tr>
            ${p.size ? `<tr><th>Size</th><td>${esc(p.size)}</td></tr>` : ''}
            <tr><th>Price</th><td>${many ? `From ${fmt(p.price)}` : fmt(p.price)} (PKR)</td></tr>
          </tbody></table>
          ${p.hasVariants ? `<h2 style="font-size:1.1rem;margin-top:22px">Variants and SKUs</h2><table class="vtable"><thead><tr><th>Variant</th><th>SKU</th><th>Price</th></tr></thead><tbody>${p.variants.map(v => `<tr><td>${esc([v.color, v.size].filter(Boolean).join(' / ') || 'Standard')}</td><td class="sku">${esc(v.sku || '—')}</td><td>${fmt(v.price)}</td></tr>`).join('')}</tbody></table>` : ''}
          ${p.usage ? `<h2 style="font-size:1.1rem;margin-top:22px">How to use</h2>${md(p.usage)}` : ''}
          <p class="muted" style="margin-top:18px">Delivered across Pakistan by PostEx (Call Courier). Cash on delivery available. <a class="link" href="/policies/shipping">Shipping Policy</a> · <a class="link" href="/policies/refund">Refund & Returns Policy</a></p>
        </div></div>
        ${related.length ? `<section class="section"><div class="section-head"><h2>You may also like</h2></div>${seo.gridHTML(related, catTitle)}</section>` : ''}</div>`
    });
  });

  // BUNDLES
  app.get('/bundles', (req, res) => {
    const d = data(), list = d.cfg.sections.bundles ? d.bundles : [];
    send(res, d, {
      title: 'Car Care Bundles | Autique',
      description: 'Save more when you pair products together. Car care bundles from Autique, delivered across Pakistan.',
      canonical: '/bundles',
      ld: [seo.breadcrumbLD([['/', 'Home'], ['/bundles', 'Bundles']])],
      body: `<div class="container"><div class="page-head"><h1>Bundles</h1><p>Save more when you pair products together.</p></div>
        ${list.length ? `<div class="bundles">${list.map(b => `<div class="bundle"><h2 style="font-size:1.15rem">${esc(b.title)}</h2>${b.desc ? `<p class="muted">${esc(b.desc)}</p>` : ''}
          <ul>${b.items.map(i => { const p = d.products.find(x => x.id === i.id); return `<li>${p ? `<a href="${productPath(p)}">${esc(i.name)}</a>` : esc(i.name)}</li>`; }).join('')}</ul>
          ${seo.priceHTML(b.bundlePrice, b.individualTotal > b.bundlePrice ? b.individualTotal : null)}</div>`).join('')}</div>`
          : '<div class="empty"><h2>No bundles right now</h2><p>Check back soon.</p></div>'}</div>`
    });
  });

  // ABOUT
  app.get('/about', (req, res) => {
    const d = data(), c = d.cfg.content;
    const paras = String(c.aboutStory || '').split(/\n\s*\n/).map(t => t.trim()).filter(Boolean);
    send(res, d, {
      title: 'About Autique | Car Care from Lahore',
      description: paras[0] || c.heroText,
      canonical: '/about',
      noindex: !d.cfg.sections.aboutPage,
      body: `<div class="container"><div class="about-story"><h1>${esc(c.aboutTitle)}</h1>${paras.map(t => `<p>${esc(t)}</p>`).join('')}
        ${c.aboutPoints.length ? `<ul class="ssr-list">${c.aboutPoints.map(pt => `<li><b>${esc(pt.title)}</b> ${esc(pt.text)}</li>`).join('')}</ul>` : ''}</div></div>`
    });
  });

  // POLICIES, CONTACT, HOW IT WORKS (text from the Site editor)
  app.get('/policies/:key', (req, res) => {
    const d = data(), title = POLICY_PAGES[req.params.key];
    if (!title) return notFound(res, d);
    const text = d.cfg.content.policies[req.params.key];
    send(res, d, {
      title: `${title} | Autique`,
      description: `${title} for orders from Autique (autique.pk), delivered across Pakistan.`,
      canonical: `/policies/${req.params.key}`,
      body: `<div class="container"><article class="doc-page"><div class="page-head"><h1>${esc(title)}</h1></div><div class="doc">${md(text)}</div></article></div>`
    });
  });
  app.get('/contact', (req, res) => {
    const d = data(), b = d.cfg.content.business;
    send(res, d, {
      title: 'Contact Autique | Car Care in Pakistan',
      description: `Contact Autique: ${[b.email, b.phone, b.address].filter(Boolean).join(', ')}. ${b.hours || ''}`,
      canonical: '/contact',
      body: `<div class="container"><div class="page-head"><h1>Contact Autique</h1></div><ul class="ssr-list">
        ${b.email ? `<li><b>Email:</b> <a href="mailto:${esc(b.email)}">${esc(b.email)}</a></li>` : ''}${b.phone ? `<li><b>Phone:</b> ${esc(b.phone)}</li>` : ''}
        ${b.address ? `<li><b>Address:</b> ${esc(b.address)}, ${esc(b.city)}</li>` : ''}${b.hours ? `<li><b>Hours:</b> ${esc(b.hours)}</li>` : ''}</ul></div>`
    });
  });
  app.get('/how-it-works', (req, res) => {
    const d = data(), c = d.cfg.content;
    send(res, d, {
      title: 'How Autique Works | Ordering and Delivery',
      description: (c.journey || []).map(j => j.title).join(', ') + '.',
      canonical: '/how-it-works',
      body: `<div class="container"><article class="doc-page"><div class="page-head"><h1>How Autique works</h1></div><div class="doc"><ol>${(c.journey || []).map(j => `<li><b>${esc(j.title)}</b>: ${esc(j.text)}</li>`).join('')}</ol>${md(c.businessModel)}</div></article></div>`
    });
  });

  // PRIVATE PAGES: rendered by the app, never indexed
  for (const [p, title] of Object.entries(PRIVATE)) {
    app.get(p, (req, res) => { const d = data(); send(res, d, { title: `${title} | Autique`, description: `${title} at Autique.`, canonical: p, noindex: true, body: shell(title) }); });
  }
  app.get('/order/:n', (req, res) => { const d = data(); send(res, d, { title: 'Your Order | Autique', description: 'Your Autique order.', noindex: true, body: shell('Your order') }); });

  // SITEMAP + ROBOTS
  app.get('/sitemap.xml', (req, res) => {
    const d = data();
    const catalogDate = mtimeOf('products.json', 'categories.json', 'settings.json');
    const urls = [['/', mtimeOf('products.json', 'categories.json', 'settings.json', 'site.json', 'bundles.json'), '1.0']];
    d.categories.forEach(c => urls.push([categoryPath(c.key), catalogDate, '0.8']));
    d.products.forEach(p => urls.push([productPath(p), catalogDate, '0.7']));
    if (d.cfg.sections.bundles && d.bundles.length) urls.push(['/bundles', mtimeOf('bundles.json', 'products.json'), '0.6']);
    if (d.cfg.sections.aboutPage) urls.push(['/about', mtimeOf('site.json'), '0.4']);
    res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([loc, lastmod, pr]) => `  <url><loc>${esc(seo.abs(loc))}</loc><lastmod>${lastmod}</lastmod><priority>${pr}</priority></url>`).join('\n')}
</urlset>
`);
  });
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send([
      'User-agent: *',
      'Allow: /',
      ...['/admin.html', '/logistics.html', '/admin/', '/logistics/', '/api/', '/webhooks/', '/cart', '/checkout', '/account', '/track'].map(p => `Disallow: ${p}`),
      '',
      `Sitemap: ${seo.abs('/sitemap.xml')}`,
      ''
    ].join('\n'));
  });

  // Anything else that looks like a page gets a real 404
  app.get('*', (req, res, next) => {
    if (/^\/(api|uploads|webhooks)\//.test(req.path) || /\.[a-z0-9]+$/i.test(req.path) || !req.accepts('html')) return next();
    notFound(res, data());
  });
};
