// functions/modules/admin/admin-gdpr.js
//
// RGPD: exportar todos los datos de una persona (acceso y portabilidad, la
// pide un jefe cuando el usuario lo solicita) y limpiar su rastro al borrar la
// cuenta (fotos, comentarios, foros, chats, notificaciones enviadas...).

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const { assertJefeAccess, writeAuditLog } = require('../lib/auth');
const { collectionGroupDocsByField, userReviewDocs } = require('../lib/user-reviews');
const {
  GDPR_AUDIT_RETAIN_DAYS,
  PERSONAL_STORAGE_FOLDERS,
  ANONYMOUS_COMMENT,
  ANONYMOUS_FORUM_MESSAGE,
  ANONYMOUS_PLACE_PHOTO,
  ANONYMOUS_REPORTER,
  toExportValue,
  exportDoc,
  planChatCleanup,
  downloadUrlPrefix,
} = require('../lib/gdpr');

const db = getFirestore();
const BATCH_LIMIT = 450;

const USER_SUBCOLLECTIONS = [
  'following', 'followers', 'followingLists', 'followingPlaces',
  'notifications', 'archives', 'archiveIndex', 'obtainedBadges',
];

class BatchWriter {
  constructor() {
    this.batch = db.batch();
    this.count = 0;
  }

  async add(op) {
    op(this.batch);
    this.count++;
    if (this.count >= BATCH_LIMIT) await this.flush();
  }

  async flush() {
    if (this.count === 0) return;
    await this.batch.commit();
    this.batch = db.batch();
    this.count = 0;
  }
}

const uniqueDocs = (...lists) => {
  const seen = new Map();
  lists.flat().forEach((docSnap) => seen.set(docSnap.ref.path, docSnap));
  return [...seen.values()];
};

async function chatsOf(uid) {
  const snap = await db.collection('chats').where('participants', 'array-contains', uid).get();
  return snap.docs;
}

// ─── Exportación ──────────────────────────────────────────────────────────────

async function collectUserData(uid) {
  const userRef = db.collection('users').doc(uid);
  const [userSnap, publicSnap] = await Promise.all([
    userRef.get(),
    db.collection('publicProfiles').doc(uid).get(),
  ]);

  let account = null;
  try {
    const record = await getAuth().getUser(uid);
    account = {
      uid: record.uid,
      email: record.email || null,
      emailVerified: record.emailVerified,
      displayName: record.displayName || null,
      photoURL: record.photoURL || null,
      providers: record.providerData.map((p) => p.providerId),
      createdAt: record.metadata.creationTime || null,
      lastSignInAt: record.metadata.lastSignInTime || null,
    };
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }

  if (!userSnap.exists && !account) return null;

  const subcollections = {};
  for (const name of USER_SUBCOLLECTIONS) {
    const snap = await userRef.collection(name).get();
    subcollections[name] = snap.docs.map(exportDoc);
  }
  const archiveItems = [];
  for (const archive of (await userRef.collection('archives').get()).docs) {
    const items = await archive.ref.collection('items').get();
    archiveItems.push(...items.docs.map(exportDoc));
  }
  const fcmTokens = await userRef.collection('fcmTokens').count().get().then((s) => s.data().count).catch(() => 0);

  const [byUserId, byAuthorId, listsByUser, listsByAuthor, comments, reactions, placePhotos, forumMessages, reports] = await Promise.all([
    userReviewDocs(db, 'userId', uid),
    userReviewDocs(db, 'authorId', uid),
    db.collection('lists').where('userId', '==', uid).get().then((s) => s.docs),
    db.collection('lists').where('authorId', '==', uid).get().then((s) => s.docs),
    collectionGroupDocsByField(db, 'comments', 'userId', uid),
    collectionGroupDocsByField(db, 'reactions', 'userId', uid),
    collectionGroupDocsByField(db, 'photos', 'userId', uid),
    collectionGroupDocsByField(db, 'messages', 'userId', uid),
    db.collection('reports').where('userId', '==', uid).get().then((s) => s.docs),
  ]);

  const chats = [];
  for (const chat of await chatsOf(uid)) {
    const data = chat.data() || {};
    const ownMessages = await chat.ref.collection('messages').where('senderId', '==', uid).get();
    chats.push({
      path: chat.ref.path,
      type: data.type || (data.isGroup ? 'group' : 'private'),
      groupName: data.groupName || null,
      participants: data.participants || [],
      createdAt: toExportValue(data.createdAt),
      ownMessages: ownMessages.docs.map(exportDoc),
    });
  }

  return {
    account,
    profile: userSnap.exists ? toExportValue(userSnap.data()) : null,
    publicProfile: publicSnap.exists ? toExportValue(publicSnap.data()) : null,
    ...subcollections,
    archiveItems,
    pushDevices: fcmTokens,
    reviews: uniqueDocs(byUserId, byAuthorId).map(exportDoc),
    lists: uniqueDocs(listsByUser, listsByAuthor).map(exportDoc),
    comments: comments.map(exportDoc),
    reactions: reactions.map(exportDoc),
    placePhotos: placePhotos.map(exportDoc),
    forumMessages: forumMessages.map(exportDoc),
    reports: reports.map(exportDoc),
    chats,
  };
}

