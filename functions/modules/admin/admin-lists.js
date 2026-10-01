// functions/modules/admin/admin-lists.js
//
// Funciones admin para recálculo de agregados de listas.
// recalculateListReviewMetrics también es usado por los triggers de core.js.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { assertJefeAccess, writeAuditLog } = require('../lib/auth');
const { recalculateListReviewMetrics } = require('../lib/list-metrics');

const db = getFirestore();

const adminUpdateSingleListAggregates = onCall(async (request) => {
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
    logger.error('adminUpdateSingleListAggregates: Error al verificar permisos', error);
    throw new HttpsError('internal', 'Error al verificar permisos.');
  }

  const { listId } = request.data || {};

  await writeAuditLog(contextAuth.uid, 'adminUpdateSingleListAggregates', { listId });

  if (!listId) {
    throw new HttpsError('invalid-argument', 'Se requiere listId.');
  }

  const listRef = db.collection('lists').doc(listId);
  try {
    const [listMetrics, forumMsgsSnap, followersSnap] = await Promise.all([
      recalculateListReviewMetrics(listId),
      db.collection('listForums').doc(listId).collection('messages').get(),
      listRef.collection('followers').get()
    ]);

    const commentsCount = forumMsgsSnap.size;
    const followersCount = followersSnap.size;

    await listRef.update({
      commentsCount,
      followersCount,
      updatedAt: FieldValue.serverTimestamp(),
    });
    logger.info(`adminUpdateSingleListAggregates: ${listId} => r:${listMetrics?.reviewCount} c:${commentsCount} f:${followersCount}`);
    return { success: true, commentsCount, followersCount, ...(listMetrics || {}) };
  } catch (e) {
    logger.error(`adminUpdateSingleListAggregates error para ${listId}:`, e);
    throw new HttpsError('internal', 'Error al recalcular agregados de la lista.');
  }
});

// eslint-disable-next-line no-unused-vars -- archivada: fuera de exports, no se despliega
const adminRecalculateListAverages = onCall(async (request) => {
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
    logger.error('adminRecalculateListAverages: Error al verificar permisos', error);
    throw new HttpsError('internal', 'Error al verificar permisos.');
  }

  const { listId } = request.data || {};

  await writeAuditLog(contextAuth.uid, 'adminRecalculateListAverages', { listId });

  if (!listId) {
    throw new HttpsError('invalid-argument', 'Se requiere listId.');
  }

  try {
    const metrics = await recalculateListReviewMetrics(listId);
    return { success: true, ...(metrics || {}), listId };
  } catch (error) {
    logger.error(`adminRecalculateListAverages error para ${listId}:`, error);
    throw new HttpsError('internal', 'Error al recalcular medias de la lista.');
  }
});

const adminRecalculateAllLists = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) throw new HttpsError('unauthenticated', 'Auth required.');

  try {
    await assertJefeAccess(contextAuth.uid, 'Admin only.');
  } catch (e) {
    if (e instanceof HttpsError) {
      throw e;
    }
    throw new HttpsError('internal', 'Error al verificar permisos.');
  }

  await writeAuditLog(contextAuth.uid, 'adminRecalculateAllLists', {});

  const listsSnap = await db.collection('lists').get();
  const results = { total: listsSnap.size, success: 0, failed: 0, errors: [] };

  // Mismo cálculo que el trigger (lib/list-metrics): sabe leer las valoraciones
  // de una Minilista en su madre y no deja sus contadores a 0.
  for (const doc of listsSnap.docs) {
    try {
      const metrics = await recalculateListReviewMetrics(doc.id);
      if (metrics) {
        // Campo antiguo que todavía lee ListCard.
        await doc.ref.update({
          avgScore: typeof metrics.averageRating === 'number' ? Number(metrics.averageRating.toFixed(1)) : 0
        });
      }
      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({ id: doc.id, error: error.message });
    }
  }

  return results;
});

module.exports = {
  adminUpdateSingleListAggregates,
  // adminRecalculateListAverages: archivada (no se despliega); duplicaba a
  // adminUpdateSingleListAggregates, que es la que usa Developer.
  adminRecalculateAllLists,
};
