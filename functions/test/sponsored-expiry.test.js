// B1: cierre automático de campañas patrocinadas vencidas (lib/sponsored-expiry.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { Timestamp } = require('firebase-admin/firestore');
const { FakeFirestore, isServerTimestamp } = require('./helpers/fake-firestore');
const {
  CAMPAIGN_EXPIRY_LIMIT,
  EXPIRED_REQUEST_NOTE,
  isCampaignExpired,
  campaignExpiryPatch,
  campaignExpiredNotification,
  expireSponsoredCampaigns,
} = require('../modules/lib/sponsored-expiry');

const TODAY = '2026-10-06';

function recorder() {
  const sent = [];
  const audits = [];
  return {
    sent,
    audits,
    send: async (uid, type, payload, options) => { sent.push({ uid, type, payload, options }); },
    audit: async (actor, action, details) => { audits.push({ actor, action, details }); },
  };
}

// Más de 200 campañas viejas ya cerradas o rechazadas, con endsAt anterior a
// las activas recién vencidas: con la consulta antigua (solo endsAt, limit 200)
// llenaban el lote y las activas no se cerraban nunca.
function seedOldClosed(db, collection, count) {
  for (let i = 0; i < count; i += 1) {
    const day = String((i % 28) + 1).padStart(2, '0');
    db.seed(`${collection}/old${String(i).padStart(3, '0')}`, {
      status: i % 2 ? 'ended' : 'rejected',
      endsAt: `2025-01-${day}`,
      placeId: 'p-old',
      createdBy: 'u-old',
    });
  }
}

test('isCampaignExpired: estado del paso y endsAt anterior a hoy (el último día cuenta)', () => {
  const step = { collection: 'sponsoredPlacements', fromStatus: 'active', toStatus: 'ended' };
  assert.equal(isCampaignExpired({ status: 'active', endsAt: '2026-10-05' }, step, TODAY), true);
  assert.equal(isCampaignExpired({ status: 'active', endsAt: TODAY }, step, TODAY), false, 'hoy todavía se sirve');
  assert.equal(isCampaignExpired({ status: 'ended', endsAt: '2026-10-05' }, step, TODAY), false);
  assert.equal(isCampaignExpired({ status: 'active', endsAt: null }, step, TODAY), false, 'sin fecha de fin no caduca');
  assert.equal(isCampaignExpired(null, step, TODAY), false);
});

