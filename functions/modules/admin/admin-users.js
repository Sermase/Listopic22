// functions/modules/admin/admin-users.js
//
// Recálculo masivo de estadísticas de usuario.

const { onCall, HttpsError } = require('../https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { assertJefeAccess, writeAuditLog } = require('../lib/auth');
const { tallyReviewsByUser } = require('../lib/review-tally');
const { userReviewDocs } = require('../lib/user-reviews');
const { cleanupUserFootprint } = require('./admin-gdpr');
const { GDPR_AUDIT_RETAIN_DAYS } = require('../lib/gdpr');
const { sendNotification } = require('../notifications');

const db = getFirestore();
const BATCH_LIMIT = 450;
const { buildPublicProfile } = require('../lib/public-profile');

function normalizeAuthorPatch(fields = {}) {
  const patch = {};

  if (typeof fields.authorName === 'string') {
    const authorName = fields.authorName.trim().slice(0, 80);
    if (authorName) {
      patch.authorName = authorName;
      patch.authorUsername = authorName;
    }
  }

  if (typeof fields.authorPhoto === 'string') {
    const authorPhoto = fields.authorPhoto.trim().slice(0, 2000);
    patch.authorPhoto = authorPhoto;
    patch.authorPhotoUrl = authorPhoto;
  }

  if (typeof fields.authorUserType === 'string' || Array.isArray(fields.authorUserType)) {
    patch.authorUserType = Array.isArray(fields.authorUserType)
      ? fields.authorUserType.filter((entry) => typeof entry === 'string').slice(0, 10)
      : fields.authorUserType.trim().slice(0, 40);
  }

  return patch;
}

async function commitBatchIfNeeded(state, force = false) {
  if (state.count === 0 || (!force && state.count < BATCH_LIMIT)) return;
  await state.batch.commit();
  state.batch = db.batch();
  state.count = 0;
}

async function forEachUniqueUserReview(userId, callback) {
  const seenPaths = new Set();
  const snapshots = await Promise.all([
    userReviewDocs(db, 'userId', userId),
    userReviewDocs(db, 'authorId', userId),
  ]);

  for (const docs of snapshots) {
    for (const docSnap of docs) {
      if (seenPaths.has(docSnap.ref.path)) continue;
      seenPaths.add(docSnap.ref.path);
      await callback(docSnap);
    }
  }

  return seenPaths.size;
}

async function propagateAuthorFieldsForUser(userId, fields) {
  const patch = normalizeAuthorPatch(fields);
  if (!Object.keys(patch).length) return { updated: 0 };

  const state = { batch: db.batch(), count: 0 };
  let updated = 0;

  await forEachUniqueUserReview(userId, async (docSnap) => {
    state.batch.update(docSnap.ref, patch);
    state.count++;
    updated++;
    await commitBatchIfNeeded(state);
  });

  await commitBatchIfNeeded(state, true);
  return { updated };
}

async function deleteKnownUserSubcollections(userId, state) {
  const subcollections = [
    'following',
    'followers',
    'followingLists',
    'followingPlaces',
    'notifications',
    'fcmTokens',
    'archives',
    'archiveIndex',
    'obtainedBadges',
    'aptReports',
  ];

  let deleted = 0;
  for (const subcollection of subcollections) {
    const snap = await db.collection('users').doc(userId).collection(subcollection).get();
    for (const docSnap of snap.docs) {
      state.batch.delete(docSnap.ref);
      state.count++;
      deleted++;
      await commitBatchIfNeeded(state);
    }
  }

  return deleted;
}

async function handleUserOwnedLists(userId, keepSublists, state) {
  const snapshots = await Promise.all([
    db.collection('lists').where('authorId', '==', userId).get(),
    db.collection('lists').where('userId', '==', userId).get(),
  ]);
  const seen = new Set();
  let touched = 0;

  for (const snap of snapshots) {
    for (const docSnap of snap.docs) {
      if (seen.has(docSnap.ref.path)) continue;
      seen.add(docSnap.ref.path);
      const data = docSnap.data() || {};
      const isSublist = Boolean(data.parentId || data.parentListId);

      if (keepSublists || !isSublist) {
        state.batch.update(docSnap.ref, {
          authorId: null,
          userId: null,
          authorName: 'Usuario eliminado',
          authorPhoto: null,
          authorPhotoUrl: null,
          authorUsername: null,
        });
      } else {
        state.batch.delete(docSnap.ref);
      }

      state.count++;
      touched++;
      await commitBatchIfNeeded(state);
    }
  }

  return touched;
}

/**
 * Contadores de una persona. `reviewCount` llega ya calculado (una sola pasada
 * por todas las valoraciones en `countReviewsByUser`): así no hace falta el
 * índice de grupo de colecciones sobre `reviews.userId`, que no existe.
 */
async function recalculateAggregatesForUser(userId, reviewCount) {
  const listsSnap = await db.collection('lists').where('userId', '==', userId).get();
  const listCount = listsSnap.size;
  const publicListsCount = listsSnap.docs.filter((d) => d.get('isPublic')).length;

  const followersSnap = await db.collection('users').doc(userId).collection('followers').get();
  const followersCount = followersSnap.size;

  const followingSnap = await db.collection('users').doc(userId).collection('following').get();
  const followingCount = followingSnap.size;

  const followingListsSnap = await db.collection('users').doc(userId).collection('followingLists').get();
  const followingListsCount = followingListsSnap.size;

  // Listas y seguidos en los campos que mantienen los triggers (publicListsCount/
  // privateListsCount y followingCount). listCount y followingUsersCount se quedaban como
  // foto fija de este recuento y tapaban a esos, también al repartir medallas: se borran.
  await db.collection('users').doc(userId).set({
    reviewsCount: reviewCount,
    reviewCount,
    publicListsCount,
    privateListsCount: listCount - publicListsCount,
    listCount: FieldValue.delete(),
    listsCount: FieldValue.delete(),
    followersCount,
    followingCount,
    followingUsersCount: FieldValue.delete(),
    followingListsCount,
    lastStatsRecalc: FieldValue.serverTimestamp()
  }, { merge: true });

  return { reviewCount, reviewsCount: reviewCount, listCount, followersCount, followingCount, followingListsCount };
}

/** Una pasada por todas las valoraciones (sin filtros: no necesita índices). */
async function countReviewsByUser() {
  const entries = [];
  let lastDoc = null;
  for (;;) {
    let query = db.collectionGroup('reviews').limit(500);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;
    snap.docs.forEach((docSnap) => entries.push({ path: docSnap.ref.path, data: docSnap.data() }));
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < 500) break;
  }
  return tallyReviewsByUser(entries);
}

