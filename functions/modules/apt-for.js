'use strict';

const { onDocumentWritten, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { aptDeltas, aptItemKey, cleanAnswers } = require('./lib/apt-for');

const db = getFirestore();

/** Lo contado por cada respuesta, para restarlo al cambiarla o borrarla. Solo el servidor lo lee. */
const ledgerRef = (uid, reviewId) => db.collection('aptLedger').doc(`${uid}_${reviewId}`);

/** Convierte los deltas en un objeto con FieldValue.increment para set(..., { merge: true }). */
function incrementTree(tree) {
  const out = {};
  Object.entries(tree).forEach(([key, value]) => {
    out[key] = typeof value === 'number' ? FieldValue.increment(value) : incrementTree(value);
  });
  return out;
}

/** «Apto para»: suma o resta en places/{placeId}.aptFor lo que cambia en una respuesta privada. */
const syncAptReport = onDocumentWritten('users/{uid}/aptReports/{reviewId}', async (event) => {
  const { uid, reviewId } = event.params;
  const after = event.data?.after?.exists ? event.data.after.data() : null;

  let nextCounted = null;
  if (after?.listId) {
    const review = await db.collection('lists').doc(after.listId).collection('reviews').doc(reviewId).get();
    const data = review.exists ? review.data() : null;
    if (data && data.userId === uid && typeof data.placeId === 'string' && data.placeId) {
      nextCounted = {
        listId: after.listId,
        placeId: data.placeId,
        itemKey: aptItemKey(data),
        answers: cleanAnswers(after.answers),
      };
    }
  }

  const ref = ledgerRef(uid, reviewId);
  await db.runTransaction(async (tx) => {
    const ledger = await tx.get(ref);
    const prevCounted = ledger.exists ? ledger.data() : null;
    const deltas = aptDeltas(prevCounted, nextCounted);
    Object.entries(deltas).forEach(([placeId, tree]) => {
      tx.set(db.collection('places').doc(placeId), {
        aptFor: { ...incrementTree(tree), updatedAt: FieldValue.serverTimestamp() },
      }, { merge: true });
    });
    if (nextCounted && Object.keys(nextCounted.answers).length > 0) tx.set(ref, nextCounted);
    else if (ledger.exists) tx.delete(ref);
  });
  logger.info('aptFor: respuesta contada', { reviewId, placeId: nextCounted?.placeId || null });
  return null;
});

/** Al borrar una reseña se borra su respuesta privada (y con ella lo que sumaba). */
const deleteAptReportOnReviewDelete = onDocumentDeleted('lists/{listId}/reviews/{reviewId}', async (event) => {
  const uid = event.data?.data()?.userId;
  if (typeof uid !== 'string' || !uid) return null;
  await db.collection('users').doc(uid).collection('aptReports').doc(event.params.reviewId).delete().catch(() => null);
  return null;
});

module.exports = { syncAptReport, deleteAptReportOnReviewDelete };
