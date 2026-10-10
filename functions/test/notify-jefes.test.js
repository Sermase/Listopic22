// B2 / B8: avisos a los jefes (lib/notify-jefes.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { FakeFirestore } = require('./helpers/fake-firestore');
const {
  findJefeUids,
  notifyJefes,
  safeNotifyJefes,
  reportAlert,
  businessClaimAlert,
  itemProposalAlert,
  sponsoredPlacementAlert,
  itemSpotlightAlert,
} = require('../modules/lib/notify-jefes');

function seedUsers(db) {
  db.seed('users/jefe-array', { userType: ['user', 'jefe'] });
  db.seed('users/jefe-string', { userType: 'jefe' });
  db.seed('users/jefe-solo-array', { userType: ['jefe'] });
  db.seed('users/negocio', { userType: ['business'] });
  db.seed('users/normal', { userType: 'user' });
  // El campo antiguo que buscaba notifyAdmins: nadie lo escribe y no cuenta.
  db.seed('users/role-admin', { role: 'admin' });
  return db;
}

test('findJefeUids: une userType array y string, sin repetir', async () => {
  const db = seedUsers(new FakeFirestore());
  const uids = await findJefeUids(db);
  assert.deepEqual([...uids].sort(), ['jefe-array', 'jefe-solo-array', 'jefe-string']);
  assert.deepEqual(db.queries.map((q) => q.filters[0].op).sort(), ['==', 'array-contains']);
});

test('findJefeUids: si una consulta falla, usa la otra', async () => {
  const db = seedUsers(new FakeFirestore());
  const original = db.collection.bind(db);
  db.collection = (name) => {
    const col = original(name);
    const where = col.where.bind(col);
    col.where = (field, op, value) => (op === 'array-contains'
      ? { limit: () => ({ get: async () => { throw new Error('caída'); } }) }
      : where(field, op, value));
    return col;
  };
  assert.deepEqual(await findJefeUids(db), ['jefe-string']);
});

test('notifyJefes: avisa a cada jefe una vez, menos a quien lo provocó', async () => {
  const db = seedUsers(new FakeFirestore());
  const sent = [];
  const send = async (uid, type, payload, options) => { sent.push({ uid, type, payload, options }); };
  const result = await notifyJefes({
    db, send, type: 'new_report', payload: { message: 'hola' }, notificationId: 'report_r1', excludeUids: ['jefe-string', null],
  });
  assert.equal(result.notified, 2);
  assert.deepEqual(sent.map((s) => s.uid).sort(), ['jefe-array', 'jefe-solo-array']);
  assert.ok(sent.every((s) => s.type === 'new_report' && s.options.notificationId === 'report_r1'));
});

test('notifyJefes: sin jefes no envía nada', async () => {
  const db = new FakeFirestore();
  db.seed('users/normal', { userType: 'user' });
  const sent = [];
  const result = await notifyJefes({ db, send: async (...args) => { sent.push(args); }, type: 'x', payload: {} });
  assert.deepEqual(result, { notified: 0, uids: [] });
  assert.equal(sent.length, 0);
});

test('reportAlert: texto legible, urgente con 🚨 y enlace al reporte', () => {
  const urgent = reportAlert('r1', { issueType: 'child_safety', targetName: 'Lista Bares Centro', targetType: 'list', userId: 'u-ana' });
  assert.equal(urgent.type, 'new_report');
  assert.equal(urgent.notificationId, 'report_r1');
  assert.deepEqual(urgent.excludeUids, ['u-ana']);
  assert.equal(urgent.payload.message, '🚨 Reporte urgente: Seguridad infantil en «Lista Bares Centro»');
  assert.equal(urgent.payload.link, '/developer?tab=reports&view=pending&focus=r1');
  assert.equal(urgent.payload.urgent, true);

  const normal = reportAlert('r/2', { issueType: 'spam', targetId: 'abc', reporterUid: 'u-luis' });
  assert.equal(normal.payload.message, '🚩 Nuevo reporte: Spam en «abc»');
  assert.equal(normal.payload.link, '/developer?tab=reports&view=pending&focus=r%2F2');
  assert.deepEqual(normal.excludeUids, ['u-luis']);

  const unknown = reportAlert('r3', { issueType: 'raro' });
  assert.equal(unknown.payload.message, '🚩 Nuevo reporte: raro en «un contenido»');
});

test('businessClaimAlert: enlace a la solicitud en su pestaña, sin placeId (el clic abre Developer)', () => {
  const alert = businessClaimAlert('u1_p1', { userId: 'u1', placeId: 'p1', placeName: 'Bar Pepe', userName: 'Juan López' });
  assert.equal(alert.type, 'admin_pending');
  assert.equal(alert.notificationId, 'admin_pending_businessClaims_u1_p1');
  assert.deepEqual(alert.excludeUids, ['u1']);
  assert.equal(alert.payload.message, '🏪 Nueva solicitud de negocio: Bar Pepe (Juan López)');
  assert.equal(alert.payload.link, '/developer?tab=businessClaims&view=pending&focus=u1_p1');
  assert.equal(alert.payload.itemId, 'u1_p1');
  assert.equal('placeId' in alert.payload, false, 'con placeId getNotificationLink mandaría a /place/<id>');
  assert.equal('placeId' in reportAlert('r1', { targetType: 'place', targetId: 'p1' }).payload, false);

  const again = businessClaimAlert('u1_p1', { userId: 'u1', placeId: 'p1', placeName: 'Bar Pepe' }, { resubmission: true });
  assert.equal(again.payload.message, '🔁 Solicitud de negocio reenviada: Bar Pepe');
  assert.equal(again.payload.resubmission, true);
});

