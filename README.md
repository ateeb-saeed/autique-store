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

- **Dashboard** — the first screen after signing in. Revenue, orders, average
  order, units sold and discounts for the last 7, 30 or 90 days, compared with
  the period before; revenue per day (hover a bar for details, or switch to a
  table); order status, revenue by category, payment method, top products,
  fulfilment, customers, stock needing attention, active promotions, and the
  latest orders. Cancelled orders are left out of revenue.
- **Products** — search and filter by category; select several to hide, show
  or delete at once. **Add product / Edit** opens one editor with the basics
  (name, category, price, description, SKU, visibility), photos (upload several
  or paste links; the first is the main one) and a "Sizes, colours and stock"
  table. Quick add creates every colour × size combination; each row has its
  own SKU, optional price (blank = the product price) and stock. Stock set here
  is recorded as "Admin edit" in the logistics stock history.
- **Bulk upload (CSV)** — add or update many products at once. Columns:
  `name, category, price, sku, description, active, image`. `category` must
  match an existing category name; if a row's SKU matches an existing
  product, that product gets updated instead of duplicated. This covers
  simple products only — variants are still added one at a time through the
  Variants button, since each needs its own picture and price.
- **Categories** — rename a category or its tagline; add new ones.
- **Coupons** — a code for a percentage or fixed Rs. amount off, with an
  optional minimum order, usage limit and expiry date; edit, switch off or
  delete any time. The table shows how many times each code has been used.
- **Bundles** — pick two or more products and set a bundle price lower
  than buying them separately. Shows up on the homepage automatically
  while active; toggle it off at the end of the month.
- **Sale** — one switch to run a storewide (or single-category) sale:
  set a percentage off and a banner label ("Eid Sale — 20% off"), and it
  shows on every affected product with the old price struck through.
- **Orders** — every order placed on the storefront, with the customer's
  details, what they bought, the payment method, and a status you can
  update (Pending, Confirmed, Shipped, Delivered, etc).

## Logistics portal

A separate sign-in for the stock person at
http://localhost:3000/logistics.html (default password `autique-logistics`,
printed on first run; the admin can change it under Admin settings). It shows
no prices and can't change products, coupons, sales or settings.

- **Stock** — every product and variant with its SKU, units on hand,
  units reserved by orders not yet dispatched, and what's available.
  **Restock** adds units that arrived, with an optional note.
- **Orders** — delivery details, items with SKUs, and the cash to collect
  for COD. **Dispatch** records the courier and tracking number and takes
  the items off the stock count; it's refused if there isn't enough stock.
- **Stock history** — every restock and dispatch, with the running balance.

## What checkout looks like for a customer

Customers need an account to order, so every order can be tracked. Anyone
can also use **Track your order** (in the menu) with their order number and
the email on their account. The **About us** page tells the Autique story.

1. Add products and/or bundles to the bag.
2. Optionally enter a discount code in the bag.
3. Click Checkout (this asks them to sign in or create an account first).
4. Fill in name, phone, address, city, and choose Cash on Delivery or
   Card.
5. See an order confirmation screen with their order number and total.

## Card payments (Rapid Gateway)

Card orders go through Rapid Gateway's hosted checkout: the customer places
the order, is sent to Rapid Gateway's card page, and comes back to their
order page. The store never sees card numbers. An order is only marked
**Paid** after the store re-checks the payment with Rapid Gateway (or gets
a signed webhook), never just because the customer came back. Unpaid card
orders don't show up for dispatch in the logistics portal and don't count
as revenue on the dashboard. A customer whose payment fails can try again
from their order page or "My orders".

**Test mode (default).** With no API key set, a local page stands in for
Rapid Gateway at `/pay/test/...` with Approve / Decline buttons, so the whole
flow can be tried without real money.

**Going live.** Get merchant/sandbox access from Rapid Gateway
(rapidgateway.pk), then set these environment variables:

| Variable | What it is |
|---|---|
| `RAPID_API_KEY` | Your secret API key. Setting it switches the store to live mode. |
| `RAPID_WEBHOOK_SECRET` | The secret used to sign webhooks. |
| `PUBLIC_URL` | Your site's address, e.g. `https://autique.pk` (used for the return and webhook links). |
| `RAPID_API_BASE` | Optional: API address if it isn't `https://api.rapidgateway.pk/v1`. |
| `RAPID_AMOUNT_MULTIPLIER` | Optional: `100` if Rapid Gateway wants amounts in paisa. |
| `RAPID_SIGNATURE_HEADER` | Optional: webhook signature header if it isn't `x-rapid-signature`. |

Register `https://your-site/api/payments/webhook` as the webhook URL in the
Rapid Gateway dashboard.

Rapid Gateway's full API reference is only shared with merchants, so
`lib/rapidgateway.js` marks each detail that must be checked against it
(API address, how the key is sent, status names, webhook signature, amount
units). Check those and run a sandbox payment before taking real orders.

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

- Add Rapid Gateway keys and verify `lib/rapidgateway.js` against their docs (see Card payments).
- Move this online (autique.pk, Railway, Cloudflare) — the same code
  runs there with minimal changes.
- Add product photos (currently every product uses the same simple icon).
