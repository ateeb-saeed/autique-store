const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const store = require('./lib/store');
const { effectivePrice, findCoupon, couponStatus, couponDiscount } = require('./lib/pricing');
const gateway = require('./lib/rapidgateway');
const crypto = require('crypto');

store.seed();

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOADS_DIR = path.join(__dirname, 'data', 'uploads');
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

app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));
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
function requireLogistics(req, res, next) {
  if (!req.session.isLogistics && !req.session.isAdmin) return res.status(401).json({ error: 'Logistics sign in required.' });
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

app.post('/api/admin/logistics-password', requireAdmin, (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'The logistics password must be at least 6 characters.' });
  }
  store.saveLogistics({ password_hash: bcrypt.hashSync(newPassword, 10) });
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
            const base = v.priceSet === false ? p.price : v.price;
            const price = effectivePrice({ price: base, categoryKey: p.categoryKey }, settings);
            return {
              id: v.id,
              sku: v.sku || '',
              color: v.color || '',
              size: v.size || '',
              price,
              originalPrice: price !== base ? base : null,
              image: v.image || ''
            };
          });
          const cheapest = variants.reduce((a, b) => (a.price < b.price ? a : b));
          return {
            id: p.id,
            name: p.name,
            sku: p.sku || '',
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
          sku: p.sku || '',
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
  res.json({ saleActive: s.saleActive, saleLabel: s.saleLabel, saleDiscountPercent: s.saleDiscountPercent, saleAppliesTo: s.saleAppliesTo, paymentMode: gateway.mode });
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
  const status = couponStatus(coupon, Number(subtotal) || 0);
  if (!status.valid) return res.json({ valid: false, reason: status.reason });
  const discount = couponDiscount(coupon, Number(subtotal) || 0);
  res.json({ valid: true, code: coupon.code, discount });
});

// =========================================================
// Orders (checkout)
// =========================================================
// Customers must be signed in to order, so every order can be tracked.
app.post('/api/orders', requireCustomer, async (req, res) => {
  const { items, variants: variantItems, bundles: bundleItems, couponCode, paymentMethod, shipping } = req.body || {};
  const hasItems = Array.isArray(items) && items.length > 0;
  const hasVariants = Array.isArray(variantItems) && variantItems.length > 0;
  const hasBundles = Array.isArray(bundleItems) && bundleItems.length > 0;
  if (!hasItems && !hasVariants && !hasBundles) return res.status(400).json({ error: 'Your cart is empty.' });
  if (!['cod', 'card'].includes(paymentMethod)) return res.status(400).json({ error: 'Choose a payment method.' });
  if (!shipping || !shipping.name || !shipping.phone || !shipping.address || !shipping.city) {
    return res.status(400).json({ error: 'Please fill in your delivery details.' });
  }
  const user = store.getUsers().find(u => u.id === req.session.userId);
  if (!user) return res.status(401).json({ error: 'Sign in required.' });
  const email = user.email;

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
    const price = effectivePrice({ price: variant.priceSet === false ? product.price : variant.price, categoryKey: product.categoryKey }, settings);
    const label = [variant.color, variant.size].filter(Boolean).join(' / ');
    subtotal += price * qty;
    lineItems.push({ productId: product.id, variantId: variant.id, name: `${product.name} — ${label}`, price, qty });
  }

  for (const item of (bundleItems || [])) {
    const bundle = allBundles.find(b => b.id === Number(item.bundleId) && b.active);
    if (!bundle) continue;
    const qty = Math.max(1, Number(item.qty) || 1);
    subtotal += bundle.bundlePrice * qty;
    lineItems.push({ bundleId: bundle.id, productIds: bundle.productIds, name: `${bundle.title} (bundle)`, price: bundle.bundlePrice, qty });
  }

  if (lineItems.length === 0) return res.status(400).json({ error: 'Your cart is empty.' });

  let discount = 0;
  let appliedCode = null;
  if (couponCode) {
    const coupon = findCoupon(store.getCoupons(), couponCode);
    const status = couponStatus(coupon, subtotal);
    if (status.valid) {
      discount = couponDiscount(coupon, subtotal);
      appliedCode = coupon.code;
    }
  }

  const total = Math.max(0, subtotal - discount);
  const orders = store.getOrders();

  const order = {
    id: store.nextId(orders),
    orderNumber: `AUT-${1000 + store.nextId(orders)}`,
    userId: user.id,
    customerName: shipping.name,
    customerEmail: email,
    items: lineItems,
    subtotal,
    discount,
    couponCode: appliedCode,
    total,
    paymentMethod,
    accessToken: crypto.randomBytes(16).toString('hex'),
    paymentStatus: paymentMethod === 'cod' ? 'unpaid' : 'pending',
    shipping: {
      name: String(shipping.name), phone: String(shipping.phone), email,
      address: String(shipping.address), city: String(shipping.city),
      province: String(shipping.province || ''), notes: String(shipping.notes || '')
    },
    status: paymentMethod === 'cod' ? 'Pending (COD)' : 'Pending payment',
    createdAt: new Date().toISOString()
  };
  orders.push(order);
  store.saveOrders(orders);
  if (appliedCode) {
    const coupons = store.getCoupons();
    const used = coupons.find(c => c.code === appliedCode);
    if (used) { used.usedCount = (used.usedCount || 0) + 1; store.saveCoupons(coupons); }
  }

  if (paymentMethod !== 'card') return res.json({ order });
  try {
    const checkoutUrl = await startCardPayment(order, req);
    res.json({ order: store.getOrders().find(o => o.id === order.id), checkoutUrl });
  } catch (e) {
    console.error('Rapid Gateway payment could not be started:', e.message);
    res.status(502).json({ order, error: 'We could not open the card payment page. Your order is saved, so you can try paying again from the next screen, or place a new order with cash on delivery.' });
  }
});

