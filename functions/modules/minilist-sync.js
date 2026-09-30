// functions/modules/minilist-sync.js
//
// Cuando una Lista madre cambia sus criterios o pesos, sus Minilistas se
// actualizan igual (decisión de producto: siempre comparables). Las reglas de
// Firestore impiden que un cliente deje una Minilista sin algún criterio de la madre.

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const { getFirestore } = require('firebase-admin/firestore');
const { syncMinilistCriteria, sameValue } = require('./lib/minilist-criteria');

const db = getFirestore();

const propagateParentCriteriaToMinilists = onDocumentUpdated('lists/{listId}', async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  if (after.parentListId) return null; // Solo las madres propagan.
  if (sameValue(before.criteriaDefinition, after.criteriaDefinition)
    && sameValue(before.scoringWeights, after.scoringWeights)) {
    return null;
  }

  const listId = event.params.listId;
  const children = await db.collection('lists').where('parentListId', '==', listId).get();
  if (children.empty) return null;

  let batch = db.batch();
  let pending = 0;
  let updated = 0;
  for (const childDoc of children.docs) {
    const child = childDoc.data() || {};
    const result = syncMinilistCriteria({
      parentBefore: before.criteriaDefinition,
      parentAfter: after.criteriaDefinition,
      parentWeights: after.scoringWeights,
      child: child.criteriaDefinition,
      childWeights: child.scoringWeights,
    });
    if (!result.changed) continue;
    batch.update(childDoc.ref, {
      criteriaDefinition: result.criteriaDefinition,
      scoringWeights: result.scoringWeights,
    });
    pending += 1;
    updated += 1;
    if (pending >= 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();
  logger.info(`propagateParentCriteriaToMinilists: ${listId} → ${updated} Minilista(s) actualizada(s)`);
  return null;
});

module.exports = { propagateParentCriteriaToMinilists };
