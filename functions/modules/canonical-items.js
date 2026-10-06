'use strict';

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { assertJefeAccess } = require('./lib/auth');
const {
  DELETE,
  SERVER_TIMESTAMP,
  normalizeItemName,
  itemDocIdFromName,
  safeDocId,
  typedItemName,
  createResolveContext,
  resolveReview,
  planReviewStamp,
  planPlaceRebuild,
  groupReviewCopies,
  hasCanonicalItemSignalChanged,
} = require('./lib/canonical-resolve');

const db = getFirestore();
const BATCH_LIMIT = 450;
const GET_ALL_CHUNK = 300;

// Firestore: código de error de una precondición o de un documento que ya
// existe / ya no existe (gRPC).
const GRPC_NOT_FOUND = 5;
const GRPC_ALREADY_EXISTS = 6;
const GRPC_FAILED_PRECONDITION = 9;

// Traduce los marcadores del plan puro a FieldValue.
function toFirestoreData(data) {
  if (data === DELETE) return FieldValue.delete();
  if (data === SERVER_TIMESTAMP) return FieldValue.serverTimestamp();
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.getPrototypeOf(data) !== Object.prototype) {
    return data;
  }
  const result = {};
  Object.entries(data).forEach(([key, value]) => {
    result[key] = toFirestoreData(value);
  });
  return result;
}

/** Todas las copias (root y anidadas) de las reseñas de un lugar. */
async function fetchReviewCopiesForPlace(placeId) {
  // collectionGroup('reviews') incluye también la colección raíz reviews/
  // (legacy), así que una sola query cubre ambas ubicaciones.
  const snap = await db.collectionGroup('reviews').where('placeId', '==', placeId).get();
  const updateTimes = new Map();
  const copies = snap.docs.map((docSnap) => {
    const path = docSnap.ref.path.split('/');
    const fallbackListId = path[0] === 'lists' ? path[1] : docSnap.data().listId || null;
    updateTimes.set(docSnap.ref.path, docSnap.updateTime);
    return {
      id: docSnap.id,
      refPath: docSnap.ref.path,
      fallbackListId,
      ...docSnap.data(),
    };
  });
  return { copies, updateTimes };
}

/** Reseñas del lugar sin duplicados root + anidada (la anidada manda). */
async function fetchReviewsForPlace(placeId) {
  const { copies } = await fetchReviewCopiesForPlace(placeId);
  return groupReviewCopies(copies).map((group) => group.primary);
}

/**
 * Id del elemento de una reseña. Con los elementos del lugar se usa el
 * resolutor completo (alias curados, fusiones); sin ellos, la regla que usan
 * los clientes: canonicalItemId || slug del nombre.
 */
function getReviewItemId(review, itemsById) {
  if (itemsById) return resolveReview(review, createResolveContext(itemsById)).itemId;
  return safeDocId(review?.canonicalItemId) || itemDocIdFromName(typedItemName(review));
}

async function fetchItemsWithMeta(placeId) {
  const snap = await db.collection('places').doc(placeId).collection('items').get();
  const itemsById = new Map();
  const updateTimes = new Map();
  snap.forEach((docSnap) => {
    itemsById.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
    updateTimes.set(docSnap.id, docSnap.updateTime);
  });
  return { itemsById, updateTimes };
}

async function fetchExistingItems(placeId) {
  const { itemsById } = await fetchItemsWithMeta(placeId);
  return itemsById;
}

async function commitBatch(batchState) {
  if (batchState.count === 0) return;
  await batchState.batch.commit();
  batchState.batch = db.batch();
  batchState.count = 0;
}

function queueSet(batchState, ref, data, options) {
  batchState.batch.set(ref, data, options);
  batchState.count += 1;
}

function queueDelete(batchState, ref) {
  batchState.batch.delete(ref);
  batchState.count += 1;
}

function sameUpdateTime(a, b) {
  if (!a || !b) return !a && !b;
  return typeof a.isEqual === 'function' ? a.isEqual(b) : String(a) === String(b);
}

async function getAllInChunks(refs) {
  const snaps = [];
  for (let i = 0; i < refs.length; i += GET_ALL_CHUNK) {
    const chunk = refs.slice(i, i + GET_ALL_CHUNK);
    if (chunk.length > 0) snaps.push(...await db.getAll(...chunk));
  }
  return snaps;
}

// Un elemento nuevo se crea con create(): si otro proceso (alta del negocio)
// lo ha creado mientras tanto, solo se escriben los campos derivados y no se
// pisan su nombre, origen ni ficha.
async function writeNewItem(itemRef, write) {
  try {
    await itemRef.create(toFirestoreData(write.createData));
  } catch (error) {
    if (error?.code !== GRPC_ALREADY_EXISTS) throw error;
    await itemRef.set(toFirestoreData(write.data), { merge: true });
  }
}