// =========================================================
// Card payments (Rapid Gateway hosted checkout)
// =========================================================
function baseUrl(req) {
  return (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

async function startCardPayment(order, req) {
  const base = baseUrl(req);
  const { id, checkoutUrl } = await gateway.createPayment({
    order,
    baseUrl: base,
    callbackUrl: `${base}/payment/return?order=${encodeURIComponent(order.orderNumber)}`,
    webhookUrl: `${base}/api/payments/webhook`
  });
  const orders = store.getOrders();
  const o = orders.find(x => x.id === order.id);
  o.paymentId = id;
  o.paymentStatus = 'pending';
  store.saveOrders(orders);
  return checkoutUrl;
}

// Record a payment result on its order. Safe to call more than once.
function applyPaymentResult(match, status) {
  if (status !== 'paid' && status !== 'failed') return null;
  const orders = store.getOrders();
  const o = orders.find(match);
  if (!o || o.paymentStatus === 'paid') return o || null;
  o.paymentStatus = status;
  if (status === 'paid') {
    o.paidAt = new Date().toISOString();
    if (o.status === 'Pending payment') o.status = 'Confirmed';
  }
  store.saveOrders(orders);
  return o;
}

function publicOrder(o) {
  return {
    orderNumber: o.orderNumber, customerName: o.customerName, customerEmail: o.customerEmail,
    items: o.items.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
    subtotal: o.subtotal, discount: o.discount, couponCode: o.couponCode, total: o.total,
    paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus || (o.paymentMethod === 'cod' ? 'unpaid' : 'pending'),
    status: o.status, createdAt: o.createdAt, shipping: o.shipping,
    dispatchedAt: o.dispatchedAt || null, courier: o.courier || '', trackingNumber: o.trackingNumber || ''
  };
}

// Track an order by its number plus the email on the account that placed it.
app.post('/api/track', (req, res) => {
  const number = String((req.body && req.body.orderNumber) || '').trim().toUpperCase();
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!number || !email) return res.status(400).json({ error: 'Enter your order number and email.' });
  const o = store.getOrders().find(x => x.orderNumber.toUpperCase() === number && String(x.customerEmail || '').toLowerCase() === email);
  if (!o) return res.status(404).json({ error: 'We could not find an order with that number and email. Check both and try again.' });
  const p = publicOrder(o);
  delete p.shipping.email;
  res.json({ order: p });
});

function findOrderForViewer(req, orderNumber, token) {
  const o = store.getOrders().find(x => x.orderNumber === orderNumber);
  if (!o) return null;
  const owner = req.session.userId && o.userId === req.session.userId;
  const tokenOk = token && o.accessToken && token.length === o.accessToken.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(o.accessToken));
  return owner || tokenOk ? o : null;
}

