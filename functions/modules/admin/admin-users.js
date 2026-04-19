// functions/modules/admin/admin-users.js
//
// Recálculo masivo de estadísticas de usuario.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { assertJefeAccess, writeAuditLog } = require('../lib/auth');

const db = getFirestore();

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

  await getAuth().setCustomUserClaims(contextAuth.uid, { admin: true });
  return { success: true };
});

module.exports = { adminRecalculateAllUsers, adminProvisionJefeClaim };
