'use strict';

// Pachote (pachote-78042.web.app) vive ahora en este proyecto. Mudanza de los
// grupos que cada dispositivo tenía en el Firebase antiguo: el dispositivo
// manda el token de su usuario antiguo, se comprueba aquí y, con ese mismo
// token, se leen sus grupos por REST (las reglas antiguas deciden qué ve).
// Cada grupo se copia entero la primera vez y este usuario recibe el mismo
// papel que tenía allí.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { fromDocument, fromFields } = require('./lib/firestore-rest');

const OLD_PROJECT = 'pachote-78042';
const OLD_BASE = `https://firestore.googleapis.com/v1/projects/${OLD_PROJECT}/databases/(default)/documents`;
const ROLES = ['admin', 'editor', 'viewer'];

const db = getFirestore();
const oldAuth = () => getAuth(getApps().find((a) => a.name === 'pachote-antiguo') || initializeApp({ projectId: OLD_PROJECT }, 'pachote-antiguo'));

function oldReader(token) {
  const call = (path) => fetch(OLD_BASE + path, { headers: { Authorization: `Bearer ${token}` } });
  return {
    async get(path) {
      const r = await call(path);
      if (r.status === 404 || r.status === 403) return null;
      if (!r.ok) throw new Error(`REST ${r.status} ${path}`);
      return fromFields((await r.json()).fields);
    },
    async list(path) {
      const out = [];
      let page = '';
      do {
        const r = await call(`${path}?pageSize=300${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`);
        if (r.status === 404 || r.status === 403) return out;
        if (!r.ok) throw new Error(`REST ${r.status} ${path}`);
        const j = await r.json();
        (j.documents || []).forEach((d) => out.push(fromDocument(d)));
        page = j.nextPageToken || '';
      } while (page && out.length < 20000);
      return out;
    },
  };
}

async function copyGroup(old, gid, core, oldUid, uid) {
  const gref = db.doc(`pachoteGroups/${gid}`);
  const [movs, logs] = await Promise.all([old.list(`/groups/${gid}/movs`), old.list(`/groups/${gid}/log`)]);
  try {
    await gref.create({ ...core, owner: core.owner === oldUid ? uid : String(core.owner || ''), migratedAt: Date.now() });
  } catch (e) {
    if (e.code === 6) return false; // Otro dispositivo lo está mudando a la vez.
    throw e;
  }
  const w = db.bulkWriter();
  movs.forEach((m) => w.set(gref.collection('movs').doc(m.id), m.data));
  logs.forEach((l) => w.set(gref.collection('log').doc(l.id), l.data));
  await w.close();
  return true;
}

const pachoteMigrate = onCall({ timeoutSeconds: 120 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Falta la sesión.');
  const token = String(request.data?.oldIdToken || '');
  if (!token) throw new HttpsError('invalid-argument', 'Falta el token antiguo.');
  let oldUid;
  try {
    oldUid = (await oldAuth().verifyIdToken(token)).uid;
  } catch (e) {
    throw new HttpsError('permission-denied', 'El token antiguo no vale.');
  }

  const old = oldReader(token);
  const me = await old.get(`/users/${oldUid}`);
  const gids = Object.keys(me?.groups || {}).filter((g) => /^[\w-]{1,80}$/.test(g)).slice(0, 60);
  const moved = [];
  let copied = 0;
  for (const gid of gids) {
    try {
      const acc = await old.get(`/groups/${gid}/access/${oldUid}`);
      if (!acc) continue;
      if (!(await db.doc(`pachoteGroups/${gid}`).get()).exists) {
        const core = await old.get(`/groups/${gid}`);
        if (!core) continue;
        if (await copyGroup(old, gid, core, oldUid, uid)) copied++;
      }
      const aref = db.doc(`pachoteGroups/${gid}/access/${uid}`);
      const prev = (await aref.get()).data();
      const role = prev?.role === 'admin' ? 'admin' : (ROLES.includes(acc.role) ? acc.role : 'editor');
      await aref.set({
        role,
        memberId: prev?.memberId || acc.memberId || null,
        joined: prev?.joined || Date.now(),
        label: String(acc.label || prev?.label || '').slice(0, 80),
        legacyUid: oldUid,
      }, { merge: true });
      moved.push(gid);
    } catch (e) {
      logger.warn('pachoteMigrate: grupo sin mudar', { gid, error: e.message });
    }
  }

  const uref = db.doc(`pachoteUsers/${uid}`);
  const mine = (await uref.get()).data() || {};
  await uref.set({
    groups: Object.fromEntries(moved.map((g) => [g, mine.groups?.[g] || { joined: Date.now() }])),
    ...(me?.profile && !mine.profile ? { profile: me.profile } : {}),
  }, { merge: true });
  await db.doc(`pachoteLegacy/${oldUid}`).set({ uid, groups: moved, at: FieldValue.serverTimestamp() }, { merge: true });
  logger.info('pachoteMigrate', { groups: moved.length, copied });
  return { groups: moved.length, copied };
});

