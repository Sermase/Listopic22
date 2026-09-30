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

test('ponderaciones apagadas por defecto', () => {
  assert.equal(scoring.WEIGHTS_ENABLED, false);
  assert.equal(scoring.criterionWeight({ weight: 3 }), 1);
});
