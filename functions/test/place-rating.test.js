const test = require('node:test');
const assert = require('node:assert/strict');
const { computePlaceRating } = require('../modules/lib/place-rating');

const r = (userId, overallRating, visibility = 'public', extra = {}) => ({ userId, overallRating, visibility, ...extra });
const roles = {
  bots: new Set(['bot']),
  critics: new Set(['cri1', 'cri2']),
  types: new Map([['bot', ['basico', 'bot']], ['cri1', ['basico', 'critico']], ['cri2', ['critico']], ['ana', ['basico']], ['luis', ['basico', 'experto']]]),
};

test('nota pública: solo públicas de personas; los bots cuentan como actividad visible, aparte', () => {
  const rating = computePlaceRating([
    r('ana', 8), r('luis', 6),
    r('ana', 10, 'private'),                        // Lista privada
    r('eva', 2, 'private', { sublistId: 'secreta' }), // Minilista privada
    r('bot', 10), r('bot', 9),
    { userId: 'sin', overallRating: 7 },             // sin visibilidad: no es pública
  ], roles);
  assert.deepEqual(rating, {
    publicHumanReviewsCount: 2,
    averageRating: 7,
    totalVisibleReviewsCount: 4,
    reviewsCount: 4,
    publicBotReviewsCount: 2,
    botAverageRating: 9.5,
    criticReviewsCount: 0,
    criticRating: null,
    publicReviewerTypes: ['basico', 'bot', 'experto'],
  });
});

test('solo bots: sin nota pública, pero con actividad visible (sigue en Buscar)', () => {
  const rating = computePlaceRating([r('bot', 8), r('bot', 6), r('ana', 9, 'private')], roles);
  assert.equal(rating.publicHumanReviewsCount, 0);
  assert.equal(rating.averageRating, null);
  assert.equal(rating.totalVisibleReviewsCount, 2);
  assert.equal(rating.reviewsCount, 2, 'reviewsCount = visibles: las apps instaladas filtran Buscar con él');
  assert.equal(rating.botAverageRating, 7);
  assert.deepEqual(rating.publicReviewerTypes, ['basico', 'bot']);
});

test('solo privadas: ni nota ni actividad visible', () => {
  const rating = computePlaceRating([r('ana', 9, 'private')], roles);
  assert.equal(rating.totalVisibleReviewsCount, 0);
  assert.equal(rating.publicHumanReviewsCount, 0);
  assert.deepEqual(rating.publicReviewerTypes, []);
});

test('nota de críticos aparte; la general los incluye como a cualquiera', () => {
  const rating = computePlaceRating([r('ana', 6), r('cri1', 9), r('cri2', 8.5), r('cri1', 4, 'private')], roles);
  assert.equal(rating.publicHumanReviewsCount, 3);
  assert.equal(rating.averageRating, 7.83);
  assert.equal(rating.criticReviewsCount, 2);
  assert.equal(rating.criticRating, 8.75);
  assert.deepEqual(rating.publicReviewerTypes, ['basico', 'critico']);
});

test('sin nota no entra en la media pero sí en el nº; sin nada, null', () => {
  const rating = computePlaceRating([r('ana', null), r('luis', 8)], roles);
  assert.equal(rating.publicHumanReviewsCount, 2);
  assert.equal(rating.averageRating, 8);
  const empty = computePlaceRating([], roles);
  assert.equal(empty.averageRating, null);
  assert.equal(empty.botAverageRating, null);
  assert.equal(empty.totalVisibleReviewsCount, 0);
});

test('un bot que además fuera crítico no cuenta como persona ni como crítico', () => {
  const rating = computePlaceRating([r('x', 9)], { bots: new Set(['x']), critics: new Set(['x']) });
  assert.equal(rating.criticReviewsCount, 0);
  assert.equal(rating.publicHumanReviewsCount, 0);
  assert.equal(rating.publicBotReviewsCount, 1);
});

test('autor sin perfil: cuenta como persona («basico»)', () => {
  const rating = computePlaceRating([r('desconocido', 7)], roles);
  assert.equal(rating.publicHumanReviewsCount, 1);
  assert.deepEqual(rating.publicReviewerTypes, ['basico']);
});