// Estampa las reseñas con BulkWriter y precondición de updateTime: si la
// reseña cambió desde la lectura (p. ej. el autor la editó) se relee, se
// vuelve a resolver y se reintenta una vez.
async function applyReviewStamps(stamps, updateTimes, resolveContext) {
  if (stamps.length === 0) return { written: 0, skipped: 0 };
  let written = 0;
  const retry = [];

  const runStamps = async (entries) => {
    const writer = db.bulkWriter();
    const failures = [];
    const ops = entries.map((entry) => {
      const ref = db.doc(entry.refPath);
      const op = entry.updateTime
        ? writer.update(ref, toFirestoreData(entry.patch), { lastUpdateTime: entry.updateTime })
        : writer.update(ref, toFirestoreData(entry.patch));
      return op.then(() => {
        written += 1;
      }).catch((error) => {
        failures.push({ entry, error });
      });
    });
    await writer.close();
    await Promise.all(ops);
    return failures;
  };

  const firstFailures = await runStamps(stamps.map((stamp) => ({
    ...stamp,
    updateTime: updateTimes.get(stamp.refPath) || null,
  })));

  let skipped = 0;
  firstFailures.forEach(({ entry, error }) => {
    if (error?.code === GRPC_FAILED_PRECONDITION) retry.push(entry);
    else {
      skipped += 1;
      if (error?.code !== GRPC_NOT_FOUND) {
        logger.warn('canonicalItems: no se pudo estampar una reseña', { refPath: entry.refPath, error: error?.message });
      }
    }
  });

  if (retry.length > 0) {
    const snaps = await getAllInChunks(retry.map((entry) => db.doc(entry.refPath)));
    const second = [];
    snaps.forEach((snap) => {
      if (!snap.exists) {
        skipped += 1;
        return;
      }
      const review = { id: snap.id, refPath: snap.ref.path, ...snap.data() };
      const resolution = resolveReview(review, resolveContext);
      const target = resolveContext.itemsById.get(resolution.itemId) || null;
      const stamp = planReviewStamp(review, resolution, target);
      if (stamp) second.push({ refPath: snap.ref.path, patch: stamp.patch, updateTime: snap.updateTime });
    });
    const secondFailures = await runStamps(second);
    skipped += secondFailures.length;
    secondFailures.forEach(({ entry, error }) => {
      logger.warn('canonicalItems: reseña cambiada dos veces durante el estampado; se deja para el próximo rebuild', {
        refPath: entry.refPath,
        error: error?.message,
      });
    });
  }

  return { written, skipped };
}

/**
 * Reconstruye los elementos de un lugar desde sus reseñas y estampa en las
 * reseñas el nombre canónico de los elementos curados (ver
 * lib/canonical-resolve.js). Solo escribe campos derivados en los elementos
 * existentes: nunca su canonicalName, businessData, source,
 * curatedAliasesNormalized, curatedRawAliases, mergedInto ni createdAt.
 */
