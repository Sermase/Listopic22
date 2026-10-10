// B5 (quién activó y cerró cada campaña, sin activar campañas ya vencidas) y
// B8 (aviso a los jefes de cada solicitud nueva) en sponsored.js.
//
// node --test ejecuta cada archivo en su propio proceso: aquí se sustituyen
// getFirestore/getAuth antes de cargar los módulos sin afectar a otros tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const firestoreAdmin = require('firebase-admin/firestore');
const authAdmin = require('firebase-admin/auth');
const { Timestamp } = firestoreAdmin;
const { FakeFirestore, isServerTimestamp } = require('./helpers/fake-firestore');
const {
  madridToday,
  formatIsoDate,
  campaignDecisionError,
  campaignReviewPatch,
} = require('../modules/lib/sponsored-review');

// ── Reglas puras ────────────────────────────────────────────────────────────

const TS = Object.freeze({ __ts: true });

test('madridToday: fecha de calendario de Madrid, no la UTC', () => {
  // Octubre (horario de verano, UTC+2): las 22:30 UTC ya son el día siguiente.
  assert.equal(madridToday(new Date('2026-10-06T22:30:00Z')), '2026-10-07');
  assert.equal(madridToday(new Date('2026-10-06T21:30:00Z')), '2026-10-06');
  // Enero (UTC+1).
  assert.equal(madridToday(new Date('2026-01-31T23:10:00Z')), '2026-02-01');
  assert.equal(formatIsoDate('2026-10-05'), '05/10/2026');
});

test('campaignDecisionError: transiciones permitidas', () => {
  const today = '2026-10-07';
  assert.equal(campaignDecisionError('activate', { status: 'requested' }, today), null);
  assert.equal(campaignDecisionError('reject', { status: 'requested' }, today), null);
  assert.equal(campaignDecisionError('end', { status: 'active' }, today), null);
  for (const [decision, status] of [['activate', 'active'], ['reject', 'ended'], ['end', 'requested'], ['end', 'rejected']]) {
    assert.equal(campaignDecisionError(decision, { status }, today).code, 'failed-precondition', `${decision} desde ${status}`);
  }
  assert.equal(campaignDecisionError('activate', null, today).code, 'failed-precondition');
  assert.equal(campaignDecisionError('borrar', { status: 'requested' }, today).code, 'invalid-argument');
});

test('campaignDecisionError: no se activa una campaña cuyo último día ya pasó', () => {
  const today = '2026-10-07';
  const past = campaignDecisionError('activate', { status: 'requested', endsAt: '2026-10-06' }, today);
  assert.equal(past.code, 'failed-precondition');
  assert.match(past.message, /06\/10\/2026/);
  assert.doesNotMatch(past.message, /—/, 'sin rayas largas en los textos');
  assert.equal(campaignDecisionError('activate', { status: 'requested', endsAt: today }, today), null, 'hoy todavía se sirve');
  assert.equal(campaignDecisionError('activate', { status: 'requested', endsAt: null }, today), null, 'sin fecha de fin');
  assert.equal(campaignDecisionError('activate', { status: 'requested', endsAt: 'mañana' }, today), null, 'fecha rara: no se bloquea');
  assert.equal(campaignDecisionError('reject', { status: 'requested', endsAt: '2020-01-01' }, today), null, 'rechazar sí');
  // Platos destacados: activar les pone fechas nuevas, las guardadas no cuentan.
  assert.equal(campaignDecisionError('activate', { status: 'requested', endsAt: '2026-07-20' }, today, { checkEndsAt: false }), null);
  assert.equal(campaignDecisionError('activate', { status: 'active', endsAt: '2026-07-20' }, today, { checkEndsAt: false }).code, 'failed-precondition');
});

test('campaignReviewPatch: activar guarda activatedBy/At', () => {
  assert.deepEqual(campaignReviewPatch('activate', { status: 'requested' }, { uid: 'jefe1', adminNotes: 'ok', serverTimestamp: TS }), {
    status: 'active', adminNotes: 'ok', reviewedBy: 'jefe1', reviewedAt: TS, activatedBy: 'jefe1', activatedAt: TS,
  });
});

