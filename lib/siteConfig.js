// Site editor settings: what the storefront shows, which customer features are
// on, and what the logistics login is allowed to do. Stored in data/site.json;
// anything missing falls back to DEFAULTS, so older installs keep working.

const store = require('./store');
const { BUSINESS, POLICIES, BUSINESS_MODEL, JOURNEY } = require('./siteContent');

const DEFAULTS = {
  content: {
    announcement: 'Cash on delivery available across Pakistan',
    heroEyebrow: 'Premium car care',
    heroTitle: 'Shine worthy of a durbar.',
    heroText: 'Waxes, tyre gels, cleaners and engine care from the brands detailers trust, delivered across Pakistan.',
    heroButton: 'Shop all products',
    brands: ['Gladiator', 'Sogo', 'Prato', 'WTB'],
    trust: [
      { title: 'Cash on delivery', text: 'Pay when your order arrives' },
      { title: 'Delivery across Pakistan', text: 'To your door, wherever you are' },
      { title: 'Genuine brands', text: 'Gladiator, Sogo, Prato and WTB' }
    ],
    bestsellersTitle: 'Bestsellers',
    bestsellersText: 'The flagship Gladiator line and more.',
    bestsellersCount: 8,
    panelTitle: 'A showroom finish, at home.',
    panelText: 'Everything here is chosen to make your car look its best and keep it that way, inside and out.',
    panelPoints: ['Exterior, interior and engine care in one place', 'Bundles that save you money every month', 'Order online and pay cash on delivery'],
    aboutTitle: 'Why we started Autique',
    aboutStory: [
      'It started on a Sunday morning, with a bucket, a borrowed hose and a car that deserved better. We loved our cars, but looking after them felt like a gamble: dusty shelves, faded labels, and no one who could tell you which wax would survive a Lahore summer or which cleaner was safe on leather.',
      'So we started asking the people who knew. Detailers, workshop owners, the uncle down the street whose 30-year-old sedan still turned heads. The same few names kept coming up: Gladiator, Sogo, Prato, WTB. Good products existed; they were just hard to find, easy to fake, and sold without care.',
      'We wanted a place that treated car care the way a boutique treats fashion: a small, trusted collection, chosen by people who actually use it, and explained in plain words. An auto boutique. Say it fast enough and you get Autique.',
      "Today we pick every product ourselves, keep our range deliberately small, and deliver across Pakistan with cash on delivery, because trust should come before payment. Whether it's a daily driver or a weekend pride and joy, we want your car to have a shine worthy of a durbar."
    ].join('\n\n'),
    aboutPoints: [
      { title: 'Chosen, not stocked.', text: "If we wouldn't use it on our own cars, we don't sell it." },
      { title: 'Genuine only.', text: 'Sourced from the brands and their trusted suppliers.' },
      { title: 'Honest help.', text: "Ask us what to use and we'll tell you, even if it's the cheaper bottle." }
    ],
    footerTagline: 'Premium car care for the discerning driver. Shine worthy of a durbar.',
    footerHelp: ['Cash on delivery across Pakistan', 'Secure card payments by Rapid Gateway'],
    // business and contact details shown in the footer, Contact page and policies
    business: { ...BUSINESS },
    policies: { ...POLICIES },
    businessModel: BUSINESS_MODEL,
    journey: JOURNEY.map(j => ({ ...j })),
    // photos of inventory, packaging and the business setup (uploaded in the Site editor)
    gallery: []
  },
  // which parts of the storefront appear
  sections: {
    logoBanner: true, trustStrip: true, collections: true, bundles: true,
    bestsellers: true, brandPanel: true, aboutPage: true
  },
  // what customers are allowed to do
  customers: {
    allowSignup: true, allowGoogle: true, allowEmailChange: true,
    allowOrderTracking: true, cashOnDelivery: true, payOnline: true
  },
  // what the logistics login may see and do (admins can always do everything)
  logistics: {
    viewOrders: true, dispatch: true, restock: true, viewHistory: true,
    seeCustomerContact: true, seeCodAmount: true
  }
};

const LIMITS = { short: 120, medium: 300, long: 6000 };
const TEXT_LIMIT = {
  announcement: LIMITS.medium, heroEyebrow: LIMITS.short, heroTitle: LIMITS.short, heroText: LIMITS.medium,
  heroButton: 40, bestsellersTitle: LIMITS.short, bestsellersText: LIMITS.medium, panelTitle: LIMITS.short,
  panelText: LIMITS.medium, aboutTitle: LIMITS.short, aboutStory: LIMITS.long, footerTagline: LIMITS.medium
};

