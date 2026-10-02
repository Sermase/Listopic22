'use strict';

// Elementos de una Lista: misma clave, misma zona y mismo orden que la web
// (espejo de frontend/src/lib/listElements.ts; los dos pasan
// frontend/src/lib/listElements.vectors.json).

const { normalizeCcaa, normalizeCountry } = require('./geo-areas');

/** Nombre de elemento comparable: sin tildes, mayúsculas ni signos («Bravás!» = «bravas»). */
function normalizeItemName(name) {
  return String(name == null ? '' : name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Clave de agrupación: sitio + nombre normalizado (dos locales de una cadena son dos elementos). */
function elementKey(placeId, itemName) {
  const item = normalizeItemName(itemName);
  return placeId ? `${placeId}_${item}` : item;
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** Zona de un sitio: la ciudad cae a la «locality» de Google; CCAA y país, normalizados. */
function placeGeoFields(place) {
  let city = text(place && place.city);
  if (!city && place && Array.isArray(place.addressComponents)) {
    const locality = place.addressComponents.find((c) => c && Array.isArray(c.types) && c.types.includes('locality'));
    city = text(locality && locality.long_name);
  }
  return {
    city,
    province: text(place && place.province),
    region: normalizeCcaa(place && place.region) || '',
    country: normalizeCountry(place && place.country),
  };
}

/** Estado de cierre de un sitio (el primero que haya), como la web. */
function placeClosedStatus(place) {
  return (place && (place.closedStatus || place.googleBusinessStatus || place.businessStatus)) || null;
}

/** userType de un perfil (texto o lista) incluye «bot». */
function isBotUserType(userType) {
  const types = Array.isArray(userType) ? userType : [userType];
  return types.some((type) => typeof type === 'string' && type.trim() === 'bot');
}

module.exports = { normalizeItemName, elementKey, placeGeoFields, placeClosedStatus, isBotUserType };