test('campaignReviewPatch: rechazar guarda closedBy/At', () => {
  assert.deepEqual(campaignReviewPatch('reject', { status: 'requested' }, { uid: 'jefe1', serverTimestamp: TS }), {
    status: 'rejected', adminNotes: null, reviewedBy: 'jefe1', reviewedAt: TS, closedBy: 'jefe1', closedAt: TS,
  });
});

test('campaignReviewPatch: finalizar guarda endedBy/At y closedBy/At sin tocar la activación', () => {
  const activatedAt = Timestamp.fromMillis(1000);
  const patch = campaignReviewPatch('end', {
    status: 'active', activatedBy: 'jefe-ana', activatedAt, reviewedBy: 'jefe-ana', reviewedAt: activatedAt,
  }, { uid: 'jefe-luis', serverTimestamp: TS });
  assert.deepEqual(patch, {
    status: 'ended', adminNotes: null, reviewedBy: 'jefe-luis', reviewedAt: TS,
    closedBy: 'jefe-luis', closedAt: TS, endedBy: 'jefe-luis', endedAt: TS,
  });
  assert.equal('activatedBy' in patch, false);
});

test('campaignReviewPatch: al finalizar una campaña anterior a B5 conserva quién la activó', () => {
  const reviewedAt = Timestamp.fromMillis(2000);
  const patch = campaignReviewPatch('end', { status: 'active', reviewedBy: 'jefe-ana', reviewedAt }, { uid: 'jefe-luis', serverTimestamp: TS });
  assert.equal(patch.activatedBy, 'jefe-ana');
  assert.equal(patch.activatedAt, reviewedAt);
  assert.equal(patch.reviewedBy, 'jefe-luis');
});

// ── Callables con Firestore en memoria ─────────────────────────────────────

const db = new FakeFirestore();
firestoreAdmin.getFirestore = () => db;
authAdmin.getAuth = () => ({
  getUser: async (uid) => ({ uid, customClaims: { admin: uid.startsWith('jefe') } }),
});

const sponsored = require('../modules/sponsored');

const PLACEMENT = 'sponsoredPlacements/pl1';
const SPOTLIGHT = 'sponsoredItemSpotlights/sp1';

function reset() {
  db.store.clear();
  db.queries.length = 0;
  db.writes.length = 0;
  delete db.collection;
  db.seed('users/jefe1', { userType: ['jefe'] });
  db.seed('users/jefe2', { userType: 'jefe' });
  db.seed('users/owner1', { userType: ['business'] });
  db.seed('places/p1', {
    name: 'Bar Pepe',
    businessOwnerUserId: 'owner1',
    businessManagerIds: ['owner1'],
    businessProActive: true,
    location: { lat: 40.4, lng: -3.7 },
    spotlightCredits: 500,
  });
  db.seed('places/p1/items/bravas', { canonicalName: 'Patatas bravas', status: 'active', stats: { averageRating: 8, reviewCount: 3 } });
}

const call = (fn, data, uid = 'jefe1') => fn.run({ auth: { uid }, data });
const auditEntries = (action) => db.docsIn('adminAuditLog').map((entry) => entry.data).filter((entry) => !action || entry.action === action);
const ownerNotification = (id) => db.data(`users/owner1/notifications/${id}`);

// Rompe solo la búsqueda de jefes (users where userType): el aviso falla y la solicitud no.
function breakJefeLookup() {
  const original = FakeFirestore.prototype.collection;
  db.collection = function brokenCollection(name) {
    const col = original.call(this, name);
    if (name !== 'users') return col;
    const where = col.where.bind(col);
    col.where = (field, op, value) => {
      if (field === 'userType') throw new Error('Firestore caído');
      return where(field, op, value);
    };
    return col;
  };
}

