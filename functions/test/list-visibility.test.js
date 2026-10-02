const test = require('node:test');
const assert = require('node:assert/strict');
const { listVisibility, effectiveVisibility, filterPublicReviews } = require('../modules/lib/list-visibility');

test('visibilidad de lista', () => {
  assert.equal(listVisibility({ isPublic: true }), 'public');
  assert.equal(listVisibility({ visibility: 'public' }), 'public');
  assert.equal(listVisibility({ isPublic: false }), 'private');
  assert.equal(listVisibility(null), 'private');
});

test('una Minilista no es más pública que su madre', () => {
  assert.equal(effectiveVisibility({ isPublic: true, parentListId: 'm' }, { isPublic: false }), 'private');
  assert.equal(effectiveVisibility({ isPublic: true, parentListId: 'm' }, { isPublic: true }), 'public');
  assert.equal(effectiveVisibility({ isPublic: false, parentListId: 'm' }, { isPublic: true }), 'private');
  assert.equal(effectiveVisibility({ isPublic: true }, null), 'public');
});

test('índice público: solo valoraciones públicas', () => {
  const reviews = [
    { id: 'a', visibility: 'public' },
    { id: 'b', visibility: 'private', sublistId: 'miniPrivada' },
    { id: 'c' },
    null,
  ];
  assert.deepEqual(filterPublicReviews(reviews).map((r) => r.id), ['a']);
  assert.deepEqual(filterPublicReviews(undefined), []);
});
