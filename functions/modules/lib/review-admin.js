'use strict';

// Developer (jefe): resumen, búsqueda y validación de cambios de valoraciones.
// Sin Firestore: lo prueba test/review-admin.test.js.

const { computeReviewScore, computingCriteria, normalizeCriteria, mergeMinilistCriteria, isScoreValue, SCORE_MIN, SCORE_MAX } = require('./scoring');

const REVIEW_PATH = /^lists\/[^/]+\/reviews\/[^/]+$|^reviews\/[^/]+$/;
const MAX_ITEM_NAME = 120;
const MAX_COMMENT = 5000;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;

/** Timestamps → ms, GeoPoint → { latitude, longitude }; recursivo. Para devolver al navegador. */
function serialize(value) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number' && Object.keys(value).length <= 2) {
    return { latitude: value.latitude, longitude: value.longitude };
  }
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    if (typeof value.isEqual === 'function' && typeof value.path === 'string') return value.path; // DocumentReference
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]));
  }
  return value;
}

const toMs = (value) => (value && typeof value.toMillis === 'function' ? value.toMillis() : (typeof value === 'number' ? value : null));
const str = (value) => (typeof value === 'string' ? value.trim() : '');
const photoList = (data) => {
  for (const field of ['photoUrls', 'photos', 'images']) {
    if (Array.isArray(data[field])) {
      const urls = data[field].filter((u) => typeof u === 'string' && u.trim());
      if (urls.length) return urls;
    }
  }
  return str(data.photoUrl) ? [str(data.photoUrl)] : [];
};
const tagList = (data) => [...new Set([...(Array.isArray(data.userTags) ? data.userTags : []), ...(Array.isArray(data.tags) ? data.tags : [])]
  .filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim()))];

/** Lo que enseña la tabla de Developer (sin el documento entero). */
function slimReview(path, data = {}) {
  const segments = path.split('/');
  const comment = str(data.comment);
  return {
    path,
    id: segments[segments.length - 1],
    legacy: segments[0] === 'reviews',
    listId: segments[0] === 'lists' ? segments[1] : (str(data.listId) || null),
    sublistId: str(data.sublistId) || null,
    userId: str(data.userId) || str(data.authorId) || null,
    authorName: str(data.authorName) || null,
    authorUserType: Array.isArray(data.authorUserType) ? data.authorUserType : [],
    itemName: str(data.itemName) || null,
    placeId: str(data.placeId) || null,
    placeName: str(data.placeName) || null,
    overallRating: isScoreValue(data.overallRating) ? data.overallRating : null,
    visibility: data.visibility === 'public' ? 'public' : 'private',
    comment: comment.length > 280 ? `${comment.slice(0, 280)}…` : comment,
    tags: tagList(data),
    photos: photoList(data),
    createdAtMs: toMs(data.createdAt),
    updatedAtMs: toMs(data.updatedAt),
  };
}

const fold = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Filtro de texto (nombre, sitio, autor, comentario, etiquetas, ruta) y de visibilidad. */
function matchesReviewQuery(review, { text = '', visibility = '' } = {}) {
  if (visibility && review.visibility !== visibility) return false;
  const needle = fold(text).trim();
  if (!needle) return true;
  const haystack = fold([review.itemName, review.placeName, review.authorName, review.comment, review.path, review.userId, ...(review.tags || [])].join(' '));
  return needle.split(/\s+/).every((word) => haystack.includes(word));
}

/**
 * Criterios con los que se puntúa la valoración, como en el formulario: los de la
 * Minilista si se hizo desde una (superconjunto de los de la madre), si no los de la Lista.
 */
function scoringContext(list, sublist) {
  if (sublist) {
    return {
      criteria: mergeMinilistCriteria(list ? list.criteriaDefinition : null, sublist.criteriaDefinition),
      weights: sublist.scoringWeights || (list ? list.scoringWeights : null) || null,
    };
  }
  return { criteria: normalizeCriteria(list ? list.criteriaDefinition : null), weights: list ? list.scoringWeights || null : null };
}

/**
 * Valida los cambios pedidos y devuelve el parche para Firestore.
 * changes: { itemName?, comment?, tags?, scores?, overallRating?, author? }
 *   author = { uid, name, photoUrl, userType } (ya leído del perfil del nuevo autor)
 * @returns {{ patch: object, changed: string[], errors: string[] }}
 */
