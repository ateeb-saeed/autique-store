// Applies lib/catalog.js to the store's data. Used by admin → Products →
// "Import Autique catalogue" and by `npm run import-catalog`.
const store = require('./store');
const catalog = require('./catalog');

// Apply lib/catalog.js to the store: categories by need, product types, and every
// product's details, SKUs, variants and photos. Matching products are updated in
// place (same id, stock and order history); missing ones are added; products that
// were merged into another (e.g. Color Magic Black into Color Magic) are hidden
// and their stock moves to the matching variant. Other products are left alone.
function catalogPlan(products) {
  const used = new Set();
  const rows = catalog.PRODUCTS.map(cp => {
    const matches = products.filter(p => !used.has(p.id) &&
      (cp.match.includes(p.name) || p.name === cp.name || (p.sku && p.sku === cp.sku)));
    matches.forEach(m => used.add(m.id));
    return { cp, target: matches[0] || null, merged: matches.slice(1) };
  });
  return { rows, untouched: products.filter(p => !used.has(p.id)) };
}

const labelOf = v => [v.color, v.size].filter(Boolean).join(' / ') || 'Standard';

function applyCatalog() {
  const products = store.getProducts();
  const { rows, untouched } = catalogPlan(products);
  const log = store.getStockLog();
  const at = new Date().toISOString();
  const moveStock = (from, product, variant, qty) => {
    if (!qty) return;
    variant.stock = (variant.stock || 0) + qty;
    log.push({ id: store.nextId(log), type: 'adjust', key: `${product.id}:${variant.id}`, name: `${product.name} — ${labelOf(variant)}`, sku: variant.sku, qty, balance: variant.stock, note: `Moved from ${from} (catalogue import)`, by: 'Admin', at });
  };

  for (const { cp, target, merged } of rows) {
    const p = target || { id: store.nextId(products), stock: 0, variants: [], active: true };
    const oldName = p.name || '';
    const oldStock = p.stock || 0;
    Object.assign(p, {
      name: cp.name, brand: cp.brand, size: cp.size, sku: cp.sku, price: cp.price, desc: cp.desc,
      usage: cp.usage, specs: cp.specs, categoryKey: cp.need, type: cp.type
    });
    // keep photos you uploaded yourself if the catalogue has none for this product
    if (cp.images.length) { p.images = cp.images.slice(); p.image = cp.images[0]; }
    if (!p.images) p.images = p.image ? [p.image] : [];

    if (cp.variants && cp.variants.length) {
      const old = p.variants || [];
      p.variants = cp.variants.map((cv, i) => {
        const prev = old.find(v => v.sku === cv.sku) || old.find(v => labelOf(v) === labelOf(cv));
        return {
          id: prev ? prev.id : Math.max(0, ...old.map(v => v.id)) + i + 1,
          color: cv.color || '', size: cv.size || '', sku: cv.sku, price: cp.price, priceSet: false,
          stock: prev ? prev.stock || 0 : 0, active: true, image: cv.image || (prev && prev.image) || ''
        };
      });
      // product-level stock from before (e.g. "Color Magic Grey") goes to its variant
      const own = p.variants.find(v => oldName.toLowerCase().includes(labelOf(v).toLowerCase()));
      if (own && oldStock) { moveStock(oldName, p, own, oldStock); p.stock = 0; }
    } else {
      p.variants = [];
    }
    for (const m of merged) {
      const v = (p.variants || []).find(x => m.name.toLowerCase().includes(labelOf(x).toLowerCase()));
      if (v) { moveStock(m.name, p, v, m.stock || 0); m.stock = 0; }
      m.active = false;
      m.mergedInto = p.id;
    }
    if (!target) products.push(p);
  }

  // categories: the needs, plus any old category still used by a product left untouched
  const oldCats = store.getCategories();
  const keepCats = oldCats.filter(c => !catalog.NEEDS.some(n => n.key === c.key) && untouched.some(p => p.categoryKey === c.key && p.active));
  store.saveCategories([...catalog.NEEDS.map(n => ({ ...n })), ...keepCats]);
  store.saveProducts(products);
  store.saveStockLog(log);
  return { updated: rows.filter(r => r.target).length, added: rows.filter(r => !r.target).length, merged: rows.reduce((n, r) => n + r.merged.length, 0), untouched: untouched.length };
}


module.exports = { catalogPlan, applyCatalog, labelOf };
