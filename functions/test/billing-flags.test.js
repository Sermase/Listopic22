const test = require('node:test');
const assert = require('node:assert/strict');
const { isCheckoutEnabled } = require('../modules/lib/billing-flags');

test('Stripe cerrado salvo STRIPE_CHECKOUT_ENABLED=true', () => {
  assert.equal(isCheckoutEnabled({}), false);
  assert.equal(isCheckoutEnabled({ STRIPE_CHECKOUT_ENABLED: 'false' }), false);
  assert.equal(isCheckoutEnabled({ STRIPE_CHECKOUT_ENABLED: '1' }), false);
  assert.equal(isCheckoutEnabled({ STRIPE_CHECKOUT_ENABLED: 'true' }), true);
  assert.equal(isCheckoutEnabled({ STRIPE_CHECKOUT_ENABLED: ' TRUE ' }), true);
});