// The gateway sends the customer back here. Re-check the status with the gateway
// rather than trusting anything in the URL, then show the order page.
app.get('/payment/return', async (req, res) => {
  const o = store.getOrders().find(x => x.orderNumber === String(req.query.order || ''));
  if (!o) return res.redirect('/#/');
  if (o.paymentId && o.paymentStatus !== 'paid') {
    try { applyPaymentResult(x => x.id === o.id, await gateway.getPaymentStatus(o.paymentId)); }
    catch (e) { console.error('Rapid Gateway status check failed:', e.message); }
  }
  res.redirect(`/#/order/${encodeURIComponent(o.orderNumber)}`);
});

// Server-to-server notification from the gateway.
app.post('/api/payments/webhook', (req, res) => {
  const event = gateway.parseWebhook(req.rawBody || Buffer.from(''), req.headers);
  if (!event) return res.status(400).json({ error: 'Invalid signature.' });
  applyPaymentResult(o => (event.paymentId && o.paymentId === event.paymentId) || (event.reference && o.orderNumber === event.reference), event.status);
  res.json({ received: true });
});

app.get('/api/order-status/:orderNumber', async (req, res) => {
  let o = findOrderForViewer(req, req.params.orderNumber, String(req.query.t || ''));
  if (!o) return res.status(404).json({ error: 'Order not found.' });
  if (o.paymentMethod === 'card' && o.paymentId && o.paymentStatus === 'pending') {
    try { o = applyPaymentResult(x => x.id === o.id, await gateway.getPaymentStatus(o.paymentId)) || o; }
    catch (e) { console.error('Rapid Gateway status check failed:', e.message); }
  }
  res.json({ order: publicOrder(o) });
});

// Start a fresh payment attempt for an unpaid card order.
app.post('/api/orders/:orderNumber/pay', async (req, res) => {
  const o = findOrderForViewer(req, req.params.orderNumber, String((req.body && req.body.t) || ''));
  if (!o) return res.status(404).json({ error: 'Order not found.' });
  if (o.paymentMethod !== 'card') return res.status(400).json({ error: 'This order is paid on delivery.' });
  if (o.paymentStatus === 'paid') return res.status(400).json({ error: 'This order is already paid.' });
  if (o.status === 'Cancelled') return res.status(400).json({ error: 'This order was cancelled.' });
  try {
    res.json({ checkoutUrl: await startCardPayment(o, req) });
  } catch (e) {
    console.error('Rapid Gateway payment could not be started:', e.message);
    res.status(502).json({ error: 'We could not open the card payment page. Please try again in a moment.' });
  }
});

