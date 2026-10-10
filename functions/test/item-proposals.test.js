// B7 (reviewItemProposal reserva la propuesta antes de aplicarla, comprueba
// que origen y destino siguen activos y, si falla, vuelve a pending con
// applyError) y B8 (submitItemProposal avisa a los jefes).
//
// node --test ejecuta cada archivo en su propio proceso: aquí se sustituyen
// getFirestore/getAuth y el rebuild de la carta antes de cargar los módulos.
const test = require('node:test');
const assert = require('node:assert/strict');
const firestoreAdmin = require('firebase-admin/firestore');
const authAdmin = require('firebase-admin/auth');
const { Timestamp } = firestoreAdmin;
const { FakeFirestore, isServerTimestamp } = require('./helpers/fake-firestore');
const {
  APPLY_STALE_MS,
  isStaleApplying,
  proposalReviewCheck,
  holdsApplyReservation,
  applyErrorInfo,
  checkMergeItems,
  checkRenameItem,
  checkReassignTarget,
  needsAppliedChangeCheck,
  rejectAfterApplyErrorCheck,
} = require('../modules/lib/item-proposals');

const NOW = Date.UTC(2026, 9, 7, 10, 0, 0);
const MIN = 60 * 1000;
const items = (entries) => new Map(Object.entries(entries).map(([id, data]) => [id, { id, ...data }]));

// ── Reglas puras ────────────────────────────────────────────────────────────

test('proposalReviewCheck: se decide desde pending o desde un applying atascado', () => {
  assert.deepEqual(proposalReviewCheck({ status: 'pending' }, NOW), { ok: true, retry: false });

  const fresh = proposalReviewCheck({ status: 'applying', applyingAt: Timestamp.fromMillis(NOW - 2 * MIN) }, NOW);
  assert.equal(fresh.ok, false);
  assert.equal(fresh.code, 'failed-precondition');
  assert.match(fresh.message, /Otro administrador/);

  assert.deepEqual(proposalReviewCheck({ status: 'applying', applyingAt: Timestamp.fromMillis(NOW - 11 * MIN) }, NOW), { ok: true, retry: true });
  assert.deepEqual(proposalReviewCheck({ status: 'applying' }, NOW), { ok: true, retry: true }, 'sin hora: se puede retomar');
  assert.deepEqual(proposalReviewCheck({ status: 'applying', applyingAt: Timestamp.fromMillis(NOW - 11 * MIN) }, NOW, 'approve'), { ok: true, retry: true });
  // Atascada: parte del cambio puede estar ya escrito, así que no se rechaza; se reintenta.
  const stuckReject = proposalReviewCheck({ status: 'applying', applyingAt: Timestamp.fromMillis(NOW - 11 * MIN) }, NOW, 'reject');
  assert.equal(stuckReject.ok, false);
  assert.equal(stuckReject.code, 'failed-precondition');
  assert.match(stuckReject.message, /se quedó a medias.*Reinténtala/);
  assert.deepEqual(proposalReviewCheck({ status: 'pending' }, NOW, 'reject'), { ok: true, retry: false });

  for (const status of ['approved', 'rejected', 'raro']) {
    const check = proposalReviewCheck({ status }, NOW);
    assert.equal(check.ok, false);
    assert.equal(check.message, 'Esta propuesta ya fue revisada.');
  }
  assert.equal(proposalReviewCheck(null, NOW).code, 'not-found');
});

test('isStaleApplying: 10 minutos, más que el timeout del callable', () => {
  assert.ok(APPLY_STALE_MS > 300 * 1000);
  assert.equal(isStaleApplying({ status: 'applying', applyingAt: Timestamp.fromMillis(NOW - APPLY_STALE_MS) }, NOW), true);
  assert.equal(isStaleApplying({ status: 'applying', applyingAt: Timestamp.fromMillis(NOW - APPLY_STALE_MS + 1) }, NOW), false);
  assert.equal(isStaleApplying({ status: 'applying', reviewedAt: Timestamp.fromMillis(NOW - 20 * MIN) }, NOW), true);
  assert.equal(isStaleApplying({ status: 'pending' }, NOW), false);
});