test('B5: activar y después finalizar guarda quién activó, quién cerró y cuándo', async () => {
  reset();
  db.seed(PLACEMENT, { status: 'requested', placeId: 'p1', placeName: 'Bar Pepe', createdBy: 'owner1', type: 'home' });

  assert.deepEqual(await call(sponsored.reviewSponsoredPlacement, { placementId: 'pl1', decision: 'activate', adminNotes: 'Adelante' }),
    { ok: true, placementId: 'pl1', status: 'active' });
  let doc = db.data(PLACEMENT);
  assert.equal(doc.status, 'active');
  assert.equal(doc.activatedBy, 'jefe1');
  assert.ok(isServerTimestamp(doc.activatedAt));
  assert.equal(doc.reviewedBy, 'jefe1');
  assert.equal(doc.closedBy, undefined);
  assert.equal(ownerNotification('sponsored_pl1').message, 'Tu campaña patrocinada de Bar Pepe está activa.');

  // La activación ya guardada (con hora real) no se toca al finalizar.
  const activatedAt = Timestamp.fromMillis(Date.UTC(2026, 9, 1));
  db.seed(PLACEMENT, { ...doc, activatedAt });
  await call(sponsored.reviewSponsoredPlacement, { placementId: 'pl1', decision: 'end' }, 'jefe2');
  doc = db.data(PLACEMENT);
  assert.equal(doc.status, 'ended');
  assert.equal(doc.activatedBy, 'jefe1');
  assert.equal(doc.activatedAt.toMillis(), activatedAt.toMillis());
  assert.equal(doc.endedBy, 'jefe2');
  assert.ok(isServerTimestamp(doc.endedAt));
  assert.equal(doc.closedBy, 'jefe2');
  assert.ok(isServerTimestamp(doc.closedAt));
  assert.equal(doc.reviewedBy, 'jefe2', 'reviewedBy sigue siendo la última decisión');
  assert.deepEqual(auditEntries('sponsored.placementReviewed').map((entry) => entry.details.nextStatus), ['active', 'ended']);
});

test('B5: finalizar una campaña activada antes de B5 conserva al que la activó', async () => {
  reset();
  const reviewedAt = Timestamp.fromMillis(Date.UTC(2026, 8, 20));
  db.seed(PLACEMENT, { status: 'active', placeId: 'p1', createdBy: 'owner1', reviewedBy: 'jefe-ana', reviewedAt });
  await call(sponsored.reviewSponsoredPlacement, { placementId: 'pl1', decision: 'end' });
  const doc = db.data(PLACEMENT);
  assert.equal(doc.activatedBy, 'jefe-ana');
  assert.equal(doc.activatedAt.toMillis(), reviewedAt.toMillis());
  assert.equal(doc.endedBy, 'jefe1');
});

test('B5: rechazar guarda closedBy/At y no inventa una activación', async () => {
  reset();
  db.seed(PLACEMENT, { status: 'requested', placeId: 'p1', placeName: 'Bar Pepe', createdBy: 'owner1' });
  await call(sponsored.reviewSponsoredPlacement, { placementId: 'pl1', decision: 'reject', adminNotes: 'Fechas ocupadas' });
  const doc = db.data(PLACEMENT);
  assert.equal(doc.status, 'rejected');
  assert.equal(doc.closedBy, 'jefe1');
  assert.ok(isServerTimestamp(doc.closedAt));
  assert.equal(doc.activatedBy, undefined);
  assert.equal(doc.endedBy, undefined);
  assert.equal(doc.adminNotes, 'Fechas ocupadas');
});

test('B5: no deja activar una campaña cuyo último día ya pasó (y no cambia nada)', async () => {
  reset();
  db.seed(PLACEMENT, { status: 'requested', placeId: 'p1', createdBy: 'owner1', startsAt: '2020-01-01', endsAt: '2020-01-31' });
  await assert.rejects(call(sponsored.reviewSponsoredPlacement, { placementId: 'pl1', decision: 'activate' }), (error) => {
    assert.equal(error.code, 'failed-precondition');
    assert.match(error.message, /31\/01\/2020/);
    return true;
  });
  assert.equal(db.data(PLACEMENT).status, 'requested');
  assert.equal(db.data(PLACEMENT).activatedBy, undefined);
  assert.equal(auditEntries().length, 0);
  assert.equal(ownerNotification('sponsored_pl1'), undefined);

  // Rechazarla sí se puede, y la que termina hoy aún se puede activar.
  await call(sponsored.reviewSponsoredPlacement, { placementId: 'pl1', decision: 'reject' });
  assert.equal(db.data(PLACEMENT).status, 'rejected');
  db.seed('sponsoredPlacements/pl2', { status: 'requested', placeId: 'p1', createdBy: 'owner1', endsAt: madridToday() });
  assert.equal((await call(sponsored.reviewSponsoredPlacement, { placementId: 'pl2', decision: 'activate' })).status, 'active');
});

