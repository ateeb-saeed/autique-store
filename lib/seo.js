// Search-engine pages: server-rendered HTML for the storefront's real URLs, with a
// per-page <title>, meta description, canonical link, Open Graph / Twitter tags and
// JSON-LD, plus the sitemap and robots.txt. The browser app (public/app.js) then
// takes over exactly as before; this only fills the first response so it is
// readable without JavaScript.
//
// SITE_URL is the one canonical address (default https://autique.pk).

const fs = require('fs');
const path = require('path');

const SITE_URL = (process.env.SITE_URL || 'https://autique.pk').replace(/\/+$/, '');
const BRANDS = ['Gladiator', 'Sogo', 'Prato', 'WTB'];
const INDEX_FILE = path.join(__dirname, '..', 'public', 'index.html');
const DATA_DIR = path.join(__dirname, '..', 'data');
const LOGO_IMAGE = '/icons/icon-512.png';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => 'Rs. ' + Math.round(Number(n) || 0).toLocaleString('en-US');
const abs = p => /^https?:\/\//.test(p) ? p : SITE_URL + (p.startsWith('/') ? p : '/' + p);
const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const productPath = p => `/product/${p.id}-${slug(p.name)}`;
const categoryPath = key => `/category/${key}`;
const brandOf = name => BRANDS.find(b => String(name || '').toLowerCase().startsWith(b.toLowerCase())) || '';
// Cut text at a word boundary so it fits (titles < 60, descriptions < 160)
function clip(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length < max) return t;
  const cut = t.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[\s,.;:–-]+$/, '') + '…';
}

// ---------- the page template (public/index.html), re-read when it changes ----------
let tpl = { mtime: 0, html: '' };
function template() {
  const mtime = fs.statSync(INDEX_FILE).mtimeMs;
  if (mtime !== tpl.mtime) tpl = { mtime, html: fs.readFileSync(INDEX_FILE, 'utf8') };
  return tpl.html;
}

const BOTTLE = `<svg viewBox="0 0 48 48" fill="none" stroke="#0f1b2b" stroke-width="1.4" aria-hidden="true"><rect x="17" y="4" width="14" height="7" rx="1.5"/><path d="M19 11 L16 17 L16 41 Q16 44 19 44 H29 Q32 44 32 41 V17 L29 11"/><line x1="16" y1="24" x2="32" y2="24"/></svg>`;
const img = (src, alt, eager) => src
  ? `<img src="${esc(src)}" alt="${esc(alt)}" width="800" height="800"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`
  : BOTTLE;
const priceHTML = (price, was, from) => `<div class="price">${from ? '<small class="muted" style="font-weight:400">From </small>' : ''}<span>${fmt(price)}</span>${was ? `<s>${fmt(was)}</s>` : ''}</div>`;
const cardHTML = (p, catTitle, eager) => `<a class="card" href="${productPath(p)}"><div class="card-img">${img(p.image, `${p.name} – Autique`, eager)}</div>
  <div class="card-body"><div class="card-cat">${esc(catTitle)}</div><h3>${esc(p.name)}</h3>${priceHTML(p.price, p.originalPrice, p.hasVariants && p.variants.length > 1)}</div></a>`;
// eager = how many of the first images load straight away (the first row on a listing page)
const gridHTML = (list, catTitle, eager = 0) => `<div class="grid">${list.map((p, i) => cardHTML(p, catTitle(p), i < eager)).join('')}</div>`;
const crumbs = items => `<nav class="crumbs" aria-label="Breadcrumb">${items.map(([href, label], i) => i === items.length - 1 ? `<span>${esc(label)}</span>` : `<a href="${href}">${esc(label)}</a>`).join(' / ')}</nav>`;

