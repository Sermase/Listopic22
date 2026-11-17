const test = require('node:test');
const assert = require('node:assert/strict');
const { isCounterOnlyChange } = require('../modules/lib/review-counter-change');

const base = { overallRating: 8, comment: 'Rica', reactionCounts: { like: 1, dislike: 0 }, commentCount: 2 };

test('solo cambian los contadores', () => {
  assert.equal(isCounterOnlyChange(base, { ...base, reactionCounts: { like: 2, dislike: 0 } }), true);
  assert.equal(isCounterOnlyChange(base, { ...base, commentCount: 3 }), true);
  assert.equal(isCounterOnlyChange({ overallRating: 8 }, { overallRating: 8, reactionCounts: { like: 1 } }), true);
});

test('cualquier otro cambio, alta, baja o nada cambiado: no', () => {
  assert.equal(isCounterOnlyChange(base, { ...base, overallRating: 9, commentCount: 3 }), false);
  assert.equal(isCounterOnlyChange(base, { ...base }), false);
  assert.equal(isCounterOnlyChange(null, base), false);
  assert.equal(isCounterOnlyChange(base, null), false);
});