const adminRecalculateAllUsers = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) throw new HttpsError('unauthenticated', 'Resulta que necesitas estar logueado.');

  try {
    await assertJefeAccess(contextAuth.uid, 'Solo los jefes pueden hacer esto.');
  } catch (e) {
    if (e instanceof HttpsError) {
      throw e;
    }
    throw new HttpsError('internal', 'Error al verificar permisos.');
  }

  await writeAuditLog(contextAuth.uid, 'adminRecalculateAllUsers', {});

  const usersSnap = await db.collection('users').get();
  const results = { total: usersSnap.size, success: 0, failed: 0, errors: [] };
  const reviewCounts = await countReviewsByUser();

  for (const doc of usersSnap.docs) {
    try {
      await recalculateAggregatesForUser(doc.id, reviewCounts.get(doc.id) || 0);
      results.success++;
    } catch (e) {
      results.failed++;
      results.errors.push({ id: doc.id, error: e.message });
    }
  }
  return results;
});

// Establece custom claim `admin: true` en el token del usuario jefe.
// Tras llamarlo el frontend debe forzar un refresh del token.
const adminProvisionJefeClaim = onCall(async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) throw new HttpsError('unauthenticated', 'Debes estar autenticado.');

  await assertJefeAccess(contextAuth.uid, 'Solo los jefes pueden hacer esto.');
  await writeAuditLog(contextAuth.uid, 'adminProvisionJefeClaim', { uid: contextAuth.uid });

  const userRecord = await getAuth().getUser(contextAuth.uid);
  await getAuth().setCustomUserClaims(contextAuth.uid, {
    ...(userRecord.customClaims || {}),
    admin: true,
  });
  return { success: true };
});

// Suspensión cautelar (Términos §7): mientras se revisa una denuncia, la
// persona puede leer, editar su perfil, exportar sus datos y borrar su cuenta,
// pero no valorar, reaccionar, comentar ni chatear (reglas: canPost()).
// Claim «suspended» en el token + users/{uid}.suspension para el aviso en la app
// (que refresca el token al verlo). Siempre la pone y la quita un jefe, a mano.
const adminSetUserSuspension = onCall(async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
  await assertJefeAccess(contextAuth.uid, 'Solo los jefes pueden suspender cuentas.');

  const uid = typeof request.data?.uid === 'string' ? request.data.uid.trim() : '';
  const suspended = request.data?.suspended === true;
  const reason = typeof request.data?.reason === 'string' ? request.data.reason.trim().slice(0, 500) : '';
  const reportId = typeof request.data?.reportId === 'string' ? request.data.reportId.trim().slice(0, 128) : null;
  if (!uid) throw new HttpsError('invalid-argument', 'Falta la cuenta.');
  if (uid === contextAuth.uid) throw new HttpsError('failed-precondition', 'No puedes suspender tu propia cuenta.');

  const userRecord = await getAuth().getUser(uid);
  if (suspended && userRecord.customClaims?.admin === true) {
    throw new HttpsError('failed-precondition', 'No se puede suspender a un jefe.');
  }
  const { suspended: _old, ...otherClaims } = userRecord.customClaims || {};
  await getAuth().setCustomUserClaims(uid, suspended ? { ...otherClaims, suspended: true } : otherClaims);

  await db.collection('users').doc(uid).set({
    suspension: suspended
      ? { active: true, reason, reportId, since: FieldValue.serverTimestamp(), by: contextAuth.uid }
      : FieldValue.delete(),
  }, { merge: true });
  await writeAuditLog(contextAuth.uid, suspended ? 'adminSuspendUser' : 'adminLiftSuspension', { uid, reason, reportId });

  await sendNotification(uid, 'account_suspension', {
    message: suspended
      ? `Tu cuenta está en revisión por una denuncia${reason ? ` (${reason})` : ''}. Mientras tanto no puedes valorar, reaccionar ni chatear. Si crees que es un error, escríbenos a istaricore@gmail.com.`
      : 'Hemos revisado tu cuenta: ya puedes volver a valorar, reaccionar y chatear.',
    link: '/preferencias',
  });
  return { success: true, suspended };
});

