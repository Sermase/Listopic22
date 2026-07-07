'use strict';

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { assertJefeAccess } = require('./lib/auth');

const db = getFirestore();
const BATCH_LIMIT = 450;

function normalizeItemName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function itemDocIdFromName(value) {
  const normalized = normalizeItemName(value);
  return normalized
    ? normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 140)
    : 'sin-nombre';
}

function safeDocId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/\//g, '-').slice(0, 300);
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function getReviewListId(review, fallbackListId) {
  return String(review.listId || fallbackListId || review.parentListId || 'sin-lista').trim() || 'sin-lista';
}

function hasCanonicalItemSignalChanged(beforeData, afterData) {
  const fields = [
    'placeId',
    'listId',
    'parentListId',
    'itemName',
    'itemNameOriginal',
    'canonicalItemId',
    'canonicalItemName',
    'overallRating',
    'photoUrl',
  ];
  return fields.some((field) => JSON.stringify(beforeData?.[field] ?? null) !== JSON.stringify(afterData?.[field] ?? null))
    || JSON.stringify(beforeData?.scores || {}) !== JSON.stringify(afterData?.scores || {});
}

function getReviewItemId(review) {
  const canonicalItemId = safeDocId(review.canonicalItemId);
  if (canonicalItemId) return canonicalItemId;
  return itemDocIdFromName(review.itemName || review.itemNameOriginal || review.canonicalItemName);
}

function addCriteriaScores(target, scores) {
  if (!scores || typeof scores !== 'object') return;
  Object.entries(scores).forEach(([key, value]) => {
    if (!isNumber(value)) return;
    if (!target[key]) target[key] = { total: 0, count: 0 };
    target[key].total += value;
    target[key].count += 1;
  });
}

function summarizeCriteria(criteriaTotals) {
  const result = {};
  Object.entries(criteriaTotals || {}).forEach(([key, value]) => {
    const count = value.count || 0;
    if (count <= 0) return;
    result[key] = {
      count,
      total: Number(value.total.toFixed(4)),
      average: Number((value.total / count).toFixed(2)),
    };
  });
  return result;
}

