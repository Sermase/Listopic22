// functions/modules/lib/criteria-migration.js
//
// Planificador PURO de una migración de criterios/pesos de una Lista con
// valoraciones: calcula (sin escribir nada) cómo quedaría cada valoración y el
// ranking antes y después. Lo usan `simulateCriteriaChange` (solo lectura) y
// `applyCriteriaChange` (que exige la misma huella que la simulación).
//
// Reglas (Mejoras/modelo-listopic.md):
// - Cada valoración se recalcula con los criterios de la lista donde se hizo
//   (Lista madre o su Minilista).
// - Un criterio que la valoración no puntuó no cuenta (nunca 0 ni 5).
// - Quitar un criterio: deja de contar; su puntuación NO se borra de la valoración.
// - Nada se pierde: se guarda la nota anterior en `overallRatingBefore`.

const crypto = require('crypto');
const { computeReviewScore, deriveScoringWeights, compareByRank, MAX_CRITERION_WEIGHT } = require('./scoring');
const { syncMinilistCriteria, sameValue } = require('./minilist-criteria');

const asMap = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

/**
 * Valida y normaliza el cambio pedido.
 * @param {{ weights?: Record<string, number>, removeCriteria?: string[] }} change
 */
function normalizeChange(change, criteriaDefinition) {
  const definition = asMap(criteriaDefinition);
  const removeCriteria = [...new Set(Array.isArray(change?.removeCriteria) ? change.removeCriteria : [])]
    .filter((id) => typeof id === 'string' && id in definition)
    .sort();
  const weights = {};
  Object.entries(asMap(change?.weights)).forEach(([id, value]) => {
    if (!(id in definition) || removeCriteria.includes(id)) return;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > MAX_CRITERION_WEIGHT) {
      throw new Error(`Peso no válido para "${id}": ${value} (debe ser 0, 1, 2 o 3).`);
    }
    weights[id] = n;
  });
  return { weights, removeCriteria };
}

function applyChangeToList(list, change) {
  const criteria = { ...asMap(list.criteriaDefinition) };
  change.removeCriteria.forEach((id) => { delete criteria[id]; });
  const currentWeights = deriveScoringWeights(asMap(list.criteriaDefinition), list.scoringWeights || null);
  const weights = {};
  Object.keys(criteria).forEach((id) => {
    weights[id] = id in change.weights ? change.weights[id] : currentWeights[id];
  });
  // `ponderable` se mantiene coherente con el peso (para pantallas antiguas).
  Object.keys(criteria).forEach((id) => {
    criteria[id] = { ...criteria[id], ponderable: weights[id] > 0 };
  });
  return { criteriaDefinition: criteria, scoringWeights: weights };
}

const scoreWith = (review, list) => computeReviewScore(review.scores, list.criteriaDefinition, {
  weights: list.scoringWeights,
  useWeights: true,
}).score;

function elementKeyOf(review) {
  const item = String(review.itemName || '').trim().toLowerCase();
  return review.placeId ? `${review.placeId}_${item}` : item;
}

function rankElements(reviews, noteOf) {
  const groups = new Map();
  reviews.forEach((review) => {
    const note = noteOf(review);
    if (typeof note !== 'number') return;
    const key = elementKeyOf(review);
    const g = groups.get(key) || { id: key, name: review.itemName || review.placeName || key, total: 0, count: 0 };
    g.total += note;
    g.count += 1;
    groups.set(key, g);
  });
  return [...groups.values()]
    .map((g) => ({ id: g.id, name: g.name, average: g.total / g.count, count: g.count }))
    .sort(compareByRank);
}

/**
 * @param {object} args
 * @param {object} args.list        Lista madre { id, criteriaDefinition, scoringWeights }
 * @param {object[]} args.minilists Minilistas de la madre [{ id, criteriaDefinition, scoringWeights }]
 * @param {object[]} args.reviews   Valoraciones [{ id, path, sublistId?, scores, overallRating, itemName, placeId }]
 * @param {object} args.change      { weights?: {id: 0..3}, removeCriteria?: [id] }
 */
