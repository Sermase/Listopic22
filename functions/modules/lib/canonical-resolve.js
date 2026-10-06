'use strict';

// functions/modules/lib/canonical-resolve.js
//
// Resolución pura reseña → elemento canónico de un lugar (sin Firebase, se
// prueba con node --test). La usan canonical-items.js (rebuild),
// business-items.js (alta de elementos, propuestas y reparación) y
// spotlight-sync.js.
//
// Modelo de identidad:
// - Cada elemento vive en places/{placeId}/items/{itemId}. El id es el slug del
//   nombre con el que nació y no cambia; canonicalName es el nombre visible.
// - curatedAliasesNormalized: nombres que el negocio o un admin declararon de
//   ese elemento (alta, nombres de un renombrado, nombres de una fusión). El
//   rebuild nunca los reescribe.
// - Cuando un elemento está curado, el servidor reescribe itemName de sus
//   reseñas con el canonicalName (el texto escrito queda en originalItemName).
//   Así los lectores que agrupan por nombre (listas, Algolia, GroupPage...)
//   siguen funcionando sin cambios.
// - canonicalItemId + canonicalItemFor en la reseña son derivados: solo existen
//   cuando el id resuelto no coincide con el slug de itemName, y nunca se leen
//   como entrada. Un canonicalItemId SIN canonicalItemFor es un enlace antiguo
//   (reasignación o fusión del código anterior): se respeta una vez y se
//   normaliza.

// Marcadores que canonical-items.js traduce a FieldValue.delete() y
// FieldValue.serverTimestamp() (este módulo no importa Firebase).
const DELETE = Object.freeze({ __canonicalSentinel: 'delete' });
const SERVER_TIMESTAMP = Object.freeze({ __canonicalSentinel: 'serverTimestamp' });

const FALLBACK_ITEM_NAME = 'Elemento sin nombre';
const MAX_MERGE_HOPS = 5;
const MAX_SOURCE_NAMES = 40;
// Solo se estampan reseñas en sus dos ubicaciones reales.
const REVIEW_PATH = /^(lists\/[^/]+\/reviews\/[^/]+|reviews\/[^/]+)$/;
// Campos de reseña que cambian el elemento o sus stats. Los campos que solo
// escribe el servidor (canonicalItemId, canonicalItemFor, canonicalItemName,
// originalItemName, itemNameCanonicalizedAt) nunca disparan un rebuild.
const SIGNAL_FIELDS = ['placeId', 'listId', 'parentListId', 'itemName', 'itemNameOriginal', 'overallRating', 'photoUrl'];

function normalizeItemName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function itemDocIdFromName(value) {
  const normalized = normalizeItemName(value);
  return normalized
    ? normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 140)
    : 'sin-nombre';
}

function safeDocId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/\//g, '-').slice(0, 300);
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasValue(value) {
  return value !== undefined && value !== null;
}

function toItemMap(itemsById) {
  if (itemsById instanceof Map) return itemsById;
  const map = new Map();
  Object.entries(itemsById || {}).forEach(([id, item]) => map.set(id, item));
  return map;
}

function getItem(itemsById, itemId) {
  if (!itemId || !itemsById) return null;
  if (itemsById instanceof Map) return itemsById.get(itemId) || null;
  return Object.prototype.hasOwnProperty.call(itemsById, itemId) ? itemsById[itemId] || null : null;
}

function curatedAliasesOf(item) {
  if (!item || !Array.isArray(item.curatedAliasesNormalized)) return [];
  return Array.from(new Set(item.curatedAliasesNormalized.map(normalizeItemName).filter(Boolean)));
}

// Nombres sin letras latinas ni cifras ('寿司', '🍺') no tienen nombre
// normalizado (todos darían el slug 'sin-nombre'): se comparan tal cual, sin
// mayúsculas ni espacios en los extremos, como en createBusinessItem. Sus
// alias curados van aparte, en curatedRawAliases.
function rawNameKey(value) {
  return String(value || '').trim().toLowerCase();
}

function rawAliasesOf(item) {
  if (!item || !Array.isArray(item.curatedRawAliases)) return [];
  return Array.from(new Set(item.curatedRawAliases
    .filter((name) => typeof name === 'string' && !normalizeItemName(name))
    .map(rawNameKey)
    .filter(Boolean)));
}

/** Reparte nombres en alias normalizados y alias tal cual (los no normalizables). */
function splitCuratedNames(names) {
  const normalized = new Set();
  const raw = new Set();
  (names || []).forEach((name) => {
    if (typeof name !== 'string') return;
    const key = normalizeItemName(name);
    if (key) normalized.add(key);
    else if (rawNameKey(name)) raw.add(rawNameKey(name));
  });
  return { normalized: Array.from(normalized), raw: Array.from(raw) };
}

