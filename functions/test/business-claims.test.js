// B3, B4 y B8 (solicitudes): reglas puras de lib/business-claims-review.js y
// las Functions de business-claims.js contra un Firestore en memoria.
//
// node --test ejecuta cada archivo en su propio proceso, así que aquí se
// pueden sustituir getFirestore/getAuth y node-fetch antes de cargar el
// módulo sin afectar a otros tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const firestoreAdmin = require('firebase-admin/firestore');
const authAdmin = require('firebase-admin/auth');
const { Timestamp } = firestoreAdmin;
const { FakeFirestore, isServerTimestamp } = require('./helpers/fake-firestore');
const {
  MAX_PREVIOUS_REVIEWS,
  isClaimResubmission,
  buildPreviousReview,
  appendPreviousReview,
  ownerTransferCheck,
} = require('../modules/lib/business-claims-review');

// ── Reglas puras ────────────────────────────────────────────────────────────

test('isClaimResubmission: solo rejected → pending', () => {
  assert.equal(isClaimResubmission({ status: 'rejected' }, { status: 'pending' }), true);
  assert.equal(isClaimResubmission({ status: 'pending' }, { status: 'pending' }), false);
  assert.equal(isClaimResubmission({ status: 'pending' }, { status: 'rejected' }), false);
  assert.equal(isClaimResubmission({ status: 'approved' }, { status: 'pending' }), false);
  assert.equal(isClaimResubmission(null, { status: 'pending' }), false);
  assert.equal(isClaimResubmission({ status: 'rejected' }, undefined), false);
});

test('buildPreviousReview: guarda lo que el reenvío va a borrar', () => {
  const reviewedAt = Timestamp.fromMillis(1000);
  const createdAt = Timestamp.fromMillis(500);
  const archivedAt = Timestamp.fromMillis(2000);
  const proofs = [{ name: 'factura.pdf', storagePath: 'business-claims/u1/c/docs/1-factura.pdf' }];
  assert.deepEqual(buildPreviousReview({
    status: 'rejected', adminNotes: 'Faltan pruebas', reviewedBy: 'jefe1', reviewedAt, createdAt, proofs, message: 'no se guarda',
  }, archivedAt), {
    status: 'rejected', adminNotes: 'Faltan pruebas', reviewedBy: 'jefe1', reviewedAt, submittedAt: createdAt, proofs, archivedAt,
  });
  assert.deepEqual(buildPreviousReview({}, null), {
    status: 'rejected', adminNotes: null, reviewedBy: null, reviewedAt: null, submittedAt: null, proofs: [], archivedAt: null,
  });
});

test('appendPreviousReview: añade, no duplica un evento repetido y guarda las últimas', () => {
  const entry = (n) => ({ status: 'rejected', reviewedBy: 'jefe1', reviewedAt: Timestamp.fromMillis(n * 1000), adminNotes: `motivo ${n}`, archivedAt: Timestamp.fromMillis(Date.now()) });
  const first = appendPreviousReview(undefined, entry(1));
  assert.equal(first.appended, true);
  assert.equal(first.list.length, 1);

  // El mismo rechazo con otro archivedAt (evento entregado dos veces) no se repite.
  const repeated = appendPreviousReview(first.list, { ...entry(1), archivedAt: Timestamp.fromMillis(1) });
  assert.equal(repeated.appended, false);
  assert.equal(repeated.list.length, 1);

  let list = [];
  for (let n = 1; n <= MAX_PREVIOUS_REVIEWS + 3; n += 1) list = appendPreviousReview(list, entry(n)).list;
  assert.equal(list.length, MAX_PREVIOUS_REVIEWS);
  assert.equal(list[0].adminNotes, 'motivo 4');
  assert.equal(list[list.length - 1].adminNotes, `motivo ${MAX_PREVIOUS_REVIEWS + 3}`);
});