function buildReviewPatch(current, changes = {}, { criteria = [], weights = null } = {}) {
  const patch = {};
  const changed = [];
  const errors = [];

  if (changes.itemName !== undefined) {
    const itemName = str(changes.itemName);
    if (!itemName || itemName.length > MAX_ITEM_NAME) errors.push(`El nombre del elemento debe tener entre 1 y ${MAX_ITEM_NAME} caracteres.`);
    else if (itemName !== str(current.itemName)) {
      Object.assign(patch, { itemName, itemNameLower: itemName.toLowerCase() });
      changed.push('itemName');
    }
  }

  if (changes.comment !== undefined) {
    const comment = typeof changes.comment === 'string' ? changes.comment.trim() : '';
    if (comment.length > MAX_COMMENT) errors.push(`El comentario no puede pasar de ${MAX_COMMENT} caracteres.`);
    else if (comment !== str(current.comment)) { patch.comment = comment; changed.push('comment'); }
  }

  if (changes.tags !== undefined) {
    if (!Array.isArray(changes.tags)) errors.push('Las etiquetas deben ser una lista.');
    else {
      const tags = [...new Set(changes.tags.filter((t) => typeof t === 'string').map((t) => t.trim()).filter(Boolean))];
      if (tags.length > MAX_TAGS || tags.some((t) => t.length > MAX_TAG_LENGTH)) errors.push(`Máximo ${MAX_TAGS} etiquetas de hasta ${MAX_TAG_LENGTH} caracteres.`);
      else if (JSON.stringify(tags) !== JSON.stringify(tagList(current))) {
        Object.assign(patch, { tags, userTags: tags });
        changed.push('tags');
      }
    }
  }

  const ids = new Set(normalizeCriteria(criteria).map((c) => c.id));
  const hasComputing = computingCriteria(criteria, { weights }).length > 0;
  let scores = current.scores && typeof current.scores === 'object' ? { ...current.scores } : {};
  if (changes.scores !== undefined) {
    if (!changes.scores || typeof changes.scores !== 'object' || Array.isArray(changes.scores)) errors.push('Las puntuaciones deben ser un objeto criterio → nota.');
    else {
      const next = {};
      for (const [key, value] of Object.entries(changes.scores)) {
        if (value === null || value === undefined || value === '') continue; // se quita
        if (!ids.has(key)) { errors.push(`El criterio «${key}» no es de esta Lista.`); continue; }
        if (!isScoreValue(value) || value < SCORE_MIN || value > SCORE_MAX) { errors.push(`«${key}» debe estar entre ${SCORE_MIN} y ${SCORE_MAX}.`); continue; }
        next[key] = value;
      }
      if (JSON.stringify(sortKeys(next)) !== JSON.stringify(sortKeys(scores))) {
        scores = next;
        patch.scores = next;
        changed.push('scores');
      }
    }
  }

  if (hasComputing) {
    // La nota global sale de los criterios, como en el formulario: no se escribe a mano.
    if (changes.overallRating !== undefined && changes.scores === undefined) {
      errors.push('La nota global se calcula con los criterios: cambia las puntuaciones.');
    }
    if (changed.includes('scores')) {
      const result = computeReviewScore(scores, criteria, { weights });
      if (!result.complete) errors.push(`Faltan criterios por puntuar: ${result.missing.join(', ')}.`);
      else if (result.score !== current.overallRating) { patch.overallRating = result.score; changed.push('overallRating'); }
    }
  } else if (changes.overallRating !== undefined) {
    const value = changes.overallRating;
    if (!isScoreValue(value) || value < SCORE_MIN || value > SCORE_MAX) errors.push(`La nota global debe estar entre ${SCORE_MIN} y ${SCORE_MAX}.`);
    else if (value !== current.overallRating) { patch.overallRating = Math.round(value * 10) / 10; changed.push('overallRating'); }
  }

  if (changes.author !== undefined) {
    const author = changes.author || {};
    const uid = str(author.uid);
    if (!uid) errors.push('Falta el nuevo autor.');
    else if (uid !== (str(current.userId) || str(current.authorId))) {
      Object.assign(patch, {
        userId: uid,
        authorId: uid,
        authorName: str(author.name) || null,
        authorPhoto: str(author.photoUrl) || null,
        authorUserType: Array.isArray(author.userType) ? author.userType : (author.userType ? [author.userType] : []),
      });
      changed.push('author');
    }
  }

  return { patch, changed, errors };
}

function sortKeys(obj) {
  return Object.fromEntries(Object.entries(obj || {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

module.exports = { REVIEW_PATH, serialize, slimReview, matchesReviewQuery, scoringContext, buildReviewPatch, photoList, tagList };