async function rebuildCanonicalItemsForPlace(placeId, { dryRun = false } = {}) {
  const empty = {
    placeId,
    itemCount: 0,
    reviewCount: 0,
    stampedReviews: 0,
    renamedReviews: 0,
    deactivatedItems: 0,
    mergedItems: 0,
    conflicts: [],
    spotlightsUpdated: 0,
  };
  if (!placeId) return empty;

  const placeRef = db.collection('places').doc(placeId);
  const [{ copies, updateTimes: reviewUpdateTimes }, { itemsById, updateTimes: itemUpdateTimes }] = await Promise.all([
    fetchReviewCopiesForPlace(placeId),
    fetchItemsWithMeta(placeId),
  ]);
  const plan = planPlaceRebuild({ reviews: copies, itemsById });
  const summary = { ...empty, ...plan.summary, conflicts: plan.conflicts };

  if (dryRun) {
    return {
      ...summary,
      dryRun: true,
      duplicates: plan.duplicates,
      activeMergedItems: plan.activeMergedItems,
    };
  }

  const itemsRef = placeRef.collection('items');
  const batchState = { batch: db.batch(), count: 0 };

  // 1) Elementos con reseñas: campos derivados + listStats.
  for (const write of plan.itemWrites) {
    const itemRef = itemsRef.doc(write.itemId);
    if (write.isNew) await writeNewItem(itemRef, write);
    else queueSet(batchState, itemRef, toFirestoreData(write.data), { merge: true });

    const existingListStats = write.isNew ? null : await itemRef.collection('listStats').get();
    const activeListIds = new Set(write.listStats.map((stat) => safeDocId(stat.listId)));
    existingListStats?.forEach((docSnap) => {
      if (!activeListIds.has(docSnap.id)) queueDelete(batchState, docSnap.ref);
    });
    write.listStats.forEach((stat) => {
      queueSet(batchState, itemRef.collection('listStats').doc(safeDocId(stat.listId)), toFirestoreData(stat), { merge: true });
    });

    if (batchState.count >= BATCH_LIMIT) await commitBatch(batchState);
  }
  await commitBatch(batchState);

  // 2) Elementos sin reseñas. Antes de escribir se releen: si alguno cambió
  //    desde la primera lectura (p. ej. el negocio acaba de darlo de alta o de
  //    revivirlo) se deja para el siguiente rebuild.
  let deactivatedItems = 0;
  let mergedItems = 0;
  if (plan.emptyItemWrites.length > 0) {
    const freshSnaps = await getAllInChunks(plan.emptyItemWrites.map((write) => itemsRef.doc(write.itemId)));
    const freshById = new Map(freshSnaps.map((snap) => [snap.id, snap]));
    for (const write of plan.emptyItemWrites) {
      const fresh = freshById.get(write.itemId);
      if (!fresh?.exists || !sameUpdateTime(fresh.updateTime, itemUpdateTimes.get(write.itemId))) {
        logger.info('canonicalItems: elemento cambiado durante el rebuild, no se toca', { placeId, itemId: write.itemId });
        plan.itemsAfter.set(write.itemId, { id: write.itemId, ...(fresh?.data() || {}) });
        continue;
      }
      const itemRef = itemsRef.doc(write.itemId);
      queueSet(batchState, itemRef, toFirestoreData(write.data), { merge: true });
      const leftovers = await itemRef.collection('listStats').get();
      leftovers.forEach((docSnap) => queueDelete(batchState, docSnap.ref));
      if (write.deactivate) deactivatedItems += 1;
      if (write.mergedInto) mergedItems += 1;
      if (batchState.count >= BATCH_LIMIT) await commitBatch(batchState);
    }
  }

  queueSet(batchState, placeRef, {
    canonicalItemsUpdatedAt: FieldValue.serverTimestamp(),
    canonicalItemsCount: plan.summary.itemCount,
  }, { merge: true });
  await commitBatch(batchState);

  // 3) Reseñas: nombre canónico y derivados, sin tocar updatedAt.
  const stampResult = await applyReviewStamps(plan.reviewStamps, reviewUpdateTimes, plan.resolveContext);

  // 4) Campañas de platos destacados abiertas: nombre, listas y stats al día.
  let spotlightsUpdated = 0;
  try {
    // require diferido: sponsored.js no depende de este módulo, pero así
    // evitamos cualquier ciclo futuro al cargar los módulos.
    const { syncSpotlightsForPlace } = require('./sponsored');
    spotlightsUpdated = await syncSpotlightsForPlace(placeId, plan.itemsAfter);
  } catch (error) {
    logger.error('canonicalItems: no se pudieron sincronizar los platos destacados', { placeId, error: error.message });
  }

  const result = {
    ...summary,
    deactivatedItems,
    mergedItems,
    stampSkipped: stampResult.skipped,
    spotlightsUpdated,
  };
  logger.info('canonicalItems: rebuilt place items', {
    placeId,
    itemCount: result.itemCount,
    reviewCount: result.reviewCount,
    stampedReviews: result.stampedReviews,
    renamedReviews: result.renamedReviews,
    deactivatedItems,
    mergedItems,
    conflicts: result.conflicts.length,
    spotlightsUpdated,
  });
  return result;
}

async function rebuildChangedPlaces(beforeData, afterData) {
  if (!hasCanonicalItemSignalChanged(beforeData, afterData)) return null;
  const placeIds = Array.from(new Set([beforeData?.placeId, afterData?.placeId].filter(Boolean)));
  await Promise.all(placeIds.map((placeId) => rebuildCanonicalItemsForPlace(placeId)));
  return null;
}

const syncCanonicalItemsOnListReviewWrite = onDocumentWritten('lists/{listId}/reviews/{reviewId}', async (event) => {
  const beforeData = event.data?.before?.data();
  const afterData = event.data?.after?.data();
  return rebuildChangedPlaces(beforeData, afterData);
});

const syncCanonicalItemsOnRootReviewWrite = onDocumentWritten('reviews/{reviewId}', async (event) => {
  const beforeData = event.data?.before?.data();
  const afterData = event.data?.after?.data();
  return rebuildChangedPlaces(beforeData, afterData);
});

const adminRebuildCanonicalItemsForPlace = onCall(async (request) => {
  const uid = request.auth?.uid;
  await assertJefeAccess(uid, 'Solo un administrador puede reconstruir items canónicos.');
  const placeId = String(request.data?.placeId || '').trim();
  if (!placeId) throw new HttpsError('invalid-argument', 'Falta placeId.');
  const result = await rebuildCanonicalItemsForPlace(placeId);
  return { ok: true, ...result };
});

module.exports = {
  adminRebuildCanonicalItemsForPlace,
  syncCanonicalItemsOnListReviewWrite,
  syncCanonicalItemsOnRootReviewWrite,
  // Helpers internos reutilizados por business-items.js (propuestas de carta).
  rebuildCanonicalItemsForPlace,
  fetchReviewsForPlace,
  fetchReviewCopiesForPlace,
  fetchExistingItems,
  toFirestoreData,
  // Reexportados desde lib/canonical-resolve.js (compatibilidad).
  normalizeItemName,
  itemDocIdFromName,
  safeDocId,
  getReviewItemId,
  hasCanonicalItemSignalChanged,
};
