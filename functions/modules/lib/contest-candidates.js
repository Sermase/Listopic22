// Lógica pura del modo concurso (sin Firestore), para probarla aparte.

const { itemDocIdFromName } = require('./canonical-resolve');

/** Aspirantes válidos de una lista: { key, placeId, itemName, photoUrl? }. */
function candidatesOf(list) {
  const raw = Array.isArray(list?.candidates) ? list.candidates : [];
  return raw.filter((c) => c && typeof c.placeId === 'string' && c.placeId && typeof c.itemName === 'string' && c.itemName.trim())
    .map((c) => ({
      key: `${c.placeId}|${c.itemName.trim().toLowerCase()}`,
      placeId: c.placeId,
      itemName: c.itemName.trim(),
      itemId: itemDocIdFromName(c.itemName),
      photoUrl: typeof c.photoUrl === 'string' ? c.photoUrl : null,
    }));
}

/** Aspirantes que entran y que salen entre dos versiones de la lista. */
function diffCandidates(before, after) {
  const prev = new Map(candidatesOf(before).map((c) => [c.key, c]));
  const next = new Map(candidatesOf(after).map((c) => [c.key, c]));
  return {
    added: [...next.values()].filter((c) => !prev.has(c.key)),
    removed: [...prev.values()].filter((c) => !next.has(c.key)),
  };
}

const ms = (value) => (value && typeof value.toMillis === 'function' ? value.toMillis() : null);

/** Concurso acabado cuyos platos deben pasar a «ya no lo sirven» y aún no se ha hecho. */
function needsCloseOut(list, now = Date.now()) {
  const contest = list?.contest;
  if (!list?.parentListId || !contest || contest.closed !== true) return false;
  if (contest.keepAvailable === true || contest.closedOutAt) return false;
  const end = ms(contest.endsAt);
  return end !== null && end < now;
}

module.exports = { candidatesOf, diffCandidates, needsCloseOut };
