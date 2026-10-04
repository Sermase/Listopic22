const test = require('node:test');
const assert = require('node:assert/strict');
const { slimReview, matchesReviewQuery, scoringContext, buildReviewPatch, serialize, REVIEW_PATH } = require('../modules/lib/review-admin');

const list = {
  criteriaDefinition: { sabor: { label: 'Sabor', order: 0 }, salsa: { label: 'Salsa', order: 1 } },
  scoringWeights: { sabor: 2, salsa: 1 },
};
const minilista = {
  parentListId: 'bravas',
  criteriaDefinition: { sabor: { label: 'Sabor', order: 0 }, salsa: { label: 'Salsa', order: 1 }, picante: { label: 'Picante', order: 2 } },
  scoringWeights: { sabor: 2, salsa: 1, picante: 1 },
};
const review = { userId: 'ana', authorName: 'ana', itemName: 'Bravas', comment: 'Ricas', tags: ['Picante'], scores: { sabor: 8, salsa: 6 }, overallRating: 7.3, visibility: 'public' };

test('rutas válidas: lists/{id}/reviews/{id} y la raíz antigua', () => {
  assert.ok(REVIEW_PATH.test('lists/a/reviews/b'));
  assert.ok(REVIEW_PATH.test('reviews/b'));
  assert.ok(!REVIEW_PATH.test('users/a'));
  assert.ok(!REVIEW_PATH.test('lists/a/reviews/b/comments/c'));
});

test('resumen y búsqueda sin tildes por nombre, sitio, autor, comentario o etiqueta', () => {
  const slim = slimReview('lists/bravas/reviews/r1', { ...review, placeName: 'Bar Uno', comment: 'Salsa casera' });
  assert.equal(slim.listId, 'bravas');
  assert.equal(slim.id, 'r1');
  assert.ok(matchesReviewQuery(slim, { text: 'bar uno' }));
  assert.ok(matchesReviewQuery(slim, { text: 'CASERA' }));
  assert.ok(matchesReviewQuery(slim, { text: 'picante' }));
  assert.ok(!matchesReviewQuery(slim, { text: 'croquetas' }));
  assert.ok(!matchesReviewQuery(slim, { visibility: 'private' }));
});

test('editar puntuaciones recalcula la nota global con los pesos (no se escribe a mano)', () => {
  const ctx = scoringContext(list, null);
  const { patch, changed, errors } = buildReviewPatch(review, { scores: { sabor: 10, salsa: 7 } }, ctx);
  assert.deepEqual(errors, []);
  assert.deepEqual(changed, ['scores', 'overallRating']);
  assert.equal(patch.overallRating, 9); // (10·2 + 7·1) / 3
  const manual = buildReviewPatch(review, { overallRating: 9.5 }, ctx);
  assert.match(manual.errors.join(' '), /se calcula con los criterios/);
});

test('Minilista: criterios de la Minilista (superconjunto) y sus pesos', () => {
  const ctx = scoringContext(list, minilista);
  const ok = buildReviewPatch(review, { scores: { sabor: 8, salsa: 6, picante: 10 } }, ctx);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.patch.overallRating, 8); // (16 + 6 + 10) / 4
  const incomplete = buildReviewPatch(review, { scores: { sabor: 9, salsa: 6 } }, ctx);
  assert.match(incomplete.errors.join(' '), /Faltan criterios por puntuar: picante/);
});

test('rechaza criterios ajenos y notas fuera de 0-10', () => {
  const ctx = scoringContext(list, null);
  const { errors } = buildReviewPatch(review, { scores: { sabor: 11, salsa: 6, precio: 5 } }, ctx);
  assert.match(errors.join(' '), /«precio» no es de esta Lista/);
  assert.match(errors.join(' '), /«sabor» debe estar entre 0 y 10/);
});

test('Lista sin criterios que calculen: la nota global sí se puede escribir', () => {
  const { patch, errors } = buildReviewPatch({ overallRating: 6 }, { overallRating: 7.25 }, { criteria: [], weights: null });
  assert.deepEqual(errors, []);
  assert.equal(patch.overallRating, 7.3);
});

test('cambio de autor: userId, authorId, nombre, foto y tipo del nuevo', () => {
  const { patch, changed } = buildReviewPatch(review, { author: { uid: 'luis', name: 'Luis', photoUrl: 'https://x/l.jpg', userType: ['basico', 'critico'] } }, scoringContext(list, null));
  assert.deepEqual(changed, ['author']);
  assert.deepEqual(patch, { userId: 'luis', authorId: 'luis', authorName: 'Luis', authorPhoto: 'https://x/l.jpg', authorUserType: ['basico', 'critico'] });
  const same = buildReviewPatch(review, { author: { uid: 'ana' } }, scoringContext(list, null));
  assert.deepEqual(same.changed, [], 'mismo autor: nada que cambiar');
});

test('texto, nombre y etiquetas: solo lo que cambia; etiquetas sin repetir', () => {
  const { patch, changed, errors } = buildReviewPatch(review, { itemName: '  Bravas  ', comment: 'Muy ricas', tags: ['Picante', ' Casero ', 'Casero'] }, scoringContext(list, null));
  assert.deepEqual(errors, []);
  assert.deepEqual(changed, ['comment', 'tags']);
  assert.deepEqual(patch, { comment: 'Muy ricas', tags: ['Picante', 'Casero'], userTags: ['Picante', 'Casero'] });
  assert.match(buildReviewPatch(review, { itemName: '' }, {}).errors.join(' '), /nombre del elemento/);
});

test('serializa Timestamps, GeoPoints y anidados para el navegador', () => {
  const ts = { toMillis: () => 1234 };
  assert.deepEqual(serialize({ a: ts, b: { c: [ts] }, g: { latitude: 1, longitude: 2 }, n: null }), { a: 1234, b: { c: [1234] }, g: { latitude: 1, longitude: 2 }, n: null });
});
