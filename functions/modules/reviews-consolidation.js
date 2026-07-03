'use strict';

/**
 * Consolidación de reseñas: la colección canónica es lists/{listId}/reviews.
 * La colección raíz reviews/ es legacy (app React antigua); este módulo permite
 * auditarla y migrar sus documentos hacia la subcolección de su lista,
 * conservando el mismo reviewId y moviendo también reactions/comments.
 *
 * Flujo recomendado (DeveloperPage → Mantenimiento):
 *   1. adminConsolidateRootReviews { dryRun: true }  → informe sin tocar nada.
 *   2. adminConsolidateRootReviews { dryRun: false } → migración por páginas.
 *   3. adminRecountReviewCounters                    → sana contadores
 *      (la creación anidada dispara los triggers de incremento, así que tras
 *      migrar los contadores quedan inflados hasta ejecutar el recuento).
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { getFirestore, FieldValue, FieldPath } = require('firebase-admin/firestore');
const { assertJefeAccess, writeAuditLog } = require('./lib/auth');

const db = getFirestore();

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const RECOUNT_SCAN_PAGE = 500;
const BATCH_LIMIT = 450;

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// Mismo criterio que gamification.countReviewPhotos para que el recuento
// de users.photosCount coincida con lo que mantienen los triggers.
function countReviewPhotos(reviewData) {
  if (!reviewData || typeof reviewData !== 'object') return 0;
  for (const field of ['photos', 'images']) {
    if (Array.isArray(reviewData[field])) {
      const count = reviewData[field].filter((photo) => typeof photo === 'string' && photo.trim().length > 0).length;
      if (count > 0) return count;
    }
  }
  return asTrimmedString(reviewData.photoUrl) ? 1 : 0;
}

async function listExists(listId, cache) {
  if (!listId) return false;
  if (cache.has(listId)) return cache.get(listId);
  const snap = await db.collection('lists').doc(listId).get();
  cache.set(listId, snap.exists ? snap : false);
  return cache.get(listId);
}

/**
 * Resuelve la lista destino de una reseña root:
 * - listId directo si la lista existe.
 * - Si no, vía sublistId: el parentListId de la sublista (o la propia sublista).
 * Devuelve { listId } o { orphanReason }.
 */
async function resolveTargetListId(review, cache) {
  const directListId = asTrimmedString(review.listId);
  if (directListId && await listExists(directListId, cache)) {
    return { listId: directListId };
  }

  const sublistId = asTrimmedString(review.sublistId);
  if (sublistId) {
    const sublistSnap = await listExists(sublistId, cache);
    if (sublistSnap) {
      const parentListId = asTrimmedString(sublistSnap.data().parentListId);
      if (parentListId && await listExists(parentListId, cache)) {
        return { listId: parentListId };
      }
      return { listId: sublistId };
    }
  }

  if (directListId) return { orphanReason: `La lista ${directListId} no existe.` };
  return { orphanReason: 'La reseña no tiene listId ni sublistId válidos.' };
}

// Mueve reactions/comments (y cualquier otra subcolección) del doc root al destino.
async function moveSubcollections(rootRef, targetRef) {
  const subcollections = await rootRef.listCollections();
  for (const col of subcollections) {
    const snap = await col.get();
    for (const subDoc of snap.docs) {
      await targetRef.collection(col.id).doc(subDoc.id).set(subDoc.data(), { merge: true });
      await subDoc.ref.delete();
    }
  }
}

function buildNestedReviewData(review, targetListId) {
  const userTags = Array.isArray(review.userTags) && review.userTags.length > 0
    ? review.userTags
    : (Array.isArray(review.tags) ? review.tags : []);

  return {
    ...review,
    listId: targetListId,
    userId: asTrimmedString(review.userId) || asTrimmedString(review.authorId) || null,
    userTags,
    migratedFromRoot: true,
    migratedFromRootAt: FieldValue.serverTimestamp(),
  };
}

