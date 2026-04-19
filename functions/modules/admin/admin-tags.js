// functions/modules/admin/admin-tags.js
//
// Función admin para reemplazar etiquetas en listas y reseñas en masa.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { getFirestore } = require('firebase-admin/firestore');
const { assertJefeAccess, writeAuditLog } = require('../lib/auth');

const db = getFirestore();

function replaceTagInArray(values, fromTag, toTag) {
  if (!Array.isArray(values)) {
    return { changed: false, value: values };
  }
  const fromTrimmed = typeof fromTag === 'string' ? fromTag.trim() : '';
  const toTrimmed = typeof toTag === 'string' ? toTag.trim() : '';
  let changed = false;
  const mapped = values.reduce((acc, tag) => {
    if (typeof tag !== 'string') {
      return acc;
    }
    const trimmed = tag.trim();
    if (!trimmed) {
      return acc;
    }
    let next = trimmed;
    if (trimmed === fromTrimmed) {
      next = toTrimmed;
      changed = true;
    }
    acc.push(next);
    return acc;
  }, []);

  if (!changed) {
    return { changed: false, value: values };
  }

  const deduped = [];
  const seen = new Set();
  mapped.forEach(tag => {
    if (!seen.has(tag)) {
      seen.add(tag);
      deduped.push(tag);
    }
  });

  return { changed: true, value: deduped };
}

function buildListTagUpdate(listData, fromTag, toTag) {
  const updatePayload = {};
  let changed = false;

  const available = replaceTagInArray(listData?.availableTags, fromTag, toTag);
  if (available.changed) {
    updatePayload.availableTags = available.value;
    changed = true;
  }

  const fixed = replaceTagInArray(listData?.fixedTags, fromTag, toTag);
  if (fixed.changed) {
    updatePayload.fixedTags = fixed.value;
    changed = true;
  }

  const tagsDefinition = listData?.tagsDefinition;
  if (tagsDefinition && typeof tagsDefinition === 'object' && !Array.isArray(tagsDefinition)) {
    const nextDefinition = { ...tagsDefinition };
    let definitionChanged = false;

    const fixedDef = replaceTagInArray(tagsDefinition.fixed, fromTag, toTag);
    if (fixedDef.changed) {
      nextDefinition.fixed = fixedDef.value;
      definitionChanged = true;
    }

    const availableDef = replaceTagInArray(tagsDefinition.userAvailable, fromTag, toTag);
    if (availableDef.changed) {
      nextDefinition.userAvailable = availableDef.value;
      definitionChanged = true;
    }

    if (definitionChanged) {
      updatePayload.tagsDefinition = nextDefinition;
      changed = true;
    }
  }

  return { changed, updatePayload };
}

async function fetchReviewDocsByTag(tag) {
  try {
    const snapshot = await db.collectionGroup('reviews')
      .where('userTags', 'array-contains', tag)
      .get();
    return { docs: snapshot.docs, usedFallback: false };
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : error?.code;
    if (code === 9 || code === 'failed-precondition') {
      logger.warn('adminReplaceTag: collectionGroup query failed, fallback to per-list queries.', { code });
      const listSnapshot = await db.collection('lists').get();
      const listRefs = listSnapshot.docs.map(doc => doc.ref);
      const docs = [];
      const chunkSize = 10;

      for (let i = 0; i < listRefs.length; i += chunkSize) {
        const chunk = listRefs.slice(i, i + chunkSize);
        const chunkSnapshots = await Promise.all(chunk.map(ref =>
          ref.collection('reviews').where('userTags', 'array-contains', tag).get()
        ));
        chunkSnapshots.forEach(chunkSnap => {
          chunkSnap.forEach(doc => docs.push(doc));
        });
      }

      return { docs, usedFallback: true };
    }
    throw error;
  }
}

const adminReplaceTag = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) {
    throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
  }

  try {
    await assertJefeAccess(contextAuth.uid, 'No tienes permiso para ejecutar esta operacion.');
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error('adminReplaceTag: Error al verificar permisos', error);
    throw new HttpsError('internal', 'Error al verificar permisos.');
  }

  const { fromTag, toTag, targets, dryRun } = request.data || {};
  await writeAuditLog(contextAuth.uid, 'adminReplaceTag', {
    fromTag, toTag, targets, dryRun: !!dryRun,
  });
  const fromTrimmed = typeof fromTag === 'string' ? fromTag.trim() : '';
  const toTrimmed = typeof toTag === 'string' ? toTag.trim() : '';

  if (!fromTrimmed || !toTrimmed) {
    throw new HttpsError('invalid-argument', 'fromTag y toTag son obligatorios.');
  }
  if (fromTrimmed === toTrimmed) {
    throw new HttpsError('invalid-argument', 'Las etiquetas deben ser diferentes.');
  }

  const targetValue = typeof targets === 'string' ? targets : 'lists-reviews';
  const applyLists = targetValue === 'lists' || targetValue === 'lists-reviews' || targetValue === 'both';
  const applyReviews = targetValue === 'reviews' || targetValue === 'lists-reviews' || targetValue === 'both';
  const shouldDryRun = Boolean(dryRun);

  const summary = {
    fromTag: fromTrimmed,
    toTag: toTrimmed,
    dryRun: shouldDryRun,
    listsMatched: 0,
    listsUpdated: 0,
    reviewsMatched: 0,
    reviewsUpdated: 0
  };

  const commitBatchIfNeeded = async (batchState) => {
    if (batchState.count === 0) return;
    await batchState.batch.commit();
    batchState.batch = db.batch();
    batchState.count = 0;
  };

  if (applyLists) {
    const listsSnapshot = await db.collection('lists').get();
    const batchState = { batch: db.batch(), count: 0 };

    for (const doc of listsSnapshot.docs) {
      const listData = doc.data() || {};
      const { changed, updatePayload } = buildListTagUpdate(listData, fromTrimmed, toTrimmed);
      if (!changed) {
        continue;
      }
      summary.listsMatched += 1;
      if (!shouldDryRun) {
        batchState.batch.update(doc.ref, updatePayload);
        batchState.count += 1;
        if (batchState.count >= 450) {
          await commitBatchIfNeeded(batchState);
        }
      }
    }

    if (!shouldDryRun) {
      await commitBatchIfNeeded(batchState);
      summary.listsUpdated = summary.listsMatched;
    } else {
      summary.listsUpdated = summary.listsMatched;
    }
  }

  if (applyReviews) {
    const { docs: reviewDocs, usedFallback } = await fetchReviewDocsByTag(fromTrimmed);
    if (usedFallback) {
      logger.info('adminReplaceTag: usando fallback per-list para reseñas.');
    }

    const batchState = { batch: db.batch(), count: 0 };
    for (const doc of reviewDocs) {
      const reviewData = doc.data() || {};
      const updated = replaceTagInArray(reviewData.userTags, fromTrimmed, toTrimmed);
      if (!updated.changed) {
        continue;
      }
      summary.reviewsMatched += 1;
      if (!shouldDryRun) {
        batchState.batch.update(doc.ref, { userTags: updated.value });
        batchState.count += 1;
        if (batchState.count >= 450) {
          await commitBatchIfNeeded(batchState);
        }
      }
    }

    if (!shouldDryRun) {
      await commitBatchIfNeeded(batchState);
      summary.reviewsUpdated = summary.reviewsMatched;
    } else {
      summary.reviewsUpdated = summary.reviewsMatched;
    }
  }

  logger.info('adminReplaceTag completado', summary);
  return summary;
});

module.exports = { adminReplaceTag };
