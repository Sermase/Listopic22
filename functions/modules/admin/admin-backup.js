// functions/modules/admin/admin-backup.js
//
// Copia de seguridad de Firestore bajo demanda desde Developer:
// - adminExportFirestoreBackup: recorre recursivamente todas las colecciones
//   (documentos + subcolecciones) y guarda un JSON en Storage
//   (backups/listopic-backup-<fecha>.json), legible solo por jefes según
//   storage.rules. Devuelve la ruta para descargarlo desde Developer.
//
// Pensada para el tamaño actual de la app (miles de documentos). Cuando el
// volumen crezca, migrar al export gestionado de Firestore (gcloud) — está
// anotado en el doc de mejoras.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { getFirestore, Timestamp, GeoPoint, DocumentReference } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { assertJefeAccess, writeAuditLog } = require('../lib/auth');

const db = getFirestore();

const MAX_DOCS = 100000;

// Colecciones raíz efímeras u operativas que no aportan a una copia de datos.
const SKIPPED_ROOT_COLLECTIONS = new Set(['rateLimits']);

function serializeValue(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Timestamp) {
    return { __type: 'timestamp', iso: value.toDate().toISOString() };
  }
  if (value instanceof GeoPoint) {
    return { __type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (value instanceof DocumentReference) {
    return { __type: 'ref', path: value.path };
  }
  if (Buffer.isBuffer(value)) {
    return { __type: 'bytes', base64: value.toString('base64') };
  }
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === 'object') {
    const result = {};
    Object.entries(value).forEach(([key, entry]) => {
      result[key] = serializeValue(entry);
    });
    return result;
  }
  return value;
}

async function dumpCollection(collectionRef, state) {
  const docs = await collectionRef.get();
  const output = {};
  for (const docSnap of docs.docs) {
    state.docCount += 1;
    if (state.docCount > MAX_DOCS) {
      throw new HttpsError('resource-exhausted', `La copia supera ${MAX_DOCS} documentos; migra al export gestionado de Firestore.`);
    }
    const entry = { __data: serializeValue(docSnap.data()) };
    const subcollections = await docSnap.ref.listCollections();
    for (const subcollection of subcollections) {
      if (!entry.__collections) entry.__collections = {};
      entry.__collections[subcollection.id] = await dumpCollection(subcollection, state);
    }
    output[docSnap.id] = entry;
  }
  return output;
}

const adminExportFirestoreBackup = onCall({
  invoker: 'public',
  timeoutSeconds: 540,
  memory: '1GiB',
}, async (request) => {
  const uid = request.auth?.uid;
  await assertJefeAccess(uid, 'Solo un administrador puede crear copias de seguridad.');

  const startedAt = Date.now();
  const state = { docCount: 0 };
  const backup = {
    __meta: {
      exportedAt: new Date().toISOString(),
      exportedBy: uid,
      format: 'listopic-firestore-json-v1',
    },
    collections: {},
  };

  const rootCollections = await db.listCollections();
  for (const collectionRef of rootCollections) {
    if (SKIPPED_ROOT_COLLECTIONS.has(collectionRef.id)) continue;
    backup.collections[collectionRef.id] = await dumpCollection(collectionRef, state);
  }

  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const path = `backups/listopic-backup-${stamp}.json`;
  const contents = JSON.stringify(backup);
  const bucket = getStorage().bucket();
  await bucket.file(path).save(contents, {
    contentType: 'application/json',
    metadata: { cacheControl: 'no-store' },
  });

  const sizeBytes = Buffer.byteLength(contents, 'utf8');
  await writeAuditLog(uid, 'backup.exported', {
    path,
    docCount: state.docCount,
    sizeBytes,
    durationMs: Date.now() - startedAt,
  });

  logger.info('adminExportFirestoreBackup: copia creada', { path, docCount: state.docCount, sizeBytes });
  return { ok: true, path, docCount: state.docCount, sizeBytes };
});

module.exports = {
  adminExportFirestoreBackup,
};
