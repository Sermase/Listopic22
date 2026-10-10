// B6: compras de impulsos con Checkout caducado o pago fallido
// (lib/impulse-purchases.js y el webhook de stripe-business.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const firestoreAdmin = require('firebase-admin/firestore');
const { FakeFirestore, isServerTimestamp } = require('./helpers/fake-firestore');
const {
  stripeWebhookAction,
  impulsePurchaseClosingStatus,
  canCloseImpulsePurchase,
} = require('../modules/lib/impulse-purchases');

const impulseSession = (type, extra = {}) => ({
  id: `evt_${type}`,
  type,
  data: { object: { id: 'cs_test_1', mode: 'payment', metadata: { kind: 'impulse_pack', placeId: 'p1', userId: 'u1', impulses: '100' }, ...extra } },
});

test('stripeWebhookAction: reparte cada evento', () => {
  assert.equal(stripeWebhookAction(impulseSession('checkout.session.completed')), 'impulse_paid');
  assert.equal(stripeWebhookAction(impulseSession('checkout.session.async_payment_succeeded')), 'impulse_paid');
  assert.equal(stripeWebhookAction(impulseSession('checkout.session.expired')), 'impulse_closed');
  assert.equal(stripeWebhookAction(impulseSession('checkout.session.async_payment_failed')), 'impulse_closed');

  const subscriptionCheckout = { type: 'checkout.session.completed', data: { object: { mode: 'subscription', metadata: { plan: 'business_pro' } } } };
  assert.equal(stripeWebhookAction(subscriptionCheckout), 'subscription');
  assert.equal(stripeWebhookAction({ type: 'customer.subscription.updated', data: { object: {} } }), 'subscription');
  assert.equal(stripeWebhookAction({ type: 'customer.subscription.deleted', data: { object: {} } }), 'subscription');

  // Un Checkout de Business Pro caducado no es una compra de impulsos: se ignora como antes.
  assert.equal(stripeWebhookAction({ type: 'checkout.session.expired', data: { object: { mode: 'subscription' } } }), null);
  assert.equal(stripeWebhookAction({ type: 'invoice.paid', data: { object: {} } }), null);
  assert.equal(stripeWebhookAction({}), null);
});

test('impulsePurchaseClosingStatus y canCloseImpulsePurchase', () => {
  assert.equal(impulsePurchaseClosingStatus('checkout.session.expired'), 'expired');
  assert.equal(impulsePurchaseClosingStatus('checkout.session.async_payment_failed'), 'failed');
  assert.equal(impulsePurchaseClosingStatus('checkout.session.completed'), null);
  assert.equal(canCloseImpulsePurchase('pending'), true);
  assert.equal(canCloseImpulsePurchase(undefined), true);
  assert.equal(canCloseImpulsePurchase('paid'), false, 'una compra pagada no retrocede');
  assert.equal(canCloseImpulsePurchase('expired'), false);
  assert.equal(canCloseImpulsePurchase('failed'), false);
});

// ── Webhook con Firestore en memoria ───────────────────────────────────────

const db = new FakeFirestore();
firestoreAdmin.getFirestore = () => db;
const WEBHOOK_SECRET = 'whsec_test_listopic';
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
const { stripeBusinessWebhook } = require('../modules/stripe-business');

async function deliver(event) {
  const rawBody = Buffer.from(JSON.stringify(event));
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${rawBody.toString('utf8')}`).digest('hex');
  const headers = { 'stripe-signature': `t=${t},v1=${v1}` };
  const req = {
    method: 'POST',
    rawBody,
    body: event,
    headers,
    header: (name) => headers[name.toLowerCase()],
    get: (name) => headers[name.toLowerCase()],
  };
  const res = {
    statusCode: 200,
    body: null,
    headersSent: false,
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; this.headersSent = true; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
    on() { return this; },
    setHeader() {},
    getHeader() {},
  };
  await stripeBusinessWebhook(req, res);
  return res;
}

const PURCHASE = 'impulsePurchases/cs_test_1';
const pendingPurchase = () => ({ placeId: 'p1', userId: 'u1', impulses: 100, status: 'pending', stripeSessionId: 'cs_test_1' });

test('webhook: un Checkout de impulsos caducado pasa la compra a expired', async () => {
  db.store.clear();
  db.seed(PURCHASE, pendingPurchase());
  db.seed('places/p1', { spotlightCredits: 20 });
  const res = await deliver(impulseSession('checkout.session.expired'));
  assert.equal(res.statusCode, 200);
  const purchase = db.data(PURCHASE);
  assert.equal(purchase.status, 'expired');
  assert.ok(isServerTimestamp(purchase.expiredAt));
  assert.equal(purchase.stripeEventId, 'evt_checkout.session.expired');
  assert.equal(purchase.impulses, 100, 'conserva los datos de la compra');
  assert.equal(db.data('places/p1').spotlightCredits, 20, 'no toca el saldo');
});

test('webhook: un pago asíncrono fallido pasa la compra a failed', async () => {
  db.store.clear();
  db.seed(PURCHASE, pendingPurchase());
  await deliver(impulseSession('checkout.session.async_payment_failed'));
  const purchase = db.data(PURCHASE);
  assert.equal(purchase.status, 'failed');
  assert.ok(isServerTimestamp(purchase.failedAt));
});

test('webhook: una compra pagada no retrocede aunque llegue un evento de cierre', async () => {
  db.store.clear();
  db.seed(PURCHASE, { ...pendingPurchase(), status: 'paid' });
  const res = await deliver(impulseSession('checkout.session.expired'));
  assert.equal(res.statusCode, 200);
  assert.equal(db.data(PURCHASE).status, 'paid');
  assert.equal(db.data(PURCHASE).expiredAt, undefined);
});

test('webhook: sin documento previo deja constancia de la compra caducada', async () => {
  db.store.clear();
  await deliver(impulseSession('checkout.session.expired'));
  const purchase = db.data(PURCHASE);
  assert.equal(purchase.status, 'expired');
  assert.equal(purchase.placeId, 'p1');
  assert.equal(purchase.userId, 'u1');
  assert.equal(purchase.impulses, 100);
});

test('webhook: el pago sigue sumando impulsos una sola vez', async () => {
  db.store.clear();
  db.seed(PURCHASE, pendingPurchase());
  db.seed('places/p1', { spotlightCredits: 20 });
  const paid = impulseSession('checkout.session.completed', { payment_status: 'paid', amount_total: 500, currency: 'eur' });
  await deliver(paid);
  await deliver(paid);
  assert.equal(db.data(PURCHASE).status, 'paid');
  assert.equal(db.data('places/p1').spotlightCredits, 120);
});