function planCriteriaChange({ list, minilists = [], reviews = [], change }) {
  const normalized = normalizeChange(change, list.criteriaDefinition);
  const parentBefore = {
    criteriaDefinition: asMap(list.criteriaDefinition),
    scoringWeights: deriveScoringWeights(asMap(list.criteriaDefinition), list.scoringWeights || null),
  };
  const parentAfter = applyChangeToList(list, normalized);

  const minisBefore = new Map();
  const minisAfter = new Map();
  const minilistUpdates = [];
  minilists.forEach((mini) => {
    minisBefore.set(mini.id, {
      criteriaDefinition: asMap(mini.criteriaDefinition),
      scoringWeights: deriveScoringWeights(asMap(mini.criteriaDefinition), mini.scoringWeights || null),
    });
    const synced = syncMinilistCriteria({
      parentBefore: parentBefore.criteriaDefinition,
      parentAfter: parentAfter.criteriaDefinition,
      parentWeights: parentAfter.scoringWeights,
      child: mini.criteriaDefinition,
      childWeights: mini.scoringWeights,
    });
    minisAfter.set(mini.id, { criteriaDefinition: synced.criteriaDefinition, scoringWeights: synced.scoringWeights });
    if (synced.changed) minilistUpdates.push({ id: mini.id, criteriaDefinition: synced.criteriaDefinition, scoringWeights: synced.scoringWeights });
  });

  const listFor = (review, phase) => {
    const minis = phase === 'before' ? minisBefore : minisAfter;
    if (review.sublistId && minis.has(review.sublistId)) return minis.get(review.sublistId);
    return phase === 'before' ? parentBefore : parentAfter;
  };

  const reviewChanges = reviews.map((review) => {
    const stored = typeof review.overallRating === 'number' ? review.overallRating : null;
    const after = scoreWith(review, listFor(review, 'after'));
    return {
      id: review.id,
      path: review.path,
      itemName: review.itemName || '',
      sublistId: review.sublistId || null,
      before: stored,
      after: after ?? stored,
      changed: after !== null && after !== stored,
    };
  });

  // Ranking de la Lista madre (vista de madre: cada valoración con los criterios de la madre).
  const noteBefore = (review) => (review.sublistId ? scoreWith(review, parentBefore) ?? review.overallRating : review.overallRating);
  const noteAfter = (review) => (review.sublistId ? scoreWith(review, parentAfter) ?? review.overallRating : reviewChanges.find((r) => r.id === review.id).after);
  const rankingBefore = rankElements(reviews, noteBefore);
  const rankingAfter = rankElements(reviews, noteAfter);
  const positionBefore = new Map(rankingBefore.map((e, i) => [e.id, i + 1]));
  const rankingChanges = rankingAfter.map((e, i) => ({
    id: e.id,
    name: e.name,
    before: positionBefore.get(e.id) ?? null,
    after: i + 1,
    averageAfter: Number(e.average.toFixed(2)),
  })).filter((r) => r.before !== r.after);

  const changedReviews = reviewChanges.filter((r) => r.changed);
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({
    list: list.id,
    change: normalized,
    parentBefore,
    minis: [...minisBefore.entries()].sort(),
    reviews: reviews.map((r) => [r.id, r.overallRating, r.scores || null, r.sublistId || null]).sort(),
  })).digest('hex').slice(0, 32);

  return {
    fingerprint,
    change: normalized,
    noChange: sameValue(parentBefore, parentAfter) && changedReviews.length === 0,
    list: { before: parentBefore, after: parentAfter },
    minilistUpdates,
    reviews: reviewChanges,
    summary: {
      totalReviews: reviews.length,
      changedReviews: changedReviews.length,
      maxDelta: changedReviews.reduce((m, r) => Math.max(m, Math.abs((r.after ?? 0) - (r.before ?? 0))), 0),
      rankingMoves: rankingChanges.length,
      minilistsAffected: minilistUpdates.length,
    },
    rankingChanges,
  };
}

module.exports = { planCriteriaChange, normalizeChange };
