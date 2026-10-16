// PostEx's courier status is the source of truth for what is physically happening
// to a booked parcel. This moves the order's own status forward to match, and
// only forward: a repeated or late update never undoes a later state.
//
//   PostEx status                                         order status
//   Unbooked, Booked, PostEx WareHouse, Picked By PostEx,
//     En-Route to PostEx warehouse                        Booked with courier
//   Out For Delivery, Package on Root (Route)             Dispatched
//   Delivered                                             Delivered
//   Returned, Expired, Un-Assigned By Me,
//     Delivery Under Review, Attempted                    unchanged: flagged for admin

const BOOKED_STATUS = 'Booked with courier';
const norm = s => String(s || '').toLowerCase().replace(/[\s_]+/g, ' ').replace(/\s*-\s*/g, '-').trim();
const STAGES = [
  // listed in the order they happen; within a stage that order counts too
  { stage: 'booked', rank: 1, order: BOOKED_STATUS, names: ['unbooked', 'booked', 'picked by postex', 'en-route to postex warehouse', 'postex warehouse'] },
  { stage: 'dispatched', rank: 2, order: 'Dispatched', names: ['out for delivery', 'package on root', 'package on route'] },
  { stage: 'delivered', rank: 3, order: 'Delivered', names: ['delivered'] }
];
const ATTENTION = ['returned', 'expired', 'un-assigned by me', 'delivery under review', 'attempted'];
// how far along each order status is (statuses before booking count as 0)
const ORDER_RANK = { [BOOKED_STATUS]: 1, Dispatched: 2, Shipped: 2, Delivered: 3 };

function classify(status) {
  const s = norm(status);
  if (ATTENTION.includes(s)) return { stage: 'attention', rank: 0 };
  const st = STAGES.find(x => x.names.includes(s));
  // e.g. "Picked By PostEx" = 1.2: still the booked stage, but after "Booked" (1.1)
  return st ? { stage: st.stage, rank: st.rank + st.names.indexOf(s) / 10, order: st.order } : { stage: 'unknown', rank: 0 };
}

// Apply a courier status to an order object (changes it in place).
// Returns { changed, ignored, previousStatus, reason }.
function applyCourierStatus(order, status, at = new Date().toISOString()) {
  const c = classify(status);
  const previousStatus = order.status;
  const reached = Number(order.courierRank) || 0;
  // an earlier stage arriving after a later one is out of order: ignore it
  if (c.rank && c.rank < reached) return { changed: false, ignored: true, previousStatus, reason: `"${status}" is earlier than what PostEx already reported` };
  order.courierStatus = String(status);
  order.courierStatusAt = at;
  if (c.stage === 'attention') {
    order.courierAttention = String(status);
    return { changed: false, ignored: false, previousStatus, reason: 'needs a decision in admin' };
  }
  if (c.stage === 'unknown') return { changed: false, ignored: false, previousStatus, reason: 'status not in the mapping; order status left as is' };
  order.courierRank = Math.max(reached, c.rank);
  delete order.courierAttention;   // back on track (e.g. a re-attempt is out for delivery)
  if (order.status !== 'Cancelled' && Math.floor(c.rank) > (ORDER_RANK[order.status] || 0)) {
    order.status = c.order;
    return { changed: true, ignored: false, previousStatus };
  }
  return { changed: false, ignored: false, previousStatus };
}

module.exports = { BOOKED_STATUS, ORDER_RANK, classify, applyCourierStatus };
