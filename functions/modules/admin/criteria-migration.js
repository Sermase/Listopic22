// functions/modules/admin/criteria-migration.js
//
// Migración de criterios y pesos de una Lista con valoraciones:
//   1) simulateCriteriaChange: calcula antes/después SIN escribir (dueño o jefe).
//   2) applyCriteriaChange: vuelve a calcular, exige la MISMA huella que la
//      simulación (si algo cambió entre medias, se rechaza) y escribe.
// Aplicar es solo para jefe mientras no se decida otra cosa
// (ver Mejoras/plan-fase-B1.md, pregunta abierta sobre quién puede migrar).

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { assertJefeAccess, writeAuditLog } = require('../lib/auth');
const { recalculateListReviewMetrics } = require('../lib/list-metrics');
const { planCriteriaChange } = require('../lib/criteria-migration');

const db = getFirestore();

const MAX_REVIEWS_IN_RESPONSE = 200;
const MAX_RANKING_IN_RESPONSE = 50;

async function isJefe(uid) {
  try {
    await assertJefeAccess(uid);
    return true;
  } catch (_) {
    return false;
  }
}

async function loadMigrationContext(listId) {
  const listSnap = await db.collection('lists').doc(listId).get();
  if (!listSnap.exists) throw new HttpsError('not-found', 'La lista no existe.');
  const list = { id: listSnap.id, ...listSnap.data() };
  if (list.parentListId) {
    throw new HttpsError('failed-precondition', 'Las Minilistas heredan criterios y pesos de su madre: cambia la Lista madre.');
  }
  const minisSnap = await db.collection('lists').where('parentListId', '==', listId).get();
  const minilists = minisSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const byPath = new Map();
  const addSnap = (snap) => snap.docs.forEach((d) => byPath.set(d.ref.path, { id: d.id, path: d.ref.path, ...d.data() }));
  addSnap(await db.collection('lists').doc(listId).collection('reviews').get());
  for (const mini of minilists) {
    // Valoraciones antiguas guardadas dentro de la propia Minilista.
    const own = await db.collection('lists').doc(mini.id).collection('reviews').get();
    own.docs.forEach((d) => byPath.set(d.ref.path, { id: d.id, path: d.ref.path, sublistId: mini.id, ...d.data() }));
  }
  return { list, minilists, reviews: [...byPath.values()] };
}

function publicPlan(plan) {
  return {
    fingerprint: plan.fingerprint,
    change: plan.change,
    noChange: plan.noChange,
    summary: plan.summary,
    list: plan.list,
    minilists: plan.minilistUpdates.map((m) => m.id),
    reviews: plan.reviews.filter((r) => r.changed).slice(0, MAX_REVIEWS_IN_RESPONSE)
      .map(({ id, itemName, sublistId, before, after }) => ({ id, itemName, sublistId, before, after })),
    rankingChanges: plan.rankingChanges.slice(0, MAX_RANKING_IN_RESPONSE),
  };
}

const simulateCriteriaChange = onCall({ timeoutSeconds: 120 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  const { listId, change } = request.data || {};
  if (!listId) throw new HttpsError('invalid-argument', 'Falta listId.');
  const context = await loadMigrationContext(listId);
  const allowed = context.list.userId === uid || await isJefe(uid);
  if (!allowed) throw new HttpsError('permission-denied', 'Solo quien creó la lista o un administrador puede simular cambios.');
  try {
    return publicPlan(planCriteriaChange({ ...context, change }));
  } catch (error) {
    throw new HttpsError('invalid-argument', error.message);
  }
});

const applyCriteriaChange = onCall({ timeoutSeconds: 540, memory: '512MiB' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  await assertJefeAccess(uid, 'Aplicar una migración de criterios está reservado a administradores.');
  const { listId, change, fingerprint } = request.data || {};
  if (!listId || !fingerprint) throw new HttpsError('invalid-argument', 'Faltan listId o la huella de la simulación.');

  const context = await loadMigrationContext(listId);
  let plan;
  try {
    plan = planCriteriaChange({ ...context, change });
  } catch (error) {
    throw new HttpsError('invalid-argument', error.message);
  }
  if (plan.fingerprint !== fingerprint) {
    throw new HttpsError('failed-precondition', 'Los datos han cambiado desde la simulación. Vuelve a simular antes de aplicar.');
  }
  if (plan.noChange) return { applied: false, summary: plan.summary };

  const version = (Number(context.list.scoringVersion) || 1) + 1;
  await writeAuditLog(uid, 'applyCriteriaChange', { listId, change: plan.change, summary: plan.summary, version });

  // 1) Lista madre y Minilistas
  const listBatch = db.batch();
  listBatch.update(db.collection('lists').doc(listId), {
    criteriaDefinition: plan.list.after.criteriaDefinition,
    scoringWeights: plan.list.after.scoringWeights,
    scoringVersion: version,
    scoringUpdatedAt: FieldValue.serverTimestamp(),
  });
  plan.minilistUpdates.forEach((mini) => {
    listBatch.update(db.collection('lists').doc(mini.id), {
      criteriaDefinition: mini.criteriaDefinition,
      scoringWeights: mini.scoringWeights,
      scoringVersion: version,
      scoringUpdatedAt: FieldValue.serverTimestamp(),
    });
  });
  await listBatch.commit();

  // 2) Valoraciones: nota nueva; la anterior se conserva. Las puntuaciones no se tocan.
  const changed = plan.reviews.filter((r) => r.changed);
  for (let i = 0; i < changed.length; i += 400) {
    const batch = db.batch();
    changed.slice(i, i + 400).forEach((r) => {
      batch.update(db.doc(r.path), {
        overallRating: r.after,
        overallRatingBefore: r.before,
        scoringVersion: version,
      });
    });
    await batch.commit();
  }

  // 3) Métricas
  await recalculateListReviewMetrics(listId).catch((e) => logger.error('applyCriteriaChange: métricas madre', e));
  for (const mini of context.minilists) {
    await recalculateListReviewMetrics(mini.id).catch((e) => logger.error(`applyCriteriaChange: métricas ${mini.id}`, e));
  }

  logger.info(`applyCriteriaChange: ${listId} v${version} · ${changed.length} valoraciones recalculadas`);
  return { applied: true, version, summary: plan.summary };
});

module.exports = { simulateCriteriaChange, applyCriteriaChange };
