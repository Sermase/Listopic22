'use strict';

// functions/modules/lib/menu-items.js
//
// Reglas puras (sin Firebase, se prueban con node --test) de la ficha oficial
// de los platos de la carta Business Pro:
// - sanitizeItemBusinessData: reconstruye TODOS los campos de businessData.
//   Quien escribe debe mandar el objeto completo (un campo que falte vuelve a
//   su valor por defecto).
// - planMenuItemsBatch: valida el lote de updateBusinessMenuItems (≤ 50).
// - businessListProblem: la lista de Listopic que el negocio elige para un
//   plato nuevo tiene que existir y ser pública.

const { parseMenuPrice } = require('./menu-price');
const { effectiveVisibility } = require('./list-visibility');

const MAX_MENU_ORDER = 9999;
const MAX_MENU_BATCH = 50;

// Los 14 alérgenos de declaración obligatoria en la UE.
const VALID_ALLERGENS = new Set([
  'gluten', 'crustaceos', 'huevo', 'pescado', 'cacahuetes', 'soja', 'lacteos',
  'frutos_secos', 'apio', 'mostaza', 'sesamo', 'sulfitos', 'altramuces', 'moluscos',
]);

const asString = (value, maxLength = 500) => (typeof value === 'string' ? value.trim().slice(0, maxLength) : '');

/** Posición dentro de su sección (0 = primero) o null si el negocio no la ha ordenado. */
function sanitizeMenuOrder(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.min(Math.floor(value), MAX_MENU_ORDER);
}

// El precio se normaliza ("1,2" → "1,20 €") y se guardan también los céntimos
// (null si no es un número, p. ej. "Según mercado").
function sanitizeItemBusinessData(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const { price, priceCents } = parseMenuPrice(typeof raw.price === 'number' ? raw.price : asString(raw.price, 40));
  return {
    group: asString(raw.group, 60),
    price,
    priceCents,
    discount: asString(raw.discount, 80),
    ingredients: asString(raw.ingredients, 300).replace(/[<>]/g, ''),
    description: asString(raw.description, 500).replace(/[<>]/g, ''),
    allergens: Array.isArray(raw.allergens)
      ? Array.from(new Set(raw.allergens.map((entry) => asString(entry, 20)).filter((entry) => VALID_ALLERGENS.has(entry)))).slice(0, 14)
      : [],
    available: raw.available !== false,
    menuOrder: sanitizeMenuOrder(raw.menuOrder),
  };
}

/**
 * Lote de updateBusinessMenuItems: [{ itemId, data }] con 1 a 50 platos
 * distintos. Devuelve { items } con la ficha ya saneada o { error: { code,
 * message } } para lanzarlo como HttpsError.
 */
function planMenuItemsBatch(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { error: { code: 'invalid-argument', message: 'No hay platos que guardar.' } };
  }
  if (rawItems.length > MAX_MENU_BATCH) {
    return { error: { code: 'invalid-argument', message: `Como mucho ${MAX_MENU_BATCH} platos a la vez.` } };
  }
  const seen = new Set();
  const items = [];
  for (const entry of rawItems) {
    const itemId = asString(entry && entry.itemId, 300);
    if (!itemId || itemId.includes('/')) {
      return { error: { code: 'invalid-argument', message: 'Falta el plato (itemId) o no es válido.' } };
    }
    if (seen.has(itemId)) {
      return { error: { code: 'invalid-argument', message: `El plato ${itemId} viene repetido.` } };
    }
    seen.add(itemId);
    items.push({ itemId, data: sanitizeItemBusinessData(entry.data) });
  }
  return { items };
}

/**
 * ¿Se puede usar esta lista para un plato nuevo? null si sí; si no, el error.
 * `parent` es la lista madre cuando `list` es una Minilista (puede faltar).
 */
function businessListProblem(list, parent) {
  if (!list || typeof list !== 'object') {
    return { code: 'not-found', message: 'Esa lista ya no existe. Elige otra o déjalo para más tarde.' };
  }
  const name = typeof list.name === 'string' && list.name.trim() ? `«${list.name.trim()}»` : 'Esa lista';
  if (list.type === 'archive') {
    return { code: 'failed-precondition', message: `${name} no admite platos. Elige otra lista.` };
  }
  if (effectiveVisibility(list, parent) !== 'public') {
    return { code: 'failed-precondition', message: `${name} es privada. Elige una lista pública de Listopic.` };
  }
  return null;
}

module.exports = {
  MAX_MENU_BATCH,
  MAX_MENU_ORDER,
  VALID_ALLERGENS,
  sanitizeMenuOrder,
  sanitizeItemBusinessData,
  planMenuItemsBatch,
  businessListProblem,
};