/** Solo jefes: devuelve en JSON todos los datos de una persona para atender su solicitud. */
const adminExportUserData = onCall({ timeoutSeconds: 300, memory: '1GiB' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
  await assertJefeAccess(request.auth.uid, 'Solo los jefes pueden exportar datos de usuarios.');

  const userId = typeof request.data?.userId === 'string' ? request.data.userId.trim() : '';
  if (!userId) throw new HttpsError('invalid-argument', 'Falta userId.');

  const data = await collectUserData(userId);
  if (!data) throw new HttpsError('not-found', 'No existe ese usuario.');

  await writeAuditLog(request.auth.uid, 'exportUserData', { targetUserId: userId }, { retainDays: GDPR_AUDIT_RETAIN_DAYS });
  return {
    format: 'listopic-user-data',
    version: 1,
    generatedAt: new Date().toISOString(),
    userId,
    data,
  };
});

// ─── Borrado ──────────────────────────────────────────────────────────────────

async function deleteStorageFolder(bucket, folder) {
  if (!bucket) return;
  try {
    await bucket.deleteFiles({ prefix: folder.endsWith('/') ? folder : `${folder}/`, force: true });
  } catch (error) {
    logger.warn(`cleanupUserFootprint: no se pudo borrar ${folder}`, { error: error.message });
  }
}

/** Quita la portada de los lugares que usan una foto que se va a borrar. */
async function clearPlaceCovers(writer, { urls = new Set(), urlPrefix = null }) {
  const places = new Map();
  for (const url of urls) {
    const snap = await db.collection('places').where('userPhotoUrl', '==', url).get();
    snap.docs.forEach((d) => places.set(d.ref.path, d.ref));
  }
  if (urlPrefix) {
    const snap = await db.collection('places')
      .where('userPhotoUrl', '>=', urlPrefix)
      .where('userPhotoUrl', '<', `${urlPrefix}`)
      .get();
    snap.docs.forEach((d) => places.set(d.ref.path, d.ref));
  }
  for (const ref of places.values()) {
    await writer.add((b) => b.update(ref, { userPhotoUrl: FieldValue.delete() }));
  }
  return places.size;
}

/**
 * Borra o anonimiza lo que la persona deja fuera de users/{uid}. Se llama desde
 * deleteOwnAccount antes de borrar el perfil. `keepContributions` es la misma
 * elección que «mantener valoraciones»: fotos de lugares, comentarios y
 * mensajes de foros se conservan sin autor o se borran con ellas.
 */
