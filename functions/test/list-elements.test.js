// Mismo caso que frontend/src/lib/listElements.vectors.test.ts (la página de la
// Lista): lo que se indexa en Algolia debe dar la misma nota, el mismo nº de
// valoraciones, la misma zona y el mismo puesto.
const test = require('node:test');
const assert = require('node:assert/strict');
const vectors = require('../../frontend/src/lib/listElements.vectors.json');
const { aggregateGroups } = require('../modules/grouped-aggregator');
const { filterPublicReviews } = require('../modules/lib/list-visibility');
const { computeListMetrics } = require('../modules/lib/list-metrics');
const { normalizeItemName, placeGeoFields } = require('../modules/lib/list-elements');
const { rankingIndexScore } = require('../modules/lib/scoring');

const groups = aggregateGroups(
  vectors.list.id,
  vectors.list,
  filterPublicReviews(vectors.reviews),
  new Map(Object.entries(vectors.places)),
  new Set(vectors.botAuthorIds),
);

// Cómo ordena Algolia con customRanking: desc(rankingScore), desc(reviewCount), asc(listRank).
const algoliaOrder = (records) => [...records].sort((a, b) =>
  rankingIndexScore(b.average, b.itemCount) - rankingIndexScore(a.average, a.itemCount)
  || b.itemCount - a.itemCount
  || a.listRank - b.listRank);

const humanRecords = groups.filter((g) => !g.botOnly);

test('nombres de elemento comparables (igual que la web)', () => {
  for (const { input, expected } of vectors.itemNames) assert.equal(normalizeItemName(input), expected);
});

test('Buscar: elementos, media, nº, zona y puesto como la Lista', () => {
  const actual = algoliaOrder(humanRecords).map((g, index) => ({
    key: g.key,
    average: g.average,
    count: g.itemCount,
    city: g.placeCity,
    province: g.placeProvince,
    region: g.placeRegion,
    country: g.placeCountry,
    rank: index + 1,
  }));
  assert.deepEqual(actual, vectors.expected.elements);
  assert.deepEqual(humanRecords.map((g) => g.listRank), vectors.expected.elements.map((e) => e.rank));
});

test('Buscar: puesto por zona igual que la Lista', () => {
  for (const [zone, keys] of Object.entries(vectors.expected.zones)) {
    const [level, value] = zone.split(':');
    const field = { city: 'placeCity', province: 'placeProvince', region: 'placeRegion' }[level];
    const inZone = algoliaOrder(humanRecords.filter((g) => g[field] === value));
    assert.deepEqual(inZone.map((g) => g.key), keys, zone);
  }
});

test('sin bots, sin Minilista privada, sin valoraciones sin nota', () => {
  const byKey = new Map(groups.map((g) => [g.key, g]));
  assert.equal(byKey.get('p_vll2_bravas').itemCount, 1);
  assert.equal(byKey.get('p_vll2_bravas').average, 7.5);
  assert.deepEqual(byKey.get('p_vll2_bravas').authorUserType, ['bot'], 'la faceta «Bots» sigue encontrándolo');
  assert.equal(byKey.get('p_leon_bravas').itemCount, 1);
  assert.deepEqual(groups.filter((g) => g.botOnly).map((g) => g.key), vectors.expected.botOnlyKeys);
  assert.ok(groups.filter((g) => g.botOnly).every((g) => g.listRank > humanRecords.length), 'los de solo bots, al final');
});

test('dos locales de una cadena son dos registros; las variantes de nombre, uno', () => {
  const slugs = groups.map((g) => g.objectSlug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.ok(groups.some((g) => g.key === 'p_chain1_bravas') && groups.some((g) => g.key === 'p_chain2_bravas'));
  assert.equal(groups.filter((g) => g.placeId === 'p_vll1' && g.key.endsWith('bravas')).length, 1);
});

test('zona del sitio: «locality» de Google y CCAA normalizada', () => {
  assert.deepEqual(placeGeoFields(vectors.places.p_vll3), { city: 'Valladolid', province: 'Valladolid', region: 'Castilla y León', country: 'España' });
  assert.equal(placeGeoFields({ country: 'Spain' }).country, 'España');
});

test('contadores de la Lista madre pública: sin la Minilista privada y solo sus criterios', () => {
  const metrics = computeListMetrics(vectors.list, vectors.reviews);
  assert.equal(metrics.reviewCount, vectors.reviews.length - 1);
  assert.deepEqual(Object.keys(metrics.criteriaAverages).sort(), ['sabor', 'salsa']);
});

test('la Minilista privada conserva sus valoraciones en su propio contexto', () => {
  const secret = { id: 'secreta', isPublic: false, visibility: 'private', parentListId: 'bravas', criteriaDefinition: vectors.list.criteriaDefinition };
  const metrics = computeListMetrics(secret, vectors.reviews.filter((r) => r.sublistId === 'secreta'));
  assert.equal(metrics.reviewCount, 1);
  assert.equal(metrics.averageRating, 10);
});
