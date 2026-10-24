'use strict';

/**
 * «Apto para»: recuento anónimo de lo que aportan celíacos, intolerantes,
 * gente en silla… Cada respuesta privada (users/{uid}/aptReports/{reviewId})
 * suma en el sitio (places/{placeId}.aptFor): lo del plato por elemento y lo
 * del local en `place`. Puro: calcula la diferencia entre lo contado antes y ahora.
 */

const { itemDocIdFromName, normalizeItemName, safeDocId, typedItemName } = require('./canonical-resolve');

const ITEM_KEYS = ['glutenFree', 'lactoseFree', 'vegetarian', 'vegan'];
const PLACE_KEYS = ['stepFree', 'accessibleRestroom', 'petFriendly'];
const VALUES = ['yes', 'no'];

/** Respuestas válidas, solo las conocidas. */
function cleanAnswers(answers) {
  const out = {};
  if (!answers || typeof answers !== 'object') return out;
  [...ITEM_KEYS, ...PLACE_KEYS].forEach((key) => {
    if (VALUES.includes(answers[key])) out[key] = answers[key];
  });
  return out;
}

/** Contadores que suma una respuesta: [{ scope: 'item'|'place', key, value }]. */
function countedEntries(counted) {
  if (!counted || !counted.placeId) return [];
  const answers = cleanAnswers(counted.answers);
  return Object.entries(answers)
    .filter(([key]) => PLACE_KEYS.includes(key) || (ITEM_KEYS.includes(key) && counted.itemKey))
    .map(([key, value]) => ({ scope: PLACE_KEYS.includes(key) ? 'place' : 'item', key, value }));
}

/**
 * Incrementos por sitio para pasar de `before` a `after` (lo contado, con
 * placeId, itemKey y answers). Devuelve { [placeId]: { place: {key: {value: n}}, items: {itemKey: {key: {value: n}}} } }
 * solo con lo que cambia.
 */
function aptDeltas(before, after) {
  const deltas = {};
  const add = (counted, sign) => {
    countedEntries(counted).forEach(({ scope, key, value }) => {
      const place = (deltas[counted.placeId] = deltas[counted.placeId] || { place: {}, items: {} });
      const bucket = scope === 'place'
        ? place.place
        : (place.items[counted.itemKey] = place.items[counted.itemKey] || {});
      bucket[key] = bucket[key] || {};
      bucket[key][value] = (bucket[key][value] || 0) + sign;
    });
  };
  add(before, -1);
  add(after, 1);
  // Fuera lo que se anula (misma respuesta antes y después).
  Object.entries(deltas).forEach(([placeId, place]) => {
    const prune = (bucket) => Object.keys(bucket).forEach((key) => {
      Object.keys(bucket[key]).forEach((value) => { if (bucket[key][value] === 0) delete bucket[key][value]; });
      if (Object.keys(bucket[key]).length === 0) delete bucket[key];
    });
    prune(place.place);
    Object.keys(place.items).forEach((itemKey) => {
      prune(place.items[itemKey]);
      if (Object.keys(place.items[itemKey]).length === 0) delete place.items[itemKey];
    });
    if (Object.keys(place.place).length === 0 && Object.keys(place.items).length === 0) delete deltas[placeId];
  });
  return deltas;
}

/**
 * Elemento de la reseña, igual que reviewItemId del cliente (frontend/src/lib/placeItems.ts):
 * el canónico fijado si sigue siendo para ese nombre; si no, el slug del nombre.
 */
function aptItemKey(review) {
  const name = typedItemName(review);
  const pinned = safeDocId(review.canonicalItemId);
  if (pinned) {
    const pinnedFor = review.canonicalItemFor;
    if (pinnedFor === undefined || pinnedFor === null || pinnedFor === normalizeItemName(name)) return pinned;
  }
  return name ? itemDocIdFromName(name) : '';
}

module.exports = { ITEM_KEYS, PLACE_KEYS, cleanAnswers, aptDeltas, aptItemKey };
