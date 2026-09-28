// The online payment methods enabled on our Rapid Gateway account. This is the
// only place they are listed: the checkout, product pages and default policy
// texts all read it. When a method is switched on or off, edit this line.
const ONLINE_METHODS = ['debit/credit card', 'Easypaisa', 'JazzCash', 'bank account'];

// "a, b, c or d"
function methodsText(list = ONLINE_METHODS) {
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}` : (list[0] || '');
}

module.exports = { ONLINE_METHODS, methodsText };
