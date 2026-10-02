'use strict';

// Contadores y notas de un sitio (tarjetas, ficha, Home, Algolia `places`).
// Espejo de lo que muestra la web en frontend/src/lib/placeRating.ts.
//
// - publicHumanReviewsCount / averageRating: valoraciones PÚBLICAS de personas (sin bots).
//   Es la nota pública y la única que entra en el ranking.
// - totalVisibleReviewsCount: todas las públicas, también las de bots. Dice si el sitio
//   tiene actividad y decide que salga en Buscar (un sitio solo con bots sigue saliendo).
// - publicBotReviewsCount / botAverageRating: las de bots, aparte. Solo se enseñan con el
//   filtro «Bots».
// - criticReviewsCount / criticRating: críticos verificados, aparte; nunca en la general
//   (la general sí los incluye: son personas).
// - reviewsCount: alias de totalVisibleReviewsCount por compatibilidad. Las apps ya
//   instaladas filtran Buscar con `reviewsCount > 0`; si contara solo humanos, en ellas
//   desaparecerían los sitios con solo bots.
// - publicReviewerTypes: tipos de usuario de quien ha valorado en público (faceta de Buscar).
// Las valoraciones privadas no cuentan para nada de esto.

const { authorOf } = require('./author-roles');

/** Por debajo de esto, la nota de críticos se marca como provisional. */
const CRITIC_MIN_SAMPLE = 3;

const isScore = (value) => typeof value === 'number' && Number.isFinite(value);
const mean2 = (values) => (values.length ? Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(2)) : null);
const meanOf = (reviews) => mean2(reviews.map((r) => r.overallRating).filter(isScore));

/**
 * @param {Array<object>} reviews todas las valoraciones del sitio (cualquier visibilidad)
 * @param {{ bots?: Set<string>, critics?: Set<string>, types?: Map<string, string[]> }} roles
 */
function computePlaceRating(reviews, { bots = new Set(), critics = new Set(), types = new Map() } = {}) {
  const visible = (reviews || []).filter((r) => r && r.visibility === 'public');
  const byBots = visible.filter((r) => bots.has(authorOf(r)));
  const byHumans = visible.filter((r) => !bots.has(authorOf(r)));
  const byCritics = byHumans.filter((r) => critics.has(authorOf(r)));

  const reviewerTypes = new Set();
  visible.forEach((r) => {
    const author = authorOf(r);
    const authorTypes = types.get(author) || [];
    authorTypes.forEach((type) => reviewerTypes.add(type));
    if (bots.has(author)) reviewerTypes.add('bot');
    if (critics.has(author)) reviewerTypes.add('critico');
    if (!bots.has(author) && authorTypes.length === 0) reviewerTypes.add('basico');
  });

  return {
    publicHumanReviewsCount: byHumans.length,
    averageRating: meanOf(byHumans),
    totalVisibleReviewsCount: visible.length,
    reviewsCount: visible.length,
    publicBotReviewsCount: byBots.length,
    botAverageRating: meanOf(byBots),
    criticReviewsCount: byCritics.length,
    criticRating: meanOf(byCritics),
    publicReviewerTypes: [...reviewerTypes].sort(),
  };
}

module.exports = { computePlaceRating, CRITIC_MIN_SAMPLE };
