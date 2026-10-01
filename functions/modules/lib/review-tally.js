// functions/modules/lib/review-tally.js
/**
 * Valoraciones por persona a partir de rutas y datos, contando solo las de
 * `lists/{listId}/reviews/{id}` (la colección raíz `reviews/` es legacy).
 * Lo usa «Recalcular usuarios» para no necesitar el índice de grupo de
 * colecciones sobre `reviews.userId`.
 */
function tallyReviewsByUser(entries) {
  const byUser = new Map();
  entries.forEach(({ path, data }) => {
    const segments = String(path || '').split('/');
    if (segments.length !== 4 || segments[0] !== 'lists' || segments[2] !== 'reviews') return;
    const userId = data && typeof data.userId === 'string' ? data.userId : '';
    if (!userId) return;
    const keys = byUser.get(userId) || new Set();
    keys.add(`${segments[1]}:${segments[3]}`);
    byUser.set(userId, keys);
  });
  return new Map([...byUser.entries()].map(([userId, keys]) => [userId, keys.size]));
}

module.exports = { tallyReviewsByUser };