function sortedSourceNames(nameCounts) {
  return Array.from(nameCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'))
    .slice(0, 40);
}

function chooseCanonicalName(existingItem, reviewNameCounts, fallbackName) {
  if (typeof existingItem?.canonicalName === 'string' && existingItem.canonicalName.trim()) {
    return existingItem.canonicalName.trim();
  }
  const first = sortedSourceNames(reviewNameCounts)[0]?.name;
  return first || String(fallbackName || 'Elemento sin nombre').trim();
}

async function fetchReviewsForPlace(placeId) {
  // collectionGroup('reviews') incluye también la colección raíz reviews/
  // (legacy), así que una sola query cubre ambas ubicaciones. El Map dedupe
  // por id las copias root+anidada de una misma reseña mientras convivan.
  const snap = await db.collectionGroup('reviews').where('placeId', '==', placeId).get();
  const byId = new Map();
  snap.docs.forEach((docSnap) => {
    const path = docSnap.ref.path.split('/');
    const fallbackListId = path[0] === 'lists' ? path[1] : docSnap.data().listId || null;
    const review = {
      id: docSnap.id,
      refPath: docSnap.ref.path,
      fallbackListId,
      ...docSnap.data(),
    };
    // Preferimos la copia anidada (canónica) si ya vimos la root.
    if (!byId.has(review.id) || path[0] === 'lists') byId.set(review.id, review);
  });
  return Array.from(byId.values());
}

async function fetchExistingItems(placeId) {
  const snap = await db.collection('places').doc(placeId).collection('items').get();
  const map = new Map();
  snap.forEach((docSnap) => map.set(docSnap.id, { id: docSnap.id, ...docSnap.data() }));
  return map;
}

function buildItemAggregates(reviews, existingItems) {
  const items = new Map();

  for (const review of reviews) {
    const itemId = getReviewItemId(review);
    const rawName = String(review.itemName || review.itemNameOriginal || review.canonicalItemName || 'Elemento sin nombre').trim();
    const normalizedName = normalizeItemName(rawName);
    const listId = getReviewListId(review, review.fallbackListId);

    if (!items.has(itemId)) {
      items.set(itemId, {
        itemId,
        nameCounts: new Map(),
        aliasesNormalized: new Set(),
        linkedListIds: new Set(),
        reviewCount: 0,
        ratingCount: 0,
        ratingTotal: 0,
        photoCount: 0,
        criteriaTotals: {},
        listStats: new Map(),
      });
    }

    const item = items.get(itemId);
    item.reviewCount += 1;
    item.linkedListIds.add(listId);
    if (rawName) item.nameCounts.set(rawName, (item.nameCounts.get(rawName) || 0) + 1);
    if (normalizedName) item.aliasesNormalized.add(normalizedName);
    if (isNumber(review.overallRating)) {
      item.ratingCount += 1;
      item.ratingTotal += review.overallRating;
    }
    if (review.photoUrl || (Array.isArray(review.photoUrls) && review.photoUrls.length > 0)) {
      item.photoCount += 1;
    }
    addCriteriaScores(item.criteriaTotals, review.scores);

    if (!item.listStats.has(listId)) {
      item.listStats.set(listId, {
        listId,
        reviewCount: 0,
        ratingCount: 0,
        ratingTotal: 0,
        criteriaTotals: {},
      });
    }
    const listStat = item.listStats.get(listId);
    listStat.reviewCount += 1;
    if (isNumber(review.overallRating)) {
      listStat.ratingCount += 1;
      listStat.ratingTotal += review.overallRating;
    }
    addCriteriaScores(listStat.criteriaTotals, review.scores);
  }

  return Array.from(items.values()).map((item) => {
    const existingItem = existingItems.get(item.itemId);
    const sourceNames = sortedSourceNames(item.nameCounts);
    const canonicalName = chooseCanonicalName(existingItem, item.nameCounts, sourceNames[0]?.name);
    const averageRating = item.ratingCount > 0 ? Number((item.ratingTotal / item.ratingCount).toFixed(2)) : null;
    const listStats = Array.from(item.listStats.values()).map((stat) => ({
      listId: stat.listId,
      reviewCount: stat.reviewCount,
      ratingCount: stat.ratingCount,
      ratingTotal: Number(stat.ratingTotal.toFixed(4)),
      averageRating: stat.ratingCount > 0 ? Number((stat.ratingTotal / stat.ratingCount).toFixed(2)) : null,
      criteriaStats: summarizeCriteria(stat.criteriaTotals),
      updatedAt: FieldValue.serverTimestamp(),
    }));

    return {
      itemId: item.itemId,
      doc: {
        canonicalName,
        aliasesNormalized: Array.from(item.aliasesNormalized).sort(),
        sourceNames,
        linkedListIds: Array.from(item.linkedListIds).sort(),
        source: existingItem?.source || 'community',
        status: existingItem?.status === 'unavailable' ? 'unavailable' : 'active',
        businessData: existingItem?.businessData || {},
        stats: {
          reviewCount: item.reviewCount,
          ratingCount: item.ratingCount,
          ratingTotal: Number(item.ratingTotal.toFixed(4)),
          averageRating,
          photoCount: item.photoCount,
          criteriaStats: summarizeCriteria(item.criteriaTotals),
        },
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: existingItem?.createdAt || FieldValue.serverTimestamp(),
      },
      listStats,
    };
  });
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

async function rebuildCanonicalItemsForPlace(placeId) {
  if (!placeId) return { placeId, itemCount: 0, reviewCount: 0 };

  const placeRef = db.collection('places').doc(placeId);
  const [reviews, existingItems] = await Promise.all([
    fetchReviewsForPlace(placeId),
    fetchExistingItems(placeId),
  ]);
  const aggregates = buildItemAggregates(reviews, existingItems);
  const activeIds = new Set(aggregates.map((item) => item.itemId));
  const batchState = { batch: db.batch(), count: 0 };

  for (const item of aggregates) {
    const itemRef = placeRef.collection('items').doc(item.itemId);
    queueSet(batchState, itemRef, item.doc, { merge: true });

    const existingListStats = await itemRef.collection('listStats').get();
    const activeListIds = new Set(item.listStats.map((stat) => stat.listId));
    existingListStats.forEach((docSnap) => {
      if (!activeListIds.has(docSnap.id)) queueDelete(batchState, docSnap.ref);
    });

    item.listStats.forEach((stat) => {
      queueSet(batchState, itemRef.collection('listStats').doc(safeDocId(stat.listId)), stat, { merge: true });
    });

    if (batchState.count >= BATCH_LIMIT) await commitBatch(batchState);
  }

  for (const [itemId, existingItem] of existingItems.entries()) {
    if (activeIds.has(itemId)) continue;
    // Los items creados por el negocio (carta oficial) pueden no tener reseñas
    // todavía: no se desactivan en el rebuild.
    if (existingItem.source === 'business') continue;
    const itemRef = placeRef.collection('items').doc(itemId);
    queueSet(batchState, itemRef, {
      status: existingItem.status === 'unavailable' ? 'unavailable' : 'inactive',
      stats: {
        reviewCount: 0,
        ratingCount: 0,
        ratingTotal: 0,
        averageRating: null,
        photoCount: 0,
        criteriaStats: {},
      },
      linkedListIds: [],
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (batchState.count >= BATCH_LIMIT) await commitBatch(batchState);
  }

  queueSet(batchState, placeRef, {
    canonicalItemsUpdatedAt: FieldValue.serverTimestamp(),
    canonicalItemsCount: aggregates.length,
  }, { merge: true });
  await commitBatch(batchState);

  logger.info('canonicalItems: rebuilt place items', { placeId, itemCount: aggregates.length, reviewCount: reviews.length });
  return { placeId, itemCount: aggregates.length, reviewCount: reviews.length };
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
  normalizeItemName,
  itemDocIdFromName,
  getReviewItemId,
};