test('con más de 200 campañas viejas cerradas sigue cerrando las activas vencidas', async () => {
  const db = new FakeFirestore();
  seedOldClosed(db, 'sponsoredPlacements', 250);
  seedOldClosed(db, 'sponsoredItemSpotlights', 250);
  db.seed('sponsoredPlacements/pl-active-expired', {
    status: 'active', endsAt: '2026-10-01', placeId: 'p1', placeName: 'Bar Pepe', createdBy: 'u-owner',
    reviewedBy: 'jefe-ana', reviewedAt: Timestamp.fromMillis(Date.UTC(2026, 8, 20)),
  });
  db.seed('sponsoredPlacements/pl-active-current', { status: 'active', endsAt: '2026-10-20', placeId: 'p1', createdBy: 'u-owner' });
  db.seed('sponsoredPlacements/pl-active-today', { status: 'active', endsAt: TODAY, placeId: 'p1', createdBy: 'u-owner' });
  db.seed('sponsoredPlacements/pl-active-open', { status: 'active', endsAt: null, placeId: 'p1', createdBy: 'u-owner' });
  db.seed('sponsoredItemSpotlights/sp-active-expired', {
    status: 'active', endsAt: '2026-10-03', placeId: 'p2', itemName: 'Bravas', createdBy: 'u-two', reviewedBy: 'jefe-luis',
  });

  const rec = recorder();
  const summary = await expireSponsoredCampaigns({ db, today: TODAY, send: rec.send, audit: rec.audit });

  const placement = db.data('sponsoredPlacements/pl-active-expired');
  assert.equal(placement.status, 'ended');
  assert.equal(placement.endedBy, 'system');
  assert.equal(placement.closedBy, 'system');
  assert.ok(isServerTimestamp(placement.endedAt));
  assert.ok(isServerTimestamp(placement.closedAt));
  assert.equal(placement.reviewedBy, 'jefe-ana', 'no se pisa la revisión');
  assert.equal(placement.activatedBy, 'jefe-ana', 'se conserva quién la activó');
  assert.equal(placement.activatedAt.toMillis(), Date.UTC(2026, 8, 20));

  const spotlight = db.data('sponsoredItemSpotlights/sp-active-expired');
  assert.equal(spotlight.status, 'ended');
  assert.equal(spotlight.endedBy, 'system');
  assert.equal(spotlight.activatedBy, 'jefe-luis');

  assert.equal(db.data('sponsoredPlacements/pl-active-current').status, 'active');
  assert.equal(db.data('sponsoredPlacements/pl-active-today').status, 'active');
  assert.equal(db.data('sponsoredPlacements/pl-active-open').status, 'active');
  assert.equal(db.data('sponsoredPlacements/old000').status, 'rejected', 'las viejas no se tocan');
  assert.equal(db.data('sponsoredPlacements/old000').closedAt, undefined);

  // Todas las consultas filtran por estado.
  assert.ok(db.queries.length >= 3);
  for (const query of db.queries.filter((q) => q.collection.startsWith('sponsored'))) {
    assert.ok(query.filters.some((f) => f.field === 'status' && f.op === '=='), `consulta sin estado en ${query.collection}`);
    assert.equal(query.limit, CAMPAIGN_EXPIRY_LIMIT);
  }

  assert.equal(summary.closed, 2);
  assert.deepEqual(rec.audits.map((a) => [a.actor, a.action]), [
    ['system', 'sponsored.campaignExpired'],
    ['system', 'sponsored.campaignExpired'],
  ]);
  assert.equal(rec.audits[0].details.spotlightId, 'sp-active-expired');
  assert.equal(rec.audits[1].details.placementId, 'pl-active-expired');
  assert.equal(rec.audits[1].details.previousStatus, 'active');
  assert.equal(rec.audits[1].details.nextStatus, 'ended');

  assert.deepEqual(rec.sent.map((s) => [s.uid, s.type, s.options.notificationId]), [
    ['u-two', 'business_pro_update', 'item_spotlight_sp-active-expired'],
    ['u-owner', 'business_pro_update', 'sponsored_pl-active-expired'],
  ]);
  assert.equal(rec.sent[0].payload.message, 'Tu campaña del plato "Bravas" ha finalizado.');
  assert.equal(rec.sent[1].payload.message, 'Tu campaña patrocinada de Bar Pepe ha finalizado.');
  assert.equal(rec.sent[1].payload.link, '/businesses/p1/manage');
});

test('las solicitudes de campaña con fechas pasadas se rechazan solas', async () => {
  const db = new FakeFirestore();
  db.seed('sponsoredPlacements/req-expired', { status: 'requested', endsAt: '2026-09-30', placeId: 'p3', placeName: 'Café Sol', createdBy: 'u-sol' });
  db.seed('sponsoredPlacements/req-future', { status: 'requested', endsAt: '2026-10-12', placeId: 'p3', createdBy: 'u-sol' });
  db.seed('sponsoredPlacements/req-open', { status: 'requested', endsAt: null, placeId: 'p3', createdBy: 'u-sol' });
  // Los platos solicitados no tienen fechas hasta activarse: no entran.
  db.seed('sponsoredItemSpotlights/sp-requested', { status: 'requested', endsAt: '2026-09-01', placeId: 'p3', createdBy: 'u-sol', creditsUsed: 40 });

  const rec = recorder();
  await expireSponsoredCampaigns({ db, today: TODAY, send: rec.send, audit: rec.audit });

  const rejected = db.data('sponsoredPlacements/req-expired');
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.adminNotes, EXPIRED_REQUEST_NOTE);
  assert.equal(rejected.closedBy, 'system');
  assert.ok(isServerTimestamp(rejected.closedAt));
  assert.equal(rejected.reviewedBy, undefined, 'nadie la revisó');
  assert.equal(rejected.endedBy, undefined);

  assert.equal(db.data('sponsoredPlacements/req-future').status, 'requested');
  assert.equal(db.data('sponsoredPlacements/req-open').status, 'requested');
  assert.equal(db.data('sponsoredItemSpotlights/sp-requested').status, 'requested');

  assert.equal(rec.audits.length, 1);
  assert.equal(rec.audits[0].details.nextStatus, 'rejected');
  assert.equal(rec.sent.length, 1);
  assert.equal(rec.sent[0].options.notificationId, 'sponsored_req-expired');
  assert.match(rec.sent[0].payload.message, /ha caducado sin revisarse/);
});