const adminBackfillPublicProfiles = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) throw new HttpsError('unauthenticated', 'Debes estar autenticado.');

  await assertJefeAccess(contextAuth.uid, 'Solo los jefes pueden regenerar perfiles publicos.');
  await writeAuditLog(contextAuth.uid, 'adminBackfillPublicProfiles', {});

  const usersSnap = await db.collection('users').get();
  const state = { batch: db.batch(), count: 0 };
  let written = 0;

  for (const docSnap of usersSnap.docs) {
    state.batch.set(
      db.collection('publicProfiles').doc(docSnap.id),
      buildPublicProfile(docSnap.id, docSnap.data()),
      { merge: false },
    );
    state.count++;
    written++;
    await commitBatchIfNeeded(state);
  }

  await commitBatchIfNeeded(state, true);
  return { success: true, total: usersSnap.size, written };
});

const propagateAuthorFieldsToReviews = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Debes estar autenticado.');

  const requestedUserId = typeof request.data?.userId === 'string' ? request.data.userId : '';
  const targetUserId = requestedUserId || request.auth.uid;
  const fields = request.data?.fields || {};

  if (!targetUserId) {
    throw new HttpsError('invalid-argument', 'Falta userId.');
  }

  const patch = normalizeAuthorPatch(fields);
  if (!Object.keys(patch).length) {
    throw new HttpsError('invalid-argument', 'No hay campos validos que propagar.');
  }

  const isOwnProfilePatch = targetUserId === request.auth.uid &&
    !Object.prototype.hasOwnProperty.call(patch, 'authorUserType');

  if (!isOwnProfilePatch) {
    await assertJefeAccess(request.auth.uid, 'Solo los jefes pueden propagar campos de otros usuarios o roles.');
    await writeAuditLog(request.auth.uid, 'propagateAuthorFieldsToReviews', {
      targetUserId,
      fields: Object.keys(patch),
    });
  }

  return await propagateAuthorFieldsForUser(targetUserId, fields);
});

const deleteOwnAccount = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Debes estar autenticado.');

  const uid = request.auth.uid;
  const keepReviews = request.data?.keepReviews === true;
  const keepSublists = request.data?.keepSublists === true;
  const userDocSnap = await db.collection('users').doc(uid).get();
  const userData = userDocSnap.exists ? (userDocSnap.data() || {}) : {};
  const usernameLower = typeof userData.usernameLower === 'string'
    ? userData.usernameLower.trim().toLowerCase()
    : '';
  // Primero lo que está fuera de users/{uid} (necesita aún sus seguidores):
  // fotos, comentarios, foros, chats, notificaciones enviadas y archivos.
  const footprint = await cleanupUserFootprint(uid, { keepContributions: keepReviews });

  const state = { batch: db.batch(), count: 0 };
  const counters = { reviews: 0, lists: 0, subcollections: 0 };

  counters.reviews = await forEachUniqueUserReview(uid, async (docSnap) => {
    if (keepReviews) {
      state.batch.update(docSnap.ref, {
        userId: null,
        authorId: null,
        authorName: 'Usuario eliminado',
        authorPhoto: null,
        authorPhotoUrl: null,
        authorUsername: null,
      });
    } else {
      state.batch.delete(docSnap.ref);
    }
    state.count++;
    await commitBatchIfNeeded(state);
  });

  counters.lists = await handleUserOwnedLists(uid, keepSublists, state);
  counters.subcollections = await deleteKnownUserSubcollections(uid, state);

  state.batch.delete(db.collection('publicProfiles').doc(uid));
  state.count++;
  state.batch.delete(db.collection('users').doc(uid));
  state.count++;
  if (usernameLower) {
    state.batch.delete(db.collection('usernameClaims').doc(usernameLower));
    state.count++;
  }
  await commitBatchIfNeeded(state, true);
  // Lo que quede colgando de users/{uid} (p. ej. archives/*/items).
  await db.recursiveDelete(db.collection('users').doc(uid));

  await getAuth().deleteUser(uid);
  await writeAuditLog(uid, 'deleteOwnAccount', {
    keepReviews,
    keepSublists,
    counters,
    footprint,
  }, { retainDays: GDPR_AUDIT_RETAIN_DAYS });

  return { success: true, ...counters, footprint };
});

module.exports = {
  adminRecalculateAllUsers,
  adminProvisionJefeClaim,
  adminSetUserSuspension,
  adminBackfillPublicProfiles,
  propagateAuthorFieldsToReviews,
  deleteOwnAccount,
};
