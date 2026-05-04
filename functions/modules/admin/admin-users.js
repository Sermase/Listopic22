// functions/modules/admin/admin-users.js
//
// Recálculo masivo de estadísticas de usuario.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { assertJefeAccess, writeAuditLog } = require('../lib/auth');

const db = getFirestore();
const BATCH_LIMIT = 450;

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
    db.collectionGroup('reviews').where('userId', '==', userId).get(),
    db.collectionGroup('reviews').where('authorId', '==', userId).get(),
  ]);

  for (const snap of snapshots) {
    for (const docSnap of snap.docs) {
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

async function recalculateAggregatesForUser(userId) {
  const reviewsSnap = await db.collectionGroup('reviews').where('userId', '==', userId).get();
  const canonicalReviewKeys = new Set();
  reviewsSnap.forEach((docSnap) => {
    const pathSegments = docSnap.ref.path.split('/');
    const isCanonicalListReviewPath =
      pathSegments.length === 4 &&
      pathSegments[0] === 'lists' &&
      pathSegments[2] === 'reviews';

    if (!isCanonicalListReviewPath) return;

    const listId = pathSegments[1] || '';
    canonicalReviewKeys.add(`${listId}:${docSnap.id}`);
  });
  const reviewCount = canonicalReviewKeys.size;

  const listsSnap = await db.collection('lists').where('userId', '==', userId).get();
  const listCount = listsSnap.size;

  const followersSnap = await db.collection('users').doc(userId).collection('followers').get();
  const followersCount = followersSnap.size;

  const followingSnap = await db.collection('users').doc(userId).collection('following').get();
  const followingCount = followingSnap.size;

  const followingListsSnap = await db.collection('users').doc(userId).collection('followingLists').get();
  const followingListsCount = followingListsSnap.size;

  await db.collection('users').doc(userId).set({
    reviewsCount: reviewCount,
    reviewCount,
    listCount,
    followersCount,
    followingCount,
    followingUsersCount: followingCount,
    followingListsCount,
    lastStatsRecalc: FieldValue.serverTimestamp()
  }, { merge: true });

  return { reviewCount, reviewsCount: reviewCount, listCount, followersCount, followingCount, followingListsCount };
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

  for (const doc of usersSnap.docs) {
    try {
      await recalculateAggregatesForUser(doc.id);
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
  await commitBatchIfNeeded(state, true);

  await getAuth().deleteUser(uid);
  await writeAuditLog(uid, 'deleteOwnAccount', {
    keepReviews,
    keepSublists,
    counters,
  });

  return { success: true, ...counters };
});

module.exports = {
  adminRecalculateAllUsers,
  adminProvisionJefeClaim,
  propagateAuthorFieldsToReviews,
  deleteOwnAccount,
};