test('es idempotente: la segunda pasada no cierra ni avisa de nuevo', async () => {
  const db = new FakeFirestore();
  db.seed('sponsoredPlacements/a', { status: 'active', endsAt: '2026-10-01', placeId: 'p1', createdBy: 'u1' });
  const rec = recorder();
  await expireSponsoredCampaigns({ db, today: TODAY, send: rec.send, audit: rec.audit });
  const second = await expireSponsoredCampaigns({ db, today: TODAY, send: rec.send, audit: rec.audit });
  assert.equal(second.closed, 0);
  assert.equal(rec.sent.length, 1);
  assert.equal(rec.audits.length, 1);
});

test('si un jefe la cambia entre la consulta y el cierre, no se toca', async () => {
  const db = new FakeFirestore();
  db.seed('sponsoredPlacements/race', { status: 'requested', endsAt: '2026-10-01', placeId: 'p1', createdBy: 'u1' });
  db.onQuery = ({ collection, filters }) => {
    const wantsRequested = filters.some((f) => f.field === 'status' && f.value === 'requested');
    if (collection === 'sponsoredPlacements' && wantsRequested) {
      db.seed('sponsoredPlacements/race', { status: 'active', endsAt: '2026-10-01', placeId: 'p1', createdBy: 'u1', reviewedBy: 'jefe' });
    }
  };
  const rec = recorder();
  const summary = await expireSponsoredCampaigns({ db, today: TODAY, send: rec.send, audit: rec.audit });
  assert.equal(db.data('sponsoredPlacements/race').status, 'active');
  assert.equal(summary.closed, 0);
  assert.equal(rec.sent.length, 0);
});

test('sin el índice (status, endsAt) consulta solo por estado y filtra endsAt en memoria', async () => {
  const db = new FakeFirestore({ compositeIndexes: false });
  db.seed('sponsoredPlacements/old', { status: 'ended', endsAt: '2025-01-01', placeId: 'p1', createdBy: 'u1' });
  db.seed('sponsoredPlacements/active', { status: 'active', endsAt: '2026-10-01', placeId: 'p1', createdBy: 'u1' });
  db.seed('sponsoredPlacements/requested', { status: 'requested', endsAt: '2026-10-02', placeId: 'p1', createdBy: 'u1' });
  const rec = recorder();
  const summary = await expireSponsoredCampaigns({ db, today: TODAY, send: rec.send, audit: rec.audit });
  assert.equal(db.data('sponsoredPlacements/active').status, 'ended');
  assert.equal(db.data('sponsoredPlacements/requested').status, 'rejected');
  assert.equal(db.data('sponsoredPlacements/old').status, 'ended');
  assert.equal(db.data('sponsoredPlacements/old').endedBy, undefined);
  assert.ok(summary.steps.every((step) => step.degraded));
  assert.ok(summary.steps.every((step) => step.error === null));
});

