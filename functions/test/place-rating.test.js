const test = require('node:test');
const assert = require('node:assert/strict');
const { computePlaceRating } = require('../modules/lib/place-rating');

const r = (userId, overallRating, visibility = 'public', extra = {}) => ({ userId, overallRating, visibility, ...extra });
const roles = { bots: new Set(['bot']), critics: new Set(['cri1', 'cri2']) };

test('solo valoraciones públicas y sin bots', () => {
  const rating = computePlaceRating([
    r('ana', 8), r('luis', 6),
    r('ana', 10, 'private'),                        // Lista privada
    r('eva', 2, 'private', { sublistId: 'secreta' }), // Minilista privada
    r('bot', 10), r('bot', 9),
    { userId: 'sin', overallRating: 7 },             // sin visibilidad: no es pública
  ], roles);
  assert.deepEqual(rating, { reviewsCount: 2, averageRating: 7, criticReviewsCount: 0, criticRating: null });
});

test('nota de críticos aparte; la general los incluye como a cualquiera', () => {
  const rating = computePlaceRating([r('ana', 6), r('cri1', 9), r('cri2', 8.5), r('cri1', 4, 'private')], roles);
  assert.equal(rating.reviewsCount, 3);
  assert.equal(rating.averageRating, 7.83);
  assert.equal(rating.criticReviewsCount, 2);
  assert.equal(rating.criticRating, 8.75);
});

test('sin nota no entra en la media pero sí en el nº; sin nada, null', () => {
  assert.deepEqual(computePlaceRating([r('ana', null), r('luis', 8)], roles), { reviewsCount: 2, averageRating: 8, criticReviewsCount: 0, criticRating: null });
  assert.deepEqual(computePlaceRating([], roles), { reviewsCount: 0, averageRating: null, criticReviewsCount: 0, criticRating: null });
});

test('un bot que además fuera crítico no cuenta en ninguna', () => {
  const rating = computePlaceRating([r('x', 9)], { bots: new Set(['x']), critics: new Set(['x']) });
  assert.equal(rating.criticReviewsCount, 0);
  assert.equal(rating.reviewsCount, 0);
});