/** Mismo nombre de plato: por nombre normalizado o, si no lo hay, tal cual. */
function sameItemName(a, b) {
  const left = normalizeItemName(a);
  const right = normalizeItemName(b);
  if (left || right) return left === right;
  return rawNameKey(a) === rawNameKey(b);
}

/** ¿El nombre escrito es un alias curado del elemento? */
function isCuratedAliasOf(item, name) {
  const normalized = normalizeItemName(name);
  if (normalized) return curatedAliasesOf(item).includes(normalized);
  const raw = rawNameKey(name);
  return Boolean(raw) && rawAliasesOf(item).includes(raw);
}

function canonicalNameOf(item) {
  return item && typeof item.canonicalName === 'string' ? item.canonicalName.trim() : '';
}

/** Texto que escribió el autor (o el que tenga la reseña), sin fallback. */
function typedItemName(review) {
  return String((review && (review.itemName || review.itemNameOriginal || review.canonicalItemName)) || '').trim();
}

// Un dato de la ficha cuenta si el negocio lo rellenó: se ignoran las marcas de
// auditoría y available:true (valor por defecto).
function hasMeaningfulBusinessData(businessData) {
  if (!businessData || typeof businessData !== 'object') return false;
  return Object.entries(businessData).some(([key, value]) => {
    if (key === 'updatedAt' || key === 'updatedBy') return false;
    if (key === 'available') return value === false;
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return false;
  });
}

function isBusinessCurated(item) {
  if (!item) return false;
  return item.source === 'business'
    || item.businessCreated === true
    || curatedAliasesOf(item).length > 0
    || rawAliasesOf(item).length > 0
    || hasMeaningfulBusinessData(item.businessData);
}

/**
 * Índice nombre normalizado → itemId con los elementos no inactivos (su
 * canonicalName y sus alias curados). Si dos elementos reclaman el mismo
 * nombre gana, por este orden: el curado por el negocio, el que lo tiene como
 * canonicalName (frente a un alias), el que tiene ese slug como id y el id
 * menor. Los conflictos se devuelven con el ganador primero.
 */
function buildAliasIndex(itemsById) {
  const items = toItemMap(itemsById);
  const candidates = new Map();
  const addCandidate = (name, itemId, viaCanonical) => {
    if (!name) return;
    if (!candidates.has(name)) candidates.set(name, new Map());
    const byItem = candidates.get(name);
    byItem.set(itemId, Boolean(viaCanonical || byItem.get(itemId)));
  };

  for (const [itemId, item] of items.entries()) {
    if (!item || item.status === 'inactive') continue;
    addCandidate(normalizeItemName(item.canonicalName), itemId, true);
    curatedAliasesOf(item).forEach((alias) => addCandidate(alias, itemId, false));
  }

  const index = new Map();
  const conflicts = [];
  for (const [name, byItem] of candidates.entries()) {
    const ids = Array.from(byItem.keys());
    if (ids.length === 1) {
      index.set(name, ids[0]);
      continue;
    }
    const slug = itemDocIdFromName(name);
    const rank = (itemId) => [
      isBusinessCurated(items.get(itemId)) ? 0 : 1,
      byItem.get(itemId) ? 0 : 1,
      itemId === slug ? 0 : 1,
    ];
    ids.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      for (let i = 0; i < ra.length; i += 1) {
        if (ra[i] !== rb[i]) return ra[i] - rb[i];
      }
      return a < b ? -1 : a > b ? 1 : 0;
    });
    index.set(name, ids[0]);
    conflicts.push({ name, itemIds: ids });
  }
  conflicts.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { index, conflicts };
}

/** Sigue mergedInto mientras el elemento esté inactivo (máx. 5 saltos, sin ciclos). */
function followMerged(itemId, itemsById) {
  let current = itemId;
  const seen = new Set([current]);
  for (let hop = 0; hop < MAX_MERGE_HOPS; hop += 1) {
    const item = getItem(itemsById, current);
    if (!item || item.status !== 'inactive' || !item.mergedInto) break;
    const next = safeDocId(item.mergedInto);
    // Un destino que ya no existe no se sigue: no queremos crear un elemento fantasma.
    if (!next || seen.has(next) || !getItem(itemsById, next)) break;
    seen.add(next);
    current = next;
  }
  return current;
}

/**
 * Índice nombre tal cual → itemId de los elementos no inactivos cuyo nombre no
 * se puede normalizar (su canonicalName y sus curatedRawAliases). Gana el
 * curado por el negocio, luego el que lo tiene como canonicalName y luego el
 * id menor.
 */
