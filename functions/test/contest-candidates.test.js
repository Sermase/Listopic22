const test = require('node:test');
const assert = require('node:assert/strict');
const { diffCandidates, needsCloseOut } = require('../modules/lib/contest-candidates');
const { planPlaceRebuild } = require('../modules/lib/canonical-resolve');

const ts = (ms) => ({ toMillis: () => ms });
const cand = (placeId, itemName) => ({ key: `${placeId}|${itemName.toLowerCase()}`, placeId, itemName });

test('diffCandidates: entran y salen aspirantes', () => {
  const before = { candidates: [cand('p1', 'Tarta de queso'), cand('p2', 'Tarta')] };
  const after = { candidates: [cand('p1', 'Tarta de queso'), cand('p3', 'La Vasca')] };
  const { added, removed } = diffCandidates(before, after);
  assert.deepEqual(added.map((c) => c.placeId), ['p3']);
  assert.equal(added[0].itemId, 'la-vasca');
  assert.deepEqual(removed.map((c) => c.placeId), ['p2']);
  assert.deepEqual(diffCandidates(null, null), { added: [], removed: [] });
});

test('needsCloseOut: solo concursos cerrados, acabados, sin «siguen» ni ya cerrados', () => {
  const base = { parentListId: 'madre', contest: { closed: true, endsAt: ts(1000) } };
  assert.equal(needsCloseOut(base, 2000), true);
  assert.equal(needsCloseOut(base, 500), false);
  assert.equal(needsCloseOut({ ...base, contest: { ...base.contest, keepAvailable: true } }, 2000), false);
  assert.equal(needsCloseOut({ ...base, contest: { ...base.contest, closedOutAt: ts(1500) } }, 2000), false);
  assert.equal(needsCloseOut({ ...base, parentListId: null }, 2000), false);
  assert.equal(needsCloseOut({ ...base, contest: { closed: true } }, 2000), false);
});

test('planPlaceRebuild: un aspirante sin reseñas sigue activo en la carta', () => {
  const items = new Map([['tarta-de-queso', {
    id: 'tarta-de-queso', canonicalName: 'Tarta de queso', source: 'contest', status: 'active',
    contestLists: { mini: 'madre' }, linkedListIds: ['madre', 'mini'],
    stats: { reviewCount: 0, ratingCount: 0, ratingTotal: 0, averageRating: null, photoCount: 0, criteriaStats: {} },
  }]]);
  const plan = planPlaceRebuild({ reviews: [], itemsById: items });
  const write = plan.emptyItemWrites?.find((w) => w.itemId === 'tarta-de-queso');
  assert.ok(!write || (write.data.status !== 'inactive' && !write.deactivate));
});
