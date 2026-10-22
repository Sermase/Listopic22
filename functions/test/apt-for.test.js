const { test } = require('node:test');
const assert = require('node:assert/strict');
const { aptDeltas, aptItemKey, cleanAnswers } = require('../modules/lib/apt-for');

test('cleanAnswers: solo claves y valores conocidos', () => {
  assert.deepEqual(cleanAnswers({ glutenFree: 'yes', stepFree: 'maybe', isAdmin: 'yes' }), { glutenFree: 'yes' });
});

test('aptDeltas: alta, cambio y baja', () => {
  const a = { placeId: 'p1', itemKey: 'bravas', answers: { glutenFree: 'yes', stepFree: 'no' } };
  assert.deepEqual(aptDeltas(null, a), { p1: { place: { stepFree: { no: 1 } }, items: { bravas: { glutenFree: { yes: 1 } } } } });
  const b = { ...a, answers: { glutenFree: 'no', stepFree: 'no' } };
  assert.deepEqual(aptDeltas(a, b), { p1: { place: {}, items: { bravas: { glutenFree: { yes: -1, no: 1 } } } } });
  assert.deepEqual(aptDeltas(a, a), {});
  assert.deepEqual(aptDeltas(a, null), { p1: { place: { stepFree: { no: -1 } }, items: { bravas: { glutenFree: { yes: -1 } } } } });
});

test('aptDeltas: lo del plato sin elemento no cuenta', () => {
  assert.deepEqual(aptDeltas(null, { placeId: 'p1', itemKey: '', answers: { vegan: 'yes' } }), {});
});

test('Buscar → Platos: sello sin gluten del plato en el grupo', () => {
  const { aggregateGroups } = require('../modules/grouped-aggregator');
  const list = { id: 'l1', isPublic: true, criteriaDefinition: { sabor: { label: 'Sabor', order: 0 } }, scoringWeights: { sabor: 1 } };
  const review = { id: 'r1', placeId: 'p1', itemName: 'Tarta', overallRating: 8, userId: 'u1', visibility: 'public' };
  const itemKey = aptItemKey(review);
  const groupsFor = (counts) => aggregateGroups('l1', list, [review],
    new Map([['p1', { name: 'Sitio', aptFor: { items: { [itemKey]: { glutenFree: counts } } } }]]));
  assert.equal(groupsFor({ yes: 2 })[0].glutenFreeSeal, true);
  assert.equal(groupsFor({ yes: 2, no: 1 })[0].glutenFreeSeal, undefined);
});