async function cleanupUserFootprint(uid, { keepContributions }) {
  const writer = new BatchWriter();
  let bucket = null;
  try {
    bucket = getStorage().bucket();
  } catch (error) {
    logger.warn('cleanupUserFootprint: sin bucket de Storage; no se borran archivos', { error: error.message });
  }
  const counters = { comments: 0, reactions: 0, forumMessages: 0, placePhotos: 0, chatsDeleted: 0, chatsLeft: 0, notificationsSent: 0, followLinks: 0, reports: 0, placeCovers: 0 };
  const commentParents = new Map();

  for (const docSnap of await collectionGroupDocsByField(db, 'comments', 'userId', uid)) {
    if (keepContributions) {
      await writer.add((b) => b.update(docSnap.ref, ANONYMOUS_COMMENT));
    } else {
      await writer.add((b) => b.delete(docSnap.ref));
      // Solo comentarios de reseñas: los de lista ya los descuenta updateAggregatesOnCommentChange.
      const parent = docSnap.ref.parent.parent;
      if (parent && parent.parent.id === 'reviews') commentParents.set(parent.path, { ref: parent, n: (commentParents.get(parent.path)?.n || 0) + 1 });
    }
    counters.comments++;
  }

  // Sus «me gusta» en reseñas (lists/*/reviews/*/reactions/{uid}): no llevan contenido, se borran siempre.
  for (const docSnap of await collectionGroupDocsByField(db, 'reactions', 'userId', uid)) {
    await writer.add((b) => b.delete(docSnap.ref));
    counters.reactions++;
  }

  for (const docSnap of await collectionGroupDocsByField(db, 'messages', 'userId', uid)) {
    await writer.add((b) => (keepContributions ? b.update(docSnap.ref, ANONYMOUS_FORUM_MESSAGE) : b.delete(docSnap.ref)));
    counters.forumMessages++;
  }

  const deletedPhotoUrls = new Set();
  for (const docSnap of await collectionGroupDocsByField(db, 'photos', 'userId', uid)) {
    const data = docSnap.data() || {};
    if (keepContributions) {
      await writer.add((b) => b.update(docSnap.ref, ANONYMOUS_PLACE_PHOTO));
    } else {
      await writer.add((b) => b.delete(docSnap.ref));
      if (typeof data.url === 'string' && data.url) deletedPhotoUrls.add(data.url);
      if (bucket && typeof data.storagePath === 'string' && data.storagePath.includes(`/${uid}/`)) {
        await bucket.file(data.storagePath).delete({ ignoreNotFound: true }).catch((error) => {
          logger.warn('cleanupUserFootprint: foto de lugar no borrada', { path: data.storagePath, error: error.message });
        });
      }
    }
    counters.placePhotos++;
  }

  if (!keepContributions) {
    counters.placeCovers = await clearPlaceCovers(writer, {
      urls: deletedPhotoUrls,
      urlPrefix: bucket ? downloadUrlPrefix(bucket.name, `reviews/${uid}/`) : null,
    });
  }

  // Notificaciones que esta persona generó a otras (sendNotification guarda senderId, senderName y senderPhoto).
  for (const docSnap of await collectionGroupDocsByField(db, 'notifications', 'senderId', uid)) {
    await writer.add((b) => b.delete(docSnap.ref));
    counters.notificationsSent++;
  }

  // Quien la seguía deja de seguirla (los triggers de social.js ajustan contadores).
  for (const follower of (await db.collection('users').doc(uid).collection('followers').get()).docs) {
    await writer.add((b) => b.delete(db.collection('users').doc(follower.id).collection('following').doc(uid)));
    counters.followLinks++;
  }

  // Las denuncias se conservan para moderación, sin nombre ni correo.
  for (const docSnap of (await db.collection('reports').where('userId', '==', uid).get()).docs) {
    await writer.add((b) => b.update(docSnap.ref, ANONYMOUS_REPORTER));
    counters.reports++;
  }

  await writer.flush();

  for (const { ref, n } of commentParents.values()) {
    await ref.update({ commentsCount: FieldValue.increment(-n) }).catch(() => undefined);
  }

  for (const chat of await chatsOf(uid)) {
    const plan = planChatCleanup(chat.data() || {}, uid);
    if (plan.action === 'delete') {
      await db.recursiveDelete(chat.ref);
      counters.chatsDeleted++;
    } else {
      const own = await chat.ref.collection('messages').where('senderId', '==', uid).get();
      for (const message of own.docs) await writer.add((b) => b.delete(message.ref));
      await writer.add((b) => b.update(chat.ref, plan.fields));
      counters.chatsLeft++;
    }
  }
  await writer.flush();

  await Promise.all(PERSONAL_STORAGE_FOLDERS.map((folder) => deleteStorageFolder(bucket, `${folder}/${uid}`)));
  if (!keepContributions) await deleteStorageFolder(bucket, `reviews/${uid}`);

  return counters;
}

module.exports = {
  adminExportUserData,
  cleanupUserFootprint,
  collectUserData,
};
