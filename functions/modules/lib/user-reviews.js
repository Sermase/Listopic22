// functions/modules/lib/user-reviews.js
const logger = require('firebase-functions/logger');

const isMissingIndex = (error) => error && (error.code === 9 || error.code === 'failed-precondition' || /requires an index/i.test(error.message || ''));

/**
 * Documentos de un grupo de colecciones (`reviews`, `comments`, `photos`...)
 * cuyo `field` vale `value`. Usa `collectionGroup(group).where(field)`, que
 * necesita el índice de grupo de colecciones sobre `<group>.<field>`. Si falta
 * (FAILED_PRECONDITION), recorre el grupo entero y filtra en memoria: más
 * lento, pero no deja sin funcionar borrar una cuenta o exportar sus datos.
 * Ver Mejoras/developer-revision.md.
 */
async function collectionGroupDocsByField(db, group, field, value) {
  try {
    const snap = await db.collectionGroup(group).where(field, '==', value).get();
    return snap.docs;
  } catch (error) {
    if (!isMissingIndex(error)) throw error;
    logger.warn(`collectionGroupDocsByField: falta el índice ${group}.${field} (grupo de colecciones); se recorre todo.`);
    const docs = [];
    let lastDoc = null;
    for (;;) {
      let query = db.collectionGroup(group).limit(500);
      if (lastDoc) query = query.startAfter(lastDoc);
      const snap = await query.get();
      if (snap.empty) break;
      snap.docs.forEach((docSnap) => { if ((docSnap.data() || {})[field] === value) docs.push(docSnap); });
      lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.size < 500) break;
    }
    return docs;
  }
}

/** Valoraciones de una persona por `field` ('userId' | 'authorId') en todas las listas. */
async function userReviewDocs(db, field, userId) {
  return collectionGroupDocsByField(db, 'reviews', field, userId);
}

module.exports = { userReviewDocs, collectionGroupDocsByField, isMissingIndex };
