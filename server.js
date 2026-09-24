const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const store = require('./lib/store');
const { effectivePrice, findCoupon, couponStatus, couponDiscount } = require('./lib/pricing');

store.seed();

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e5)}${ext}`);
  }
});
const upload = multer({ storage: uploadStorage, limits: { fileSize: 5 * 1024 * 1024 } });

function publicUser(u) { return { id: u.id, name: u.name, email: u.email }; }

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'autique-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Admin sign in required.' });
  next();
}
function requireCustomer(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Sign in required.' });
  next();
}

// =========================================================
// Customer accounts
// =========================================================
app.post('/api/signup', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are all required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const cleanEmail = email.toLowerCase().trim();
  const users = store.getUsers();
  if (users.some(u => u.email === cleanEmail)) return res.status(409).json({ error: 'An account with that email already exists.' });

  const newUser = {
    id: store.nextId(users),
    name: name.trim(),
    email: cleanEmail,
    password_hash: bcrypt.hashSync(password, 10),
    created_at: new Date().toISOString()
  };
  users.push(newUser);
  store.saveUsers(users);
  req.session.userId = newUser.id;
  res.json({ user: publicUser(newUser) });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const user = store.getUsers().find(u => u.email === email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Incorrect email or password.' });
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

app.post('/api/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = store.getUsers().find(u => u.id === req.session.userId);
  res.json({ user: user ? publicUser(user) : null });
});

// =========================================================
// Admin auth
// =========================================================
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  const admin = store.getAdmin();
  if (!admin || !password || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Incorrect admin password.' });
  }
  req.session.isAdmin = true;
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => { req.session.isAdmin = false; res.json({ ok: true }); });

app.get('/api/admin/me', (req, res) => { res.json({ isAdmin: !!req.session.isAdmin }); });

app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const admin = store.getAdmin();
  if (!bcrypt.compareSync(currentPassword || '', admin.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }
  store.saveAdmin({ password_hash: bcrypt.hashSync(newPassword, 10) });
  res.json({ ok: true });
});

// =========================================================
// Storefront (public) catalog — includes sale pricing
// =========================================================
app.get('/api/products', (req, res) => {
  const settings = store.getSettings();
  const categories = store.getCategories();
  const products = store.getProducts().filter(p => p.active);

  const result = categories.map(cat => ({
    key: cat.key,
    title: cat.title,
    tagline: cat.tagline,
    products: products
      .filter(p => p.categoryKey === cat.key)
      .map(p => {
        const activeVariants = (p.variants || []).filter(v => v.active !== false);
        if (activeVariants.length > 0) {
          const variants = activeVariants.map(v => {
            const price = effectivePrice({ price: v.price, categoryKey: p.categoryKey }, settings);
            return {
              id: v.id,
              color: v.color || '',
              size: v.size || '',
              price,
              originalPrice: price !== v.price ? v.price : null,
              image: v.image || ''
            };
          });
          const cheapest = variants.reduce((a, b) => (a.price < b.price ? a : b));
          return {
            id: p.id,
            name: p.name,
            desc: p.desc,
            image: p.image || '',
            hasVariants: true,
            variants,
            price: cheapest.price,
            originalPrice: cheapest.originalPrice
          };
        }
        const price = effectivePrice(p, settings);
        return {
          id: p.id,
          name: p.name,
          desc: p.desc,
          image: p.image || '',
          hasVariants: false,
          price,
          originalPrice: price !== p.price ? p.price : null
        };
      })
  })).filter(cat => cat.products.length > 0);

  res.json({ categories: result });
});

app.get('/api/settings', (req, res) => {
  const s = store.getSettings();
  res.json({ saleActive: s.saleActive, saleLabel: s.saleLabel, saleDiscountPercent: s.saleDiscountPercent, saleAppliesTo: s.saleAppliesTo });
});

app.get('/api/bundles', (req, res) => {
  const settings = store.getSettings();
  const products = store.getProducts();
  const bundles = store.getBundles().filter(b => b.active);

  const result = bundles.map(b => {
    const items = b.productIds
      .map(id => products.find(p => p.id === id))
      .filter(Boolean)
      .map(p => ({ id: p.id, name: p.name, price: effectivePrice(p, settings) }));
    const individualTotal = items.reduce((sum, p) => sum + p.price, 0);
    return { id: b.id, title: b.title, desc: b.desc, bundlePrice: b.bundlePrice, items, individualTotal };
  });
  res.json({ bundles: result });
});

app.post('/api/coupons/validate', (req, res) => {
  const { code, subtotal } = req.body || {};
  const coupon = findCoupon(store.getCoupons(), code);
  const status = couponStatus(coupon);
  if (!status.valid) return res.json({ valid: false, reason: status.reason });
  const discount = couponDiscount(coupon, Number(subtotal) || 0);
  res.json({ valid: true, code: coupon.code, discount });
});

// =========================================================
// Orders (checkout)
// =========================================================
app.post('/api/orders', requireCustomer, (req, res) => {
  const { items, variants: variantItems, bundles: bundleItems, couponCode, paymentMethod, shipping } = req.body || {};
  const hasItems = Array.isArray(items) && items.length > 0;
  const hasVariants = Array.isArray(variantItems) && variantItems.length > 0;
  const hasBundles = Array.isArray(bundleItems) && bundleItems.length > 0;
  if (!hasItems && !hasVariants && !hasBundles) return res.status(400).json({ error: 'Your cart is empty.' });
  if (!['cod', 'card'].includes(paymentMethod)) return res.status(400).json({ error: 'Choose a payment method.' });
  if (!shipping || !shipping.name || !shipping.phone || !shipping.address || !shipping.city) {
    return res.status(400).json({ error: 'Please fill in your delivery details.' });
  }

  const settings = store.getSettings();
  const products = store.getProducts();
  const allBundles = store.getBundles();

  let subtotal = 0;
  const lineItems = [];

  for (const item of (items || [])) {
    const product = products.find(p => p.id === Number(item.productId));
    if (!product || !product.active) continue;
    const qty = Math.max(1, Number(item.qty) || 1);
    const price = effectivePrice(product, settings);
    subtotal += price * qty;
    lineItems.push({ productId: product.id, name: product.name, price, qty });
  }

  for (const item of (variantItems || [])) {
    const product = products.find(p => p.id === Number(item.productId));
    if (!product || !product.active) continue;
    const variant = (product.variants || []).find(v => v.id === Number(item.variantId) && v.active !== false);
    if (!variant) continue;
    const qty = Math.max(1, Number(item.qty) || 1);
    const price = effectivePrice({ price: variant.price, categoryKey: product.categoryKey }, settings);
    const label = [variant.color, variant.size].filter(Boolean).join(' / ');
    subtotal += price * qty;
    lineItems.push({ productId: product.id, variantId: variant.id, name: `${product.name} — ${label}`, price, qty });
  }

  for (const item of (bundleItems || [])) {
    const bundle = allBundles.find(b => b.id === Number(item.bundleId) && b.active);
    if (!bundle) continue;
    const qty = Math.max(1, Number(item.qty) || 1);
    subtotal += bundle.bundlePrice * qty;
    lineItems.push({ bundleId: bundle.id, name: `${bundle.title} (bundle)`, price: bundle.bundlePrice, qty });
  }

  if (lineItems.length === 0) return res.status(400).json({ error: 'Your cart is empty.' });

  let discount = 0;
  let appliedCode = null;
  if (couponCode) {
    const coupon = findCoupon(store.getCoupons(), couponCode);
    const status = couponStatus(coupon);
    if (status.valid) {
      discount = couponDiscount(coupon, subtotal);
      appliedCode = coupon.code;
    }
  }

  const total = Math.max(0, subtotal - discount);
  const orders = store.getOrders();
  const user = store.getUsers().find(u => u.id === req.session.userId);

  const order = {
    id: store.nextId(orders),
    orderNumber: `AUT-${1000 + store.nextId(orders)}`,
    userId: user.id,
    customerName: shipping.name,
    customerEmail: user.email,
    items: lineItems,
    subtotal,
    discount,
    couponCode: appliedCode,
    total,
    paymentMethod,
    shipping,
    status: paymentMethod === 'cod' ? 'Pending (COD)' : 'Pending payment',
    createdAt: new Date().toISOString()
  };
  orders.push(order);
  store.saveOrders(orders);

  res.json({ order });
});

// =========================================================
// Admin: products & categories
// =========================================================
app.get('/api/admin/products', requireAdmin, (req, res) => {
  res.json({ products: store.getProducts(), categories: store.getCategories() });
});

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const { name, price, desc, categoryKey, sku, image } = req.body || {};
  if (!name || !price || !categoryKey) return res.status(400).json({ error: 'Name, price and category are required.' });
  const products = store.getProducts();
  const id = store.nextId(products);
  const product = {
    id, name, price: Number(price), desc: desc || '', categoryKey, active: true,
    sku: sku || store.autoSku(name, id), image: image || '', variants: []
  };
  products.push(product);
  store.saveProducts(products);
  res.json({ product });
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const products = store.getProducts();
  const product = products.find(p => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  const { name, price, desc, categoryKey, active, sku, image } = req.body || {};
  if (name !== undefined) product.name = name;
  if (price !== undefined) product.price = Number(price);
  if (desc !== undefined) product.desc = desc;
  if (categoryKey !== undefined) product.categoryKey = categoryKey;
  if (active !== undefined) product.active = !!active;
  if (sku !== undefined) product.sku = sku;
  if (image !== undefined) product.image = image;
  store.saveProducts(products);
  res.json({ product });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const products = store.getProducts().filter(p => p.id !== Number(req.params.id));
  store.saveProducts(products);
  res.json({ ok: true });
});

// ---- Image upload ----
app.post('/api/admin/upload-image', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image was uploaded.' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ---- Variants ----
app.post('/api/admin/products/:id/variants', requireAdmin, (req, res) => {
  const products = store.getProducts();
  const product = products.find(p => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  const { color, size, price, sku, image } = req.body || {};
  if (!price) return res.status(400).json({ error: 'A variant price is required.' });
  if (!product.variants) product.variants = [];
  const variant = {
    id: store.nextId(product.variants),
    color: color || '',
    size: size || '',
    price: Number(price),
    sku: sku || `${product.sku}-${(product.variants.length + 1)}`,
    image: image || '',
    active: true
  };
  product.variants.push(variant);
  store.saveProducts(products);
  res.json({ variant });
});

app.put('/api/admin/products/:id/variants/:variantId', requireAdmin, (req, res) => {
  const products = store.getProducts();
  const product = products.find(p => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  const variant = (product.variants || []).find(v => v.id === Number(req.params.variantId));
  if (!variant) return res.status(404).json({ error: 'Variant not found.' });
  const { color, size, price, sku, image, active } = req.body || {};
  if (color !== undefined) variant.color = color;
  if (size !== undefined) variant.size = size;
  if (price !== undefined) variant.price = Number(price);
  if (sku !== undefined) variant.sku = sku;
  if (image !== undefined) variant.image = image;
  if (active !== undefined) variant.active = !!active;
  store.saveProducts(products);
  res.json({ variant });
});

app.delete('/api/admin/products/:id/variants/:variantId', requireAdmin, (req, res) => {
  const products = store.getProducts();
  const product = products.find(p => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  product.variants = (product.variants || []).filter(v => v.id !== Number(req.params.variantId));
  store.saveProducts(products);
  res.json({ ok: true });
});

// ---- Bulk CSV import ----
app.post('/api/admin/products/bulk-import', requireAdmin, (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  const products = store.getProducts();
  const categories = store.getCategories();
  let created = 0, updated = 0;
  const skipped = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // account for the header row
    const name = String(row.name || '').trim();
    if (!name) { skipped.push({ row: rowNum, reason: 'Missing product name' }); return; }

    const catInput = String(row.category || '').trim().toLowerCase();
    const category = categories.find(c => c.key === catInput || c.title.toLowerCase() === catInput);
    if (!category) { skipped.push({ row: rowNum, reason: `Category "${row.category}" not found` }); return; }

    const price = Number(row.price);
    if (!price || price <= 0) { skipped.push({ row: rowNum, reason: 'Missing or invalid price' }); return; }

    const sku = String(row.sku || '').trim();
    const activeVal = String(row.active ?? '').trim().toLowerCase();
    const active = activeVal === '' ? true : ['yes', 'true', '1'].includes(activeVal);

    const existing = sku ? products.find(p => p.sku && p.sku.toLowerCase() === sku.toLowerCase()) : null;
    if (existing) {
      existing.name = name;
      existing.price = price;
      existing.desc = row.description || existing.desc;
      existing.categoryKey = category.key;
      existing.active = active;
      if (row.image) existing.image = row.image;
      updated++;
    } else {
      const id = store.nextId(products);
      products.push({
        id, name, price, desc: row.description || '', categoryKey: category.key,
        active, sku: sku || store.autoSku(name, id), image: row.image || '', variants: []
      });
      created++;
    }
  });

  store.saveProducts(products);
  res.json({ created, updated, skipped });
});

app.post('/api/admin/categories', requireAdmin, (req, res) => {
  const { title, tagline } = req.body || {};
  if (!title) return res.status(400).json({ error: 'A category title is required.' });
  const categories = store.getCategories();
  const key = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `cat-${categories.length + 1}`;
  if (categories.some(c => c.key === key)) return res.status(409).json({ error: 'A category with a similar name already exists.' });
  const category = { key, title, tagline: tagline || '' };
  categories.push(category);
  store.saveCategories(categories);
  res.json({ category });
});

app.put('/api/admin/categories/:key', requireAdmin, (req, res) => {
  const categories = store.getCategories();
  const category = categories.find(c => c.key === req.params.key);
  if (!category) return res.status(404).json({ error: 'Category not found.' });
  const { title, tagline } = req.body || {};
  if (title !== undefined) category.title = title;
  if (tagline !== undefined) category.tagline = tagline;
  store.saveCategories(categories);
  res.json({ category });
});

// =========================================================
// Admin: coupons
// =========================================================
app.get('/api/admin/coupons', requireAdmin, (req, res) => { res.json({ coupons: store.getCoupons() }); });

app.post('/api/admin/coupons', requireAdmin, (req, res) => {
  const { code, type, value, expiresAt } = req.body || {};
  if (!code || !type || value === undefined) return res.status(400).json({ error: 'Code, type and value are required.' });
  if (!['percent', 'fixed'].includes(type)) return res.status(400).json({ error: 'Type must be percent or fixed.' });
  const coupons = store.getCoupons();
  if (coupons.some(c => c.code.toUpperCase() === String(code).toUpperCase())) {
    return res.status(409).json({ error: 'That code already exists.' });
  }
  const coupon = { id: store.nextId(coupons), code: code.toUpperCase().trim(), type, value: Number(value), expiresAt: expiresAt || null, active: true };
  coupons.push(coupon);
  store.saveCoupons(coupons);
  res.json({ coupon });
});

app.put('/api/admin/coupons/:id', requireAdmin, (req, res) => {
  const coupons = store.getCoupons();
  const coupon = coupons.find(c => c.id === Number(req.params.id));
  if (!coupon) return res.status(404).json({ error: 'Coupon not found.' });
  const { active, value, expiresAt } = req.body || {};
  if (active !== undefined) coupon.active = !!active;
  if (value !== undefined) coupon.value = Number(value);
  if (expiresAt !== undefined) coupon.expiresAt = expiresAt;
  store.saveCoupons(coupons);
  res.json({ coupon });
});

app.delete('/api/admin/coupons/:id', requireAdmin, (req, res) => {
  const coupons = store.getCoupons().filter(c => c.id !== Number(req.params.id));
  store.saveCoupons(coupons);
  res.json({ ok: true });
});

// =========================================================
// Admin: bundles
// =========================================================
app.get('/api/admin/bundles', requireAdmin, (req, res) => { res.json({ bundles: store.getBundles(), products: store.getProducts() }); });

app.post('/api/admin/bundles', requireAdmin, (req, res) => {
  const { title, desc, productIds, bundlePrice } = req.body || {};
  if (!title || !Array.isArray(productIds) || productIds.length < 2 || !bundlePrice) {
    return res.status(400).json({ error: 'Title, at least two products, and a bundle price are required.' });
  }
  const bundles = store.getBundles();
  const bundle = { id: store.nextId(bundles), title, desc: desc || '', productIds: productIds.map(Number), bundlePrice: Number(bundlePrice), active: true };
  bundles.push(bundle);
  store.saveBundles(bundles);
  res.json({ bundle });
});

app.put('/api/admin/bundles/:id', requireAdmin, (req, res) => {
  const bundles = store.getBundles();
  const bundle = bundles.find(b => b.id === Number(req.params.id));
  if (!bundle) return res.status(404).json({ error: 'Bundle not found.' });
  const { title, desc, productIds, bundlePrice, active } = req.body || {};
  if (title !== undefined) bundle.title = title;
  if (desc !== undefined) bundle.desc = desc;
  if (productIds !== undefined) bundle.productIds = productIds.map(Number);
  if (bundlePrice !== undefined) bundle.bundlePrice = Number(bundlePrice);
  if (active !== undefined) bundle.active = !!active;
  store.saveBundles(bundles);
  res.json({ bundle });
});

app.delete('/api/admin/bundles/:id', requireAdmin, (req, res) => {
  const bundles = store.getBundles().filter(b => b.id !== Number(req.params.id));
  store.saveBundles(bundles);
  res.json({ ok: true });
});

// =========================================================
// Admin: sale settings
// =========================================================
app.get('/api/admin/settings', requireAdmin, (req, res) => { res.json({ settings: store.getSettings() }); });

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const current = store.getSettings();
  const { saleActive, saleLabel, saleDiscountPercent, saleAppliesTo } = req.body || {};
  const updated = {
    saleActive: saleActive !== undefined ? !!saleActive : current.saleActive,
    saleLabel: saleLabel !== undefined ? saleLabel : current.saleLabel,
    saleDiscountPercent: saleDiscountPercent !== undefined ? Number(saleDiscountPercent) : current.saleDiscountPercent,
    saleAppliesTo: saleAppliesTo !== undefined ? saleAppliesTo : current.saleAppliesTo
  };
  store.saveSettings(updated);
  res.json({ settings: updated });
});

// =========================================================
// Admin: orders
// =========================================================
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const orders = store.getOrders().slice().sort((a, b) => b.id - a.id);
  res.json({ orders });
});

app.put('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const orders = store.getOrders();
  const order = orders.find(o => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (req.body && req.body.status) order.status = req.body.status;
  store.saveOrders(orders);
  res.json({ order });
});

app.listen(PORT, () => {
  console.log(`Autique store running at http://localhost:${PORT}`);
  console.log(`Admin panel at http://localhost:${PORT}/admin.html`);
});