test('ownerTransferCheck: solo bloquea si quita la propiedad a otra persona sin confirmar', () => {
  const verified = { businessVerified: true, businessOwnerUserId: 'u-old' };
  assert.deepEqual(ownerTransferCheck(verified, 'u-new', undefined), { previousOwnerUserId: 'u-old', blocked: true });
  assert.deepEqual(ownerTransferCheck(verified, 'u-new', 'true'), { previousOwnerUserId: 'u-old', blocked: true }, 'solo vale el booleano true');
  assert.deepEqual(ownerTransferCheck(verified, 'u-new', true), { previousOwnerUserId: 'u-old', blocked: false });
  assert.deepEqual(ownerTransferCheck(verified, 'u-old', undefined), { previousOwnerUserId: null, blocked: false }, 'mismo propietario');
  assert.deepEqual(ownerTransferCheck({ businessOwnerUserId: 'u-old' }, 'u-new', undefined), { previousOwnerUserId: null, blocked: false }, 'sin verificar');
  assert.deepEqual(ownerTransferCheck({ businessVerified: true }, 'u-new', undefined), { previousOwnerUserId: null, blocked: false }, 'sin propietario');
  assert.deepEqual(ownerTransferCheck(null, 'u-new', undefined), { previousOwnerUserId: null, blocked: false }, 'lugar inexistente');
});

// ── Functions con Firestore en memoria ─────────────────────────────────────

const db = new FakeFirestore();
firestoreAdmin.getFirestore = () => db;
authAdmin.getAuth = () => ({
  getUser: async (uid) => ({ uid, customClaims: { admin: uid.startsWith('jefe') } }),
});

const emails = [];
const fetchPath = require.resolve('node-fetch');
const fakeFetchModule = new Module(fetchPath);
fakeFetchModule.filename = fetchPath;
fakeFetchModule.loaded = true;
fakeFetchModule.exports = async (url, init) => {
  emails.push({ url, ...JSON.parse(init.body) });
  return { ok: true, json: async () => ({ id: `email${emails.length}` }), text: async () => '' };
};
require.cache[fetchPath] = fakeFetchModule;
process.env.RESEND_API_KEY = 'test-resend-key';

const claims = require('../modules/business-claims');
const all = require('../index.js');

const CLAIM_ID = 'u1_p1';
const CLAIM_PATH = `businessClaims/${CLAIM_ID}`;

function reset() {
  db.store.clear();
  db.queries.length = 0;
  db.writes.length = 0;
  emails.length = 0;
  db.seed('users/jefe1', { userType: ['jefe'] });
  db.seed('users/jefe2', { userType: 'jefe' });
  db.seed('users/u1', { userType: ['business'] });
}

const submitted = (overrides = {}) => ({
  userId: 'u1',
  userName: 'Juan López',
  placeId: 'p1',
  placeName: 'Bar Pepe',
  role: 'Propietario',
  contactEmail: 'juan@bar.es',
  message: 'Soy el dueño',
  status: 'pending',
  proofs: [{ name: 'nueva.pdf', downloadUrl: 'https://x/nueva.pdf' }],
  truthDeclarationAccepted: true,
  createdAt: Timestamp.fromMillis(Date.UTC(2026, 9, 5)),
  ...overrides,
});

const rejectedBefore = (overrides = {}) => submitted({
  status: 'rejected',
  adminNotes: 'Faltan pruebas del local',
  reviewedBy: 'jefe1',
  reviewedAt: Timestamp.fromMillis(Date.UTC(2026, 9, 1)),
  createdAt: Timestamp.fromMillis(Date.UTC(2026, 8, 28)),
  proofs: [{ name: 'vieja.pdf', downloadUrl: 'https://x/vieja.pdf' }],
  ...overrides,
});

function updateEvent(before, after) {
  return {
    params: { claimId: CLAIM_ID },
    data: {
      before: { data: () => before, ref: db.doc(CLAIM_PATH) },
      after: { data: () => after, ref: db.doc(CLAIM_PATH) },
    },
  };
}

const jefeNotification = (uid) => db.data(`users/${uid}/notifications/admin_pending_businessClaims_${CLAIM_ID}`);

test('index.js exporta onBusinessClaimUpdated como trigger de update con el secret de Resend', () => {
  const fn = all.onBusinessClaimUpdated;
  assert.ok(fn, 'onBusinessClaimUpdated no se exporta');
  assert.equal(fn.__endpoint.eventTrigger.eventType, 'google.cloud.firestore.document.v1.updated');
  assert.equal(fn.__endpoint.eventTrigger.eventFilterPathPatterns.document, 'businessClaims/{claimId}');
  assert.ok(fn.__endpoint.secretEnvironmentVariables.some((s) => s.key === 'RESEND_API_KEY'));
  assert.ok(all.onBusinessClaimCreated && all.reviewBusinessClaim);
});

