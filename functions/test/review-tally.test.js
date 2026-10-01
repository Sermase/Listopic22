const test = require('node:test');
const assert = require('node:assert/strict');
const { tallyReviewsByUser } = require('../modules/lib/review-tally');

test('cuenta por persona solo valoraciones de lists/*/reviews', () => {
  const counts = tallyReviewsByUser([
    { path: 'lists/a/reviews/1', data: { userId: 'ana' } },
    { path: 'lists/a/reviews/2', data: { userId: 'ana' } },
    { path: 'lists/b/reviews/3', data: { userId: 'bot' } },
    { path: 'reviews/legacy', data: { userId: 'ana' } },          // raíz legacy: no cuenta
    { path: 'lists/a/reviews/4', data: { authorId: 'sinUserId' } }, // igual que antes: solo userId
  ]);
  assert.equal(counts.get('ana'), 2);
  assert.equal(counts.get('bot'), 1);
  assert.equal(counts.has('sinUserId'), false);
});
