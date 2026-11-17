// functions/modules/lib/list-metrics.js
//
// Recálculo de métricas de una lista a partir de sus reseñas.
// Compartido por los triggers de agregados y las funciones admin de listas.

const logger = require('firebase-functions/logger');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { buildGroupedItemsForList } = require('../grouped-aggregator');
const { reviewScoreForList } = require('./scoring');
const { listVisibility } = require('./list-visibility');
const { buildListRanking } = require('./list-ranking');

// Perezoso: computeListMetrics se prueba sin inicializar Firebase.
const db = { collection: (...args) => getFirestore().collection(...args) };

// Las valoraciones de una Minilista se guardan en su Lista madre con
// `sublistId`; las más antiguas pueden estar en la subcolección de la Minilista.
async function fetchListReviews(listRef, listData) {
  const parentListId = typeof listData.parentListId === 'string' && listData.parentListId
    ? listData.parentListId
    : null;
  if (!parentListId) {
    const snap = await listRef.collection('reviews').get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }
  const [inParentSnap, ownSnap] = await Promise.all([
    db.collection('lists').doc(parentListId).collection('reviews').where('sublistId', '==', listRef.id).get(),
    listRef.collection('reviews').get()
  ]);
  const byId = new Map();
  [...inParentSnap.docs, ...ownSnap.docs].forEach((doc) => byId.set(doc.id, { id: doc.id, ...doc.data() }));
  return Array.from(byId.values());
}

/**
 * Nota, nº de valoraciones y medias por criterio de una Lista, con lo mismo que
 * enseña su página: solo las valoraciones de su visibilidad (en una Lista
 * pública, las de una Minilista privada no cuentan) y solo sus criterios.
 */
function computeListMetrics(listData, reviews) {
  const visibility = listVisibility(listData);
  const visible = (reviews || []).filter((review) => review && review.visibility === visibility);
  const ownCriteria = listData && listData.criteriaDefinition && typeof listData.criteriaDefinition === 'object'
    ? new Set(Object.keys(listData.criteriaDefinition))
    : null;

  const criteriaTotals = {};
  const criteriaCounts = {};
  let totalOverall = 0;
  let overallCount = 0;

  visible.forEach((data) => {
    // Madre: las valoraciones de Minilista cuentan solo con sus criterios.
    // Minilista: la nota guardada, con sus criterios extra.
    const { score } = reviewScoreForList(data, listData);
    if (score !== null) {
      totalOverall += score;
      overallCount += 1;
    }

    const scores = data.scores || {};
    Object.entries(scores).forEach(([key, value]) => {
      if (ownCriteria && !ownCriteria.has(key)) return;
      if (typeof value === 'number' && Number.isFinite(value)) {
        criteriaTotals[key] = (criteriaTotals[key] || 0) + value;
        criteriaCounts[key] = (criteriaCounts[key] || 0) + 1;
      }
    });
  });

  const criteriaAverages = {};
  Object.entries(criteriaTotals).forEach(([key, total]) => {
    criteriaAverages[key] = Number((total / criteriaCounts[key]).toFixed(2));
  });

  return {
    reviewCount: visible.length,
    averageRating: overallCount > 0 ? Number((totalOverall / overallCount).toFixed(2)) : null,
    criteriaAverages,
  };
}

/**
 * Rehace todo lo que sale de las valoraciones de una Lista con UNA sola lectura
 * de la Lista: métricas (nota, nº, medias, etiquetas), resumen de puestos
 * (listRankings/{listId}, solo Listas públicas) y, si se pasa `onGrouped`,
 * Buscar (Algolia). Antes cada valoración leía la Lista entera tres veces.
 * @param {string} listId
 * @param {{ onGrouped?: (args: { listId: string, listData: object, groupedReviews: Array<object>, isPublic: boolean }) => Promise<unknown> }} [options]
 */
async function recalculateListReviewMetrics(listId, { onGrouped } = {}) {
  if (!listId) {
    logger.warn('recalculateListReviewMetrics: listId es requerido');
    return null;
  }

  const listRef = db.collection('lists').doc(listId);
  const listSnap = await listRef.get();
  if (!listSnap.exists) {
    logger.warn(`recalculateListReviewMetrics: la lista ${listId} no existe`);
    return null;
  }
  const listData = listSnap.data() || {};
  const isPublic = listVisibility(listData) === 'public';

  let groupedResult = null;
  try {
    // Mismos elementos que la página de la Lista (en una pública, solo valoraciones públicas).
    groupedResult = await buildGroupedItemsForList(listId, { publicOnly: isPublic, listData });
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

  // Las mismas valoraciones que ya se leyeron (antes se volvían a leer todas).
  const reviews = groupedResult ? groupedResult.allReviews : await fetchListReviews(listRef, listData);
  const { reviewCount, averageRating, criteriaAverages } = computeListMetrics(listData, reviews);

  const existingTags = Array.isArray(listData.availableTags) ? listData.availableTags : [];
  existingTags.forEach(tag => availableTags.add(tag));

  const updateData = {
    reviewCount,
    averageRating,
    criteriaAverages,
    criteriaAveragesUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    availableTags: Array.from(availableTags).sort(),
    // Con 0 reseñas también hay que escribir 0: `undefined` hace fallar el
    // update y las métricas se quedaban con los valores anteriores.
    itemCount
  };

  await listRef.update(updateData);
  logger.info(`recalculateListReviewMetrics: ${listId} => r:${updateData.reviewCount} avg:${averageRating} tags:${updateData.availableTags?.length}`);

  if (groupedResult) {
    await writeListRanking(listId, isPublic, groupedResult.groupedReviews);
    if (onGrouped) {
      await onGrouped({ listId, listData: groupedResult.listData, groupedReviews: groupedResult.groupedReviews, isPublic });
    }
  }

  return {
    reviewCount,
    averageRating,
    criteriaAverages,
    availableTags: updateData.availableTags
  };
}

/** Guarda (Lista pública) o borra (privada) el resumen de puestos. Un fallo no tumba lo demás. */
async function writeListRanking(listId, isPublic, groupedReviews) {
  const ref = db.collection('listRankings').doc(listId);
  try {
    if (!isPublic) {
      await ref.delete();
      return;
    }
    const { elements, total, truncated } = buildListRanking(groupedReviews);
    await ref.set({ listId, isPublic: true, elements, total, truncated, updatedAt: FieldValue.serverTimestamp() });
  } catch (error) {
    logger.error(`writeListRanking: no se pudo guardar el resumen de ${listId}`, error);
  }
}

module.exports = { recalculateListReviewMetrics, computeListMetrics };