test('B3: un reenvío guarda la decisión anterior, manda el email «(reenvío)» y avisa a los jefes', async () => {
  reset();
  const before = rejectedBefore();
  const after = submitted();
  db.seed(CLAIM_PATH, after);

  await claims.onBusinessClaimUpdated.run(updateEvent(before, after));

  const doc = db.data(CLAIM_PATH);
  assert.equal(doc.status, 'pending', 'no cambia el estado');
  assert.equal(doc.previousReviews.length, 1);
  const [previous] = doc.previousReviews;
  assert.equal(previous.status, 'rejected');
  assert.equal(previous.adminNotes, 'Faltan pruebas del local');
  assert.equal(previous.reviewedBy, 'jefe1');
  assert.equal(previous.reviewedAt.toMillis(), Date.UTC(2026, 9, 1));
  assert.equal(previous.submittedAt.toMillis(), Date.UTC(2026, 8, 28));
  assert.deepEqual(previous.proofs, [{ name: 'vieja.pdf', downloadUrl: 'https://x/vieja.pdf' }]);
  assert.ok(previous.archivedAt instanceof Timestamp, 'Timestamp real: serverTimestamp no vale dentro de un array');

  assert.equal(emails.length, 1);
  assert.equal(emails[0].subject, 'Nueva reclamación de negocio (reenvío): Bar Pepe');
  assert.match(emails[0].html, /Reenvío nº 1/);
  assert.match(emails[0].html, /Faltan pruebas del local/);
  assert.match(emails[0].html, /nueva\.pdf/);

  for (const uid of ['jefe1', 'jefe2']) {
    const notification = jefeNotification(uid);
    assert.ok(notification, `sin aviso para ${uid}`);
    assert.equal(notification.type, 'admin_pending');
    assert.equal(notification.link, `/developer?tab=businessClaims&view=pending&focus=${CLAIM_ID}`);
    assert.equal(notification.message, '🔁 Solicitud de negocio reenviada: Bar Pepe (Juan López)');
  }
  assert.equal(jefeNotification('u1'), undefined, 'el solicitante no recibe el aviso de jefes');
});

test('B3: el mismo evento entregado dos veces no duplica historial ni email', async () => {
  reset();
  const before = rejectedBefore();
  const after = submitted();
  db.seed(CLAIM_PATH, after);
  await claims.onBusinessClaimUpdated.run(updateEvent(before, after));
  await claims.onBusinessClaimUpdated.run(updateEvent(before, after));
  assert.equal(db.data(CLAIM_PATH).previousReviews.length, 1);
  assert.equal(emails.length, 1);
  assert.equal(jefeNotification('jefe1').count, 1);
});

test('B3: el segundo reenvío conserva el historial del primero', async () => {
  reset();
  const firstReview = {
    status: 'rejected', adminNotes: 'Primera vez', reviewedBy: 'jefe2',
    reviewedAt: Timestamp.fromMillis(Date.UTC(2026, 8, 1)), submittedAt: Timestamp.fromMillis(Date.UTC(2026, 7, 30)),
    proofs: [], archivedAt: Timestamp.fromMillis(Date.UTC(2026, 8, 2)),
  };
  // El jefe rechaza otra vez (update de admin: previousReviews sigue ahí) y el
  // cliente reenvía con un setDoc completo (sin previousReviews).
  const before = rejectedBefore({ previousReviews: [firstReview], adminNotes: 'Segunda vez' });
  const after = submitted();
  db.seed(CLAIM_PATH, after);

  await claims.onBusinessClaimUpdated.run(updateEvent(before, after));

  const doc = db.data(CLAIM_PATH);
  assert.deepEqual(doc.previousReviews.map((r) => r.adminNotes), ['Primera vez', 'Segunda vez']);
  assert.match(emails[0].html, /Reenvío nº 2/);
});

test('B3: otros cambios de la solicitud no hacen nada', async () => {
  reset();
  db.seed(CLAIM_PATH, submitted({ status: 'approved' }));
  await claims.onBusinessClaimUpdated.run(updateEvent(submitted(), submitted({ status: 'approved' })));
  await claims.onBusinessClaimUpdated.run(updateEvent(submitted(), submitted({ updatedAt: Timestamp.now() })));
  await claims.onBusinessClaimUpdated.run(updateEvent(rejectedBefore(), rejectedBefore({ adminNotes: 'otra nota' })));
  assert.equal(emails.length, 0);
  assert.equal(db.writes.length, 0);
  assert.equal(db.data(CLAIM_PATH).previousReviews, undefined);
});

