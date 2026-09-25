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
- **Admin panel:** http://localhost:3000/admin/
- **Logistics portal:** http://localhost:3000/logistics/

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

## Site editor (admin → Site editor)

One place to change what customers and the logistics login see, without
touching code. Saved in `data/site.json`; anything never saved uses the
original wording.

- **Content** — announcement bar, home page hero (heading, text, button,
  brands), trust strip, bestsellers heading and count, brand panel, the About
  story and points, footer tagline and help lines.
- **Sections** — show or hide the animated logo banner, trust strip,
  collections, bundles, bestsellers, brand panel and the About page.
- **Customer rules** — new sign-ups, Google sign-in, email changes, order
  tracking, cash on delivery, pay online (at least one payment option must stay
  on).
- **Logistics rights** — whether the logistics login can see orders, dispatch,
  restock, see stock history, see customers' phone/address and see COD amounts.
  The admin can always do everything.

These are enforced on the server, not just hidden on the page. "Restore
defaults for this section" brings back the original settings (after Save).

## Logistics portal

A separate sign-in for the stock person at
http://localhost:3000/logistics/ (default password `autique-logistics`,
printed on first run; the admin can change it under Admin settings). It shows
no prices and can't change products, coupons, sales or settings.

- **Stock** — every product and variant with its SKU, units on hand,
  units reserved by orders not yet dispatched, and what's available.
  **Restock** adds units that arrived, with an optional note.
- **Orders** — delivery details, items with SKUs, and the cash to collect
  for COD. **Dispatch** records the courier and tracking number and takes
  the items off the stock count; it's refused if there isn't enough stock.
  After dispatch, **Print invoice / dispatch note** opens an A4 PDF to pack
  with the parcel: order and tracking details, the ship-to address, the items
  with SKUs and totals, a large "collect Rs. X cash on delivery" (or
  "prepaid") box for the courier, a received-by signature line and the
  returns policy. Dispatched orders keep an **Invoice** button (also in
  admin → Orders).
- **Stock history** — every restock and dispatch, with the running balance.

## The Autique catalogue

`lib/catalog.js` holds the full catalogue: categories **by need** (Cleaning,
Shine & Protect, Polishing & Restoration, Protection & Maintenance, Engine &
Fuel Care), product **types** (Tyre Care, Car Wash & Shampoo, Interior Care,
Leather Care, Glass Care, Wax & Polish, Scratch & Paint Care, Engine Care, Fuel
Additives, Rust & Lubricants, Car Fragrances), and all 24 products with prices,
brand SKUs, sizes, variants (e.g. dashboard polish scents, Color Magic
colours), descriptions, directions and specifications. Product photos are in
`public/products/` (from the brands' own listings and Pakistani retailers).

To apply it to a store (it updates matching products in place, keeping stock
and order history, and adds anything missing):

- **Admin → Products → "Import Autique catalogue"** (shows a preview first), or
- `npm run import-catalog` to preview, then `npm run import-catalog -- --apply`.

On the live site, run it once after deploying. Running it again is safe.
Customers can shop by need and by type (menu, home page and shop filters).

## Business pages (for payment-provider verification)

Written from the business case document and editable in admin → Site editor →
Content:

- **Footer:** email, contact number, business address (exactly as registered:
  "82-A Revenue Society Lahore"), hours, and links to every policy.
- **Policies:** Refund & Returns, Shipping, Privacy, Terms & Conditions
  (`#/policies/refund`, `shipping`, `privacy`, `terms`).
- **Contact us** (`#/contact`): contact cards and business details (trading
  name, sole proprietorship, proprietor, NTN, registered address).
- **How Autique works** (`#/how-it-works`): the business model, operations,
  and the full customer journey step by step.
- **Inside Autique** photo gallery (home, About, How it works): upload real
  photos of inventory, packaging and the business setup in the Site editor.
- **Product pages:** photo gallery, brand, size, description, how to use,
  specifications, SKU, price, delivery and returns. Fill these in for each
  product in admin → Products.

The CNIC from the business document is deliberately not shown anywhere.

## Sign in with Google

The sign-up and sign-in pages show a **Continue with Google** button when
`GOOGLE_CLIENT_ID` is set (hidden otherwise). The server checks Google's
signed ID token itself (signature, issuer, audience, expiry, verified email).
A Google sign-in with an email that already has an account signs into that
account; otherwise a new account is created with no password (those customers
always use the Google button).

To get a client id: Google Cloud Console → APIs & Services → Credentials →
Create credentials → OAuth client ID → Web application. Under **Authorized
JavaScript origins** add `http://localhost:3000` and your live address (e.g.
`https://autique.pk`). No redirect URI is needed. Copy the client id into
`GOOGLE_CLIENT_ID`.

## Install as an app (Windows, Android, iPhone)

The storefront is an installable web app called **autique.**, with the copper
car as its icon (`public/manifest.webmanifest`, icons in `public/icons/`).
Customers install it from the menu ("Install the autique. app"), which shows
the steps for their device:

- **Windows / Mac:** Chrome or Edge → install icon in the address bar.
- **Android:** Chrome → ⋮ menu → Install app.
- **iPhone / iPad:** Safari → Share → Add to Home Screen.

It needs the live site on **HTTPS** (Railway provides this); on your laptop
it also works at `http://localhost`. `public/sw.js` keeps the app quick and
shows the last home page when offline; it never caches the API, admin,
logistics or payments. If you change `sw.js`, bump `CACHE` in it.

To list it in the Microsoft Store, Google Play or the App Store, feed the
live URL to pwabuilder.com, which packages this same web app for each store.

The admin and logistics portals are **separate apps**: **autique admin**
(`/admin/`, copper car on navy) and **autique logistics** (`/logistics/`,
copper car on white). Each has its own manifest, icon and "Install the …
app" link in its sidebar, and installs as its own entry on the phone or PC.
They never cache anything, because they show live orders, stock and customer
details. The old `/admin.html` and `/logistics.html` links redirect.

## What checkout looks like for a customer

Customers can **check out as a guest** — no account needed. After ordering,
the confirmation page offers an optional account (just a password) that saves
the order and their delivery details; if they're already signed in, they can
add the order to their account. Anyone can use **Track your order** with the
order number and the email used at checkout.

1. Add products and/or bundles to the bag.
2. Optionally enter a discount code in the bag.
3. Click Checkout (this asks them to sign in or create an account first).
4. Fill in name, phone, address, city, and choose Cash on Delivery or
   Card.
5. See an order confirmation screen with their order number and total.

## Online payments (Rapid Gateway)

The "Pay online" option at checkout uses Rapid Gateway's hosted page (card,
JazzCash, Easypaisa). The store never sees card details.

