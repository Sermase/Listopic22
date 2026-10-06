'use strict';

// functions/modules/lib/spotlight-sync.js
//
// Partes puras de los platos destacados (sponsoredItemSpotlights), sin
// Firebase:
// - spotlightCenterFromPlace: centro de la campaña a partir del lugar, con
//   todas las formas de coordenadas que hay en places/ (como Algolia y la web).
// - buildSpotlightSyncPatch: qué copiar del elemento a una campaña abierta
//   (nombre actual, listas, nota, nº de reseñas; y redirigirla si el plato se
//   fusionó con otro).

const { followMerged, getItem } = require('./canonical-resolve');

const MAX_LINKED_LISTS = 40;

function isCoordinate(value, limit) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
}

// GeoPoint (getters latitude/longitude o _latitude/_longitude serializado),
// mapa {latitude, longitude} o mapa {lat, lng}.
function pointFrom(value) {
  if (!value || typeof value !== 'object') return null;
  const pairs = [
    [value.latitude, value.longitude],
    [value._latitude, value._longitude],
    [value.lat, value.lng],
  ];
  for (const [lat, lng] of pairs) {
    if (isCoordinate(lat, 90) && isCoordinate(lng, 180)) return { lat, lng };
  }
  return null;
}

/** { lat, lng } del lugar o null si no tiene coordenadas utilizables. */
function spotlightCenterFromPlace(place) {
  if (!place || typeof place !== 'object') return null;
  for (const source of [place.location, place.coordinates, place.geopoint]) {
    const point = pointFrom(source);
    if (point) return point;
  }
  return pointFrom({ lat: place.lat, lng: place.lng })
    || pointFrom({ latitude: place.latitude, longitude: place.longitude });
}

/** Elemento vigente de la campaña (siguiendo fusiones) o null si ya no está activo. */
function resolveSpotlightItem(spotlight, itemsById) {
  const originalId = String((spotlight && spotlight.itemId) || '');
  if (!originalId) return null;
  const itemId = followMerged(originalId, itemsById);
  const item = getItem(itemsById, itemId);
  if (!item || item.status === 'inactive') return null;
  return { itemId, item };
}

function sameList(a, b) {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  return left.length === right.length && left.every((value, i) => value === right[i]);
}

/**
 * Cambios para una campaña abierta (solo los campos que cambian) o null.
 * Si el plato ya no existe o está inactivo sin destino devuelve
 * { itemInactive: true }: no se reembolsa nada, decide un admin.
 */
function buildSpotlightSyncPatch(spotlight, itemsById) {
  if (!spotlight) return null;
  const resolved = resolveSpotlightItem(spotlight, itemsById);
  if (!resolved) return spotlight.itemInactive === true ? null : { itemInactive: true };

  const { itemId, item } = resolved;
  const patch = {};
  if (itemId !== spotlight.itemId) patch.itemId = itemId;
  const name = typeof item.canonicalName === 'string' ? item.canonicalName.trim() : '';
  if (name && name !== spotlight.itemName) patch.itemName = name;
  const linkedListIds = Array.isArray(item.linkedListIds) ? item.linkedListIds.slice(0, MAX_LINKED_LISTS) : [];
  if (!sameList(linkedListIds, spotlight.linkedListIds)) patch.linkedListIds = linkedListIds;
  const averageRating = typeof item.stats?.averageRating === 'number' ? item.stats.averageRating : null;
  if ((spotlight.itemAverageRating ?? null) !== averageRating) patch.itemAverageRating = averageRating;
  const reviewCount = typeof item.stats?.reviewCount === 'number' ? item.stats.reviewCount : 0;
  if (spotlight.itemReviewCount !== reviewCount) patch.itemReviewCount = reviewCount;
  if (spotlight.itemInactive === true) patch.itemInactive = false;
  return Object.keys(patch).length > 0 ? patch : null;
}

module.exports = {
  spotlightCenterFromPlace,
  resolveSpotlightItem,
  buildSpotlightSyncPatch,
};
