const test = require('node:test');
const assert = require('node:assert/strict');

require('firebase-admin').initializeApp({ projectId: 'demo-test' });
const { resolveGamificationState } = require('../modules/gamification');

const defs = [
  { id: 'PIONERO', type: 'review_count', threshold: 1, xpReward: 10 },
  { id: 'CRITICO_DE_BARRIO', type: 'review_count', threshold: 10, xpReward: 25 },
  { id: 'CALENTANDO', type: 'level_reached', threshold: 3, xpReward: 10 },
  { id: 'BIEN_COMIDO', type: 'custom', threshold: 0, xpReward: 25 },
];
const metrics = (reviewsCount) => ({ reviewsCount, photosCount: 0, listsCount: 0, followersCount: 0, followingCount: 0, reviewedPlacesCount: 0 });

test('quita las de contador que ya no se cumplen y deja las secretas', () => {
  const state = resolveGamificationState(['PIONERO', 'CRITICO_DE_BARRIO', 'BIEN_COMIDO'], defs, metrics(3));
  assert.deepEqual(state.lostBadges, ['CRITICO_DE_BARRIO']);
  assert.ok(state.finalBadgeIds.includes('BIEN_COMIDO'));
  assert.ok(state.finalBadgeIds.includes('PIONERO'));
});

test('quita las copias antiguas aunque no estén activas', () => {
  const state = resolveGamificationState(['CRITIC_BRONZE', 'PHOTOGRAPHER', 'PIONERO'], defs, metrics(1));
  assert.deepEqual(state.lostBadges, ['CRITIC_BRONZE', 'PHOTOGRAPHER']);
});

test('sigue dando las nuevas, también las de nivel', () => {
  const state = resolveGamificationState([], defs, metrics(20));
  assert.deepEqual(state.lostBadges, []);
  assert.ok(['PIONERO', 'CRITICO_DE_BARRIO', 'CALENTANDO'].every((id) => state.newBadges.includes(id)));
});