test('holdsApplyReservation: misma persona y misma hora de reserva', () => {
  const at = Timestamp.fromMillis(NOW);
  assert.equal(holdsApplyReservation({ status: 'applying', reviewedBy: 'jefe1', applyingAt: at }, 'jefe1', NOW), true);
  assert.equal(holdsApplyReservation({ status: 'applying', reviewedBy: 'jefe1', applyingAt: Timestamp.fromMillis(NOW + 1) }, 'jefe1', NOW), false, 'retomada después (aunque sea la misma persona)');
  assert.equal(holdsApplyReservation({ status: 'applying', reviewedBy: 'jefe2', applyingAt: at }, 'jefe1', NOW), false);
  assert.equal(holdsApplyReservation({ status: 'pending', reviewedBy: 'jefe1', applyingAt: at }, 'jefe1', NOW), false);
  assert.equal(holdsApplyReservation({ status: 'applying', reviewedBy: 'jefe1' }, 'jefe1', 0), false);
  assert.equal(holdsApplyReservation(null, 'jefe1', NOW), false);
});

test('applyErrorInfo: mensaje, código y quién lo intentó', () => {
  assert.deepEqual(applyErrorInfo({ message: '  Ya hay un elemento llamado «Bravas».  ', code: 'already-exists' }, 'jefe1'), {
    message: 'Ya hay un elemento llamado «Bravas».', code: 'already-exists', by: 'jefe1',
  });
  assert.deepEqual(applyErrorInfo(Object.assign(new Error('9 FAILED_PRECONDITION'), { code: 9 }), 'jefe1').code, '9');
  assert.equal(applyErrorInfo(new Error(''), 'jefe1').message, 'Error desconocido al aplicar la propuesta.');
  assert.equal(applyErrorInfo({ message: 'x'.repeat(500) }, 'jefe1').message.length, 300);
  assert.equal(applyErrorInfo(undefined, null).code, null);
});

test('checkMergeItems: origen y destino activos, siguiendo fusiones', () => {
  const base = {
    bravas: { canonicalName: 'Bravas', status: 'active' },
    'patatas-bravas': { canonicalName: 'Patatas bravas', status: 'active' },
    viejo: { canonicalName: 'Viejo', status: 'inactive', mergedInto: 'patatas-bravas' },
  };
  assert.deepEqual(checkMergeItems(items(base), { sourceItemId: 'bravas', targetItemId: 'patatas-bravas' }),
    { sourceId: 'bravas', targetId: 'patatas-bravas', alreadyMerged: false });
  // El destino propuesto se fusionó después: se sigue hasta el vigente.
  assert.equal(checkMergeItems(items(base), { sourceItemId: 'bravas', targetItemId: 'viejo' }).targetId, 'patatas-bravas');
});

test('checkMergeItems: un origen ya fusionado en ese destino se da por aplicado (reintento)', () => {
  const map = items({
    bravas: { canonicalName: 'Bravas', status: 'inactive', mergedInto: 'patatas-bravas' },
    'patatas-bravas': { canonicalName: 'Patatas bravas', status: 'active' },
  });
  assert.deepEqual(checkMergeItems(map, { sourceItemId: 'bravas', targetItemId: 'patatas-bravas' }),
    { sourceId: 'bravas', targetId: 'patatas-bravas', alreadyMerged: true });
});

test('checkMergeItems: rechaza un origen o un destino que ya no están activos', () => {
  const map = items({
    bravas: { canonicalName: 'Bravas', status: 'inactive' },
    tortilla: { canonicalName: 'Tortilla', status: 'inactive', mergedInto: 'tortilla-de-patatas' },
    'tortilla-de-patatas': { canonicalName: 'Tortilla de patatas', status: 'active' },
    'patatas-bravas': { canonicalName: 'Patatas bravas', status: 'active' },
    croquetas: { canonicalName: 'Croquetas', status: 'inactive' },
  });
  const failsWith = (payload, pattern, code = 'failed-precondition') => assert.throws(() => checkMergeItems(map, payload), (error) => {
    assert.equal(error.code, code);
    assert.match(error.message, pattern);
    return true;
  });
  failsWith({ sourceItemId: 'bravas', targetItemId: 'patatas-bravas' }, /origen «Bravas» ya no está activo/);
  failsWith({ sourceItemId: 'tortilla', targetItemId: 'patatas-bravas' }, /ya se fusionó con «Tortilla de patatas»/);
  failsWith({ sourceItemId: 'patatas-bravas', targetItemId: 'croquetas' }, /destino ya no está activo/);
  failsWith({ sourceItemId: 'tortilla-de-patatas', targetItemId: 'tortilla' }, /ya son el mismo/);
  failsWith({ sourceItemId: 'nada', targetItemId: 'patatas-bravas' }, /no existe/, 'not-found');
  failsWith({ sourceItemId: 'patatas-bravas', targetItemId: 'nada' }, /no existe/, 'not-found');
});

