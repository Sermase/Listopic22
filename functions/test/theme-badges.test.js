const test = require('node:test');
const assert = require('node:assert/strict');
const { emptyThemeStats, addThemeStat, themeBadgesMet } = require('../modules/lib/theme-badges');

const at = (iso) => ({ toDate: () => new Date(iso) });
const stats = (reviews) => {
  const s = emptyThemeStats();
  reviews.forEach((r) => addThemeStat(s, r));
  return s;
};

test('sin valoraciones no hay medallas de temas', () => {
  assert.deepEqual(themeBadgesMet(emptyThemeStats()), []);
});

test('la primera valoración da Cálido; 3 sitios, Fresco', () => {
  assert.deepEqual(themeBadgesMet(stats([{ placeId: 'a' }])), ['TEMA_CALIDO']);
  assert.deepEqual(themeBadgesMet(stats([{ placeId: 'a' }, { placeId: 'b' }, { placeName: 'Casa Pepe' }])), ['TEMA_CALIDO', 'TEMA_FRESCO']);
  assert.deepEqual(themeBadgesMet(stats([{ placeId: 'a' }, { placeId: 'a' }, { placeId: 'a' }])), ['TEMA_CALIDO']);
});

test('Neón cuenta de 21 a 3 en hora de Madrid', () => {
  // 20:30 UTC en octubre = 22:30 en Madrid (UTC+2).
  const night = Array.from({ length: 5 }, (_, i) => ({ placeId: 'a', createdAt: at(`2026-10-0${i + 1}T20:30:00Z`) }));
  assert.ok(themeBadgesMet(stats(night)).includes('TEMA_NEON'));
  const four = night.slice(0, 4).concat({ placeId: 'a', createdAt: at('2026-10-09T12:00:00Z') });
  assert.ok(!themeBadgesMet(stats(four)).includes('TEMA_NEON'));
});

test('Grafito pide 10 con foto', () => {
  const photos = Array.from({ length: 10 }, (_, i) => (i % 2 ? { photos: ['x'] } : { photoUrl: 'y' }));
  assert.ok(themeBadgesMet(stats(photos)).includes('TEMA_GRAFITO'));
  assert.ok(!themeBadgesMet(stats(photos.slice(1).concat({ photos: [' '] }))).includes('TEMA_GRAFITO'));
});

test('Atardecer pide 8 entre las 18 y las 22 h en 4 días distintos', () => {
  // 17:00 UTC = 19:00 en Madrid.
  const sameDay = Array.from({ length: 8 }, () => ({ createdAt: at('2026-10-03T17:00:00Z') }));
  assert.ok(!themeBadgesMet(stats(sameDay)).includes('TEMA_ATARDECER'));
  const spread = Array.from({ length: 8 }, (_, i) => ({ createdAt: at(`2026-10-0${(i % 4) + 1}T17:00:00Z`) }));
  assert.ok(themeBadgesMet(stats(spread)).includes('TEMA_ATARDECER'));
});

test('Laguna pide 15 sitios distintos', () => {
  const places = Array.from({ length: 15 }, (_, i) => ({ placeId: `p${i}` }));
  assert.ok(themeBadgesMet(stats(places)).includes('TEMA_LAGUNA'));
  assert.ok(!themeBadgesMet(stats(places.slice(1))).includes('TEMA_LAGUNA'));
});
