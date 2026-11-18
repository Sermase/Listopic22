// functions/modules/contest-candidates.js
//
// Modo concurso de las Minilistas:
// - syncContestCandidates: cada aspirante entra en la carta de su sitio
//   (places/{placeId}/items) como elemento «de concurso», aunque nadie lo haya
//   valorado aún. Al quitarlo se suelta; si nadie lo valoró, se desactiva.
// - closeOutEndedContests: al acabar un concurso con «no siguen disponibles»,
//   sus platos pasan a «ya no lo sirven» (places.unavailableItems). Un jefe los
//   reactiva desde la página del plato o Developer → Concursos.

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { normalizeItemName, zeroStats } = require('./lib/canonical-resolve');
const { candidatesOf, diffCandidates, needsCloseOut } = require('./lib/contest-candidates');

const db = getFirestore();

async function attachCandidate(listId, parentListId, candidate) {
  const placeRef = db.collection('places').doc(candidate.placeId);
  const itemRef = placeRef.collection('items').doc(candidate.itemId);
  const [placeSnap, itemSnap] = await Promise.all([placeRef.get(), itemRef.get()]);
  if (!placeSnap.exists) {
    logger.warn('contest: aspirante en un sitio que no está en Listopic', { listId, placeId: candidate.placeId });
    return;
  }
  const contestEntry = { [`contestLists.${listId}`]: parentListId || '' };
  if (!itemSnap.exists) {
    await itemRef.set({
      canonicalName: candidate.itemName,
      aliasesNormalized: [normalizeItemName(candidate.itemName)].filter(Boolean),
      source: 'contest',
      inContest: true,
      status: 'active',
      contestLists: { [listId]: parentListId || '' },
      linkedListIds: [listId, parentListId].filter(Boolean),
      ...(candidate.photoUrl ? { photoUrl: candidate.photoUrl } : {}),
      ...(candidate.diet.length > 0 ? { contestDiet: candidate.diet } : {}),
      ...(candidate.description ? { contestDescription: candidate.description } : {}),
      businessData: {},
      stats: zeroStats(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }
  const item = itemSnap.data() || {};
  const linked = new Set(Array.isArray(item.linkedListIds) ? item.linkedListIds : []);
  [listId, parentListId].filter(Boolean).forEach((id) => linked.add(id));
  await itemRef.update({
    ...contestEntry,
    inContest: true,
    linkedListIds: [...linked].sort(),
    ...(item.status === 'inactive' && !item.mergedInto ? { status: 'active' } : {}),
    // La foto del aspirante manda en los platos que creó el concurso (se puede cambiar).
    ...(candidate.photoUrl && (!item.photoUrl || item.source === 'contest') ? { photoUrl: candidate.photoUrl } : {}),
    // Detalles declarados por quien lo apuntó: el último concurso que lo toca manda.
    contestDiet: candidate.diet.length > 0 ? candidate.diet : FieldValue.delete(),
    contestDescription: candidate.description || FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function detachCandidate(listId, candidate) {
  const itemRef = db.collection('places').doc(candidate.placeId).collection('items').doc(candidate.itemId);
  const snap = await itemRef.get();
  if (!snap.exists) return;
  const item = snap.data() || {};
  if (!item.contestLists || !(listId in item.contestLists)) return;
  const rest = Object.keys(item.contestLists).filter((id) => id !== listId);
  const unreviewed = !(Number(item.stats?.reviewCount) > 0);
  await itemRef.update({
    [`contestLists.${listId}`]: FieldValue.delete(),
    ...(rest.length === 0 ? { inContest: false } : {}),
    ...(item.source === 'contest' && unreviewed && rest.length === 0 ? { status: 'inactive', linkedListIds: [] } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

const syncContestCandidates = onDocumentWritten('lists/{listId}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  const { added, removed } = diffCandidates(before, after);
  if (added.length === 0 && removed.length === 0) return null;
  const listId = event.params.listId;
  const parentListId = after?.parentListId || before?.parentListId || '';
  const results = await Promise.allSettled([
    ...added.map((c) => attachCandidate(listId, parentListId, c)),
    ...removed.map((c) => detachCandidate(listId, c)),
  ]);
  results.filter((r) => r.status === 'rejected').forEach((r) => logger.error('contest: fallo al sincronizar aspirante', { listId, error: r.reason?.message }));
  return null;
});

/** Pone los platos de un concurso acabado como «ya no lo sirven». */
async function closeOutContest(listDoc) {
  const list = listDoc.data() || {};
  const byPlace = new Map();
  candidatesOf(list).forEach((c) => byPlace.set(c.placeId, [...(byPlace.get(c.placeId) || []), c.itemName]));
  for (const [placeId, names] of byPlace) {
    const placeRef = db.collection('places').doc(placeId);
    const snap = await placeRef.get();
    if (!snap.exists) continue;
    const current = Array.isArray(snap.data()?.unavailableItems) ? snap.data().unavailableItems : [];
    const known = new Set(current.map(normalizeItemName));
    const extra = names.filter((n) => !known.has(normalizeItemName(n)));
    if (extra.length === 0) continue;
    await placeRef.update({
      unavailableItems: [...current, ...extra],
      unavailableItemsUpdatedAt: FieldValue.serverTimestamp(),
    });
  }
  await listDoc.ref.update({ 'contest.closedOutAt': FieldValue.serverTimestamp() });
  return byPlace.size;
}

const closeOutEndedContests = onSchedule({ schedule: 'every day 04:10', timeZone: 'Europe/Madrid' }, async () => {
  const now = Timestamp.now();
  // Solo los acabados en las últimas 2 semanas: los ya cerrados no se acumulan en la consulta.
  const since = Timestamp.fromMillis(now.toMillis() - 14 * 24 * 3600 * 1000);
  const snap = await db.collection('lists')
    .where('contest.endsAt', '>=', since)
    .where('contest.endsAt', '<', now)
    .limit(500)
    .get();
  for (const listDoc of snap.docs) {
    if (!needsCloseOut(listDoc.data(), now.toMillis())) continue;
    try {
      const places = await closeOutContest(listDoc);
      logger.info('contest: concurso cerrado, platos fuera de carta', { listId: listDoc.id, places });
    } catch (error) {
      logger.error('contest: no se pudo cerrar el concurso', { listId: listDoc.id, error: error?.message });
    }
  }
});

module.exports = { syncContestCandidates, closeOutEndedContests };