// Al entrar en Pachote con una cuenta (Google o email de Listopic) se deja
// atrás el usuario anónimo de ese dispositivo. Con su token se pasan sus
// grupos a la cuenta, con el mismo papel (también el de administrador).
const pachoteAdopt = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Falta la sesión.');
  let prevUid;
  try {
    prevUid = (await getAuth().verifyIdToken(String(request.data?.prevIdToken || ''))).uid;
  } catch (e) {
    throw new HttpsError('permission-denied', 'El token anterior no vale.');
  }
  if (prevUid === uid) return { groups: 0 };
  const prev = (await db.doc(`pachoteUsers/${prevUid}`).get()).data() || {};
  const gids = Object.keys(prev.groups || {}).slice(0, 100);
  const moved = [];
  for (const gid of gids) {
    const old = (await db.doc(`pachoteGroups/${gid}/access/${prevUid}`).get()).data();
    if (!old) continue;
    const aref = db.doc(`pachoteGroups/${gid}/access/${uid}`);
    const cur = (await aref.get()).data();
    const role = cur?.role === 'admin' || old.role === 'admin' ? 'admin' : (cur?.role || old.role || 'editor');
    await aref.set({ role, memberId: cur?.memberId || old.memberId || null, joined: cur?.joined || old.joined || Date.now(), label: String(old.label || '').slice(0, 80) }, { merge: true });
    moved.push(gid);
  }
  const uref = db.doc(`pachoteUsers/${uid}`);
  const mine = (await uref.get()).data() || {};
  await uref.set({
    groups: Object.fromEntries(moved.map((g) => [g, mine.groups?.[g] || prev.groups[g] || { joined: Date.now() }])),
    ...(prev.profile && !mine.profile ? { profile: prev.profile } : {}),
  }, { merge: true });
  return { groups: moved.length };
});

// «Bote a pachas» y las cuentas del chat abren Pachote ya con la cuenta de
// Listopic: token propio de esa misma cuenta (caduca en una hora), que Pachote
// usa al abrirse. Firmarlo pide el rol «Creador de tokens de cuenta de
// servicio» en la cuenta de servicio de Functions; sin él, Pachote se abre sin
// cuenta, como antes.
const pachoteHandoff = onCall(async (request) => {
  const auth = request.auth;
  if (!auth?.uid || auth.token?.firebase?.sign_in_provider === 'anonymous') {
    throw new HttpsError('unauthenticated', 'Entra en Listopic.');
  }
  try {
    return { token: await getAuth().createCustomToken(auth.uid) };
  } catch (e) {
    logger.error('pachoteHandoff', e.code || e.message);
    throw new HttpsError('failed-precondition', 'No se pudo preparar la entrada en Pachote.');
  }
});

module.exports = { pachoteMigrate, pachoteAdopt, pachoteHandoff };
