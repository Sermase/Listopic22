'use strict';

// Nota pública de un sitio (tarjetas, ficha, Home, Algolia `places`):
// - solo valoraciones públicas (una Lista o Minilista privada no cuenta);
// - sin bots;
// - nota de críticos aparte (críticos verificados), nunca mezclada con la general.
// La general incluye también a los críticos: son valoraciones públicas de personas.
// Espejo de lo que muestra la web en frontend/src/lib/placeRating.ts.

const { authorOf } = require('./author-roles');

/** Por debajo de esto, la nota de críticos se marca como provisional. */
const CRITIC_MIN_SAMPLE = 3;

const isScore = (value) => typeof value === 'number' && Number.isFinite(value);
const mean2 = (values) => (values.length ? Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(2)) : null);

/**
 * @param {Array<object>} reviews todas las valoraciones del sitio (cualquier visibilidad)
 * @param {{ bots?: Set<string>, critics?: Set<string> }} roles
 */
function computePlaceRating(reviews, { bots = new Set(), critics = new Set() } = {}) {
  const counted = (reviews || []).filter((r) => r && r.visibility === 'public' && !bots.has(authorOf(r)));
  const byCritics = counted.filter((r) => critics.has(authorOf(r)));
  return {
    reviewsCount: counted.length,
    averageRating: mean2(counted.map((r) => r.overallRating).filter(isScore)),
    criticReviewsCount: byCritics.length,
    criticRating: mean2(byCritics.map((r) => r.overallRating).filter(isScore)),
  };
}

module.exports = { computePlaceRating, CRITIC_MIN_SAMPLE };