test('B8: una solicitud nueva manda el email y avisa a los jefes (menos al solicitante)', async () => {
  reset();
  db.seed('users/jefe-solicitante', { userType: ['jefe'] });
  const claim = submitted({ userId: 'jefe-solicitante' });
  await claims.onBusinessClaimCreated.run({ params: { claimId: CLAIM_ID }, data: { data: () => claim } });

  assert.equal(emails.length, 1);
  assert.equal(emails[0].subject, 'Nueva reclamación de negocio: Bar Pepe');
  assert.doesNotMatch(emails[0].html, /Reenvío/);
  assert.equal(jefeNotification('jefe1').message, '🏪 Nueva solicitud de negocio: Bar Pepe (Juan López)');
  assert.ok(jefeNotification('jefe2'));
  assert.equal(jefeNotification('jefe-solicitante'), undefined);
});

// ── B4: reviewBusinessClaim ────────────────────────────────────────────────

function seedClaimAndPlace(place) {
  reset();
  db.seed(CLAIM_PATH, submitted());
  if (place) db.seed('places/p1', place);
}

const review = (data, uid = 'jefe1') => claims.reviewBusinessClaim.run({ auth: { uid }, data: { claimId: CLAIM_ID, ...data } });
const auditEntries = () => db.docsIn('adminAuditLog').map((entry) => entry.data);

test('B4: aprobar sobre otro propietario sin confirmar falla y no cambia nada', async () => {
  seedClaimAndPlace({ name: 'Bar Pepe', businessVerified: true, businessOwnerUserId: 'u-old', businessManagerIds: ['u-old'] });
  await assert.rejects(review({ status: 'approved' }), (error) => {
    assert.equal(error.code, 'failed-precondition');
    assert.equal(error.details.reason, 'owner-transfer-required');
    assert.equal(error.details.currentOwnerUserId, 'u-old');
    return true;
  });
  assert.equal(db.data(CLAIM_PATH).status, 'pending');
  assert.equal(db.data('places/p1').businessOwnerUserId, 'u-old');
  assert.equal(auditEntries().length, 0);
});

test('B4: con allowOwnerTransfer transfiere y lo deja en la auditoría', async () => {
  seedClaimAndPlace({ name: 'Bar Pepe', businessVerified: true, businessOwnerUserId: 'u-old', businessManagerIds: ['u-old'] });
  const result = await review({ status: 'approved', adminNotes: 'Pruebas correctas', allowOwnerTransfer: true });
  assert.deepEqual(result, { ok: true, status: 'approved', previousOwnerUserId: 'u-old' });

  const claim = db.data(CLAIM_PATH);
  assert.equal(claim.status, 'approved');
  assert.equal(claim.reviewedBy, 'jefe1');
  assert.ok(isServerTimestamp(claim.reviewedAt));
  const place = db.data('places/p1');
  assert.equal(place.businessOwnerUserId, 'u1');
  assert.deepEqual(place.businessManagerIds, ['u-old', 'u1'], 'el anterior sigue como gestor');

  const [audit] = auditEntries();
  assert.equal(audit.action, 'businessClaim.review');
  assert.equal(audit.actorUid, 'jefe1');
  assert.equal(audit.details.claimId, CLAIM_ID);
  assert.equal(audit.details.previousOwnerUserId, 'u-old');
  assert.equal(audit.details.ownerTransferred, true);
  assert.equal(audit.details.adminNotes, 'Pruebas correctas');
});

test('B4: el mismo propietario, un lugar sin verificar o un rechazo no piden confirmación', async () => {
  seedClaimAndPlace({ businessVerified: true, businessOwnerUserId: 'u1' });
  assert.deepEqual(await review({ status: 'approved' }), { ok: true, status: 'approved', previousOwnerUserId: null });
  assert.equal(auditEntries()[0].details.ownerTransferred, false);

  seedClaimAndPlace({ name: 'Sin verificar' });
  assert.equal((await review({ status: 'approved' })).status, 'approved');

  seedClaimAndPlace(null);
  assert.equal((await review({ status: 'approved' })).status, 'approved');

  seedClaimAndPlace({ businessVerified: true, businessOwnerUserId: 'u-old' });
  assert.equal((await review({ status: 'rejected', adminNotes: 'No coincide el CIF' })).status, 'rejected');
  assert.equal(db.data('places/p1').businessOwnerUserId, 'u-old');
});

test('B4: solo un jefe puede revisar', async () => {
  seedClaimAndPlace(null);
  await assert.rejects(review({ status: 'approved' }, 'u1'), (error) => error.code === 'permission-denied');
});