1. The order is saved with status **Awaiting payment**. The store gets an OAuth2
   token from Rapid Gateway (cached until it expires) and posts the order to
   `process-transaction` (basket_id = the order number). Rapid Gateway answers
   with a redirect, and the customer is sent to that checkout page.
2. Rapid Gateway sends them back to `PUBLIC_BASE_URL/?order=AUT-…` (with
   `&failed=1` on failure), where a banner says the payment is being confirmed.
3. Rapid Gateway calls `PUBLIC_BASE_URL/webhooks/rg` (see its payment
   webhooks guide). The store checks `X-RapidGateway-Signature`: uppercase hex
   HMAC-SHA256 of `timestamp + "." + raw body` with your webhook salt, using
   `X-RapidGateway-Timestamp` (rejected if more than 5 minutes off). Bad or
   stale signatures get 401.
   - `transaction.completed` → **Confirmed**, only if the paid amount matches the
     order total; otherwise the order is left alone and flagged in admin.
   - `transaction.failed` → **Payment failed** (only while still Awaiting payment).
   - `refund.completed` / `reversal.completed` → noted on the order in admin.
   - `webhook.test` is acknowledged and ignored. Repeat deliveries of the same
     `eventId` are ignored.

The status field is the single source of truth: the webhook and the admin's
status dropdown both write to it. Orders in "Awaiting payment" or "Payment
failed" don't show for dispatch and don't count as revenue.

| Variable | What it is |
|---|---|
| `RG_MERCHANT_ID` | Your Rapid Gateway merchant id. If it's missing, the "Pay online" option is hidden. |
| `RG_SANDBOX_CLIENT_ID` | OAuth2 client id (default `client`, the shared sandbox credential). |
| `RG_SANDBOX_CLIENT_SECRET` | OAuth2 client secret (default `secret`). |
| `RG_WEBHOOK_SECRET` | Webhook signing salt (Dashboard → Settings → Webhooks). |
| `RG_WEBHOOK_SECRET_PREVIOUS` | Optional: the old salt while you rotate it; both verify until you remove this. |
| `PUBLIC_BASE_URL` | The store's public address (default `http://localhost:3000`). Used for the return and webhook links. |

Register `https://your-site/webhooks/rg` as the webhook URL in the Rapid
Gateway dashboard. Sandbox test amounts: an order of exactly **Rs. 100**
succeeds and **Rs. 200** fails.

The API address is set in `lib/rapidgateway.js` (`RG_BASE`); the checkout
endpoint is the sandbox one (`/sandbox/process-transaction`) until you go live.

## Order emails

The customer is emailed automatically at each stage, from `info@autique.pk`:

| Stage | Sent when |
|---|---|
| Order placed | A COD order is placed, or a card order is sent to the payment page |
| Order confirmed | The status becomes **Confirmed** (by the Rapid Gateway webhook for card orders, or the admin's status dropdown) |
| On its way | The order is dispatched (logistics portal, or status **Dispatched** / **Shipped**). Includes the PostEx tracking link and the invoice PDF attached |
| Delivered | The admin sets the status to **Delivered** |

Each email goes at most once per order; admin → Orders shows which were
sent. Set these environment variables (on Railway: Variables):

| Variable | What it is |
|---|---|
| `SMTP_HOST` | Your mail provider's SMTP server, e.g. `smtp.zoho.com`, `smtp.gmail.com` (Google Workspace) or `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` (default) or `465` |
| `SMTP_USER` | Usually the full address, `info@autique.pk` |
| `SMTP_PASS` | Its password or app password |
| `MAIL_FROM` | Optional sender, default `Autique <info@autique.pk>` |
| `MAIL_REPLY_TO` | Optional reply-to address |
| `MAIL_OUTBOX_DIR` | For testing only: with no `SMTP_HOST`, save every email (and its PDF) to this folder instead of sending |

Without `SMTP_HOST`, nothing is sent: orders work as before and the server
log notes each email it skipped. The mailbox's domain needs SPF/DKIM set up
at your provider, or emails may land in spam. `PUBLIC_BASE_URL` must be the
live address, since the emails link to Track your order and show the logo
from it.

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

- Add the Rapid Gateway keys on Railway (see Online payments).
- Move this online (autique.pk, Railway, Cloudflare) — the same code
  runs there with minimal changes.
- Add product photos (currently every product uses the same simple icon).
