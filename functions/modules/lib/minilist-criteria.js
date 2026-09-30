// functions/modules/lib/minilist-criteria.js
//
// Una Minilista contiene SIEMPRE todos los criterios de su Lista madre, con
// los mismos pesos. Esta función calcula cómo debe quedar una Minilista cuando
// su madre cambia (o para repararla). Pura: sin Firestore, con tests.

const { deriveScoringWeights } = require('./scoring');

const asMap = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const sameValue = (a, b) => stableStringify(a ?? null) === stableStringify(b ?? null);

/**
 * @param {object} args
 * @param {object} args.parentBefore  criteriaDefinition de la madre antes del cambio (o el actual, para reparar)
 * @param {object} args.parentAfter   criteriaDefinition de la madre ahora
 * @param {object} [args.parentWeights] scoringWeights de la madre ahora
 * @param {object} args.child         criteriaDefinition de la Minilista
 * @param {object} [args.childWeights] scoringWeights de la Minilista
 * @returns {{ criteriaDefinition: object, scoringWeights: object, changed: boolean }}
 */
function syncMinilistCriteria({ parentBefore, parentAfter, parentWeights, child, childWeights }) {
  const before = asMap(parentBefore);
  const after = asMap(parentAfter);
  const current = asMap(child);

  const removed = Object.keys(before).filter((key) => !(key in after));
  const next = { ...current };
  removed.forEach((key) => { delete next[key]; });
  Object.keys(after).forEach((key) => { next[key] = after[key]; });

  const inheritedWeights = deriveScoringWeights(after, parentWeights || null);
  const ownWeights = deriveScoringWeights(next, childWeights || null);
  const nextWeights = { ...ownWeights, ...inheritedWeights };

  return {
    criteriaDefinition: next,
    scoringWeights: nextWeights,
    changed: !sameValue(next, current) || !sameValue(nextWeights, childWeights || null),
  };
}

module.exports = { syncMinilistCriteria, sameValue };