function buildRawNameIndex(itemsById) {
  const items = toItemMap(itemsById);
  const candidates = new Map();
  const addCandidate = (key, itemId, viaCanonical) => {
    if (!key) return;
    if (!candidates.has(key)) candidates.set(key, new Map());
    const byItem = candidates.get(key);
    byItem.set(itemId, Boolean(viaCanonical || byItem.get(itemId)));
  };
  for (const [itemId, item] of items.entries()) {
    if (!item || item.status === 'inactive') continue;
    const name = canonicalNameOf(item);
    if (name && !normalizeItemName(name)) addCandidate(rawNameKey(name), itemId, true);
    rawAliasesOf(item).forEach((alias) => addCandidate(alias, itemId, false));
  }
  const index = new Map();
  for (const [key, byItem] of candidates.entries()) {
    const rank = (itemId) => [isBusinessCurated(items.get(itemId)) ? 0 : 1, byItem.get(itemId) ? 0 : 1];
    const winner = Array.from(byItem.keys()).sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      return (ra[0] - rb[0]) || (ra[1] - rb[1]) || (a < b ? -1 : a > b ? 1 : 0);
    })[0];
    index.set(key, winner);
  }
  return index;
}

function createResolveContext(itemsById) {
  const items = toItemMap(itemsById);
  return { itemsById: items, aliasIndex: buildAliasIndex(items).index, rawNameIndex: buildRawNameIndex(items) };
}

/**
 * Elemento al que pertenece una reseña:
 * enlace antiguo (canonicalItemId sin canonicalItemFor, si el elemento existe)
 * → índice de alias (o el nombre tal cual si no se puede normalizar) → slug
 * del nombre escrito; y luego se siguen las fusiones.
 */
function resolveReview(review, ctx = {}) {
  const itemsById = ctx.itemsById ? toItemMap(ctx.itemsById) : new Map();
  const aliasIndex = ctx.aliasIndex instanceof Map
    ? ctx.aliasIndex
    : (ctx.aliasIndex && ctx.aliasIndex.index instanceof Map ? ctx.aliasIndex.index : buildAliasIndex(itemsById).index);
  const typed = typedItemName(review);

  let itemId = '';
  let via = 'slug';
  const pinned = safeDocId(review && review.canonicalItemId);
  if (pinned && !hasValue(review.canonicalItemFor) && getItem(itemsById, pinned)) {
    itemId = pinned;
    via = 'pin';
  }
  if (!itemId) {
    const normalized = normalizeItemName(typed);
    let aliased = null;
    if (normalized) aliased = aliasIndex.get(normalized);
    else if (typed) {
      const rawNameIndex = ctx.rawNameIndex instanceof Map ? ctx.rawNameIndex : buildRawNameIndex(itemsById);
      aliased = rawNameIndex.get(rawNameKey(typed));
    }
    if (aliased) {
      itemId = aliased;
      via = 'alias';
    }
  }
  if (!itemId) {
    itemId = itemDocIdFromName(typed);
    via = 'slug';
  }
  const finalId = followMerged(itemId, itemsById);
  return { itemId: finalId, via, followedMerge: finalId !== itemId };
}

/**
 * Cambios que el servidor escribe en una copia de la reseña tras resolverla.
 * Devuelve { patch, renamed } o null si no cambia nada (idempotente).
 */
function planReviewStamp(review, resolution, targetItem) {
  if (!review || !resolution || !resolution.itemId) return null;
  const typed = typedItemName(review);
  const canonicalName = canonicalNameOf(targetItem);
  const shouldRename = Boolean(canonicalName)
    && !sameItemName(typed, canonicalName)
    && (resolution.via === 'pin' || resolution.followedMerge === true || isCuratedAliasOf(targetItem, typed));

  const patch = {};
  const finalName = shouldRename ? canonicalName : typed;
  if (shouldRename) {
    if (review.itemName !== finalName) patch.itemName = finalName;
    if (review.itemNameLower !== finalName.toLowerCase()) patch.itemNameLower = finalName.toLowerCase();
    if (!review.originalItemName && typed) patch.originalItemName = typed;
    patch.itemNameCanonicalizedAt = SERVER_TIMESTAMP;
  }

  const desiredId = resolution.itemId !== itemDocIdFromName(finalName) ? resolution.itemId : null;
  if (desiredId) {
    const forName = normalizeItemName(finalName);
    if (review.canonicalItemId !== desiredId) patch.canonicalItemId = desiredId;
    if (review.canonicalItemFor !== forName) patch.canonicalItemFor = forName;
  } else {
    if (review.canonicalItemId !== undefined) patch.canonicalItemId = DELETE;
    if (review.canonicalItemFor !== undefined) patch.canonicalItemFor = DELETE;
  }
  if (review.canonicalItemName !== undefined) patch.canonicalItemName = DELETE;

  if (Object.keys(patch).length === 0) return null;
  return { patch, renamed: shouldRename };
}

/**
 * Cambios de una copia de reseña que un admin mueve a otro elemento
 * (propuesta reassign_review aprobada). El nombre escrito no pasa a ser alias.
 */
