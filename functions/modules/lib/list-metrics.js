// functions/modules/lib/list-metrics.js
//
// Recálculo de métricas de una lista a partir de sus reseñas.
// Compartido por los triggers de agregados y las funciones admin de listas.

const logger = require('firebase-functions/logger');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { buildGroupedItemsForList } = require('../grouped-aggregator');

const db = getFirestore();

async function recalculateListReviewMetrics(listId) {
  if (!listId) {
    logger.warn('recalculateListReviewMetrics: listId es requerido');
    return null;
  }

  let groupedResult = null;
  try {
    groupedResult = await buildGroupedItemsForList(listId);
  } catch (e) {
    logger.error(`Error building grouped items for list ${listId}`, e);
  }

  let availableTags = new Set();
  let itemCount = 0;

  if (groupedResult && groupedResult.groupedReviews) {
    groupedResult.groupedReviews.forEach(group => {
      if (Array.isArray(group.groupTags)) {
        group.groupTags.forEach(tag => availableTags.add(tag));
      }
    });
    itemCount = groupedResult.groupedReviews.length;
  }

  const listRef = db.collection('lists').doc(listId);
  const reviewsSnap = await listRef.collection('reviews').get();

  const criteriaTotals = {};
  const criteriaCounts = {};
  let totalOverall = 0;
  let overallCount = 0;

  reviewsSnap.forEach((doc) => {
    const data = doc.data() || {};
    const overall = data.overallRating;
    if (typeof overall === 'number' && Number.isFinite(overall)) {
      totalOverall += overall;
      overallCount += 1;
    }

    const scores = data.scores || {};
    Object.entries(scores).forEach(([key, value]) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        criteriaTotals[key] = (criteriaTotals[key] || 0) + value;
        criteriaCounts[key] = (criteriaCounts[key] || 0) + 1;
      }
    });
  });

  const criteriaAverages = {};
  Object.entries(criteriaTotals).forEach(([key, total]) => {
    const count = criteriaCounts[key] || 0;
    if (count > 0) {
      criteriaAverages[key] = Number((total / count).toFixed(2));
    }
  });

  const averageRating = overallCount > 0
    ? Number((totalOverall / overallCount).toFixed(2))
    : null;

  const listSnap = await listRef.get();
  const existingTags = listSnap.exists && Array.isArray(listSnap.data().availableTags)
    ? listSnap.data().availableTags
    : [];
  existingTags.forEach(tag => availableTags.add(tag));

  const updateData = {
    reviewCount: reviewsSnap.size,
    averageRating,
    criteriaAverages,
    criteriaAveragesUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    availableTags: Array.from(availableTags).sort(),
    itemCount: itemCount > 0 ? itemCount : undefined
  };

  await listRef.update(updateData);
  logger.info(`recalculateListReviewMetrics: ${listId} => r:${updateData.reviewCount} avg:${averageRating} tags:${updateData.availableTags?.length}`);

  return {
    reviewCount: reviewsSnap.size,
    averageRating,
    criteriaAverages,
    availableTags: updateData.availableTags
  };
}

module.exports = { recalculateListReviewMetrics };