// El índice compuesto se despliega aparte (firebase deploy --only
// firestore:indexes) y tarda en construirse. Mientras tanto el fallback no
// puede volver a la consulta antigua solo por endsAt, que con 200+ campañas
// viejas cerradas reproducía el bug 7.
test('sin el índice y con 200+ campañas viejas cerradas sigue cerrando las vencidas', async () => {
  const db = new FakeFirestore({ compositeIndexes: false });
  seedOldClosed(db, 'sponsoredPlacements', 250);
  db.seed('sponsoredPlacements/zz-active-expired', { status: 'active', endsAt: '2026-10-01', placeId: 'p1', createdBy: 'u1' });
  db.seed('sponsoredPlacements/zz-requested-expired', { status: 'requested', endsAt: '2026-10-02', placeId: 'p1', createdBy: 'u1' });
  const rec = recorder();
  const summary = await expireSponsoredCampaigns({ db, today: TODAY, send: rec.send, audit: rec.audit });
  assert.equal(db.data('sponsoredPlacements/zz-active-expired').status, 'ended');
  assert.equal(db.data('sponsoredPlacements/zz-requested-expired').status, 'rejected');
  assert.equal(summary.closed, 2);
});

test('sin el índice pagina por estado: encuentra vencidas más allá del primer lote', async () => {
  const db = new FakeFirestore({ compositeIndexes: false });
  // 5 activas vigentes ocupan el primer lote (ids menores) y la vencida queda después.
  for (let i = 0; i < 5; i += 1) {
    db.seed(`sponsoredPlacements/a${i}`, { status: 'active', endsAt: '2026-12-31', placeId: 'p1', createdBy: 'u1' });
  }
  db.seed('sponsoredPlacements/z-expired', { status: 'active', endsAt: '2026-10-01', placeId: 'p1', createdBy: 'u1' });
  const rec = recorder();
  const summary = await expireSponsoredCampaigns({ db, today: TODAY, send: rec.send, audit: rec.audit, limit: 2 });
  assert.equal(db.data('sponsoredPlacements/z-expired').status, 'ended');
  assert.equal(db.data('sponsoredPlacements/a0').status, 'active');
  const placementsActive = summary.steps.find((step) => step.collection === 'sponsoredPlacements' && step.fromStatus === 'active');
  assert.equal(placementsActive.closed, 1);
  assert.equal(placementsActive.truncated, false);
});

test('un error en un paso no impide los demás', async () => {
  const db = new FakeFirestore();
  db.seed('sponsoredPlacements/a', { status: 'active', endsAt: '2026-10-01', placeId: 'p1', createdBy: 'u1' });
  const original = db.collection.bind(db);
  db.collection = (path) => {
    if (path === 'sponsoredItemSpotlights') {
      return { where: () => ({ where: () => ({ limit: () => ({ get: async () => { throw new Error('boom'); } }) }) }) };
    }
    return original(path);
  };
  const rec = recorder();
  const summary = await expireSponsoredCampaigns({ db, today: TODAY, send: rec.send, audit: rec.audit });
  assert.equal(summary.steps[0].error, 'boom');
  assert.equal(db.data('sponsoredPlacements/a').status, 'ended');
});

test('campaignExpiryPatch no inventa la activación si ya existe o no se sabe', () => {
  const step = { collection: 'sponsoredPlacements', fromStatus: 'active', toStatus: 'ended' };
  const ts = Timestamp.fromMillis(1);
  const kept = campaignExpiryPatch(step, { activatedBy: 'jefe-b5', activatedAt: ts, reviewedBy: 'jefe-otro', reviewedAt: ts }, 'NOW');
  assert.equal(kept.activatedBy, undefined);
  assert.equal(kept.activatedAt, undefined);
  const unknown = campaignExpiryPatch(step, {}, 'NOW');
  assert.deepEqual(unknown, { status: 'ended', endedAt: 'NOW', endedBy: 'system', closedAt: 'NOW', closedBy: 'system' });
});

test('el aviso al negocio sin nombre de plato sigue siendo legible', () => {
  const step = { collection: 'sponsoredItemSpotlights', fromStatus: 'active', toStatus: 'ended' };
  const notification = campaignExpiredNotification(step, 'x', { placeId: 'p1', createdBy: 'u1' });
  assert.equal(notification.payload.message, 'Tu campaña de plato destacado ha finalizado.');
  assert.equal(notification.userId, 'u1');
});
