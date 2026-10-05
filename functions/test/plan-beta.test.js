const test = require('node:test');
const assert = require('node:assert/strict');
const { PLAN_BETA, normalizeInterestRequest, interestDocId, priceShown, trialExpiry } = require('../modules/lib/plan-beta');

test('beta de planes: valida plan y periodo', () => {
  assert.ok(normalizeInterestRequest({ plan: 'gold' }).error);
  assert.ok(normalizeInterestRequest({ plan: 'premium' }).error, 'Premium aún no está en la beta');
  assert.deepEqual(normalizeInterestRequest({ plan: 'business_pro', billing: 'raro' }), { plan: 'business_pro', billing: 'monthly', placeId: '' });
  assert.deepEqual(normalizeInterestRequest({ plan: 'business_pro', billing: 'yearly', placeId: ' p1 ' }), { plan: 'business_pro', billing: 'yearly', placeId: 'p1' });
});

test('beta de planes: un registro por usuario o por local', () => {
  assert.equal(interestDocId({ plan: 'premium', placeId: '' }, 'u1'), 'premium_user_u1');
  assert.equal(interestDocId({ plan: 'business_pro', placeId: '' }, 'u1'), 'business_pro_user_u1');
  assert.equal(interestDocId({ plan: 'business_pro', placeId: 'p1' }, 'u1'), 'business_pro_place_p1');
});

test('beta de planes: precio enseñado y caducidad de la prueba', () => {
  assert.equal(priceShown('business_pro', 'monthly'), PLAN_BETA.plans.business_pro.monthlyEur);
  assert.equal(priceShown('business_pro', 'yearly'), PLAN_BETA.plans.business_pro.yearlyEur);
  assert.equal(trialExpiry(0).getTime(), PLAN_BETA.trialDays * 86400000);
});