test('B8: propuestas, campañas y platos llevan su id propio y enlace a su fila', () => {
  const proposal = itemProposalAlert('prop/1', {
    placeId: 'p1', placeName: 'Bar Pepe', type: 'merge', createdBy: 'u-owner',
    payload: { sourceItemId: 'bravas', sourceItemName: 'Bravas', targetItemId: 'patatas-bravas', targetItemName: 'Patatas bravas' },
  });
  assert.equal(proposal.type, 'admin_pending');
  assert.equal(proposal.notificationId, 'admin_pending_itemProposals_prop/1');
  assert.deepEqual(proposal.excludeUids, ['u-owner']);
  assert.equal(proposal.payload.message, '📝 Propuesta de carta en Bar Pepe: 🔀 Fusión «Bravas» → «Patatas bravas»');
  assert.equal(proposal.payload.link, '/developer?tab=proProposals&view=inbox&focus=prop%2F1');
  assert.equal(proposal.payload.queue, 'itemProposals');

  const move = itemProposalAlert('prop2', {
    placeName: 'Bar Pepe', type: 'reassign_review',
    payload: { reviewItemName: 'brabas', reviewAuthorName: 'Ana', targetItemId: 'patatas-bravas', targetItemName: 'Patatas bravas' },
  });
  assert.equal(move.payload.message, '📝 Propuesta de carta en Bar Pepe: ↪️ Mover reseña «brabas» de Ana → «Patatas bravas»');

  const placement = sponsoredPlacementAlert('pl1', {
    placeName: 'Café Sol', type: 'home', headline: 'Desayunos 3€', startsAt: '2026-10-12', endsAt: '2026-10-19', createdBy: 'u-owner',
  });
  assert.equal(placement.notificationId, 'admin_pending_sponsoredPlacements_pl1');
  assert.equal(placement.payload.message, '📣 Campaña solicitada: Café Sol · Home · «Desayunos 3€» · del 12/10 al 19/10');
  assert.equal(placement.payload.link, '/developer?tab=proProposals&view=inbox&focus=pl1');
  assert.equal(sponsoredPlacementAlert('pl2', { placeName: 'Café Sol', type: 'search', endsAt: '2026-10-19' }).payload.message,
    '📣 Campaña solicitada: Café Sol · Búsqueda · hasta el 19/10');

  const spotlight = itemSpotlightAlert('sp1', {
    placeName: 'Bar Pepe', itemName: 'Bravas', radiusKm: 1.4, days: 7, impulses: 1400, createdBy: 'u-owner',
  });
  assert.equal(spotlight.notificationId, 'admin_pending_sponsoredItemSpotlights_sp1');
  assert.equal(spotlight.payload.message, '🍽️ Plato destacado solicitado: «Bravas» · Bar Pepe · 1,4 km × 7 d · 1400 impulsos');
  assert.equal(spotlight.payload.link, '/developer?tab=proProposals&view=inbox&focus=sp1');

  for (const alert of [proposal, placement, spotlight]) {
    assert.equal('placeId' in alert.payload, false, 'con placeId getNotificationLink mandaría a /place/<id>');
    assert.doesNotMatch(alert.payload.message, /—/, 'sin rayas largas');
  }
});

test('safeNotifyJefes: avisa y nunca lanza', async () => {
  const db = seedUsers(new FakeFirestore());
  const sent = [];
  const alert = sponsoredPlacementAlert('pl1', { placeName: 'Café Sol', type: 'home', createdBy: 'jefe-string' });
  const result = await safeNotifyJefes({ db, send: async (uid, type, payload, options) => { sent.push({ uid, options }); }, alert });
  assert.equal(result.notified, 2);
  assert.ok(sent.every((entry) => entry.options.notificationId === 'admin_pending_sponsoredPlacements_pl1'));

  const failing = await safeNotifyJefes({ db, send: async () => { throw new Error('push caído'); }, alert });
  assert.equal(failing, null);
  assert.equal(await safeNotifyJefes({ db: null, send: async () => {}, alert }), null);
});

test('reports.js ya no busca jefes por el campo role', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'reports.js'), 'utf8');
  assert.equal(/where\(\s*["']role["']/.test(source), false);
  assert.match(source, /notifyJefes\(/);
});

test('onReportWritten avisa a los jefes de un reporte nuevo (menos a quien reporta)', async () => {
  const firestoreAdmin = require('firebase-admin/firestore');
  const db = seedUsers(new FakeFirestore());
  firestoreAdmin.getFirestore = () => db;
  const { onReportWritten } = require('../modules/reports');

  const report = {
    userId: 'jefe-string', targetType: 'list', targetId: 'l1', targetName: 'Bares Centro',
    issueType: 'harassment', status: 'pending', source: 'callable',
  };
  db.seed('reports/r9', report);
  await onReportWritten.run({
    params: { reportId: 'r9' },
    data: {
      before: { exists: false, data: () => undefined },
      after: { exists: true, data: () => report, ref: db.doc('reports/r9') },
    },
  });

  for (const uid of ['jefe-array', 'jefe-solo-array']) {
    const notification = db.data(`users/${uid}/notifications/report_r9`);
    assert.ok(notification, `sin aviso para ${uid}`);
    assert.equal(notification.type, 'new_report');
    assert.equal(notification.message, '🚨 Reporte urgente: Acoso en «Bares Centro»');
    assert.equal(notification.link, '/developer?tab=reports&view=pending&focus=r9');
  }
  assert.equal(db.data('users/jefe-string/notifications/report_r9'), undefined, 'quien reporta no se avisa a sí mismo');
  assert.equal(db.data('users/role-admin/notifications/report_r9'), undefined);
});
