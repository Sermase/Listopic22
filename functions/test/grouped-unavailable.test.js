const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregateGroups } = require('../modules/grouped-aggregator');

const list = { id: 'l1', criteria: [] };
const review = (id, itemName, overallRating) => ({
  id, userId: `u_${id}`, listId: 'l1', placeId: 'p1', itemName, overallRating, visibility: 'public',
});

test('plato que el sitio ya no sirve: marcado y al final, sin quitar puesto a nadie', () => {
  const places = new Map([['p1', { name: 'Bar', unavailableItems: ['TOMATE aliñado'] }]]);
  const groups = aggregateGroups('l1', list, [
    review('a', 'Tomate aliñado', 9.5),
    review('b', 'Bravas', 7),
    review('c', 'Croquetas', 8),
  ], places, new Set());
  assert.deepEqual(groups.map((g) => [g.itemName, g.listRank, g.itemUnavailable]), [
    ['Croquetas', 1, false],
    ['Bravas', 2, false],
    ['Tomate aliñado', 3, true],
  ]);
});
