// functions/modules/lib/list-visibility.js
// Reglas de visibilidad (Mejoras/modelo-listopic.md):
// - Cada valoración lleva `visibility` igual a la de su lista real (la Minilista
//   si tiene `sublistId`).
// - Una Minilista nunca es más pública que su madre.

const listVisibility = (list) => (list && (list.isPublic === true || list.visibility === 'public') ? 'public' : 'private');

/** Visibilidad efectiva: una Minilista de madre privada cuenta como privada. */
function effectiveVisibility(list, parent) {
  const own = listVisibility(list);
  if (own === 'private') return 'private';
  if (list && list.parentListId && parent) return listVisibility(parent);
  return own;
}

/**
 * Solo las valoraciones públicas. Para índices públicos (Algolia): las de una
 * Minilista privada no deben contar ni prestar foto o etiquetas, igual que la
 * página de la Lista no las enseña.
 */
const filterPublicReviews = (reviews) => (reviews || []).filter((review) => review && review.visibility === 'public');

module.exports = { listVisibility, effectiveVisibility, filterPublicReviews };
