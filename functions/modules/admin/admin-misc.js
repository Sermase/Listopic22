// functions/modules/admin/admin-misc.js
//
// Auditoría de estadísticas y acceso genérico a colecciones para admins.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { getFirestore } = require('firebase-admin/firestore');
const { assertJefeAccess, writeAuditLog } = require('../lib/auth');
const { buildGroupedItemsForList } = require('../grouped-aggregator');

const db = getFirestore();

const adminAuditStatistics = onCall(async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) {
    throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
  }

  const startTime = Date.now();
  const summary = {
    checked: { places: 0, users: 0, lists: 0 },
    updated: { places: 0, users: 0, lists: 0, groupedItems: 0 },
    errors: []
  };
  const details = {
    places: [],
    users: [],
    lists: [],
    groupedItems: []
  };

  try {
    await assertJefeAccess(contextAuth.uid);
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error('adminAuditStatistics: Error al verificar permisos de admin', error);
    throw new HttpsError('internal', 'Error al verificar permisos.');
  }

  await writeAuditLog(contextAuth.uid, 'adminAuditStatistics', {});

  const safeNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

  // --- AUDITAR LUGARES ---
  try {
    const placesSnap = await db.collection('places').get();
    summary.checked.places = placesSnap.size;

    for (const doc of placesSnap.docs) {
      const data = doc.data() || {};
      const updates = {};
      const diffs = [];

      try {
        const [reviewsCountSnap, followersCountSnap] = await Promise.all([
          db.collectionGroup('reviews').where('placeId', '==', doc.id).count().get(),
          doc.ref.collection('followers').count().get(),
        ]);

        const actualReviewCount = safeNumber(reviewsCountSnap.data().count);
        const actualFollowersCount = safeNumber(followersCountSnap.data().count);

        const storedReviewCount = safeNumber(data.reviewsCount);
        if (storedReviewCount !== actualReviewCount) {
          updates.reviewsCount = actualReviewCount;
          diffs.push({ field: 'reviewsCount', previous: storedReviewCount, value: actualReviewCount });
        }

        const storedFollowersCount = safeNumber(data.followersCount);
        if (storedFollowersCount !== actualFollowersCount) {
          updates.followersCount = actualFollowersCount;
          diffs.push({ field: 'followersCount', previous: storedFollowersCount, value: actualFollowersCount });
        }

        if (diffs.length > 0) {
          await doc.ref.update(updates);
          summary.updated.places += 1;
          details.places.push({
            id: doc.id,
            name: data.name || null,
            diffs
          });
        }
      } catch (error) {
        logger.error(`adminAuditStatistics: Error auditando lugar ${doc.id}`, error);
        summary.errors.push({ type: 'place', id: doc.id, message: error.message });
      }
    }
  } catch (error) {
    logger.error('adminAuditStatistics: Error obteniendo lugares', error);
    summary.errors.push({ type: 'places', id: null, message: error.message });
  }

  // --- AUDITAR LISTAS ---
  try {
    const listsSnap = await db.collection('lists').get();
    summary.checked.lists = listsSnap.size;

    for (const doc of listsSnap.docs) {
      const data = doc.data() || {};
      const updates = {};
      const diffs = [];
      let groupedItemsDiffAdded = false;

      try {
        const [followersSnap, commentsSnap] = await Promise.all([
          doc.ref.collection('followers').count().get(),
          doc.ref.collection('comments').count().get().catch(() => ({ data: () => ({ count: 0 }) })),
        ]);

        let reviewCount = 0;
        let groupedItemsCount = 0;
        try {
          const aggregation = await buildGroupedItemsForList(doc.id);
          reviewCount = Array.isArray(aggregation.reviews) ? aggregation.reviews.length : 0;
          groupedItemsCount = Array.isArray(aggregation.groupedReviews) ? aggregation.groupedReviews.length : 0;
        } catch (error) {
          logger.error(`adminAuditStatistics: Error generando grupos para lista ${doc.id}`, error);
          summary.errors.push({ type: 'list-grouped', id: doc.id, message: error.message });
        }

        let forumMessagesCount = 0;
        try {
          const forumCountSnap = await db.collection('listForums').doc(doc.id).collection('messages').count().get();
          forumMessagesCount = safeNumber(forumCountSnap.data().count);
        } catch (error) {
          logger.error(`adminAuditStatistics: Error contando mensajes de foro para lista ${doc.id}`, error);
          summary.errors.push({ type: 'list-forum', id: doc.id, message: error.message });
        }

        const commentsLegacyCount = safeNumber(commentsSnap.data().count);
        const totalCommentsCount = commentsLegacyCount + forumMessagesCount;
        const actualFollowersCount = safeNumber(followersSnap.data().count);

        const storedReviewCount = safeNumber(data.reviewCount);
        if (storedReviewCount !== reviewCount) {
          updates.reviewCount = reviewCount;
          diffs.push({ field: 'reviewCount', previous: storedReviewCount, value: reviewCount });
        }

        const storedFollowersCount = safeNumber(data.followersCount);
        if (storedFollowersCount !== actualFollowersCount) {
          updates.followersCount = actualFollowersCount;
          diffs.push({ field: 'followersCount', previous: storedFollowersCount, value: actualFollowersCount });
        }

        const storedCommentsCount = safeNumber(data.commentsCount);
        if (storedCommentsCount !== totalCommentsCount) {
          updates.commentsCount = totalCommentsCount;
          diffs.push({ field: 'commentsCount', previous: storedCommentsCount, value: totalCommentsCount });
        }

        const storedGroupedItemsCount = safeNumber(data.groupedItemsCount);
        if (Number.isFinite(groupedItemsCount) && storedGroupedItemsCount !== groupedItemsCount) {
          updates.groupedItemsCount = groupedItemsCount;
          diffs.push({ field: 'groupedItemsCount', previous: storedGroupedItemsCount, value: groupedItemsCount });
          groupedItemsDiffAdded = true;
        }

        if (diffs.length > 0) {
          await doc.ref.update(updates);
          summary.updated.lists += 1;
          if (groupedItemsDiffAdded) {
            summary.updated.groupedItems += 1;
            details.groupedItems.push({
              listId: doc.id,
              name: data.name || null,
              newValue: updates.groupedItemsCount,
              previousValue: storedGroupedItemsCount
            });
          }
          details.lists.push({
            id: doc.id,
            name: data.name || null,
            diffs
          });
        }
      } catch (error) {
        logger.error(`adminAuditStatistics: Error auditando lista ${doc.id}`, error);
        summary.errors.push({ type: 'list', id: doc.id, message: error.message });
      }
    }
  } catch (error) {
    logger.error('adminAuditStatistics: Error obteniendo listas', error);
    summary.errors.push({ type: 'lists', id: null, message: error.message });
  }

  // --- AUDITAR USUARIOS ---
  try {
    const usersSnap = await db.collection('users').get();
    summary.checked.users = usersSnap.size;

    for (const doc of usersSnap.docs) {
      const data = doc.data() || {};
      const updates = {};
      const diffs = [];

      try {
        const [reviewsCountSnap, followersSnap, followingSnap, publicListsSnap, privateListsSnap] = await Promise.all([
          db.collectionGroup('reviews').where('userId', '==', doc.id).count().get(),
          doc.ref.collection('followers').count().get(),
          doc.ref.collection('following').count().get(),
          db.collection('lists').where('userId', '==', doc.id).where('isPublic', '==', true).count().get(),
          db.collection('lists').where('userId', '==', doc.id).where('isPublic', '==', false).count().get(),
        ]);

        const actualReviewsCount = safeNumber(reviewsCountSnap.data().count);
        const actualFollowersCount = safeNumber(followersSnap.data().count);
        const actualFollowingCount = safeNumber(followingSnap.data().count);
        const actualPublicListsCount = safeNumber(publicListsSnap.data().count);
        const actualPrivateListsCount = safeNumber(privateListsSnap.data().count);

        let commentsCount = 0;
        try {
          const commentsSnap = await db.collectionGroup('comments').where('userId', '==', doc.id).count().get();
          commentsCount += safeNumber(commentsSnap.data().count);
        } catch (error) {
          logger.error(`adminAuditStatistics: Error contando comentarios clásicos para usuario ${doc.id}`, error);
          summary.errors.push({ type: 'user-comments', id: doc.id, message: error.message });
        }
        try {
          const forumCommentsSnap = await db.collectionGroup('messages').where('userId', '==', doc.id).count().get();
          commentsCount += safeNumber(forumCommentsSnap.data().count);
        } catch (error) {
          logger.error(`adminAuditStatistics: Error contando mensajes de foro para usuario ${doc.id}`, error);
          summary.errors.push({ type: 'user-forum-comments', id: doc.id, message: error.message });
        }

        const storedReviewsCount = safeNumber(data.reviewsCount);
        if (storedReviewsCount !== actualReviewsCount) {
          updates.reviewsCount = actualReviewsCount;
          diffs.push({ field: 'reviewsCount', previous: storedReviewsCount, value: actualReviewsCount });
        }

        const storedFollowersCount = safeNumber(data.followersCount);
        if (storedFollowersCount !== actualFollowersCount) {
          updates.followersCount = actualFollowersCount;
          diffs.push({ field: 'followersCount', previous: storedFollowersCount, value: actualFollowersCount });
        }

        const storedFollowingCount = safeNumber(data.followingCount);
        if (storedFollowingCount !== actualFollowingCount) {
          updates.followingCount = actualFollowingCount;
          diffs.push({ field: 'followingCount', previous: storedFollowingCount, value: actualFollowingCount });
        }

        const storedPublicListsCount = safeNumber(data.publicListsCount);
        if (storedPublicListsCount !== actualPublicListsCount) {
          updates.publicListsCount = actualPublicListsCount;
          diffs.push({ field: 'publicListsCount', previous: storedPublicListsCount, value: actualPublicListsCount });
        }

        const storedPrivateListsCount = safeNumber(data.privateListsCount);
        if (storedPrivateListsCount !== actualPrivateListsCount) {
          updates.privateListsCount = actualPrivateListsCount;
          diffs.push({ field: 'privateListsCount', previous: storedPrivateListsCount, value: actualPrivateListsCount });
        }

        if (Number.isFinite(commentsCount)) {
          const storedCommentsCount = safeNumber(data.commentsCount);
          if (storedCommentsCount !== commentsCount) {
            updates.commentsCount = commentsCount;
            diffs.push({ field: 'commentsCount', previous: storedCommentsCount, value: commentsCount });
          }
        }

        if (diffs.length > 0) {
          await doc.ref.update(updates);
          summary.updated.users += 1;
          details.users.push({
            id: doc.id,
            name: data.displayName || data.username || null,
            diffs
          });
        }
      } catch (error) {
        logger.error(`adminAuditStatistics: Error auditando usuario ${doc.id}`, error);
        summary.errors.push({ type: 'user', id: doc.id, message: error.message });
      }
    }
  } catch (error) {
    logger.error('adminAuditStatistics: Error obteniendo usuarios', error);
    summary.errors.push({ type: 'users', id: null, message: error.message });
  }

  const durationMs = Date.now() - startTime;
  logger.info('adminAuditStatistics finalizado', { summary, durationMs });

  return {
    summary: {
      ...summary,
      durationMs,
      completedAt: new Date().toISOString()
    },
    details
  };
});

const adminGetCollection = onCall(async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) {
    throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
  }

  try {
    await assertJefeAccess(contextAuth.uid);
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error('adminGetCollection: Error al verificar permisos de admin', error);
    throw new HttpsError('internal', 'Error al verificar permisos.');
  }

  const collectionName = request.data.collectionName;

  await writeAuditLog(contextAuth.uid, 'adminGetCollection', { collectionName });
  const allowedCollections = ['users', 'lists', 'places', 'categories', 'listForums', 'reviews'];

  if (!collectionName || !allowedCollections.includes(collectionName)) {
    throw new HttpsError('invalid-argument', 'Nombre de colección no válido o no permitido.');
  }

  try {
    const snapshot = await db.collection(collectionName).get();
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return { data };
  } catch (error) {
    logger.error(`adminGetCollection: Error obteniendo colección ${collectionName}`, error);
    throw new HttpsError('internal', 'Error al obtener la colección.');
  }
});

module.exports = { adminAuditStatistics, adminGetCollection };
