'use strict';

// Una persona, una reseña por elemento (sitio + plato) en cada lista.
// Espejo de frontend/src/lib/reviewUniqueness.ts.

const { normalizeItemName } = require('./list-elements');

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** Clave del hueco de una reseña; null si le falta autor, lista, sitio o plato. */
function reviewSlotKey(review) {
  const userId = text(review && review.userId);
  const listId = text(review && review.listId);
  const placeId = text(review && review.placeId);
  const item = normalizeItemName(review && review.itemName);
  if (!userId || !listId || !placeId || placeId === 'unknown' || !item) return null;
  const scope = review.visibility === 'private' ? `private:${text(review.sublistId) || listId}` : 'public';
  return `${userId}|${listId}|${scope}|${placeId}|${item}`;
}

const millis = (value) => {
  if (!value) return Number.MAX_SAFE_INTEGER;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number.MAX_SAFE_INTEGER;
};

/**
 * Entre reseñas del mismo hueco se queda la más antigua (a igualdad, el id menor),
 * así dos altas simultáneas no se borran la una a la otra.
 * Devuelve el id que se conserva.
 */
function keeperId(reviews) {
  const sorted = [...reviews].sort((a, b) => millis(a.createdAt) - millis(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sorted.length > 0 ? sorted[0].id : null;
}

module.exports = { reviewSlotKey, keeperId };