// ---- Test mode only: a stand-in for the gateway's card page ----
app.get('/pay/test/:id', (req, res) => {
  if (gateway.mode !== 'test') return res.status(404).send('Not found');
  const p = gateway.testFind(req.params.id);
  if (!p) return res.status(404).send('Payment not found');
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test card payment</title><style>
body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#fff;color:#0f1b2b;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}
.box{width:min(420px,100%);border:1.5px solid #0f1b2b;border-radius:22px;padding:30px;text-align:center}
.tag{display:inline-block;border:1.5px solid #b4413c;color:#b4413c;border-radius:999px;padding:4px 12px;font-size:.78rem;font-weight:700}
h1{font-size:1.3rem;margin:14px 0 4px}.amt{font-size:2.2rem;font-weight:800;margin:10px 0 6px}p{color:#4b586b;font-size:.92rem;line-height:1.5}
button{width:100%;border-radius:999px;padding:14px;font:inherit;font-weight:600;cursor:pointer;border:1.5px solid #0f1b2b;margin-top:10px}
.ok{background:#0f1b2b;color:#fff}.no{background:#fff;color:#0f1b2b}</style></head><body><div class="box">
<span class="tag">Test mode</span><h1>Rapid Gateway (simulated)</h1><div class="amt">Rs. ${Number(p.amount).toLocaleString('en-US')}</div>
<p>Order ${esc(p.orderNumber)}. This page stands in for the real card page until Rapid Gateway keys are added. No money moves.</p>
${p.status === 'pending' ? `<form method="post" action="/api/payments/test/${esc(p.id)}"><button class="ok" name="approve" value="1">Approve test payment</button><button class="no" name="approve" value="0">Decline test payment</button></form>`
  : `<p>This payment is already ${esc(p.status)}.</p><form method="post" action="/api/payments/test/${esc(p.id)}"><button class="ok" name="approve" value="1">Back to the store</button></form>`}
</div></body></html>`);
});

app.post('/api/payments/test/:id', express.urlencoded({ extended: false }), (req, res) => {
  if (gateway.mode !== 'test') return res.status(404).send('Not found');
  const p = gateway.testComplete(req.params.id, req.body && req.body.approve === '1');
  if (!p) return res.status(404).send('Payment not found');
  res.redirect(303, p.callbackUrl);
});

app.get('/api/my-orders', requireCustomer, (req, res) => {
  const orders = store.getOrders()
    .filter(o => o.userId === req.session.userId)
    .sort((a, b) => b.id - a.id)
    .map(o => ({
      orderNumber: o.orderNumber, items: o.items.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
      subtotal: o.subtotal, discount: o.discount, couponCode: o.couponCode, total: o.total,
      paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus || (o.paymentMethod === 'cod' ? 'unpaid' : 'pending'),
      status: o.status, createdAt: o.createdAt,
      courier: o.courier || '', trackingNumber: o.trackingNumber || ''
    }));
  res.json({ orders });
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

// One save for the whole product editor: basics, photos, variants and stock.
function applyProductForm(product, body, products) {
  const name = String(body.name || '').trim();
  const price = Number(body.price);
  if (!name) return 'Product name is required.';
  if (!(price >= 0) || body.price === '' || body.price === undefined) return 'Enter a price.';
  if (!store.getCategories().some(c => c.key === body.categoryKey)) return 'Choose a category.';

  const log = store.getStockLog();
  const at = new Date().toISOString();
  const logChange = (key, label, sku, before, after) => {
    if (before === after) return;
    log.push({ id: store.nextId(log), type: 'adjust', key, name: label, sku: sku || '', qty: after - before, balance: after, note: 'Set in admin', by: 'Admin', at });
  };
  const int = v => Math.max(0, Math.floor(Number(v) || 0));

  product.name = name;
  product.price = price;
  product.categoryKey = body.categoryKey;
  product.desc = String(body.desc || '');
  product.active = body.active !== false;
  product.sku = String(body.sku || '').trim() || product.sku || store.autoSku(name, product.id);
  const images = (Array.isArray(body.images) ? body.images : []).filter(u => typeof u === 'string' && u.trim()).slice(0, 12);
  product.images = images;
  product.image = images[0] || '';

  const old = product.variants || [];
  const rows = (Array.isArray(body.variants) ? body.variants : []).filter(v => v && (v.id || v.color || v.size || v.sku));
  const kept = [];
  rows.forEach((v, i) => {
    const prev = old.find(x => x.id === Number(v.id));
    const priceSet = v.price !== '' && v.price !== undefined && v.price !== null;
    const variant = prev || { id: Math.max(0, ...old.map(x => x.id), ...kept.map(x => x.id)) + 1, active: true, image: '' };
    variant.color = String(v.color || '').trim();
    variant.size = String(v.size || '').trim();
    variant.priceSet = priceSet;
    variant.price = priceSet ? Math.max(0, Number(v.price)) : price;
    variant.sku = String(v.sku || '').trim() || `${product.sku}-${i + 1}`;
    const before = prev ? (prev.stock || 0) : 0;
    variant.stock = int(v.stock);
    logChange(`${product.id}:${variant.id}`, `${name} — ${[variant.color, variant.size].filter(Boolean).join(' / ') || 'Standard'}`, variant.sku, before, variant.stock);
    kept.push(variant);
  });
  product.variants = kept;
  if (!kept.length) {
    const before = product.stock || 0;
    product.stock = int(body.stock);
    logChange(String(product.id), name, product.sku, before, product.stock);
  }
  store.saveStockLog(log);
  return null;
}

app.post('/api/admin/products/full', requireAdmin, (req, res) => {
  const products = store.getProducts();
  const product = { id: store.nextId(products), stock: 0, variants: [] };
  const error = applyProductForm(product, req.body || {}, products);
  if (error) return res.status(400).json({ error });
  products.push(product);
  store.saveProducts(products);
  res.json({ product });
});

app.put('/api/admin/products/:id/full', requireAdmin, (req, res) => {
  const products = store.getProducts();
  const product = products.find(p => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  const error = applyProductForm(product, req.body || {}, products);
  if (error) return res.status(400).json({ error });
  store.saveProducts(products);
  res.json({ product });
});

app.post('/api/admin/products/bulk-action', requireAdmin, (req, res) => {
  const ids = (Array.isArray(req.body && req.body.ids) ? req.body.ids : []).map(Number);
  const action = req.body && req.body.action;
  if (!ids.length || !['hide', 'show', 'delete'].includes(action)) return res.status(400).json({ error: 'Choose products and an action.' });
  let products = store.getProducts();
  if (action === 'delete') products = products.filter(p => !ids.includes(p.id));
  else products.forEach(p => { if (ids.includes(p.id)) p.active = action === 'show'; });
  store.saveProducts(products);
  res.json({ ok: true });
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

// Coupon fields: code, type (percent | fixed), value, minOrder, usageLimit, expiresAt, active
function applyCouponForm(coupon, body, coupons) {
  if (body.code !== undefined) {
    const code = String(body.code).trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,30}$/.test(code)) return 'Use 2 to 30 letters, numbers, dashes or underscores for the code.';
    if (coupons.some(c => c.id !== coupon.id && c.code.toUpperCase() === code)) return 'That code already exists.';
    coupon.code = code;
  }
  if (body.type !== undefined) {
    if (!['percent', 'fixed'].includes(body.type)) return 'Type must be percent or fixed.';
    coupon.type = body.type;
  }
  if (body.value !== undefined) {
    const value = Number(body.value);
    if (!(value > 0)) return 'Enter a discount amount above 0.';
    if (coupon.type === 'percent' && value > 100) return 'A percentage discount cannot be more than 100.';
    coupon.value = value;
  }
  if (body.minOrder !== undefined) coupon.minOrder = Math.max(0, Number(body.minOrder) || 0);
  if (body.usageLimit !== undefined) coupon.usageLimit = Number(body.usageLimit) > 0 ? Math.floor(Number(body.usageLimit)) : null;
  if (body.expiresAt !== undefined) coupon.expiresAt = body.expiresAt || null;
  if (body.active !== undefined) coupon.active = !!body.active;
  return null;
}

app.post('/api/admin/coupons', requireAdmin, (req, res) => {
  const body = req.body || {};
  if (!body.code || body.value === undefined) return res.status(400).json({ error: 'Code and amount are required.' });
  const coupons = store.getCoupons();
  const coupon = { id: store.nextId(coupons), type: 'percent', minOrder: 0, usageLimit: null, usedCount: 0, expiresAt: null, active: true };
  const error = applyCouponForm(coupon, { type: 'percent', ...body }, coupons);
  if (error) return res.status(400).json({ error });
  coupons.push(coupon);
  store.saveCoupons(coupons);
  res.json({ coupon });
});

app.put('/api/admin/coupons/:id', requireAdmin, (req, res) => {
  const coupons = store.getCoupons();
  const coupon = coupons.find(c => c.id === Number(req.params.id));
  if (!coupon) return res.status(404).json({ error: 'Coupon not found.' });
  const error = applyCouponForm(coupon, req.body || {}, coupons);
  if (error) return res.status(400).json({ error });
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

// =========================================================
// Logistics portal: stock, dispatch, restocking (no pricing)
// =========================================================
const CLOSED_STATUSES = ['Dispatched', 'Shipped', 'Delivered', 'Cancelled'];

function variantLabel(v) {
  return [v.color, v.size].filter(Boolean).join(' / ') || 'Standard';
}

function stockKey(productId, variantId) {
  return variantId ? `${productId}:${variantId}` : String(productId);
}

function stockName(found) {
  return found.variant ? `${found.product.name} — ${variantLabel(found.variant)}` : found.product.name;
}

// What an order takes off the shelf, as { key: qty }. Bundles count as each
// of their products. A product with variants inside a bundle can't be pinned
// to one variant, so it is left out of the count.
function orderStockNeeds(order, products, bundles) {
  const needs = {};
  const add = (key, qty) => { needs[key] = (needs[key] || 0) + qty; };
  for (const item of order.items) {
    if (item.bundleId) {
      const bundle = bundles.find(b => b.id === item.bundleId);
      const ids = item.productIds || (bundle ? bundle.productIds : []);
      ids.forEach(pid => {
        const p = products.find(x => x.id === pid);
        if (p && !(p.variants || []).length) add(stockKey(pid), item.qty);
      });
    } else {
      add(stockKey(item.productId, item.variantId), item.qty);
    }
  }
  return needs;
}

function findStockItem(products, key) {
  const [pid, vid] = key.split(':').map(Number);
  const product = products.find(p => p.id === pid);
  if (!product) return null;
  if (!vid) return { product, variant: null, target: product };
  const variant = (product.variants || []).find(v => v.id === vid);
  return variant ? { product, variant, target: variant } : null;
}

function isAwaitingCardPayment(o) {
  return o.paymentMethod === 'card' && o.paymentStatus !== 'paid';
}

function isOpenOrder(o) {
  return !o.dispatchedAt && !CLOSED_STATUSES.includes(o.status) && !isAwaitingCardPayment(o);
}

app.post('/api/logistics/login', (req, res) => {
  const { password } = req.body || {};
  const account = store.getLogistics();
  if (!account || !password || !bcrypt.compareSync(password, account.password_hash)) {
    return res.status(401).json({ error: 'Incorrect logistics password.' });
  }
  req.session.isLogistics = true;
  res.json({ ok: true });
});

app.post('/api/logistics/logout', (req, res) => { req.session.isLogistics = false; res.json({ ok: true }); });

app.get('/api/logistics/me', (req, res) => {
  res.json({ signedIn: !!(req.session.isLogistics || req.session.isAdmin) });
});

app.get('/api/logistics/stock', requireLogistics, (req, res) => {
  res.json({ stock: buildStockRows() });
});

function buildStockRows() {
  const products = store.getProducts();
  const bundles = store.getBundles();
  const categories = store.getCategories();

  const reserved = {};
  store.getOrders().filter(isOpenOrder).forEach(o => {
    Object.entries(orderStockNeeds(o, products, bundles)).forEach(([k, q]) => { reserved[k] = (reserved[k] || 0) + q; });
  });

  const rows = [];
  products.forEach(p => {
    const cat = categories.find(c => c.key === p.categoryKey);
    const category = cat ? cat.title : p.categoryKey;
    const variants = p.variants || [];
    const entries = variants.length
      ? variants.map(v => ({ key: stockKey(p.id, v.id), variant: variantLabel(v), sku: v.sku, image: v.image || p.image,
          active: p.active && v.active !== false, onHand: v.stock || 0 }))
      : [{ key: stockKey(p.id), variant: '', sku: p.sku, image: p.image, active: !!p.active, onHand: p.stock || 0 }];
    entries.forEach(e => {
      const r = reserved[e.key] || 0;
      rows.push({ ...e, name: p.name, category, sku: e.sku || '', image: e.image || '', reserved: r, available: e.onHand - r });
    });
  });
  return rows;
}

app.post('/api/logistics/restock', requireLogistics, (req, res) => {
  const { key, qty, note } = req.body || {};
  const amount = Math.floor(Number(qty));
  if (!key || !(amount > 0)) return res.status(400).json({ error: 'Enter how many units arrived (a whole number above 0).' });

  const products = store.getProducts();
  const found = findStockItem(products, String(key));
  if (!found) return res.status(404).json({ error: 'Product not found.' });
  found.target.stock = (found.target.stock || 0) + amount;
  store.saveProducts(products);

  const log = store.getStockLog();
  log.push({
    id: store.nextId(log), type: 'restock', key: String(key), name: stockName(found),
    sku: found.target.sku || '', qty: amount, balance: found.target.stock,
    note: note || '', by: req.session.isLogistics ? 'Logistics' : 'Admin', at: new Date().toISOString()
  });
  store.saveStockLog(log);
  res.json({ ok: true, onHand: found.target.stock });
});

app.get('/api/logistics/orders', requireLogistics, (req, res) => {
  const products = store.getProducts();
  const orders = store.getOrders().slice().sort((a, b) => b.id - a.id).map(o => ({
    id: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    phone: o.shipping.phone,
    address: o.shipping.address,
    city: o.shipping.city,
    items: o.items.map(i => {
      const found = i.bundleId ? null : findStockItem(products, stockKey(i.productId, i.variantId));
      const contents = i.bundleId
        ? (i.productIds || []).map(pid => (products.find(p => p.id === pid) || {}).name).filter(Boolean)
        : [];
      return { name: i.name, qty: i.qty, sku: found ? (found.target.sku || '') : '', contents };
    }),
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus || (o.paymentMethod === 'cod' ? 'unpaid' : 'pending'),
    codAmount: o.paymentMethod === 'cod' ? o.total : null,
    status: o.status,
    open: isOpenOrder(o),
    createdAt: o.createdAt,
    dispatchedAt: o.dispatchedAt || null,
    courier: o.courier || '',
    trackingNumber: o.trackingNumber || ''
  }));
  res.json({ orders });
});

app.post('/api/logistics/orders/:id/dispatch', requireLogistics, (req, res) => {
  const { courier, trackingNumber } = req.body || {};
  const orders = store.getOrders();
  const order = orders.find(o => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (isAwaitingCardPayment(order) && !order.dispatchedAt) return res.status(400).json({ error: 'This card order has not been paid yet.' });
  if (!isOpenOrder(order)) return res.status(400).json({ error: `This order is already ${order.status.toLowerCase()}.` });

  const products = store.getProducts();
  const needs = orderStockNeeds(order, products, store.getBundles());

  const short = [];
  Object.entries(needs).forEach(([key, qty]) => {
    const found = findStockItem(products, key);
    const have = found ? (found.target.stock || 0) : 0;
    if (have < qty) short.push(`${found ? stockName(found) : 'Unknown product'}: need ${qty}, have ${have}`);
  });
  if (short.length) return res.status(409).json({ error: 'Not enough stock to dispatch this order.', short });

  const log = store.getStockLog();
  const at = new Date().toISOString();
  const by = req.session.isLogistics ? 'Logistics' : 'Admin';
  Object.entries(needs).forEach(([key, qty]) => {
    const found = findStockItem(products, key);
    found.target.stock = (found.target.stock || 0) - qty;
    log.push({
      id: store.nextId(log), type: 'dispatch', key, name: stockName(found),
      sku: found.target.sku || '', qty: -qty, balance: found.target.stock,
      note: order.orderNumber, by, at
    });
  });
  store.saveProducts(products);
  store.saveStockLog(log);

  order.status = 'Dispatched';
  order.dispatchedAt = at;
  order.courier = courier || '';
  order.trackingNumber = trackingNumber || '';
  store.saveOrders(orders);
  res.json({ ok: true });
});

app.get('/api/logistics/stock-log', requireLogistics, (req, res) => {
  res.json({ log: store.getStockLog().slice(-300).reverse() });
});

// =========================================================
// Admin: dashboard — one read of everything, aggregated
// =========================================================
const LOW_STOCK_LEVEL = 5;

function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function orderTotals(list) {
  const sales = list.filter(o => o.status !== 'Cancelled' && !isAwaitingCardPayment(o));
  const revenue = sales.reduce((s, o) => s + o.total, 0);
  return {
    revenue,
    orders: sales.length,
    avgOrder: sales.length ? Math.round(revenue / sales.length) : 0,
    units: sales.reduce((s, o) => s + o.items.reduce((n, i) => n + i.qty, 0), 0),
    discounts: sales.reduce((s, o) => s + (o.discount || 0), 0)
  };
}

app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  const prevStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() - days);

  const allOrders = store.getOrders();
  const inRange = allOrders.filter(o => new Date(o.createdAt) >= start);
  const inPrev = allOrders.filter(o => { const t = new Date(o.createdAt); return t >= prevStart && t < start; });
  const sales = inRange.filter(o => o.status !== 'Cancelled' && !isAwaitingCardPayment(o));

  // Daily revenue and order counts, with empty days filled in
  const daily = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    daily.push({ date: dayKey(d), revenue: 0, orders: 0 });
  }
  const byDay = Object.fromEntries(daily.map(d => [d.date, d]));
  sales.forEach(o => {
    const bucket = byDay[dayKey(o.createdAt)];
    if (bucket) { bucket.revenue += o.total; bucket.orders += 1; }
  });

  const count = (list, fn) => {
    const out = {};
    list.forEach(x => { const k = fn(x); out[k] = (out[k] || 0) + 1; });
    return Object.entries(out).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };

  // Product and category performance from order lines (before coupon discounts)
  const products = store.getProducts();
  const categories = store.getCategories();
  const productMap = {};
  const categoryMap = {};
  sales.forEach(o => o.items.forEach(i => {
    const key = i.bundleId ? `b${i.bundleId}` : String(i.productId);
    const name = i.bundleId ? i.name : ((products.find(p => p.id === i.productId) || {}).name || i.name);
    const row = productMap[key] || (productMap[key] = { name, units: 0, revenue: 0 });
    row.units += i.qty;
    row.revenue += i.price * i.qty;

    let catTitle = 'Bundles';
    if (!i.bundleId) {
      const p = products.find(x => x.id === i.productId);
      const cat = p && categories.find(c => c.key === p.categoryKey);
      catTitle = cat ? cat.title : 'Other';
    }
    categoryMap[catTitle] = (categoryMap[catTitle] || 0) + i.price * i.qty;
  }));

  const stock = buildStockRows().filter(r => r.active);
  const users = store.getUsers();
  const settings = store.getSettings();

  res.json({
    days,
    totals: orderTotals(inRange),
    previous: orderTotals(inPrev),
    daily,
    statuses: count(inRange, o => o.status),
    payments: count(sales, o => (o.paymentMethod === 'cod' ? 'Cash on delivery' : 'Card')),
    topProducts: Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 8),
    categories: Object.entries(categoryMap).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    fulfilment: {
      toDispatch: allOrders.filter(isOpenOrder).length,
      dispatched: inRange.filter(o => o.dispatchedAt).length,
      cancelled: inRange.filter(o => o.status === 'Cancelled').length
    },
    customers: {
      total: users.length,
      newInRange: users.filter(u => new Date(u.created_at) >= start).length,
      buyersInRange: new Set(sales.map(o => o.userId || o.customerEmail)).size
    },
    stock: {
      skus: stock.length,
      units: stock.reduce((s, r) => s + r.onHand, 0),
      out: stock.filter(r => r.available <= 0).length,
      low: stock.filter(r => r.available > 0 && r.available <= LOW_STOCK_LEVEL).length,
      attention: stock
        .filter(r => r.available <= LOW_STOCK_LEVEL)
        .sort((a, b) => b.reserved - a.reserved || a.available - b.available)
        .slice(0, 8)
        .map(r => ({ name: r.name, variant: r.variant, sku: r.sku, onHand: r.onHand, reserved: r.reserved, available: r.available }))
    },
    catalog: {
      products: products.length,
      active: products.filter(p => p.active).length,
      variants: products.reduce((s, p) => s + (p.variants || []).length, 0)
    },
    promotions: {
      sale: settings.saleActive ? { label: settings.saleLabel, percent: settings.saleDiscountPercent } : null,
      coupons: store.getCoupons().filter(c => couponStatus(c).valid).length,
      bundles: store.getBundles().filter(b => b.active).length
    },
    recentOrders: allOrders.slice().sort((a, b) => b.id - a.id).slice(0, 6).map(o => ({
      orderNumber: o.orderNumber, customerName: o.customerName, total: o.total, status: o.status, createdAt: o.createdAt
    }))
  });
});

app.listen(PORT, () => {
  console.log(`Autique store running at http://localhost:${PORT}`);
  console.log(`Admin panel at http://localhost:${PORT}/admin.html`);
  console.log(`Logistics portal at http://localhost:${PORT}/logistics.html`);
});
