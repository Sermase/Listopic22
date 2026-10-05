const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  DEFAULT_IMPULSE_PRICING,
  normalizeImpulsePricing,
  validateImpulsePricingInput,
  campaignImpulses,
  impulsesPriceEur,
  normalizeCampaignRequest,
  resolveImpulsePurchase,
} = require('../modules/lib/impulse-pricing');
const { verifyStripeSignature } = require('../modules/lib/stripe-signature');

const pricing = normalizeImpulsePricing({});

test('impulsos: 1 impulso = 0,2 km × 1 día × 1 papeleta a 0,05 €', () => {
  assert.equal(pricing.pricePerImpulseEur, 0.05);
  assert.equal(campaignImpulses({ radiusKm: 0.2, days: 1, intensity: 1 }, pricing), 1);
  assert.equal(campaignImpulses({ radiusKm: 0.4, days: 1, intensity: 1 }, pricing), 2);
  assert.equal(campaignImpulses({ radiusKm: 0.4, days: 2, intensity: 1 }, pricing), 4);
  // Bar: 1 km, 7 días → 35 impulsos = 1,75 €
  assert.equal(campaignImpulses({ radiusKm: 1, days: 7, intensity: 1 }, pricing), 35);
  assert.equal(impulsesPriceEur(35, pricing), 1.75);
  // Campaña grande: 5 km, 10 días, ×4 → 1.000 impulsos = 50 €
  assert.equal(campaignImpulses({ radiusKm: 5, days: 10, intensity: 4 }, pricing), 1000);
  assert.equal(impulsesPriceEur(1000, pricing), 50);
  // Radios que no son múltiplo exacto en coma flotante
  assert.equal(campaignImpulses({ radiusKm: 1.2, days: 1, intensity: 1 }, pricing), 6);
});

test('impulsos: la configuración antigua por semanas no fija el precio nuevo', () => {
  const legacy = normalizeImpulsePricing({ pricePerRadiusStepPerWeek: 0.08, maxUnitsPerCampaign: 4, maxWeeks: 3, minRadiusKm: 0.4, maxRadiusKm: 10 });
  assert.equal(legacy.pricePerImpulseEur, DEFAULT_IMPULSE_PRICING.pricePerImpulseEur);
  assert.equal(legacy.maxIntensity, 4);
  assert.equal(legacy.maxDays, 21);
  assert.equal(legacy.minRadiusKm, 0.4);
  assert.equal(legacy.maxRadiusKm, 10);
  assert.deepEqual(legacy.packs, DEFAULT_IMPULSE_PRICING.packs.map((pack) => ({ ...pack })));
});

test('impulsos: petición de campaña (formato nuevo y antiguo)', () => {
  assert.deepEqual(normalizeCampaignRequest({ radiusKm: 2, days: 3, intensity: 2 }, pricing), { intensity: 2, days: 3, radiusKm: 2 });
  assert.deepEqual(normalizeCampaignRequest({ radiusKm: 2, weeks: 2, units: 3 }, pricing), { intensity: 3, days: 14, radiusKm: 2 });
  assert.ok(normalizeCampaignRequest({ radiusKm: 0.3, days: 1, intensity: 1 }, pricing).error);
  assert.ok(normalizeCampaignRequest({ radiusKm: 2, days: 0, intensity: 1 }, pricing).error);
  assert.ok(normalizeCampaignRequest({ radiusKm: 2, days: 1, intensity: 11 }, pricing).error);
  assert.ok(normalizeCampaignRequest({ radiusKm: 21, days: 1, intensity: 1 }, pricing).error);
  assert.ok(normalizeCampaignRequest({ radiusKm: 2, days: 1.5, intensity: 1 }, pricing).error);
});

test('impulsos: compra por paquete o suelta con mínimo', () => {
  assert.deepEqual(resolveImpulsePurchase({ packIndex: 1 }, pricing), { impulses: 500, priceEur: 22.5, packIndex: 1 });
  assert.ok(resolveImpulsePurchase({ packIndex: 9 }, pricing).error);
  assert.deepEqual(resolveImpulsePurchase({ impulses: 30 }, pricing), { impulses: 100, priceEur: 5, packIndex: null });
  assert.deepEqual(resolveImpulsePurchase({ impulses: 1234 }, pricing), { impulses: 1234, priceEur: 61.7, packIndex: null });
  assert.ok(resolveImpulsePurchase({ impulses: 0 }, pricing).error);
  assert.ok(resolveImpulsePurchase({ impulses: 2.5 }, pricing).error);
});

test('impulsos: validación de lo que guarda un jefe', () => {
  const ok = validateImpulsePricingInput({
    pricePerImpulseEur: 0.05, minRadiusKm: 0.2, maxRadiusKm: 50, maxIntensity: 20, maxDays: 90, minPurchaseImpulses: 100,
    packs: [{ impulses: 500, priceEur: 22.5 }, { impulses: 100, priceEur: 5 }],
  });
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.pricing.packs, [{ impulses: 100, priceEur: 5 }, { impulses: 500, priceEur: 22.5 }]);
  const base = { pricePerImpulseEur: 0.05, minRadiusKm: 0.2, maxRadiusKm: 20, maxIntensity: 10, maxDays: 60, minPurchaseImpulses: 100, packs: [] };
  assert.ok(validateImpulsePricingInput({ ...base, pricePerImpulseEur: 0 }).error);
  assert.ok(validateImpulsePricingInput({ ...base, maxRadiusKm: 0.1 }).error);
  assert.ok(validateImpulsePricingInput({ ...base, minPurchaseImpulses: 5 }).error, 'menos de 0,50 €');
  assert.ok(validateImpulsePricingInput({ ...base, packs: [{ impulses: 10, priceEur: 0.2 }] }).error);
  assert.ok(validateImpulsePricingInput({ ...base, packs: [{ impulses: 100, priceEur: 5 }, { impulses: 100, priceEur: 4 }] }).error);
  assert.equal(validateImpulsePricingInput(base).error, undefined);
});

test('webhook de Stripe: firma válida, caducada, falsa y con rotación', () => {
  const secret = 'whsec_test';
  const body = Buffer.from('{"id":"evt_1"}');
  const now = 1_800_000_000;
  const sign = (t, key = secret) => crypto.createHmac('sha256', key).update(`${t}.${body.toString('utf8')}`).digest('hex');
  assert.doesNotThrow(() => verifyStripeSignature(body, `t=${now},v1=${sign(now)}`, secret, now));
  assert.doesNotThrow(() => verifyStripeSignature(body, `t=${now},v1=${sign(now, 'otro')},v1=${sign(now)}`, secret, now));
  assert.throws(() => verifyStripeSignature(body, `t=${now - 301},v1=${sign(now - 301)}`, secret, now), /caducada/);
  assert.throws(() => verifyStripeSignature(body, `t=${now},v1=${sign(now, 'otro')}`, secret, now), /no válida/);
  assert.throws(() => verifyStripeSignature(body, `t=${now}`, secret, now), /incompleta/);
});
