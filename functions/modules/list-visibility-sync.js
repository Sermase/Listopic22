// functions/modules/list-visibility-sync.js
//
// Cuando una lista cambia de visibilidad:
// 1) sus valoraciones pasan a la misma `visibility` (las hechas desde una
//    Minilista siguen a su Minilista);
// 2) si es una madre que pasa a privada, sus Minilistas públicas pasan a
//    privadas (y ese cambio vuelve a disparar este trigger para sus valoraciones).
// La web ya sincroniza al guardar; esto cubre cualquier otro camino (Developer,
// scripts, ediciones de jefe) y las Minilistas de otras personas.

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const { getFirestore } = require('firebase-admin/firestore');
const { listVisibility } = require('./lib/list-visibility');

const db = getFirestore();

async function commitInBatches(updates) {
  for (let i = 0; i < updates.length; i += 400) {
    const batch = db.batch();
    updates.slice(i, i + 400).forEach(({ ref, data }) => batch.update(ref, data));
    await batch.commit();
  }
}

const syncListVisibility = onDocumentUpdated('lists/{listId}', async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  const visibility = listVisibility(after);
  if (listVisibility(before) === visibility) return null;
  const listId = event.params.listId;

  // 1) Valoraciones cuya lista real es esta.
  const reviewDocs = [];
  const own = await db.collection('lists').doc(listId).collection('reviews').get();
  own.docs.forEach((d) => {
    const sub = (d.data() || {}).sublistId;
    if (!(typeof sub === 'string' && sub.trim() && sub !== listId)) reviewDocs.push(d);
  });
  if (after.parentListId) {
    const inParent = await db.collection('lists').doc(after.parentListId).collection('reviews').where('sublistId', '==', listId).get();
    reviewDocs.push(...inParent.docs);
  }
  const reviewUpdates = reviewDocs
    .filter((d) => (d.data() || {}).visibility !== visibility)
    .map((d) => ({ ref: d.ref, data: { visibility } }));
  await commitInBatches(reviewUpdates);

  // 2) Madre → privada: sus Minilistas, como máximo privadas.
  let closedMinilists = 0;
  if (visibility === 'private' && !after.parentListId) {
    const minis = await db.collection('lists').where('parentListId', '==', listId).get();
    const toClose = minis.docs.filter((d) => listVisibility(d.data()) === 'public');
    await commitInBatches(toClose.map((d) => ({ ref: d.ref, data: { isPublic: false, visibility: 'private', publicAccess: 'reader' } })));
    closedMinilists = toClose.length;
  }

  logger.info(`syncListVisibility: ${listId} → ${visibility} · ${reviewUpdates.length} valoraciones · ${closedMinilists} Minilistas cerradas`);
  return null;
});

module.exports = { syncListVisibility };