test('checkRenameItem y checkReassignTarget: el elemento sigue activo', () => {
  const map = items({
    bravas: { canonicalName: 'Bravas', status: 'active' },
    viejo: { canonicalName: 'Viejo', status: 'inactive' },
    tortilla: { canonicalName: 'Tortilla', status: 'inactive', mergedInto: 'bravas' },
  });
  assert.equal(checkRenameItem(map, { itemId: 'bravas' }).itemId, 'bravas');
  assert.throws(() => checkRenameItem(map, { itemId: 'viejo' }), /«Viejo» ya no está activo/);
  assert.throws(() => checkRenameItem(map, { itemId: 'tortilla' }), (error) => error.details.itemId === 'bravas' && /se fusionó con «Bravas»/.test(error.message));
  assert.throws(() => checkRenameItem(map, { itemId: 'nada' }), (error) => error.code === 'not-found');

  assert.equal(checkReassignTarget(map, { targetItemId: 'tortilla' }).targetId, 'bravas');
  assert.throws(() => checkReassignTarget(map, { targetItemId: 'viejo' }), /destino ya no está activo/);
});

test('rejectAfterApplyErrorCheck: no deja rechazar un cambio que ya está en la carta', () => {
  const failed = { message: 'Firestore no responde', code: null, by: 'jefe1' };
  const merge = {
    placeId: 'p1', type: 'merge', status: 'pending', applyError: failed,
    payload: { sourceItemId: 'bravas', targetItemId: 'patatas-bravas' },
  };
  const rename = {
    placeId: 'p1', type: 'rename', status: 'pending', applyError: failed,
    payload: { itemId: 'bravas', currentName: 'Bravas', newName: 'Bravas picantes' },
  };

  // Solo se mira la carta si falló al aplicarse y es una fusión o un renombre.
  assert.equal(needsAppliedChangeCheck(merge), true);
  assert.equal(needsAppliedChangeCheck(rename), true);
  assert.equal(needsAppliedChangeCheck({ ...merge, applyError: undefined }), false, 'nunca se intentó aplicar');
  assert.equal(needsAppliedChangeCheck({ ...merge, status: 'applying' }), false);
  assert.equal(needsAppliedChangeCheck({ ...merge, type: 'reassign_review' }), false);
  assert.equal(needsAppliedChangeCheck({ ...merge, placeId: 'a/b' }), false);
  assert.equal(needsAppliedChangeCheck(null), false);

  // Fusión guardada (el rebuild falló después): se pide reintentar.
  const merged = rejectAfterApplyErrorCheck(merge, items({
    bravas: { canonicalName: 'Bravas', status: 'inactive', mergedInto: 'patatas-bravas' },
    'patatas-bravas': { canonicalName: 'Patatas bravas', status: 'active' },
  }));
  assert.equal(merged.ok, false);
  assert.equal(merged.code, 'failed-precondition');
  assert.match(merged.message, /fusión ya está hecha: «Bravas» ya forma parte de «Patatas bravas».*«🔁 Reintentar»/);
  // Siguiendo fusiones: el destino propuesto se fusionó después con otro.
  assert.equal(rejectAfterApplyErrorCheck(merge, items({
    bravas: { canonicalName: 'Bravas', status: 'inactive', mergedInto: 'bravas-caseras' },
    'patatas-bravas': { canonicalName: 'Patatas bravas', status: 'inactive', mergedInto: 'bravas-caseras' },
    'bravas-caseras': { canonicalName: 'Bravas caseras', status: 'active' },
  })).ok, false);
  // Nada escrito todavía, o el origen se fusionó con otro elemento: se puede rechazar.
  assert.deepEqual(rejectAfterApplyErrorCheck(merge, items({
    bravas: { canonicalName: 'Bravas', status: 'active' },
    'patatas-bravas': { canonicalName: 'Patatas bravas', status: 'active' },
  })), { ok: true });
  assert.deepEqual(rejectAfterApplyErrorCheck(merge, items({
    bravas: { canonicalName: 'Bravas', status: 'inactive', mergedInto: 'croquetas' },
    'patatas-bravas': { canonicalName: 'Patatas bravas', status: 'active' },
    croquetas: { canonicalName: 'Croquetas', status: 'active' },
  })), { ok: true });
  assert.deepEqual(rejectAfterApplyErrorCheck(merge, items({})), { ok: true }, 'sin elementos no hay nada que deshacer');

  // Renombre: el elemento ya se llama como el nombre nuevo.
  const renamed = rejectAfterApplyErrorCheck(rename, items({ bravas: { canonicalName: 'Bravas picantes', status: 'active' } }));
  assert.equal(renamed.ok, false);
  assert.match(renamed.message, /nombre ya se cambió a «Bravas picantes».*«🔁 Reintentar»/);
  assert.deepEqual(rejectAfterApplyErrorCheck(rename, items({ bravas: { canonicalName: 'Bravas', status: 'active' } })), { ok: true });
  // Sin applyError no se mira nada.
  assert.deepEqual(rejectAfterApplyErrorCheck({ ...rename, applyError: undefined }, items({ bravas: { canonicalName: 'Bravas picantes' } })), { ok: true });
});

