const test = require('node:test');
const assert = require('node:assert/strict');
const { planCriteriaChange } = require('../modules/lib/criteria-migration');

const c = (label, extra = {}) => ({ type: 'slider', label, ponderable: true, ...extra });
const list = {
  id: 'madre',
  criteriaDefinition: { sabor: c('Sabor'), textura: c('Textura'), precio: c('Precio', { ponderable: false }) },
  scoringWeights: { sabor: 1, textura: 1, precio: 0 },
};
const mini = {
  id: 'mini',
  criteriaDefinition: { ...list.criteriaDefinition, relleno: c('Relleno') },
  scoringWeights: { sabor: 1, textura: 1, precio: 0, relleno: 1 },
};
const reviews = [
  { id: 'r1', path: 'lists/madre/reviews/r1', itemName: 'Croqueta', placeId: 'p1', scores: { sabor: 9, textura: 5 }, overallRating: 7 },
  { id: 'r2', path: 'lists/madre/reviews/r2', itemName: 'Bravas', placeId: 'p2', scores: { sabor: 6, textura: 8 }, overallRating: 7 },
  // Antigua: no tiene «textura» (criterio posterior) → solo cuenta sabor.
  { id: 'r3', path: 'lists/madre/reviews/r3', itemName: 'Tortilla', placeId: 'p3', scores: { sabor: 8 }, overallRating: 8 },
  // Minilista: con su criterio propio.
  { id: 'r4', path: 'lists/madre/reviews/r4', sublistId: 'mini', itemName: 'Croqueta', placeId: 'p4', scores: { sabor: 8, textura: 6, relleno: 10 }, overallRating: 8 },
];

test('simular sin cambios reales no toca nada', () => {
  const plan = planCriteriaChange({ list, minilists: [mini], reviews, change: {} });
  assert.equal(plan.noChange, true);
  assert.equal(plan.summary.changedReviews, 0);
});

test('sabor ×3: recalcula con pesos y respeta criterios no puntuados', () => {
  const plan = planCriteriaChange({ list, minilists: [mini], reviews, change: { weights: { sabor: 3 } } });
  const byId = Object.fromEntries(plan.reviews.map((r) => [r.id, r]));
  assert.equal(byId.r1.after, 8);    // (9·3 + 5) / 4
  assert.equal(byId.r2.after, 6.5);  // (6·3 + 8) / 4
  assert.equal(byId.r3.after, 8);    // solo sabor: sigue en 8 (no se inventa textura)
  assert.equal(byId.r3.changed, false);
  assert.equal(byId.r4.after, 8);    // Minilista: (8·3 + 6 + 10) / 5 = 40/5
  assert.equal(byId.r4.changed, false);
  assert.equal(plan.list.after.scoringWeights.sabor, 3);
  assert.equal(plan.minilistUpdates.length, 1);
  assert.equal(plan.minilistUpdates[0].scoringWeights.sabor, 3);
  assert.equal(plan.summary.changedReviews, 2);
});

test('quitar un criterio: deja de contar pero la puntuación no se borra', () => {
  const plan = planCriteriaChange({ list, minilists: [mini], reviews, change: { removeCriteria: ['textura'] } });
  assert.equal('textura' in plan.list.after.criteriaDefinition, false);
  assert.equal(plan.reviews.find((r) => r.id === 'r1').after, 9);
  assert.equal(plan.reviews.find((r) => r.id === 'r4').after, 9); // sabor 8 + relleno 10
  assert.equal('textura' in plan.minilistUpdates[0].criteriaDefinition, false);
  assert.deepEqual(reviews[0].scores, { sabor: 9, textura: 5 }); // el plan no muta nada
});

test('ponderable se mantiene coherente con el peso', () => {
  const plan = planCriteriaChange({ list, reviews, change: { weights: { precio: 2, textura: 0 } } });
  assert.equal(plan.list.after.criteriaDefinition.precio.ponderable, true);
  assert.equal(plan.list.after.criteriaDefinition.textura.ponderable, false);
});

test('pesos no válidos se rechazan', () => {
  assert.throws(() => planCriteriaChange({ list, reviews, change: { weights: { sabor: 4 } } }), /Peso no válido/);
  assert.throws(() => planCriteriaChange({ list, reviews, change: { weights: { sabor: 1.5 } } }), /Peso no válido/);
});

test('la huella es estable y cambia si cambian los datos', () => {
  const a = planCriteriaChange({ list, minilists: [mini], reviews, change: { weights: { sabor: 3 } } });
  const b = planCriteriaChange({ list, minilists: [mini], reviews, change: { weights: { sabor: 3 } } });
  const changedData = reviews.map((r) => (r.id === 'r2' ? { ...r, overallRating: 6 } : r));
  const c2 = planCriteriaChange({ list, minilists: [mini], reviews: changedData, change: { weights: { sabor: 3 } } });
  assert.equal(a.fingerprint, b.fingerprint);
  assert.notEqual(a.fingerprint, c2.fingerprint);
});

test('el ranking de la madre antes/después usa sus criterios (sin el propio de la Minilista)', () => {
  const plan = planCriteriaChange({ list, minilists: [mini], reviews, change: { weights: { sabor: 3 } } });
  assert.ok(Array.isArray(plan.rankingChanges));
  plan.rankingChanges.forEach((r) => assert.notEqual(r.before, r.after));
});
