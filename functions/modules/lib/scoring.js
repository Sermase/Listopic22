// functions/modules/lib/scoring.js
//
// Cálculo de notas en el servidor. Espejo de frontend/src/lib/scoring.ts:
// ambos pasan los mismos vectores (frontend/src/lib/scoring.vectors.json).
// Ver Mejoras/modelo-listopic.md para las reglas.

const SCORE_MIN = 0;
const SCORE_MAX = 10;
const MAX_CRITERION_WEIGHT = 3;
const WEIGHTS_ENABLED = false;

// Ranking único: posición = (n·media + 3·7) / (n + 3). Ver scoring.ts.
const RANK_PRIOR_WEIGHT = 3;
const RANK_PRIOR = 7;

const roundToTenth = (value) => Number(value.toFixed(1));

const isScoreValue = (value) => typeof value === 'number' && Number.isFinite(value);

function normalizeCriteria(criteria) {
  if (!criteria) return [];
  if (Array.isArray(criteria)) {
    return criteria
      .filter((c) => c && typeof c.id === 'string' && c.id.length > 0)
      .map((c) => ({ ...c }));
  }
  return Object.entries(criteria)
    .filter(([, def]) => def && typeof def === 'object')
    .map(([id, def]) => ({ ...def, id }));
}

const clampWeight = (value) => Math.min(MAX_CRITERION_WEIGHT, Math.max(0, Math.round(value)));

// `scoringWeights` de la lista (options.weights) manda sobre `ponderable`.
function criterionWeight(criterion, options = {}) {
  const useWeights = options.useWeights ?? WEIGHTS_ENABLED;
  const listWeight = criterion.id && options.weights ? options.weights[criterion.id] : undefined;
  if (isScoreValue(listWeight)) {
    const weight = clampWeight(listWeight);
    return useWeights ? weight : (weight > 0 ? 1 : 0);
  }
  if (criterion.ponderable === false || criterion.isPonderable === false) return 0;
  if (useWeights && isScoreValue(criterion.weight)) return clampWeight(criterion.weight);
  return 1;
}

// ×1 lo que cuenta, ×0 lo que no (conserva pesos ya guardados).
function deriveScoringWeights(criteria, existing) {
  const weights = {};
  normalizeCriteria(criteria).forEach((criterion) => {
    const previous = existing ? existing[criterion.id] : undefined;
    weights[criterion.id] = isScoreValue(previous)
      ? clampWeight(previous)
      : (criterion.ponderable === false || criterion.isPonderable === false ? 0 : 1);
  });
  return weights;
}

function computingCriteria(criteria, options = {}) {
  return normalizeCriteria(criteria).filter((c) => criterionWeight(c, options) > 0);
}

function computeReviewScore(scores, criteria, options = {}) {
  const required = computingCriteria(criteria, options);
  let weightedTotal = 0;
  let weightSum = 0;
  let scoredCount = 0;
  const missing = [];

  required.forEach((criterion) => {
    const value = scores ? scores[criterion.id] : undefined;
    if (!isScoreValue(value)) {
      missing.push(criterion.id);
      return;
    }
    const weight = criterionWeight(criterion, options);
    weightedTotal += value * weight;
    weightSum += weight;
    scoredCount += 1;
  });

  return {
    score: weightSum > 0 ? roundToTenth(weightedTotal / weightSum) : null,
    complete: required.length > 0 && missing.length === 0,
    scoredCount,
    requiredCount: required.length,
    missing
  };
}

function mergeMinilistCriteria(parentCriteria, ownCriteria) {
  const merged = new Map();
  normalizeCriteria(parentCriteria).forEach((c) => merged.set(c.id, c));
  normalizeCriteria(ownCriteria).forEach((c) => {
    if (!merged.has(c.id)) merged.set(c.id, c);
  });
  return Array.from(merged.values());
}

const storedOverall = (review) => (isScoreValue(review && review.overallRating) ? review.overallRating : null);

// Valoración vista desde la Lista madre: las hechas desde una Minilista se
// recalculan solo con los criterios de la madre (los extra no cuentan).
function reviewScoreForParentList(review, parentCriteria, options = {}) {
  const stored = storedOverall(review);
  const fromMinilist = typeof review?.sublistId === 'string' && review.sublistId.length > 0;
  if (fromMinilist) {
    const result = computeReviewScore(review.scores, parentCriteria, options);
    if (result.score !== null) {
      return { score: result.score, source: 'criteria', partial: !result.complete };
    }
  }
  return { score: stored, source: stored === null ? 'none' : 'stored', partial: false };
}

function reviewScoreForMinilist(review) {
  const stored = storedOverall(review);
  return { score: stored, source: stored === null ? 'none' : 'stored', partial: false };
}

function reviewScoreForList(review, list, options = {}) {
  const isMinilist = typeof list?.parentListId === 'string' && list.parentListId.length > 0;
  return isMinilist
    ? reviewScoreForMinilist(review)
    : reviewScoreForParentList(review, list ? list.criteriaDefinition : null, { weights: list ? list.scoringWeights : null, ...options });
}

function averageScore(values) {
  const valid = values.filter(isScoreValue);
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

// --- Ranking único (espejo de rankPosition en la web) ---
const safeNumber = (value) => (isScoreValue(value) ? value : 0);

function rankPosition(average, count, prior = RANK_PRIOR, priorWeight = RANK_PRIOR_WEIGHT) {
  const n = Math.max(0, safeNumber(count));
  if (n <= 0) return 0;
  const rating = Math.max(SCORE_MIN, Math.min(SCORE_MAX, safeNumber(average)));
  return ((rating * n) + (prior * priorWeight)) / (n + priorWeight);
}

function compareByRank(a, b) {
  const diff = rankPosition(b.average, b.count) - rankPosition(a.average, a.count);
  if (diff !== 0) return diff;
  return safeNumber(b.count) - safeNumber(a.count);
}

const rankingIndexScore = (average, count) => Number(rankPosition(average, count).toFixed(4));

module.exports = {
  SCORE_MIN,
  SCORE_MAX,
  MAX_CRITERION_WEIGHT,
  WEIGHTS_ENABLED,
  roundToTenth,
  isScoreValue,
  normalizeCriteria,
  criterionWeight,
  computingCriteria,
  computeReviewScore,
  mergeMinilistCriteria,
  reviewScoreForParentList,
  reviewScoreForMinilist,
  reviewScoreForList,
  averageScore,
  deriveScoringWeights,
  RANK_PRIOR_WEIGHT,
  RANK_PRIOR,
  rankPosition,
  compareByRank,
  rankingIndexScore
};