// ── reviewItemProposal y submitItemProposal con Firestore en memoria ───────

const db = new FakeFirestore();
firestoreAdmin.getFirestore = () => db;
authAdmin.getAuth = () => ({
  getUser: async (uid) => ({ uid, customClaims: { admin: uid.startsWith('jefe') } }),
});

// El rebuild real lee reseñas con collectionGroup (no lo tiene el doble): se
// sustituye antes de cargar business-items.js, que lo desestructura al cargar.
const canonicalItems = require('../modules/canonical-items');
const rebuildCalls = [];
let rebuildImpl = async () => ({ renamedReviews: 3 });
canonicalItems.rebuildCanonicalItemsForPlace = async (placeId) => {
  rebuildCalls.push(placeId);
  return rebuildImpl(placeId);
};
canonicalItems.fetchReviewCopiesForPlace = async () => ({ copies: [], updateTimes: new Map() });

const businessItems = require('../modules/business-items');

const PROPOSAL = 'itemProposals/prop1';

function reset() {
  db.store.clear();
  db.queries.length = 0;
  db.writes.length = 0;
  rebuildCalls.length = 0;
  rebuildImpl = async () => ({ renamedReviews: 3 });
  delete db.collection;
  db.seed('users/jefe1', { userType: ['jefe'] });
  db.seed('users/jefe2', { userType: 'jefe' });
  db.seed('users/owner1', { userType: ['business'] });
  db.seed('places/p1', {
    name: 'Bar Pepe', businessOwnerUserId: 'owner1', businessManagerIds: ['owner1'], businessProActive: true,
  });
  db.seed('places/p1/items/bravas', { canonicalName: 'Bravas', status: 'active', curatedAliasesNormalized: ['bravas'] });
  db.seed('places/p1/items/patatas-bravas', { canonicalName: 'Patatas bravas', status: 'active' });
  db.seed('places/p1/items/croquetas', { canonicalName: 'Croquetas', status: 'active' });
}

const mergeProposal = (overrides = {}) => ({
  placeId: 'p1',
  placeName: 'Bar Pepe',
  type: 'merge',
  payload: { sourceItemId: 'bravas', sourceItemName: 'Bravas', targetItemId: 'patatas-bravas', targetItemName: 'Patatas bravas' },
  status: 'pending',
  createdBy: 'owner1',
  createdAt: Timestamp.fromMillis(NOW - 60 * MIN),
  ...overrides,
});

const review = (data, uid = 'jefe1') => businessItems.reviewItemProposal.run({ auth: { uid }, data: { proposalId: 'prop1', ...data } });
const auditActions = () => db.docsIn('adminAuditLog').map((entry) => entry.data.action);
const ownerNotification = () => db.data('users/owner1/notifications/item_proposal_prop1');