test('B5: estado incompatible, inexistente o sin permiso', async () => {
  reset();
  db.seed(PLACEMENT, { status: 'ended', placeId: 'p1' });
  await assert.rejects(call(sponsored.reviewSponsoredPlacement, { placementId: 'pl1', decision: 'end' }), (error) => error.code === 'failed-precondition');
  await assert.rejects(call(sponsored.reviewSponsoredPlacement, { placementId: 'nada', decision: 'end' }), (error) => error.code === 'not-found');
  await assert.rejects(call(sponsored.reviewSponsoredPlacement, { placementId: 'pl1', decision: 'end' }, 'owner1'), (error) => error.code === 'permission-denied');
});

test('B5: plato destacado al activar guarda activatedBy y sus fechas', async () => {
  reset();
  db.seed(SPOTLIGHT, {
    status: 'requested', placeId: 'p1', placeName: 'Bar Pepe', itemId: 'bravas', itemName: 'Bravas', days: 7, createdBy: 'owner1', startsAt: null, endsAt: null,
  });
  await call(sponsored.reviewItemSpotlight, { spotlightId: 'sp1', decision: 'activate' });
  const doc = db.data(SPOTLIGHT);
  assert.equal(doc.status, 'active');
  assert.equal(doc.activatedBy, 'jefe1');
  assert.ok(isServerTimestamp(doc.activatedAt));
  assert.match(doc.startsAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(doc.endsAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(doc.itemName, 'Patatas bravas', 'el plato se pone al día al activar');
  assert.deepEqual(doc.center, { lat: 40.4, lng: -3.7 });
  assert.equal(ownerNotification('item_spotlight_sp1').message, 'Tu plato destacado "Patatas bravas" está activo.');
});

test('B5: un plato pedido con fechas viejas (solicitudes de julio) se activa con fechas nuevas', async () => {
  reset();
  db.seed(SPOTLIGHT, {
    status: 'requested', placeId: 'p1', placeName: 'Bar Pepe', itemId: 'bravas', itemName: 'Bravas', days: 7, createdBy: 'owner1',
    startsAt: '2026-07-10', endsAt: '2026-07-17',
  });
  await call(sponsored.reviewItemSpotlight, { spotlightId: 'sp1', decision: 'activate' });
  const doc = db.data(SPOTLIGHT);
  assert.equal(doc.status, 'active');
  assert.ok(doc.endsAt >= madridToday(), 'el periodo empieza hoy');
});

test('B5: plato destacado rechazado devuelve los impulsos una sola vez y guarda closedBy', async () => {
  reset();
  db.seed(SPOTLIGHT, { status: 'requested', placeId: 'p1', itemId: 'bravas', itemName: 'Bravas', creditsUsed: 120, createdBy: 'owner1' });
  await call(sponsored.reviewItemSpotlight, { spotlightId: 'sp1', decision: 'reject', adminNotes: 'Sin hueco' });
  const doc = db.data(SPOTLIGHT);
  assert.equal(doc.status, 'rejected');
  assert.equal(doc.closedBy, 'jefe1');
  assert.equal(doc.creditsRefunded, true);
  assert.ok(isServerTimestamp(doc.creditsRefundedAt));
  assert.equal(db.data('places/p1').spotlightCredits, 620);
  await assert.rejects(call(sponsored.reviewItemSpotlight, { spotlightId: 'sp1', decision: 'reject' }), (error) => error.code === 'failed-precondition');
  assert.equal(db.data('places/p1').spotlightCredits, 620, 'no se devuelve dos veces');
});

test('B5: plato destacado finalizado conserva la activación', async () => {
  reset();
  const activatedAt = Timestamp.fromMillis(Date.UTC(2026, 9, 1));
  db.seed(SPOTLIGHT, {
    status: 'active', placeId: 'p1', itemId: 'bravas', itemName: 'Bravas', createdBy: 'owner1',
    activatedBy: 'jefe2', activatedAt, reviewedBy: 'jefe2', reviewedAt: activatedAt, startsAt: '2026-10-01', endsAt: '2026-10-08',
  });
  await call(sponsored.reviewItemSpotlight, { spotlightId: 'sp1', decision: 'end' });
  const doc = db.data(SPOTLIGHT);
  assert.equal(doc.status, 'ended');
  assert.equal(doc.activatedBy, 'jefe2');
  assert.equal(doc.activatedAt.toMillis(), activatedAt.toMillis());
  assert.equal(doc.endedBy, 'jefe1');
  assert.equal(doc.closedBy, 'jefe1');
  assert.equal(doc.startsAt, '2026-10-01', 'las fechas no cambian al finalizar');
  assert.equal(doc.endsAt, '2026-10-08');
});

// ── B8: avisos a los jefes ─────────────────────────────────────────────────

const jefeNotification = (uid, id) => db.data(`users/${uid}/notifications/${id}`);

test('B8: una campaña solicitada avisa a cada jefe con enlace a su fila (y no al negocio)', async () => {
  reset();
  const { placementId } = await call(sponsored.requestSponsoredPlacement, {
    placeId: 'p1', type: 'search', headline: 'Desayunos 3€', startsAt: '2026-10-12', endsAt: '2026-10-19',
  }, 'owner1');
  const id = `admin_pending_sponsoredPlacements_${placementId}`;
  for (const uid of ['jefe1', 'jefe2']) {
    const notification = jefeNotification(uid, id);
    assert.ok(notification, `sin aviso para ${uid}`);
    assert.equal(notification.type, 'admin_pending');
    assert.equal(notification.message, '📣 Campaña solicitada: Bar Pepe · Búsqueda · «Desayunos 3€» · del 12/10 al 19/10');
    assert.equal(notification.link, `/developer?tab=proProposals&view=inbox&focus=${placementId}`);
    assert.equal(notification.queue, 'sponsoredPlacements');
    assert.equal(notification.itemId, placementId);
    assert.equal('placeId' in notification, false, 'con placeId el clic abriría la ficha del lugar');
  }
  assert.equal(jefeNotification('owner1', id), undefined);
  assert.equal(db.data(`sponsoredPlacements/${placementId}`).status, 'requested');
});

test('B8: un plato destacado solicitado avisa a los jefes', async () => {
  reset();
  const result = await call(sponsored.requestItemSpotlight, { placeId: 'p1', itemId: 'bravas', radiusKm: 3, days: 7, intensity: 1 }, 'owner1');
  const notification = jefeNotification('jefe1', `admin_pending_sponsoredItemSpotlights_${result.spotlightId}`);
  assert.ok(notification);
  assert.equal(notification.message, `🍽️ Plato destacado solicitado: «Patatas bravas» · Bar Pepe · 3 km × 7 d · ${result.impulses.toLocaleString('es-ES')} impulsos`);
  assert.equal(notification.link, `/developer?tab=proProposals&view=inbox&focus=${result.spotlightId}`);
  assert.ok(jefeNotification('jefe2', `admin_pending_sponsoredItemSpotlights_${result.spotlightId}`));
});

test('B8: un jefe que pide una campaña no se avisa a sí mismo', async () => {
  reset();
  const { placementId } = await call(sponsored.requestSponsoredPlacement, { placeId: 'p1', type: 'home' }, 'jefe1');
  assert.equal(jefeNotification('jefe1', `admin_pending_sponsoredPlacements_${placementId}`), undefined);
  assert.equal(jefeNotification('jefe2', `admin_pending_sponsoredPlacements_${placementId}`).message, '📣 Campaña solicitada: Bar Pepe · Home');
});

test('B8: si avisar a los jefes falla, la solicitud se guarda igual', async () => {
  reset();
  breakJefeLookup();
  try {
    const placement = await call(sponsored.requestSponsoredPlacement, { placeId: 'p1', type: 'home' }, 'owner1');
    assert.equal(placement.ok, true);
    assert.equal(db.data(`sponsoredPlacements/${placement.placementId}`).status, 'requested');
    const spotlight = await call(sponsored.requestItemSpotlight, { placeId: 'p1', itemId: 'bravas', radiusKm: 1, days: 1, intensity: 1 }, 'owner1');
    assert.equal(spotlight.ok, true);
    assert.equal(db.data(`sponsoredItemSpotlights/${spotlight.spotlightId}`).status, 'requested');
    assert.equal(db.docsIn('users/jefe1/notifications').length, 0);
  } finally {
    delete db.collection;
  }
});
