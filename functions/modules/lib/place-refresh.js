'use strict';

// Cuándo NO se refresca un sitio desde Google de forma automática (al valorar).
// El refresco manual de Developer (jefe) siempre puede hacerlo.

const REFRESH_MAX_AGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const toMillis = (value) => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  return null;
};

/** Sitio con propietario asignado: sus datos editables los mantiene el negocio. */
function isOwnedPlace(place) {
  if (!place) return false;
  return (typeof place.businessOwnerUserId === 'string' && place.businessOwnerUserId.trim() !== '')
    || place.businessVerified === true
    || (Array.isArray(place.businessManagerIds) && place.businessManagerIds.some((id) => typeof id === 'string' && id));
}

/** 'propietario' | 'reciente' | null (null = se puede refrescar). */
function googleRefreshSkipReason(place, now = Date.now()) {
  if (isOwnedPlace(place)) return 'propietario';
  // Solo cuentan los refrescos completos (lastGoogleSync): «Solo ubicación», estado o imagen no traen el resto.
  const last = toMillis(place && place.lastGoogleSync);
  if (last !== null && now - last < REFRESH_MAX_AGE_DAYS * DAY_MS) return 'reciente';
  return null;
}

/** { latitude, longitude } desde GeoPoint o mapa; null si no hay. */
function latLngOf(value) {
  if (!value || typeof value !== 'object') return null;
  const latitude = typeof value.latitude === 'number' ? value.latitude : value._latitude;
  const longitude = typeof value.longitude === 'number' ? value.longitude : value._longitude;
  return typeof latitude === 'number' && typeof longitude === 'number' ? { latitude, longitude } : null;
}

module.exports = { REFRESH_MAX_AGE_DAYS, isOwnedPlace, googleRefreshSkipReason, latLngOf, toMillis };
