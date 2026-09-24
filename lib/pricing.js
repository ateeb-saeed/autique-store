// Central place for any calculation involving money, so the storefront
// and the server always agree on what something costs.

// Works for a full product, or for any {price, categoryKey} pair — which
// lets a variant reuse the exact same sale logic as its parent product.
function effectivePrice(item, settings) {
  if (!settings.saleActive) return item.price;
  const applies = settings.saleAppliesTo === 'all' || settings.saleAppliesTo === item.categoryKey;
  if (!applies) return item.price;
  const pct = Number(settings.saleDiscountPercent) || 0;
  return Math.max(0, Math.round(item.price * (1 - pct / 100)));
}

function findCoupon(coupons, code) {
  if (!code) return null;
  const clean = String(code).trim().toUpperCase();
  return coupons.find(c => c.code.toUpperCase() === clean) || null;
}

function couponStatus(coupon) {
  if (!coupon) return { valid: false, reason: 'That code does not exist.' };
  if (!coupon.active) return { valid: false, reason: 'That code is no longer active.' };
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    return { valid: false, reason: 'That code has expired.' };
  }
  return { valid: true };
}

function couponDiscount(coupon, subtotal) {
  if (coupon.type === 'percent') {
    return Math.round(subtotal * (Number(coupon.value) / 100));
  }
  // fixed amount off, never more than the subtotal itself
  return Math.min(Number(coupon.value) || 0, subtotal);
}

module.exports = { effectivePrice, findCoupon, couponStatus, couponDiscount };
