const test = require('node:test');
const assert = require('node:assert/strict');
const { planChatCleanup, toExportValue, downloadUrlPrefix } = require('../modules/lib/gdpr');

test('chat privado: se borra entero', () => {
  assert.deepEqual(planChatCleanup({ type: 'private', participants: ['ana', 'bea'] }, 'ana'), { action: 'delete' });
  assert.deepEqual(planChatCleanup({ participants: ['ana', 'bea'] }, 'ana'), { action: 'delete' });
});

test('grupo: la persona sale, se quitan sus mapas y pasa la propiedad', () => {
  const plan = planChatCleanup({
    type: 'group',
    participants: ['ana', 'bea', 'carla'],
    unreadCount: { ana: 2, bea: 0, carla: 1 },
    participantProfiles: { ana: { username: 'ana' }, bea: { username: 'bea' } },
    ownerId: 'ana',
    lastMessageSenderId: 'ana',
  }, 'ana');
  assert.equal(plan.action, 'leave');
  assert.deepEqual(plan.fields.participants, ['bea', 'carla']);
  assert.deepEqual(plan.fields.unreadCount, { bea: 0, carla: 1 });
  assert.deepEqual(plan.fields.participantProfiles, { bea: { username: 'bea' } });
  assert.equal(plan.fields.ownerId, 'bea');
  assert.equal(plan.fields.lastMessage, 'Mensaje eliminado');
  assert.equal(plan.fields.lastMessageSenderId, null);
});

test('grupo que se queda vacío: se borra', () => {
  assert.deepEqual(planChatCleanup({ type: 'group', participants: ['ana'] }, 'ana'), { action: 'delete' });
});

test('grupo: no toca lo que no es suyo', () => {
  const plan = planChatCleanup({ type: 'group', participants: ['ana', 'bea', 'carla'], ownerId: 'bea' }, 'ana');
  assert.deepEqual(plan.fields, { participants: ['bea', 'carla'] });
});

test('exportación: fechas ISO, GeoPoint, referencias y anidados', () => {
  const ts = { toDate: () => new Date('2026-10-05T10:00:00Z') };
  const ref = { path: 'lists/l1', isEqual: () => false };
  assert.deepEqual(toExportValue({ a: ts, b: { latitude: 1, longitude: 2 }, c: ref, d: [ts, 3], e: null, f: undefined }), {
    a: '2026-10-05T10:00:00.000Z', b: { latitude: 1, longitude: 2 }, c: 'lists/l1', d: ['2026-10-05T10:00:00.000Z', 3], e: null, f: null,
  });
});

test('prefijo de URL de descarga de una carpeta', () => {
  assert.equal(
    downloadUrlPrefix('listopic.firebasestorage.app', 'reviews/u1/'),
    'https://firebasestorage.googleapis.com/v0/b/listopic.firebasestorage.app/o/reviews%2Fu1%2F',
  );
});