async function waitFor(condition) {
  for (let i = 0; i < 200; i += 1) {
    if (condition()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('waitFor: la condición no se cumplió');
}

test('B7: aprobar una fusión la aplica una vez y deja la propuesta aprobada', async () => {
  reset();
  db.seed(PROPOSAL, mergeProposal());
  const result = await review({ decision: 'approve', adminNotes: 'Mismo plato' });
  assert.deepEqual(result, {
    ok: true, proposalId: 'prop1', decision: 'approve', applyResult: { reassignedReviews: 3, targetItemId: 'patatas-bravas' },
  });

  const doc = db.data(PROPOSAL);
  assert.equal(doc.status, 'approved');
  assert.equal(doc.reviewedBy, 'jefe1');
  assert.ok(isServerTimestamp(doc.reviewedAt));
  assert.equal(doc.adminNotes, 'Mismo plato');
  assert.deepEqual(doc.applyResult, { reassignedReviews: 3, targetItemId: 'patatas-bravas' });
  assert.equal(doc.applyingAt, undefined, 'la reserva no se queda en el documento');
  assert.equal(doc.applyError, undefined);

  assert.equal(db.data('places/p1/items/bravas').status, 'inactive');
  assert.equal(db.data('places/p1/items/bravas').mergedInto, 'patatas-bravas');
  assert.deepEqual(db.data('places/p1/items/patatas-bravas').curatedAliasesNormalized, ['bravas']);
  assert.deepEqual(rebuildCalls, ['p1']);
  assert.ok(auditActions().includes('businessPro.itemProposalApproved'));
  assert.match(ownerNotification().message, /fusión de elementos en Bar Pepe ha sido aprobada/);

  // La reserva pasó por 'applying' con reviewedBy antes de aplicar.
  const reservation = db.writes.find((write) => write.path === PROPOSAL && write.data.status === 'applying');
  assert.ok(reservation, 'sin reserva previa');
  assert.equal(reservation.data.reviewedBy, 'jefe1');
  assert.ok(reservation.data.applyingAt instanceof Timestamp);
});

test('B7: mientras un jefe la aplica, otro no puede aprobarla ni rechazarla', async () => {
  reset();
  db.seed(PROPOSAL, mergeProposal());
  let release;
  rebuildImpl = () => new Promise((resolve) => { release = () => resolve({ renamedReviews: 1 }); });

  const first = review({ decision: 'approve' }, 'jefe1');
  await waitFor(() => typeof release === 'function');
  assert.equal(db.data(PROPOSAL).status, 'applying');
  assert.equal(db.data(PROPOSAL).reviewedBy, 'jefe1');

  for (const decision of ['approve', 'reject']) {
    await assert.rejects(review({ decision, adminNotes: 'Lo miro yo' }, 'jefe2'), (error) => {
      assert.equal(error.code, 'failed-precondition');
      assert.match(error.message, /Otro administrador está aplicando/);
      return true;
    });
  }

  release();
  assert.equal((await first).ok, true);
  assert.equal(db.data(PROPOSAL).status, 'approved');
  assert.equal(db.data(PROPOSAL).reviewedBy, 'jefe1');
  assert.deepEqual(rebuildCalls, ['p1'], 'la fusión se aplica una sola vez');

  await assert.rejects(review({ decision: 'approve' }, 'jefe2'), (error) => error.message === 'Esta propuesta ya fue revisada.');
});

test('B7: si aplicar falla vuelve a pending con applyError y el error llega al panel', async () => {
  reset();
  db.seed(PROPOSAL, mergeProposal({
    type: 'rename',
    payload: { itemId: 'bravas', currentName: 'Bravas', newName: 'Croquetas' },
  }));

  await assert.rejects(review({ decision: 'approve', adminNotes: 'ok' }), (error) => {
    assert.equal(error.code, 'already-exists');
    assert.match(error.message, /Ya hay un elemento llamado «Croquetas»/);
    return true;
  });

  const doc = db.data(PROPOSAL);
  assert.equal(doc.status, 'pending');
  assert.equal(doc.reviewedBy, undefined, 'pendiente otra vez: sin revisor');
  assert.equal(doc.applyingAt, undefined);
  assert.equal(doc.applyError.code, 'already-exists');
  assert.match(doc.applyError.message, /«Croquetas»/);
  assert.equal(doc.applyError.by, 'jefe1');
  assert.ok(isServerTimestamp(doc.applyError.at));
  assert.equal(db.data('places/p1/items/bravas').canonicalName, 'Bravas', 'no se aplicó nada');
  assert.deepEqual(auditActions(), ['businessPro.itemProposalApplyFailed']);
  assert.equal(ownerNotification(), undefined, 'el negocio no recibe nada hasta que se decida');

  // Se arregla el conflicto y se reintenta: queda aprobada y sin applyError.
  db.seed('places/p1/items/croquetas', { canonicalName: 'Croquetas caseras', status: 'active' });
  const retry = await review({ decision: 'approve' });
  assert.deepEqual(retry.applyResult, { renamed: true, renamedReviews: 3 });
  assert.equal(db.data(PROPOSAL).status, 'approved');
  assert.equal(db.data(PROPOSAL).applyError, undefined);
  assert.equal(db.data('places/p1/items/bravas').canonicalName, 'Croquetas');
});

test('B7: un fallo inesperado (rebuild caído) también libera la propuesta', async () => {
  reset();
  db.seed(PROPOSAL, mergeProposal());
  rebuildImpl = async () => { throw new Error('Firestore no responde'); };
  await assert.rejects(review({ decision: 'approve' }), /Firestore no responde/);
  const doc = db.data(PROPOSAL);
  assert.equal(doc.status, 'pending');
  assert.deepEqual({ message: doc.applyError.message, code: doc.applyError.code }, { message: 'Firestore no responde', code: null });

  // El origen ya quedó fusionado: el reintento lo reconoce y completa el rebuild.
  rebuildImpl = async () => ({ renamedReviews: 2 });
  const retry = await review({ decision: 'approve' });
  assert.deepEqual(retry.applyResult, { reassignedReviews: 2, targetItemId: 'patatas-bravas', alreadyMerged: true });
  assert.equal(db.data(PROPOSAL).status, 'approved');
});

test('B7: tras un fallo, no se rechaza una fusión que ya quedó guardada; se reintenta', async () => {
  reset();
  db.seed(PROPOSAL, mergeProposal());
  rebuildImpl = async () => { throw new Error('Firestore no responde'); };
  await assert.rejects(review({ decision: 'approve' }), /Firestore no responde/);
  assert.equal(db.data(PROPOSAL).status, 'pending');
  assert.equal(db.data('places/p1/items/bravas').mergedInto, 'patatas-bravas', 'la fusión se guardó antes del rebuild');

  await assert.rejects(review({ decision: 'reject', adminNotes: 'Mejor no' }), (error) => {
    assert.equal(error.code, 'failed-precondition');
    assert.match(error.message, /fusión ya está hecha.*«🔁 Reintentar»/);
    return true;
  });
  const doc = db.data(PROPOSAL);
  assert.equal(doc.status, 'pending', 'no se marca rechazada con la fusión dentro');
  assert.ok(doc.applyError);
  assert.equal(ownerNotification(), undefined, 'el negocio no recibe un «rechazada» de algo ya fusionado');
  assert.equal(auditActions().includes('businessPro.itemProposalRejected'), false);

  rebuildImpl = async () => ({ renamedReviews: 2 });
  const retry = await review({ decision: 'approve' });
  assert.equal(retry.applyResult.alreadyMerged, true);
  assert.equal(db.data(PROPOSAL).status, 'approved');
});

test('B7: tras un fallo, no se rechaza un renombre ya escrito, pero sí uno que no llegó a aplicarse', async () => {
  reset();
  db.seed(PROPOSAL, mergeProposal({
    type: 'rename',
    payload: { itemId: 'bravas', currentName: 'Bravas', newName: 'Bravas picantes' },
  }));
  rebuildImpl = async () => { throw new Error('Tiempo agotado'); };
  await assert.rejects(review({ decision: 'approve' }), /Tiempo agotado/);
  assert.equal(db.data('places/p1/items/bravas').canonicalName, 'Bravas picantes');
  await assert.rejects(review({ decision: 'reject' }), (error) => error.code === 'failed-precondition'
    && /nombre ya se cambió a «Bravas picantes».*«🔁 Reintentar»/.test(error.message));
  assert.equal(db.data(PROPOSAL).status, 'pending');

  // Falló antes de escribir nada (el nombre ya era de otro): se rechaza como siempre.
  reset();
  db.seed(PROPOSAL, mergeProposal({
    type: 'rename',
    payload: { itemId: 'bravas', currentName: 'Bravas', newName: 'Croquetas' },
  }));
  await assert.rejects(review({ decision: 'approve' }), (error) => error.code === 'already-exists');
  assert.ok(db.data(PROPOSAL).applyError);
  const rejected = await review({ decision: 'reject', adminNotes: 'Ese nombre ya existe' });
  assert.equal(rejected.decision, 'reject');
  assert.equal(db.data(PROPOSAL).status, 'rejected');
  assert.match(ownerNotification().message, /rechazada: Ese nombre ya existe/);
});

test('B7: no aplica una fusión cuyo origen o destino ya no están activos', async () => {
  reset();
  db.seed('places/p1/items/bravas', { canonicalName: 'Bravas', status: 'inactive' });
  db.seed(PROPOSAL, mergeProposal());
  await assert.rejects(review({ decision: 'approve' }), (error) => error.code === 'failed-precondition' && /origen «Bravas» ya no está activo/.test(error.message));
  assert.equal(db.data(PROPOSAL).status, 'pending');
  assert.match(db.data(PROPOSAL).applyError.message, /origen/);

  reset();
  db.seed('places/p1/items/patatas-bravas', { canonicalName: 'Patatas bravas', status: 'inactive' });
  db.seed(PROPOSAL, mergeProposal());
  await assert.rejects(review({ decision: 'approve' }), /destino ya no está activo/);
  assert.equal(db.data(PROPOSAL).status, 'pending');
  assert.equal(db.data('places/p1/items/bravas').status, 'active', 'el origen no se toca');
  assert.deepEqual(rebuildCalls, []);
});

test('B7: no renombra un elemento que ya no está activo', async () => {
  reset();
  db.seed('places/p1/items/bravas', { canonicalName: 'Bravas', status: 'inactive' });
  db.seed(PROPOSAL, mergeProposal({ type: 'rename', payload: { itemId: 'bravas', currentName: 'Bravas', newName: 'Bravas picantes' } }));
  await assert.rejects(review({ decision: 'approve' }), /ya no está activo/);
  assert.equal(db.data(PROPOSAL).status, 'pending');
  assert.equal(db.data('places/p1/items/bravas').canonicalName, 'Bravas');
});

test('B7: una propuesta atascada en applying se puede retomar pasados 10 minutos', async () => {
  reset();
  db.seed(PROPOSAL, mergeProposal({ status: 'applying', reviewedBy: 'jefe2', applyingAt: Timestamp.fromMillis(Date.now() - 2 * MIN) }));
  await assert.rejects(review({ decision: 'approve' }), /Otro administrador/);
  assert.equal(db.data(PROPOSAL).reviewedBy, 'jefe2');

  db.seed(PROPOSAL, mergeProposal({ status: 'applying', reviewedBy: 'jefe2', applyingAt: Timestamp.fromMillis(Date.now() - 11 * MIN) }));
  const result = await review({ decision: 'approve' });
  assert.equal(result.ok, true);
  assert.equal(db.data(PROPOSAL).status, 'approved');
  assert.equal(db.data(PROPOSAL).reviewedBy, 'jefe1');

});

test('B7: una atascada no se rechaza (la fusión puede estar ya hecha); el reintento la termina', async () => {
  reset();
  // La llamada anterior guardó la fusión y murió reconstruyendo la carta.
  db.seed('places/p1/items/bravas', { canonicalName: 'Bravas', status: 'inactive', mergedInto: 'patatas-bravas' });
  const stuckAt = Timestamp.fromMillis(Date.now() - 30 * MIN);
  db.seed(PROPOSAL, mergeProposal({ status: 'applying', reviewedBy: 'jefe2', applyingAt: stuckAt }));

  await assert.rejects(review({ decision: 'reject', adminNotes: 'Mejor no' }), (error) => {
    assert.equal(error.code, 'failed-precondition');
    assert.match(error.message, /se quedó a medias/);
    return true;
  });
  assert.equal(db.data(PROPOSAL).status, 'applying', 'no cambia nada');
  assert.equal(db.data(PROPOSAL).reviewedBy, 'jefe2');
  assert.equal(ownerNotification(), undefined, 'el negocio no recibe un «rechazada» de algo ya fusionado');

  const retry = await review({ decision: 'approve' });
  assert.deepEqual(retry.applyResult, { reassignedReviews: 3, targetItemId: 'patatas-bravas', alreadyMerged: true });
  assert.equal(db.data(PROPOSAL).status, 'approved');
  assert.match(ownerNotification().message, /ha sido aprobada/);
});

test('B7: una llamada que se pasó de tiempo no pisa a quien la retomó', async () => {
  reset();
  db.seed(PROPOSAL, mergeProposal());
  let release;
  rebuildImpl = () => new Promise((resolve) => { release = () => resolve({ renamedReviews: 1 }); });

  // jefe1 aprueba y su llamada se queda colgada en el rebuild.
  const late = review({ decision: 'approve' }, 'jefe1');
  await waitFor(() => typeof release === 'function');
  // Pasados 10 minutos, jefe2 la retoma (su reserva, con otra hora).
  const takeover = { status: 'applying', reviewedBy: 'jefe2', applyingAt: Timestamp.fromMillis(Date.now() + 1000) };
  db.seed(PROPOSAL, mergeProposal(takeover));

  // La llamada vieja termina bien: no la marca aprobada ni avisa al negocio.
  release();
  await assert.rejects(late, (error) => error.code === 'aborted' && /retomado/.test(error.message));
  assert.equal(db.data(PROPOSAL).status, 'applying');
  assert.equal(db.data(PROPOSAL).reviewedBy, 'jefe2');
  assert.equal(ownerNotification(), undefined);
  assert.equal(auditActions().includes('businessPro.itemProposalApproved'), false);

  // Y si la llamada vieja falla, tampoco libera la reserva de jefe2.
  reset();
  db.seed(PROPOSAL, mergeProposal());
  let fail;
  rebuildImpl = () => new Promise((_, reject) => { fail = () => reject(new Error('Tiempo agotado')); });
  const lateFail = review({ decision: 'approve' }, 'jefe1');
  await waitFor(() => typeof fail === 'function');
  db.seed(PROPOSAL, mergeProposal(takeover));
  fail();
  await assert.rejects(lateFail, /Tiempo agotado/);
  assert.equal(db.data(PROPOSAL).status, 'applying', 'sigue reservada por jefe2');
  assert.equal(db.data(PROPOSAL).reviewedBy, 'jefe2');
  assert.equal(db.data(PROPOSAL).applyError, undefined);
});

test('B7: rechazar no aplica nada y avisa al negocio con el motivo', async () => {
  reset();
  db.seed(PROPOSAL, mergeProposal());
  const result = await review({ decision: 'reject', adminNotes: 'No son el mismo plato' });
  assert.deepEqual(result, { ok: true, proposalId: 'prop1', decision: 'reject', applyResult: null });
  const doc = db.data(PROPOSAL);
  assert.equal(doc.status, 'rejected');
  assert.equal(doc.reviewedBy, 'jefe1');
  assert.equal(doc.applyResult, null);
  assert.equal(db.data('places/p1/items/bravas').status, 'active');
  assert.deepEqual(rebuildCalls, []);
  assert.match(ownerNotification().message, /rechazada: No son el mismo plato/);
  assert.ok(auditActions().includes('businessPro.itemProposalRejected'));
});

test('B7: solo un jefe revisa', async () => {
  reset();
  db.seed(PROPOSAL, mergeProposal());
  await assert.rejects(review({ decision: 'approve' }, 'owner1'), (error) => error.code === 'permission-denied');
  await assert.rejects(review({ decision: 'quizá' }), (error) => error.code === 'invalid-argument');
  await assert.rejects(businessItems.reviewItemProposal.run({ auth: { uid: 'jefe1' }, data: { proposalId: 'nada', decision: 'approve' } }),
    (error) => error.code === 'not-found');
  assert.equal(db.data(PROPOSAL).status, 'pending');
});

// ── B8: aviso a los jefes al proponer ──────────────────────────────────────

const submit = (data, uid = 'owner1') => businessItems.submitItemProposal.run({ auth: { uid }, data: { placeId: 'p1', ...data } });

test('B8: una propuesta nueva avisa a cada jefe con enlace a su fila', async () => {
  reset();
  const { proposalId } = await submit({ type: 'merge', payload: { sourceItemId: 'bravas', targetItemId: 'patatas-bravas' }, note: 'Errata' });
  const id = `admin_pending_itemProposals_${proposalId}`;
  for (const uid of ['jefe1', 'jefe2']) {
    const notification = db.data(`users/${uid}/notifications/${id}`);
    assert.ok(notification, `sin aviso para ${uid}`);
    assert.equal(notification.type, 'admin_pending');
    assert.equal(notification.message, '📝 Propuesta de carta en Bar Pepe: 🔀 Fusión «Bravas» → «Patatas bravas»');
    assert.equal(notification.link, `/developer?tab=proProposals&view=inbox&focus=${proposalId}`);
    assert.equal(notification.itemId, proposalId);
    assert.equal('placeId' in notification, false);
  }
  assert.equal(db.data(`users/owner1/notifications/${id}`), undefined);

  // El cupo de propuestas abiertas cuenta también las que se están aplicando.
  const quota = db.queries.find((q) => q.collection === 'itemProposals' && q.filters.some((f) => f.field === 'status'));
  assert.deepEqual(quota.filters.find((f) => f.field === 'status'), { field: 'status', op: 'in', value: ['pending', 'applying'] });
});

test('B8: el aviso de un renombre lleva el nombre actual y el nuevo', async () => {
  reset();
  const { proposalId } = await submit({ type: 'rename', payload: { itemId: 'bravas', newName: 'Bravas picantes' } });
  assert.equal(
    db.data(`users/jefe1/notifications/admin_pending_itemProposals_${proposalId}`).message,
    '📝 Propuesta de carta en Bar Pepe: ✏️ Renombre «Bravas» → «Bravas picantes»',
  );
});

test('B8: si avisar a los jefes falla, la propuesta se guarda igual', async () => {
  reset();
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
  try {
    const result = await submit({ type: 'merge', payload: { sourceItemId: 'bravas', targetItemId: 'patatas-bravas' } });
    assert.equal(result.ok, true);
    assert.equal(db.data(`itemProposals/${result.proposalId}`).status, 'pending');
    assert.equal(db.docsIn('users/jefe1/notifications').length, 0);
  } finally {
    delete db.collection;
  }
});
