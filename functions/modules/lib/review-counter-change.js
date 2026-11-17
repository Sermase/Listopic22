'use strict';

// Un «ñam» o un comentario solo cambian los contadores de la reseña. Esa
// escritura no debe rehacer la Lista, Algolia ni las medallas (cada «ñam»
// costaría una reconstrucción entera).
const COUNTER_KEYS = new Set(['reactionCounts', 'commentCount', 'commentsCount']);

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function isCounterOnlyChange(before, after) {
  if (!before || !after) return false;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  let changed = false;
  for (const key of keys) {
    if (same(before[key], after[key])) continue;
    if (!COUNTER_KEYS.has(key)) return false;
    changed = true;
  }
  return changed;
}

module.exports = { isCounterOnlyChange };