const clean = (v, max) => String(v == null ? '' : v).replace(/\s+$/g, '').slice(0, max);
const cleanList = (list, max, count) => (Array.isArray(list) ? list : []).map(x => clean(x, max).trim()).filter(Boolean).slice(0, count);
const cleanPairs = (list, count) => (Array.isArray(list) ? list : []).slice(0, count)
  .map(x => ({ title: clean(x && x.title, LIMITS.short).trim(), text: clean(x && x.text, LIMITS.medium).trim() }));

function merge(saved) {
  const s = saved || {};
  const c = s.content || {};
  return {
    content: {
      ...DEFAULTS.content, ...c,
      business: { ...DEFAULTS.content.business, ...(c.business || {}) },
      policies: { ...DEFAULTS.content.policies, ...(c.policies || {}) }
    },
    sections: { ...DEFAULTS.sections, ...(s.sections || {}) },
    customers: { ...DEFAULTS.customers, ...(s.customers || {}) },
    logistics: { ...DEFAULTS.logistics, ...(s.logistics || {}) }
  };
}

// The business email changed from ateeb@ to info@autique.pk; update any copy of
// the old address saved from the Site editor (contact details and policy texts).
const OLD_EMAIL = /ateeb@autique\.pk/gi;
function migrate(saved) {
  if (!saved) return saved;
  return JSON.parse(JSON.stringify(saved).replace(OLD_EMAIL, 'info@autique.pk'));
}

function get() { return merge(migrate(store.getSite())); }

// Validate an edited config from the admin form. Returns { site } or { error }.
function sanitize(body) {
  const b = merge(body);
  const c = b.content, d = DEFAULTS.content;
  const content = {};
  for (const [key, max] of Object.entries(TEXT_LIMIT)) content[key] = clean(c[key], max).trim();
  for (const key of ['heroTitle', 'heroButton', 'aboutTitle']) if (!content[key]) content[key] = d[key];
  content.brands = cleanList(c.brands, 40, 8);
  content.trust = cleanPairs(c.trust, 3);
  while (content.trust.length < 3) content.trust.push({ title: '', text: '' });
  content.panelPoints = cleanList(c.panelPoints, LIMITS.short, 5);
  content.aboutPoints = cleanPairs(c.aboutPoints, 5).filter(p => p.title || p.text);
  content.footerHelp = cleanList(c.footerHelp, LIMITS.short, 5);
  content.bestsellersCount = Math.max(1, Math.min(24, Math.floor(Number(c.bestsellersCount)) || d.bestsellersCount));

  content.business = {};
  for (const key of Object.keys(d.business)) content.business[key] = clean(c.business[key], LIMITS.short).trim();
  if (content.business.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content.business.email)) return { error: 'Enter a valid contact email.' };
  if (content.business.phone && !/^\+?[\d\s()-]{7,20}$/.test(content.business.phone)) return { error: 'Enter a valid contact number, like 0321 1234567.' };
  content.policies = {};
  for (const key of Object.keys(d.policies)) content.policies[key] = clean(c.policies[key], 20000).trim() || d.policies[key];
  content.businessModel = clean(c.businessModel, 12000).trim() || d.businessModel;
  content.journey = cleanPairs(c.journey, 12).filter(j => j.title || j.text);
  if (!content.journey.length) content.journey = d.journey.map(j => ({ ...j }));
  content.gallery = (Array.isArray(c.gallery) ? c.gallery : []).slice(0, 24)
    .map(g => ({ src: clean(g && g.src, 500).trim(), caption: clean(g && g.caption, LIMITS.short).trim() }))
    .filter(g => /^\/uploads\/[\w.-]+$/.test(g.src) || /^https:\/\/[^\s"'<>]+$/.test(g.src));

  const bools = group => Object.fromEntries(Object.keys(DEFAULTS[group]).map(k => [k, b[group][k] === true]));
  const site = { content, sections: bools('sections'), customers: bools('customers'), logistics: bools('logistics') };

  if (!site.customers.cashOnDelivery && !site.customers.payOnline) {
    return { error: 'Keep at least one payment option (cash on delivery or pay online) switched on.' };
  }
  // dispatching needs the orders list
  if (!site.logistics.viewOrders) site.logistics.dispatch = false;
  return { site };
}

function save(body) {
  const result = sanitize(body);
  if (result.site) store.saveSite(result.site);
  return result;
}

module.exports = { DEFAULTS, get, save };