const adminConsolidateRootReviews = onCall({ timeoutSeconds: 540, memory: '512MiB' }, async (request) => {
  const uid = request.auth?.uid;
  await assertJefeAccess(uid, 'Solo un administrador puede consolidar reseñas.');

  const dryRun = request.data?.dryRun !== false; // por defecto solo informa
  const pageSize = Math.min(Math.max(Number(request.data?.pageSize) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const startAfterId = asTrimmedString(request.data?.startAfterId);

  let query = db.collection('reviews').orderBy(FieldPath.documentId()).limit(pageSize);
  if (startAfterId) query = query.startAfter(startAfterId);
  const snap = await query.get();

  const listCache = new Map();
  const result = {
    dryRun,
    processed: snap.size,
    migrated: 0,
    alreadyNested: 0,
    orphans: 0,
    orphanSamples: [],
    lastDocId: snap.size > 0 ? snap.docs[snap.size - 1].id : null,
    done: snap.size < pageSize,
  };

  for (const docSnap of snap.docs) {
    const review = docSnap.data() || {};
    const target = await resolveTargetListId(review, listCache);

    if (target.orphanReason) {
      result.orphans += 1;
      if (result.orphanSamples.length < 10) {
        result.orphanSamples.push({ reviewId: docSnap.id, reason: target.orphanReason });
      }
      if (!dryRun) {
        await docSnap.ref.set({
          rootMigration: { status: 'orphan', reason: target.orphanReason, checkedAt: FieldValue.serverTimestamp() },
        }, { merge: true });
      }
      continue;
    }

    const targetRef = db.collection('lists').doc(target.listId).collection('reviews').doc(docSnap.id);
    const targetSnap = await targetRef.get();

    if (targetSnap.exists) {
      // Copia duplicada: la anidada es la canónica, solo limpiamos la root.
      result.alreadyNested += 1;
      if (!dryRun) {
        await moveSubcollections(docSnap.ref, targetRef);
        await docSnap.ref.delete();
      }
      continue;
    }

    result.migrated += 1;
    if (!dryRun) {
      await targetRef.set(buildNestedReviewData(review, target.listId));
      await moveSubcollections(docSnap.ref, targetRef);
      await docSnap.ref.delete();
    }
  }

  if (!dryRun) {
    await writeAuditLog(uid, 'reviews.consolidateRootPage', {
      processed: result.processed,
      migrated: result.migrated,
      alreadyNested: result.alreadyNested,
      orphans: result.orphans,
      lastDocId: result.lastDocId,
    });
  }

  logger.info('reviewsConsolidation: página procesada', result);
  return result;
});

const adminRecountReviewCounters = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  const uid = request.auth?.uid;
  await assertJefeAccess(uid, 'Solo un administrador puede recontar contadores.');

  const listCounts = new Map();
  const userStats = new Map(); // uid -> { reviews, photos }
  const placeStats = new Map(); // placeId -> { count, ratingTotal }

  let lastDoc = null;
  let scanned = 0;

  for (;;) {
    let query = db.collectionGroup('reviews').limit(RECOUNT_SCAN_PAGE);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      scanned += 1;
      const data = docSnap.data() || {};
      const path = docSnap.ref.path.split('/');
      const nestedListId = path[0] === 'lists' && path.length === 4 ? path[1] : null;
      const listId = nestedListId || asTrimmedString(data.listId) || null;

      if (listId) listCounts.set(listId, (listCounts.get(listId) || 0) + 1);
      const sublistId = asTrimmedString(data.sublistId);
      if (sublistId && sublistId !== listId) {
        listCounts.set(sublistId, (listCounts.get(sublistId) || 0) + 1);
      }

      const reviewUserId = asTrimmedString(data.userId) || asTrimmedString(data.authorId);
      if (reviewUserId) {
        const stats = userStats.get(reviewUserId) || { reviews: 0, photos: 0 };
        stats.reviews += 1;
        stats.photos += countReviewPhotos(data);
        userStats.set(reviewUserId, stats);
      }

      const placeId = asTrimmedString(data.placeId);
      if (placeId) {
        const stats = placeStats.get(placeId) || { count: 0, ratingTotal: 0 };
        stats.count += 1;
        // Mismo criterio que updatePlaceAggregates: rating ausente cuenta como 0.
        stats.ratingTotal += isNumber(data.overallRating) ? data.overallRating : 0;
        placeStats.set(placeId, stats);
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < RECOUNT_SCAN_PAGE) break;
  }

  let batch = db.batch();
  let batchCount = 0;
  const commitIfNeeded = async (force = false) => {
    if (batchCount === 0 || (!force && batchCount < BATCH_LIMIT)) return;
    await batch.commit();
    batch = db.batch();
    batchCount = 0;
  };

  for (const [listId, count] of listCounts.entries()) {
    batch.set(db.collection('lists').doc(listId), {
      reviewCount: count,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    batchCount += 1;
    await commitIfNeeded();
  }

  for (const [userId, stats] of userStats.entries()) {
    batch.set(db.collection('users').doc(userId), {
      reviewsCount: stats.reviews,
      photosCount: stats.photos,
    }, { merge: true });
    batchCount += 1;
    await commitIfNeeded();
  }

  for (const [placeId, stats] of placeStats.entries()) {
    batch.set(db.collection('places').doc(placeId), {
      reviewsCount: stats.count,
      averageRating: stats.count > 0 ? Number((stats.ratingTotal / stats.count).toFixed(2)) : null,
    }, { merge: true });
    batchCount += 1;
    await commitIfNeeded();
  }

  await commitIfNeeded(true);

  const summary = {
    scannedReviews: scanned,
    listsUpdated: listCounts.size,
    usersUpdated: userStats.size,
    placesUpdated: placeStats.size,
  };

  await writeAuditLog(uid, 'reviews.recountCounters', summary);
  logger.info('reviewsConsolidation: recuento completado', summary);
  return summary;
});

const adminCountRootReviews = onCall(async (request) => {
  const uid = request.auth?.uid;
  await assertJefeAccess(uid, 'Solo un administrador puede consultar la colección root.');
  const agg = await db.collection('reviews').count().get();
  return { rootReviews: agg.data().count };
});

module.exports = {
  adminConsolidateRootReviews,
  adminRecountReviewCounters,
  adminCountRootReviews,
};
