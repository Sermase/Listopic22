// Mismos vectores que el frontend: si uno cambia el cálculo, el otro falla.
const test = require('node:test');
const assert = require('node:assert/strict');
const vectors = require('../../frontend/src/lib/scoring.vectors.json');
const scoring = require('../modules/lib/scoring');

test('nota de valoración', async (t) => {
  for (const v of vectors.review) {
    await t.test(v.name, () => {
      assert.deepEqual(scoring.computeReviewScore(v.scores, v.criteria, v.options), v.expected);
    });
  }
});

test('Lista madre', async (t) => {
  for (const v of vectors.parent) {
    await t.test(v.name, () => {
      assert.deepEqual(scoring.reviewScoreForParentList(v.review, v.parentCriteria), v.expected);
    });
  }
});

test('según la lista', async (t) => {
  for (const v of vectors.list) {
    await t.test(v.name, () => {
      assert.deepEqual(scoring.reviewScoreForList(v.review, v.list), v.expected);
    });
  }
});

test('ranking único', async (t) => {
  for (const v of vectors.ranking) {
    await t.test(`media ${v.average} con ${v.count} (C=${v.prior})`, () => {
      assert.ok(Math.abs(scoring.rankPosition(v.average, v.count, v.prior) - v.position) < 1e-9);
      if (v.prior === 7) assert.equal(scoring.rankingIndexScore(v.average, v.count), v.indexScore);
    });
  }
});

test('pesos derivados', async (t) => {
  for (const v of vectors.deriveWeights) {
    await t.test(v.name, () => {
      assert.deepEqual(scoring.deriveScoringWeights(v.criteria, v.existing), v.expected);
    });
  }
});

test('pesos ×0–×3 activos', () => {
  assert.equal(scoring.WEIGHTS_ENABLED, true);
  assert.equal(scoring.criterionWeight({ weight: 3 }), 3);
  assert.equal(scoring.criterionWeight({ weight: 3 }, { useWeights: false }), 1);
});

test('regla histórica de criterios nuevos', async (t) => {
  const HAND = [7, 8, 7, 8, 7];
  for (const [i, v] of vectors.historic.entries()) {
    await t.test(v.name, () => {
      const score = v.kind === 'review'
        ? scoring.computeReviewScore(v.scores, v.list.criteriaDefinition, { weights: v.list.scoringWeights }).score
        : scoring.reviewScoreForList(v.review, v.list).score;
      assert.equal(score, HAND[i]);
      assert.equal(score, v.expected);
    });
  }
});
