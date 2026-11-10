// Resumen de puestos (listRankings/{listId}): mismo orden que la Lista, sin
// bots, sin sitios cerrados ni platos retirados, y puestos sin huecos.
const test = require('node:test');
const assert = require('node:assert/strict');
const vectors = require('../../frontend/src/lib/listElements.vectors.json');
const { aggregateGroups } = require('../modules/grouped-aggregator');
const { filterPublicReviews } = require('../modules/lib/list-visibility');
const { buildListRanking, RANKING_MAX_ELEMENTS } = require('../modules/lib/list-ranking');

const groups = aggregateGroups(
  vectors.list.id,
  vectors.list,
  filterPublicReviews(vectors.reviews),
  new Map(Object.entries(vectors.places)),
  new Set(vectors.botAuthorIds),
);

test('mismos elementos, nota, nº, zona y orden que la Lista', () => {
  const { elements, total, truncated } = buildListRanking(groups);
  const actual = elements.map((e, index) => ({
    key: e.id,
    average: e.average,
    count: e.count,
    city: e.city,
    province: e.province,
    region: e.region,
    country: e.country,
    rank: index + 1,
  }));
  assert.deepEqual(actual, vectors.expected.elements);
  assert.equal(total, vectors.expected.elements.length);
  assert.equal(truncated, false);
  assert.ok(!elements.some((e) => vectors.expected.botOnlyKeys.includes(e.id)), 'sin elementos solo de bots');
});

test('sin sitios cerrados ni platos retirados, y sin huecos en el puesto', () => {
  const closed = groups.map((g, i) => (i === 0 ? { ...g, placeClosedStatus: 'CLOSED_PERMANENTLY' } : i === 1 ? { ...g, itemUnavailable: true } : g));
  const { elements } = buildListRanking(closed);
  assert.ok(!elements.some((e) => e.id === groups[0].key || e.id === groups[1].key));
  assert.equal(elements[0].id, groups.filter((g) => !g.botOnly)[2].key);
});

test('tope de elementos por documento', () => {
  const many = Array.from({ length: RANKING_MAX_ELEMENTS + 3 }, (_, i) => ({ key: `k${i}`, itemName: 'x', average: 5, itemCount: 1 }));
  const { elements, total, truncated } = buildListRanking(many);
  assert.equal(elements.length, RANKING_MAX_ELEMENTS);
  assert.equal(total, RANKING_MAX_ELEMENTS + 3);
  assert.equal(truncated, true);
});
