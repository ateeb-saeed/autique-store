# Autique — local store

A Shopify-style storefront for Autique, with sign in/sign up, a cart, an
admin panel, discount coupons, bundles, storewide sales, and a checkout
flow with Cash on Delivery / Card. Runs entirely on your own laptop
(localhost) for now.

## What's inside

- `server.js` — the backend: storefront + admin APIs, accounts, orders.
- `lib/store.js` — reads/writes all the data (plain JSON files, no database
  engine, so nothing needs to be compiled on your machine).
- `lib/pricing.js` — sale pricing and coupon math, shared by every route.
- `products.js` — the original 25 products, used only to fill the store
  the very first time it runs. After that, edit products from the admin
  panel instead.
- `data/` — created automatically the first time you run the server:
  accounts, products, categories, coupons, bundles, orders, sale settings,
  and the admin password all live here as plain JSON files.
- `public/index.html`, `style.css`, `app.js` — the storefront.
- `public/admin.html`, `admin.css`, `admin.js` — the admin panel.

## How to run it

```
npm install
npm start
```

Then open:

- **Storefront:** http://localhost:3000
- **Admin panel:** http://localhost:3000/admin.html

The first time you start the server, it prints a default admin password
in the terminal — something like:

```
Admin panel created. Sign in at /admin with this password: autique-admin
```

Use that to sign in, then go to "Admin settings" inside the panel and
change it to something only you know.

## What the admin panel can do

- **Products** — edit name, price, SKU, description, category, image, or turn
  a product on/off; add brand-new products with a picture upload.
- **Variants** — click "Variants" on any product to add color/size options,
  each with its own SKU, price and picture (e.g. Grey vs Black versions of
  the same product). Customers pick one from a dropdown on the storefront.
- **Bulk upload (CSV)** — add or update many products at once. Columns:
  `name, category, price, sku, description, active, image`. `category` must
  match an existing category name; if a row's SKU matches an existing
  product, that product gets updated instead of duplicated. This covers
  simple products only — variants are still added one at a time through the
  Variants button, since each needs its own picture and price.
- **Categories** — rename a category or its tagline; add new ones.
- **Discount coupons** — create a code that takes a percentage or a fixed
  Rs. amount off, with an optional expiry date; deactivate or delete one
  any time.
- **Bundles** — pick two or more products and set a bundle price lower
  than buying them separately. Shows up on the homepage automatically
  while active; toggle it off at the end of the month.
- **Sale** — one switch to run a storewide (or single-category) sale:
  set a percentage off and a banner label ("Eid Sale — 20% off"), and it
  shows on every affected product with the old price struck through.
- **Orders** — every order placed on the storefront, with the customer's
  details, what they bought, the payment method, and a status you can
  update (Pending, Confirmed, Shipped, Delivered, etc).

## What checkout looks like for a customer

1. Add products and/or bundles to the cart.
2. Optionally enter a discount code in the cart drawer.
3. Click Checkout (this asks them to sign in first, if they haven't).
4. Fill in name, phone, address, city, and choose Cash on Delivery or
   Card.
5. See an order confirmation screen with their order number and total.

Card payment is currently a stub — it records the order as "Pending
payment" but doesn't charge a real card yet. That's the natural next
step once you're ready to connect Rapid Gateway.

## Taking it online

When you deploy this (Railway, etc.), set an environment variable called
`SESSION_SECRET` to a long random string — this keeps people signed in
securely. Locally it falls back to a default automatically, so you don't
need to set anything to keep running it on your own laptop.

Also: `data/` and `public/uploads/` hold everything that makes the store
"yours" — accounts, orders, coupons, uploaded pictures. Wherever you host
this, make sure those two folders are on storage that survives a restart
(a persistent volume), not just the app's own temporary disk.

## Next steps, when you're ready

- Connect a real payment gateway for the Card option.
- Move this online (autique.pk, Railway, Cloudflare) — the same code
  runs there with minimal changes.
- Add product photos (currently every product uses the same simple icon).
