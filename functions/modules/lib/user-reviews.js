// functions/modules/lib/user-reviews.js
const logger = require('firebase-functions/logger');

const isMissingIndex = (error) => error && (error.code === 9 || error.code === 'failed-precondition' || /requires an index/i.test(error.message || ''));

/**
 * Valoraciones de una persona por `field` ('userId' | 'authorId') en todas las
 * listas. Usa `collectionGroup(...).where(field)`, que necesita el índice de
 * grupo de colecciones sobre `reviews.<field>`. Si falta (FAILED_PRECONDITION),
 * recorre todas las valoraciones y filtra en memoria: más lento, pero no deja
 * sin funcionar borrar una cuenta. Ver Mejoras/developer-revision.md.
 */
async function userReviewDocs(db, field, userId) {
  try {
    const snap = await db.collectionGroup('reviews').where(field, '==', userId).get();
    return snap.docs;
  } catch (error) {
    if (!isMissingIndex(error)) throw error;
    logger.warn(`userReviewDocs: falta el índice reviews.${field} (grupo de colecciones); se recorre todo.`);
    const docs = [];
    let lastDoc = null;
    for (;;) {
      let query = db.collectionGroup('reviews').limit(500);
      if (lastDoc) query = query.startAfter(lastDoc);
      const snap = await query.get();
      if (snap.empty) break;
      snap.docs.forEach((docSnap) => { if ((docSnap.data() || {})[field] === userId) docs.push(docSnap); });
      lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.size < 500) break;
    }
    return docs;
  }
}

module.exports = { userReviewDocs, isMissingIndex };
