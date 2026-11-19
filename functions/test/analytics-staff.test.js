// Separar la actividad de los jefes en la analitica (lib/analytics-staff.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeFirestore } = require('./helpers/fake-firestore');
const { isStaffUid, withoutStaff, clearStaffCache } = require('../modules/lib/analytics-staff');

test('withoutStaff resta los contadores de jefes sin bajar de cero', () => {
  const row = withoutStaff({
    totalViews: 10, uniqueSessions: 4, authenticatedViews: 6, anonymousViews: 4,
    totalShares: 3, shareActions: 2, staffViews: 5, staffSessions: 1, staffShares: 3, staffShareActions: 4,
  });
  assert.equal(row.totalViews, 5);
  assert.equal(row.uniqueSessions, 3);
  assert.equal(row.authenticatedViews, 1);
  assert.equal(row.anonymousViews, 4);
  assert.equal(row.totalShares, 0);
  assert.equal(row.shareActions, 0);
});

test('withoutStaff en filas de mapa: reseñas y conexiones', () => {
  assert.deepEqual(
    withoutStaff({ reviews: 3, staffReviews: 1, sessions: 7, staffSessions: 2 }),
    { reviews: 2, staffReviews: 1, sessions: 5, staffSessions: 2 },
  );
  assert.equal(withoutStaff({ reviews: 2 }).reviews, 2);
});

test('isStaffUid: claim admin, userType jefe (string o array) y resto', async () => {
  clearStaffCache();
  const db = new FakeFirestore();
  db.seed('users/a', { userType: ['user', 'jefe'] });
  db.seed('users/b', { userType: 'jefe' });
  db.seed('users/c', { userType: 'user' });
  assert.equal(await isStaffUid(db, 'a'), true);
  assert.equal(await isStaffUid(db, 'b'), true);
  assert.equal(await isStaffUid(db, 'c'), false);
  assert.equal(await isStaffUid(db, 'nadie'), false);
  assert.equal(await isStaffUid(db, ''), false);
  assert.equal(await isStaffUid(db, 'x', { admin: true }), true);
});

test('withoutStaff resta también los desgloses por dispositivo, origen y canal', () => {
  const row = withoutStaff({
    totalViews: 5, staffViews: 2,
    byDevice: { mobile: 3, desktop: 2 }, staffByDevice: { desktop: 2 },
    bySource: { direct: 5 }, staffBySource: { direct: 2 },
    byShareChannel: { whatsapp: 1 },
  });
  assert.deepEqual(row.byDevice, { mobile: 3 });
  assert.deepEqual(row.bySource, { direct: 3 });
  assert.deepEqual(row.byShareChannel, { whatsapp: 1 });
});
