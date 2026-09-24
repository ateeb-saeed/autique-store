// Every collection in this store (users, products, coupons, bundles,
// orders, settings, admin password) lives in a plain JSON file under
// /data. No database engine, no native modules — just files, so it
// keeps working on machines that can't install a compiler.

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  categories: path.join(DATA_DIR, 'categories.json'),
  products: path.join(DATA_DIR, 'products.json'),
  coupons: path.join(DATA_DIR, 'coupons.json'),
  bundles: path.join(DATA_DIR, 'bundles.json'),
  orders: path.join(DATA_DIR, 'orders.json'),
  settings: path.join(DATA_DIR, 'settings.json'),
  admin: path.join(DATA_DIR, 'admin.json')
};

const DEFAULT_ADMIN_PASSWORD = 'autique-admin';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function nextId(list) {
  return list.length ? Math.max(...list.map(x => x.id)) + 1 : 1;
}

function autoSku(name, id) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase();
  return `${initials}-${id}`;
}

// ---------- First-run seeding ----------
function seed() {
  ensureDataDir();

  if (!fs.existsSync(FILES.users)) writeJSON(FILES.users, []);
  if (!fs.existsSync(FILES.coupons)) writeJSON(FILES.coupons, []);
  if (!fs.existsSync(FILES.bundles)) writeJSON(FILES.bundles, []);
  if (!fs.existsSync(FILES.orders)) writeJSON(FILES.orders, []);

  if (!fs.existsSync(FILES.settings)) {
    writeJSON(FILES.settings, {
      saleActive: false,
      saleLabel: '',
      saleDiscountPercent: 0,
      saleAppliesTo: 'all' // 'all' or a category key
    });
  }

  if (!fs.existsSync(FILES.admin)) {
    writeJSON(FILES.admin, {
      password_hash: bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10)
    });
    console.log(`\nAdmin panel created. Sign in at /admin with this password: ${DEFAULT_ADMIN_PASSWORD}`);
    console.log('Change it from inside the admin panel once you sign in.\n');
  }

  if (!fs.existsSync(FILES.categories) || !fs.existsSync(FILES.products)) {
    // Seed from the original product catalog, the first time only.
    const { categories: rawCategories } = require('../products');
    const categories = rawCategories.map(c => ({
      key: c.key,
      title: c.title,
      tagline: c.tagline
    }));
    const products = rawCategories.flatMap(c =>
      c.products.map(p => ({
        id: p.id,
        name: p.name,
        price: p.price,
        desc: p.desc,
        categoryKey: c.key,
        active: true,
        sku: autoSku(p.name, p.id),
        image: '',
        variants: []
      }))
    );
    writeJSON(FILES.categories, categories);
    writeJSON(FILES.products, products);
  }
}

// ---------- Generic collection access ----------
const store = {
  seed,
  DEFAULT_ADMIN_PASSWORD,
  autoSku,

  getUsers: () => readJSON(FILES.users, []),
  saveUsers: (list) => writeJSON(FILES.users, list),

  getCategories: () => readJSON(FILES.categories, []),
  saveCategories: (list) => writeJSON(FILES.categories, list),

  getProducts: () => readJSON(FILES.products, []),
  saveProducts: (list) => writeJSON(FILES.products, list),

  getCoupons: () => readJSON(FILES.coupons, []),
  saveCoupons: (list) => writeJSON(FILES.coupons, list),

  getBundles: () => readJSON(FILES.bundles, []),
  saveBundles: (list) => writeJSON(FILES.bundles, list),

  getOrders: () => readJSON(FILES.orders, []),
  saveOrders: (list) => writeJSON(FILES.orders, list),

  getSettings: () => readJSON(FILES.settings, {
    saleActive: false, saleLabel: '', saleDiscountPercent: 0, saleAppliesTo: 'all'
  }),
  saveSettings: (obj) => writeJSON(FILES.settings, obj),

  getAdmin: () => readJSON(FILES.admin, null),
  saveAdmin: (obj) => writeJSON(FILES.admin, obj),

  nextId
};

module.exports = store;
