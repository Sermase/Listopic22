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

const { badgeWritePlan } = require('../modules/gamification');
const { tallyUserStats, counterUpdates, changedCounters } = require('../modules/lib/user-stats');

test('quita las medallas cuya ficha ya no existe y las apagadas no suman XP', () => {
  const known = new Set([...defs.map((d) => d.id), 'APAGADA']);
  const state = resolveGamificationState(['PIONERO', 'BORRADA', 'APAGADA'], defs, metrics(1), known);
  assert.deepEqual(state.lostBadges, ['BORRADA']);
  assert.ok(state.finalBadgeIds.includes('APAGADA'));
  const withoutOff = resolveGamificationState(['PIONERO'], defs, metrics(1), known);
  assert.equal(state.totalXP, withoutOff.totalXP);
});

test('sin fichas cargadas no quita nada por no existir', () => {
  const state = resolveGamificationState(['PIONERO', 'RARA'], defs, metrics(1), new Set());
  assert.deepEqual(state.lostBadges, []);
});

test('quita las entradas antiguas tal cual están guardadas', () => {
  const old = { id: 'CRITICO_DE_BARRIO', earnedAt: 'x' };
  const plan = badgeWritePlan(['PIONERO', old, ' BIEN_COMIDO', 'PIONERO', ''], ['CRITICO_DE_BARRIO'], ['CALENTANDO']);
  assert.deepEqual(plan.remove, ['PIONERO', old, ' BIEN_COMIDO', '']);
  assert.deepEqual(plan.add.sort(), ['BIEN_COMIDO', 'CALENTANDO', 'PIONERO']);
});

test('lista limpia: solo se quita lo perdido', () => {
  const plan = badgeWritePlan(['PIONERO', 'CRITICO_DE_BARRIO'], ['CRITICO_DE_BARRIO'], []);
  assert.deepEqual(plan, { remove: ['CRITICO_DE_BARRIO'], add: [] });
});

test('recuento desde cero de valoraciones, fotos, sitios y listas', () => {
  const stats = tallyUserStats([
    { path: 'lists/a/reviews/1', data: { userId: 'ana', placeId: 'p1', photos: ['x', 'y'] } },
    { path: 'lists/a/reviews/2', data: { userId: 'ana', placeId: 'p1', photoUrl: 'z' } },
    { path: 'lists/b/reviews/3', data: { authorId: 'ana', placeId: 'p2' } },
    { path: 'reviews/legacy', data: { userId: 'ana', placeId: 'p9' } },
  ], [{ data: { userId: 'ana', isPublic: true } }, { data: { userId: 'ana', isPublic: false } }, { data: { userId: 'leo', isPublic: true } }]);
  assert.deepEqual(stats.get('ana'), { reviewsCount: 3, photosCount: 3, reviewedPlacesCount: 1, publicListsCount: 1, privateListsCount: 1 });
  assert.equal(stats.get('leo').reviewsCount, 0);
});

test('quien ya no tiene nada vuelve a cero y se borran los contadores sueltos', () => {
  const updates = counterUpdates(undefined, 2, 0);
  assert.equal(updates.reviewsCount, 0);
  assert.equal(updates.followersCount, 2);
  const changes = changedCounters({ reviewsCount: 180, followersCount: 2, listCount: 30 }, updates);
  assert.ok(changes.some((c) => c.key === 'reviewsCount' && c.before === 180 && c.after === 0));
  assert.ok(changes.some((c) => c.key === 'listCount' && c.after === null));
  assert.ok(!changes.some((c) => c.key === 'followersCount'));
});