// ---------- structured data ----------
function orgLD(business) {
  const org = {
    '@type': 'Organization', '@id': SITE_URL + '/#organization', name: 'Autique', url: SITE_URL + '/',
    logo: abs(LOGO_IMAGE), email: business.email || 'info@autique.pk',
    areaServed: { '@type': 'Country', name: 'Pakistan' }
  };
  if (business.phone) org.telephone = business.phone;
  if (business.address) org.address = { '@type': 'PostalAddress', streetAddress: business.address, addressLocality: 'Lahore', addressRegion: 'Punjab', addressCountry: 'PK' };
  return org;
}
const websiteLD = () => ({
  '@type': 'WebSite', '@id': SITE_URL + '/#website', name: 'Autique', url: SITE_URL + '/',
  publisher: { '@id': SITE_URL + '/#organization' },
  potentialAction: { '@type': 'SearchAction', target: `${SITE_URL}/shop?q={search_term_string}`, 'query-input': 'required name=search_term_string' }
});
const breadcrumbLD = items => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([href, name], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(href) }))
});
function productLD(p, raw, catTitle) {
  const stockOf = x => Number(x && x.stock) || 0;
  const inStock = raw && ((raw.variants || []).filter(v => v.active !== false).some(v => stockOf(v) > 0) || stockOf(raw) > 0);
  const availability = inStock ? 'https://schema.org/InStock' : 'https://schema.org/BackOrder';
  const url = abs(productPath(p));
  const prices = p.hasVariants ? p.variants.map(v => v.price) : [p.price];
  const low = Math.min(...prices), high = Math.max(...prices);
  const offers = prices.length > 1 && low !== high
    ? { '@type': 'AggregateOffer', priceCurrency: 'PKR', lowPrice: low, highPrice: high, offerCount: prices.length, availability, url }
    : { '@type': 'Offer', priceCurrency: 'PKR', price: low, availability, url, itemCondition: 'https://schema.org/NewCondition', seller: { '@id': SITE_URL + '/#organization' } };
  const ld = { '@type': 'Product', name: p.name, description: p.desc, url, category: catTitle, offers };
  if (p.sku) ld.sku = p.sku;
  const images = (p.images && p.images.length ? p.images : p.image ? [p.image] : []).map(abs);
  if (images.length) ld.image = images;
  const brand = brandOf(p.name);
  if (brand) ld.brand = { '@type': 'Brand', name: brand };
  return ld;
}

// ---------- head + body injection ----------
function render(page, business) {
  const title = clip(page.title, 60);
  const description = clip(page.description, 160);
  const canonical = page.canonical ? abs(page.canonical) : '';
  const image = abs(page.image || LOGO_IMAGE);
  const graph = [orgLD(business), websiteLD(), ...(page.ld || [])];
  const head = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    page.noindex ? '<meta name="robots" content="noindex">' : '',
    canonical ? `<link rel="canonical" href="${esc(canonical)}">` : '',
    `<meta property="og:site_name" content="Autique">`,
    `<meta property="og:type" content="${page.ogType || 'website'}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    canonical ? `<meta property="og:url" content="${esc(canonical)}">` : '',
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:image:alt" content="${esc(page.imageAlt || 'Autique car care')}">`,
    `<meta property="og:locale" content="en_PK">`,
    `<meta name="twitter:card" content="${page.image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
    `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>`
  ].filter(Boolean).join('\n');
  let html = template()
    .replace(/<title>[\s\S]*?<\/title>\s*<meta name="description"[^>]*>/, head)
    .replace(/<main id="app">[\s\S]*?<\/main>/, `<main id="app">${page.body || '<div class="spinner" aria-label="Loading"></div>'}</main>`)
    .replace('<footer id="footer"></footer>', `<footer id="footer">${page.footer || ''}</footer>`);
  return html;
}

module.exports = {
  SITE_URL, BRANDS, DATA_DIR, esc, fmt, abs, slug, clip, productPath, categoryPath, brandOf,
  img, cardHTML, gridHTML, priceHTML, crumbs, breadcrumbLD, productLD, render
};