function planReassignStamp(review, targetItemId, targetItem) {
  const canonicalName = canonicalNameOf(targetItem) || targetItemId;
  const typed = typedItemName(review);
  const patch = {
    itemName: canonicalName,
    itemNameLower: canonicalName.toLowerCase(),
    itemNameCanonicalizedAt: SERVER_TIMESTAMP,
    canonicalItemName: DELETE,
  };
  if (!review.originalItemName && typed && typed !== canonicalName) patch.originalItemName = typed;
  // Los derivados quedan ya como los dejaría el rebuild (menos escrituras).
  if (targetItemId !== itemDocIdFromName(canonicalName)) {
    patch.canonicalItemId = targetItemId;
    patch.canonicalItemFor = normalizeItemName(canonicalName);
  } else {
    patch.canonicalItemId = DELETE;
    patch.canonicalItemFor = DELETE;
  }
  return patch;
}

function sameJson(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function sameTimestamp(a, b) {
  if (!hasValue(a) && !hasValue(b)) return true;
  if (!hasValue(a) || !hasValue(b)) return false;
  if (typeof a.isEqual === 'function') {
    try {
      return a.isEqual(b);
    } catch (_) { /* tipos distintos: se compara abajo */ }
  }
  const toMs = (value) => (typeof value.toMillis === 'function' ? value.toMillis()
    : value instanceof Date ? value.getTime() : null);
  const ma = toMs(a);
  const mb = toMs(b);
  if (ma !== null && mb !== null) return ma === mb;
  return sameJson(a, b);
}

/**
 * ¿Una escritura de reseña obliga a reconstruir los elementos del lugar? Las
 * escrituras que solo hace el servidor (estampar el nombre canónico o los
 * derivados) no: quien las escribe ya ha reconstruido.
 */
function hasCanonicalItemSignalChanged(beforeData, afterData) {
  const changed = SIGNAL_FIELDS.filter((field) => !sameJson(beforeData?.[field], afterData?.[field]));
  const scoresChanged = JSON.stringify(beforeData?.scores || {}) !== JSON.stringify(afterData?.scores || {});
  if (changed.length === 0 && !scoresChanged) return false;
  const onlyServerRename = !scoresChanged
    && changed.every((field) => field === 'itemName')
    && !sameTimestamp(beforeData?.itemNameCanonicalizedAt, afterData?.itemNameCanonicalizedAt);
  return !onlyServerRename;
}

// ── Agregados (misma aritmética que el rebuild anterior) ─────────────────────

function getReviewListId(review, fallbackListId) {
  return String(review.listId || fallbackListId || review.parentListId || 'sin-lista').trim() || 'sin-lista';
}

function addCriteriaScores(target, scores) {
  if (!scores || typeof scores !== 'object') return;
  Object.entries(scores).forEach(([key, value]) => {
    if (!isNumber(value)) return;
    if (!target[key]) target[key] = { total: 0, count: 0 };
    target[key].total += value;
    target[key].count += 1;
  });
}

function summarizeCriteria(criteriaTotals) {
  const result = {};
  Object.entries(criteriaTotals || {}).forEach(([key, value]) => {
    const count = value.count || 0;
    if (count <= 0) return;
    result[key] = {
      count,
      total: Number(value.total.toFixed(4)),
      average: Number((value.total / count).toFixed(2)),
    };
  });
  return result;
}

function sortedSourceNames(nameCounts) {
  return Array.from(nameCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'))
    .slice(0, MAX_SOURCE_NAMES);
}

function chooseCanonicalName(existingItem, reviewNameCounts, fallbackName) {
  const current = canonicalNameOf(existingItem);
  if (current) return current;
  const first = sortedSourceNames(reviewNameCounts)[0]?.name;
  return first || String(fallbackName || FALLBACK_ITEM_NAME).trim();
}

function zeroStats() {
  return {
    reviewCount: 0,
    ratingCount: 0,
    ratingTotal: 0,
    averageRating: null,
    photoCount: 0,
    criteriaStats: {},
  };
}

function statsAreZero(stats) {
  if (!stats || typeof stats !== 'object') return false;
  return (stats.reviewCount || 0) === 0
    && (stats.ratingCount || 0) === 0
    && (stats.ratingTotal || 0) === 0
    && !hasValue(stats.averageRating)
    && (stats.photoCount || 0) === 0
    && Object.keys(stats.criteriaStats || {}).length === 0;
}

function sortedStrings(values) {
  return Array.from(new Set((values || []).filter((value) => typeof value === 'string' && value))).sort();
}

function sameStringSet(a, b) {
  const left = sortedStrings(Array.isArray(a) ? a : []);
  const right = sortedStrings(Array.isArray(b) ? b : []);
  return left.length === right.length && left.every((value, i) => value === right[i]);
}

/** Agrupa las copias root + anidada de una misma reseña (la anidada manda). */
function groupReviewCopies(reviews) {
  const byId = new Map();
  (reviews || []).forEach((review, position) => {
    if (!review) return;
    const id = hasValue(review.id) ? String(review.id) : `__sin-id-${position}`;
    const isNested = String(review.refPath || '').startsWith('lists/');
    if (!byId.has(id)) {
      byId.set(id, { id, primary: review, copies: [review] });
      return;
    }
    const group = byId.get(id);
    group.copies.push(review);
    if (isNested) group.primary = review;
  });
  return Array.from(byId.values());
}

/** Elementos no inactivos que comparten nombre visible (para revisar a mano). */
function findDuplicateItems(itemsById) {
  const byName = new Map();
  for (const [itemId, item] of toItemMap(itemsById).entries()) {
    if (!item || item.status === 'inactive') continue;
    const name = normalizeItemName(item.canonicalName);
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(itemId);
  }
  return Array.from(byName.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([name, ids]) => ({ name, itemIds: ids.sort() }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function withoutSentinels(data) {
  const result = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    if (value === DELETE) {
      result[key] = undefined;
      return;
    }
    if (value === SERVER_TIMESTAMP) return;
    result[key] = value;
  });
  return result;
}

function applyToItem(item, data) {
  const next = { ...(item || {}) };
  Object.entries(withoutSentinels(data)).forEach(([key, value]) => {
    if (value === undefined) delete next[key];
    else next[key] = value;
  });
  return next;
}

/**
 * Plan completo del rebuild de un lugar, sin efectos. `reviews` son TODAS las
 * copias (root y anidadas) con { id, refPath, fallbackListId, ...datos };
 * `itemsById` los elementos actuales del lugar. Devuelve:
 * - itemWrites: elementos con reseñas. `data` solo trae campos derivados;
 *   `createData` (solo si el elemento es nuevo) trae además canonicalName,
 *   source, businessData y createdAt.
 * - emptyItemWrites: elementos sin reseñas que cambian (stats a cero, estado,
 *   fusión de duplicados comunitarios). Sus listStats se borran.
 * - reviewStamps: escrituras por copia de reseña.
 * - itemsAfter: los elementos como quedarían (para patrocinados e informes).
 */
function planPlaceRebuild({ reviews = [], itemsById } = {}) {
  const items = toItemMap(itemsById);
  const { index: aliasIndex, conflicts } = buildAliasIndex(items);
  const ctx = { itemsById: items, aliasIndex, rawNameIndex: buildRawNameIndex(items) };
  const groups = groupReviewCopies(reviews);

  const aggregates = new Map();
  const reviewStamps = [];
  let stampedReviews = 0;
  let renamedReviews = 0;

  for (const { id: reviewId, primary, copies } of groups) {
    const resolution = resolveReview(primary, ctx);
    const target = items.get(resolution.itemId) || null;

    let stamped = false;
    let renamed = false;
    let primaryName = typedItemName(primary) || FALLBACK_ITEM_NAME;
    for (const copy of copies) {
      if (copy.refPath && !REVIEW_PATH.test(copy.refPath)) continue;
      const stamp = planReviewStamp(copy, resolution, target);
      if (!stamp) continue;
      if (copy === primary && stamp.renamed) primaryName = stamp.patch.itemName || primaryName;
      stamped = true;
      renamed = renamed || stamp.renamed;
      reviewStamps.push({
        refPath: copy.refPath,
        reviewId,
        itemId: resolution.itemId,
        patch: stamp.patch,
        renamed: stamp.renamed,
      });
    }
    if (stamped) stampedReviews += 1;
    if (renamed) renamedReviews += 1;

    const itemId = resolution.itemId;
    const rawName = String(primaryName).trim();
    const normalizedName = normalizeItemName(rawName);
    const listId = getReviewListId(primary, primary.fallbackListId);
    if (!aggregates.has(itemId)) {
      aggregates.set(itemId, {
        itemId,
        nameCounts: new Map(),
        aliasesNormalized: new Set(),
        linkedListIds: new Set(),
        reviewCount: 0,
        ratingCount: 0,
        ratingTotal: 0,
        photoCount: 0,
        criteriaTotals: {},
        listStats: new Map(),
      });
    }
    const item = aggregates.get(itemId);
    item.reviewCount += 1;
    item.linkedListIds.add(listId);
    if (rawName) item.nameCounts.set(rawName, (item.nameCounts.get(rawName) || 0) + 1);
    if (normalizedName) item.aliasesNormalized.add(normalizedName);
    if (isNumber(primary.overallRating)) {
      item.ratingCount += 1;
      item.ratingTotal += primary.overallRating;
    }
    if (primary.photoUrl || (Array.isArray(primary.photoUrls) && primary.photoUrls.length > 0)) {
      item.photoCount += 1;
    }
    addCriteriaScores(item.criteriaTotals, primary.scores);

    if (!item.listStats.has(listId)) {
      item.listStats.set(listId, { listId, reviewCount: 0, ratingCount: 0, ratingTotal: 0, criteriaTotals: {} });
    }
    const listStat = item.listStats.get(listId);
    listStat.reviewCount += 1;
    if (isNumber(primary.overallRating)) {
      listStat.ratingCount += 1;
      listStat.ratingTotal += primary.overallRating;
    }
    addCriteriaScores(listStat.criteriaTotals, primary.scores);
  }

  const itemsAfter = new Map();
  items.forEach((item, itemId) => itemsAfter.set(itemId, { ...item }));

  const itemWrites = [];
  for (const aggregate of aggregates.values()) {
    const existing = items.get(aggregate.itemId) || null;
    const sourceNames = sortedSourceNames(aggregate.nameCounts);
    const canonicalName = chooseCanonicalName(existing, aggregate.nameCounts, sourceNames[0]?.name);
    const aliases = new Set(aggregate.aliasesNormalized);
    curatedAliasesOf(existing).forEach((alias) => aliases.add(alias));
    const canonicalNormalized = normalizeItemName(canonicalName);
    if (canonicalNormalized) aliases.add(canonicalNormalized);
    const linkedListIds = new Set(aggregate.linkedListIds);
    if (Array.isArray(existing?.businessListIds)) existing.businessListIds.forEach((listId) => linkedListIds.add(listId));

    const data = {
      aliasesNormalized: Array.from(aliases).sort(),
      sourceNames,
      linkedListIds: sortedStrings(Array.from(linkedListIds)),
      status: existing?.status === 'unavailable' ? 'unavailable' : 'active',
      stats: {
        reviewCount: aggregate.reviewCount,
        ratingCount: aggregate.ratingCount,
        ratingTotal: Number(aggregate.ratingTotal.toFixed(4)),
        averageRating: aggregate.ratingCount > 0 ? Number((aggregate.ratingTotal / aggregate.ratingCount).toFixed(2)) : null,
        photoCount: aggregate.photoCount,
        criteriaStats: summarizeCriteria(aggregate.criteriaTotals),
      },
      updatedAt: SERVER_TIMESTAMP,
    };
    // Un elemento existente sin nombre (datos antiguos) recibe uno; nunca se
    // reescribe el que ya tiene.
    if (existing && !canonicalNameOf(existing)) data.canonicalName = canonicalName;
    const createData = existing ? null : {
      ...data,
      canonicalName,
      source: 'community',
      businessData: {},
      createdAt: SERVER_TIMESTAMP,
    };
    const listStats = Array.from(aggregate.listStats.values()).map((stat) => ({
      listId: stat.listId,
      reviewCount: stat.reviewCount,
      ratingCount: stat.ratingCount,
      ratingTotal: Number(stat.ratingTotal.toFixed(4)),
      averageRating: stat.ratingCount > 0 ? Number((stat.ratingTotal / stat.ratingCount).toFixed(2)) : null,
      criteriaStats: summarizeCriteria(stat.criteriaTotals),
      updatedAt: SERVER_TIMESTAMP,
    }));

    itemWrites.push({ itemId: aggregate.itemId, isNew: !existing, data, createData, listStats });
    itemsAfter.set(aggregate.itemId, applyToItem(existing || { id: aggregate.itemId }, createData || data));
  }

  const emptyItemWrites = [];
  let deactivatedItems = 0;
  let mergedItems = 0;
  for (const [itemId, existing] of items.entries()) {
    if (aggregates.has(itemId) || !existing) continue;
    const currentStatus = existing.status || 'active';
    const data = {};
    let deactivate = false;
    let mergedInto = null;

    if (isBusinessCurated(existing)) {
      // Carta oficial: sigue visible sin reseñas, con stats a cero.
      const linked = sortedStrings(Array.isArray(existing.businessListIds) ? existing.businessListIds : []);
      if (!statsAreZero(existing.stats)) data.stats = zeroStats();
      if (!sameStringSet(existing.linkedListIds, linked) || !Array.isArray(existing.linkedListIds)) data.linkedListIds = linked;
    } else {
      const status = currentStatus === 'unavailable' ? 'unavailable' : 'inactive';
      if (currentStatus !== status) {
        data.status = status;
        deactivate = status === 'inactive';
      }
      if (!statsAreZero(existing.stats)) data.stats = zeroStats();
      if (!Array.isArray(existing.linkedListIds) || existing.linkedListIds.length > 0) data.linkedListIds = [];
      // Duplicado comunitario de un nombre que ya es de otro elemento: se
      // fusiona con él para que los enlaces viejos lleven al bueno.
      if (status === 'inactive' && !existing.mergedInto) {
        const owner = aliasIndex.get(normalizeItemName(existing.canonicalName));
        if (owner && owner !== itemId) {
          data.mergedInto = owner;
          mergedInto = owner;
        }
      }
    }

    if (Object.keys(data).length === 0) continue;
    data.updatedAt = SERVER_TIMESTAMP;
    if (deactivate) deactivatedItems += 1;
    if (mergedInto) mergedItems += 1;
    emptyItemWrites.push({ itemId, data, deactivate, mergedInto });
    itemsAfter.set(itemId, applyToItem(existing, data));
  }

  const activeMergedItems = Array.from(itemsAfter.entries())
    .filter(([, item]) => item && item.status !== 'inactive' && item.mergedInto)
    .map(([itemId]) => itemId)
    .sort();

  return {
    itemWrites,
    emptyItemWrites,
    reviewStamps,
    itemsAfter,
    conflicts,
    duplicates: findDuplicateItems(itemsAfter),
    activeMergedItems,
    resolveContext: ctx,
    summary: {
      itemCount: aggregates.size,
      reviewCount: groups.length,
      stampedReviews,
      renamedReviews,
      deactivatedItems,
      mergedItems,
    },
  };
}

// ── Reparación de datos antiguos (adminRepairPlaceItems) ─────────────────────

function toMillis(value) {
  if (!hasValue(value)) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (isNumber(value._seconds)) return value._seconds * 1000;
  if (isNumber(value.seconds)) return value.seconds * 1000;
  return 0;
}

/**
 * Siembra en memoria lo que el modelo nuevo necesita y los datos antiguos no
 * tienen: alias curados (alta de negocio, renombrados y fusiones aprobados),
 * fusiones reactivadas y enlaces de reasignación perdidos al mover la reseña
 * de lista. Devuelve los elementos y reseñas sembrados (para planPlaceRebuild)
 * y las escrituras que lo persisten.
 */
function seedRepairPlan({ itemsById, proposals = [], reviews = [] } = {}) {
  const original = toItemMap(itemsById);
  const items = new Map();
  original.forEach((item, itemId) => items.set(itemId, {
    ...item,
    curatedAliasesNormalized: curatedAliasesOf(item),
    curatedRawAliases: rawAliasesOf(item),
  }));

  const patches = new Map();
  const patchFor = (itemId) => {
    if (!patches.has(itemId)) patches.set(itemId, { itemId, addCuratedAliases: new Set(), addCuratedRawAliases: new Set() });
    return patches.get(itemId);
  };
  const addAliases = (itemId, names) => {
    const item = items.get(itemId);
    if (!item) return;
    const { normalized, raw } = splitCuratedNames(names);
    normalized.forEach((alias) => {
      if (item.curatedAliasesNormalized.includes(alias)) return;
      item.curatedAliasesNormalized.push(alias);
      patchFor(itemId).addCuratedAliases.add(alias);
    });
    raw.forEach((alias) => {
      if (item.curatedRawAliases.includes(alias)) return;
      item.curatedRawAliases.push(alias);
      patchFor(itemId).addCuratedRawAliases.add(alias);
    });
  };

  const ordered = (proposals || [])
    .filter((proposal) => proposal && proposal.payload)
    .slice()
    .sort((a, b) => (toMillis(a.reviewedAt) - toMillis(b.reviewedAt)) || (toMillis(a.createdAt) - toMillis(b.createdAt)));

  const mergeAtBySource = new Map();
  ordered.filter((proposal) => proposal.type === 'merge').forEach((proposal) => {
    const sourceId = safeDocId(proposal.payload.sourceItemId);
    if (sourceId) mergeAtBySource.set(sourceId, toMillis(proposal.reviewedAt));
  });

  // El negocio volvió a crear el plato después de su última fusión aprobada
  // (alta antigua con merge, o alta nueva que revive el slug): sigue activo.
  // Se mira en cada pasada, no solo cuando aún tiene el mergedInto viejo, para
  // que una segunda reparación no lo vuelva a fusionar.
  const recreatedAfterMerge = (itemId) => {
    const item = items.get(itemId);
    const mergedAt = mergeAtBySource.get(itemId) || 0;
    return Boolean(item) && item.source === 'business' && Boolean(item.createdBy)
      && mergedAt > 0 && toMillis(item.createdAt) > mergedAt;
  };

  // 1) Elementos activos con mergedInto: o la fusión se reactivó con reseñas
  //    nuevas (vuelve a inactivo), o el negocio volvió a crear ese plato
  //    después de la fusión (se queda activo y pierde el mergedInto viejo).
  let fixedMergedItems = 0;
  for (const [itemId, item] of items.entries()) {
    if (item.status === 'inactive' || !item.mergedInto) continue;
    if (recreatedAfterMerge(itemId)) {
      delete item.mergedInto;
      patchFor(itemId).clearMergedInto = true;
    } else {
      item.status = 'inactive';
      patchFor(itemId).status = 'inactive';
    }
    fixedMergedItems += 1;
  }

  // 2) Propuestas aprobadas, en el orden en que se aprobaron.
  const pinsByRefPath = new Map();
  for (const proposal of ordered) {
    const payload = proposal.payload || {};
    if (proposal.type === 'rename') {
      addAliases(safeDocId(payload.itemId), [payload.currentName, payload.newName]);
    } else if (proposal.type === 'merge') {
      const sourceId = safeDocId(payload.sourceItemId);
      const targetId = followMerged(safeDocId(payload.targetItemId), items);
      if (!sourceId || !targetId || sourceId === targetId || !items.has(targetId)) continue;
      const source = items.get(sourceId);
      addAliases(targetId, [
        payload.sourceItemName,
        source?.canonicalName,
        ...curatedAliasesOf(source),
        ...rawAliasesOf(source),
        ...(Array.isArray(source?.aliasesNormalized) ? source.aliasesNormalized : []),
      ]);
      // El origen de una fusión aprobada queda inactivo y apuntando al destino
      // (salvo que el negocio lo haya vuelto a crear después, ver arriba).
      const recreated = recreatedAfterMerge(sourceId);
      let fixed = false;
      if (source && !recreated && source.status !== 'inactive') {
        source.status = 'inactive';
        patchFor(sourceId).status = 'inactive';
        fixed = true;
      }
      if (source && !recreated && !source.mergedInto) {
        source.mergedInto = targetId;
        patchFor(sourceId).mergedInto = targetId;
        fixed = true;
      }
      if (fixed) fixedMergedItems += 1;
    } else if (proposal.type === 'reassign_review') {
      const reviewId = String(payload.reviewId || String(payload.reviewPath || '').split('/').pop() || '');
      const targetId = safeDocId(payload.targetItemId);
      if (!reviewId || !items.has(targetId)) continue;
      const expected = normalizeItemName(payload.reviewItemName);
      for (const copy of reviews || []) {
        if (!copy || String(copy.id) !== reviewId || !copy.refPath) continue;
        // Ya pasó por el modelo nuevo, o conserva su enlace antiguo.
        if (hasValue(copy.canonicalItemFor) || copy.originalItemName || hasValue(copy.itemNameCanonicalizedAt)) continue;
        if (hasValue(copy.canonicalItemId) && !pinsByRefPath.has(copy.refPath)) continue;
        // Si el autor cambió el nombre después, la reseña queda liberada.
        if (expected && normalizeItemName(typedItemName(copy)) !== expected) continue;
        pinsByRefPath.set(copy.refPath, { refPath: copy.refPath, reviewId, itemId: targetId });
      }
    }
  }

  // 3) La carta oficial (también lo que acaba de quedar curado por una fusión
  //    o un renombrado) se queda con su propio nombre como alias curado. Va al
  //    final para que una segunda reparación no tenga nada que añadir.
  for (const [itemId, item] of items.entries()) {
    if (isBusinessCurated(item)) addAliases(itemId, [item.canonicalName]);
  }

  const seededReviews = (reviews || []).map((copy) => {
    const pin = copy && pinsByRefPath.get(copy.refPath);
    return pin ? { ...copy, canonicalItemId: pin.itemId } : copy;
  });

  const itemPatches = Array.from(patches.values())
    .map((patch) => ({
      ...patch,
      addCuratedAliases: Array.from(patch.addCuratedAliases).sort(),
      addCuratedRawAliases: Array.from(patch.addCuratedRawAliases).sort(),
    }))
    .filter((patch) => patch.addCuratedAliases.length > 0 || patch.addCuratedRawAliases.length > 0
      || patch.status || patch.clearMergedInto || patch.mergedInto);

  return {
    itemsById: items,
    reviews: seededReviews,
    itemPatches,
    reviewPins: Array.from(pinsByRefPath.values()),
    fixedMergedItems,
  };
}

module.exports = {
  DELETE,
  SERVER_TIMESTAMP,
  FALLBACK_ITEM_NAME,
  REVIEW_PATH,
  normalizeItemName,
  itemDocIdFromName,
  safeDocId,
  typedItemName,
  getItem,
  toItemMap,
  curatedAliasesOf,
  rawAliasesOf,
  rawNameKey,
  splitCuratedNames,
  sameItemName,
  isBusinessCurated,
  buildAliasIndex,
  followMerged,
  createResolveContext,
  resolveReview,
  planReviewStamp,
  planReassignStamp,
  hasCanonicalItemSignalChanged,
  groupReviewCopies,
  findDuplicateItems,
  planPlaceRebuild,
  seedRepairPlan,
};
