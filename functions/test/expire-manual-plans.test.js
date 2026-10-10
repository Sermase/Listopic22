// B1: proceso diario expireManualPlans (admin/admin-plans.js) contra un
// Firestore en memoria: planes caducados y campañas vencidas.
const test = require('node:test');
const assert = require('node:assert/strict');
const firestoreAdmin = require('firebase-admin/firestore');
const { Timestamp } = firestoreAdmin;
const { FakeFirestore } = require('./helpers/fake-firestore');

const db = new FakeFirestore();
firestoreAdmin.getFirestore = () => db;
const { expireManualPlans } = require('../modules/admin/admin-plans');

const DAY = 24 * 60 * 60 * 1000;
const isoDay = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const audits = () => db.docsIn('adminAuditLog').map((entry) => entry.data);

test('un Business Pro manual caducado pierde también businessPlanGrantedBy', async () => {
  db.store.clear();
  db.seed('places/p-beta', {
    name: 'Bar Pepe',
    businessTier: 'pro',
    businessProActive: true,
    businessPlanSource: 'trial',
    businessPlanExpiresAt: Timestamp.fromMillis(Date.now() - DAY),
    businessPlanGrantedBy: 'beta',
    businessPlanNotes: 'Prueba de 90 días',
  });
  db.seed('places/p-stripe', {
    businessProActive: true,
    businessPlanSource: 'stripe',
    businessPlanExpiresAt: Timestamp.fromMillis(Date.now() - DAY),
    businessPlanGrantedBy: 'jefe1',
  });

  await expireManualPlans.run({});

  const place = db.data('places/p-beta');
  assert.equal(place.businessTier, 'free');
  assert.equal(place.businessProActive, false);
  assert.equal(place.businessPlanSource, undefined);
  assert.equal(place.businessPlanExpiresAt, undefined);
  assert.equal(place.businessPlanGrantedBy, undefined);
  assert.equal(place.businessPlanNotes, 'Prueba de 90 días', 'la nota se conserva para el historial');

  assert.equal(db.data('places/p-stripe').businessPlanGrantedBy, 'jefe1', 'Stripe no se toca');

  const expired = audits().find((entry) => entry.action === 'businessPlan.expired');
  assert.equal(expired.actorUid, 'system');
  assert.equal(expired.details.placeId, 'p-beta');
  assert.equal(expired.details.previousGrantedBy, 'beta');
});

test('cierra campañas vencidas con auditoría y aviso al negocio, también con 200+ viejas', async () => {
  db.store.clear();
  for (let i = 0; i < 230; i += 1) {
    db.seed(`sponsoredPlacements/old${String(i).padStart(3, '0')}`, { status: 'ended', endsAt: '2025-02-01', placeId: 'p-old' });
  }
  db.seed('sponsoredPlacements/active', { status: 'active', endsAt: isoDay(-2), placeId: 'p1', placeName: 'Café Sol', createdBy: 'u-sol', reviewedBy: 'jefe1' });
  db.seed('sponsoredPlacements/requested', { status: 'requested', endsAt: isoDay(-1), placeId: 'p1', placeName: 'Café Sol', createdBy: 'u-sol' });
  db.seed('sponsoredItemSpotlights/spot', { status: 'active', endsAt: isoDay(-1), placeId: 'p1', itemName: 'Bravas', createdBy: 'u-sol' });
  db.seed('sponsoredPlacements/current', { status: 'active', endsAt: isoDay(5), placeId: 'p1', createdBy: 'u-sol' });

  await expireManualPlans.run({});

  assert.equal(db.data('sponsoredPlacements/active').status, 'ended');
  assert.equal(db.data('sponsoredPlacements/active').endedBy, 'system');
  assert.equal(db.data('sponsoredPlacements/active').activatedBy, 'jefe1');
  assert.equal(db.data('sponsoredPlacements/requested').status, 'rejected');
  assert.equal(db.data('sponsoredPlacements/requested').adminNotes, 'Caducada sin revisar');
  assert.equal(db.data('sponsoredItemSpotlights/spot').status, 'ended');
  assert.equal(db.data('sponsoredPlacements/current').status, 'active');

  const expiredCampaigns = audits().filter((entry) => entry.action === 'sponsored.campaignExpired');
  assert.equal(expiredCampaigns.length, 3);
  assert.ok(expiredCampaigns.every((entry) => entry.actorUid === 'system'));

  const notifications = db.docsIn('users/u-sol/notifications');
  assert.deepEqual(notifications.map((n) => n.id).sort(), ['item_spotlight_spot', 'sponsored_active', 'sponsored_requested']);
  assert.ok(notifications.every((n) => n.data.type === 'business_pro_update'));
});
