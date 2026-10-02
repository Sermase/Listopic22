#!/usr/bin/env node
/**
 * SOLO LECTURA. Minilistas a las que les falta algún criterio de su madre
 * o con pesos distintos en criterios heredados, y cuántas valoraciones tienen.
 * La reparación la hace backfill-scoring-weights.js.
 *
 *   cd functions
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/service-account.json node scripts/audit-minilist-criteria.js
 */
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { deriveScoringWeights } = require('../modules/lib/scoring');

initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'listopic' });
const db = getFirestore();

(async () => {
  const snap = await db.collection('lists').get();
  const lists = new Map(snap.docs.map((d) => [d.id, d.data() || {}]));
  let total = 0;
  let wrong = 0;
  for (const [id, mini] of lists) {
    if (!mini.parentListId) continue;
    total += 1;
    const parent = lists.get(mini.parentListId);
    if (!parent) { console.log(`- ${id} "${mini.name || ''}": madre ${mini.parentListId} no existe`); wrong += 1; continue; }
    const pc = parent.criteriaDefinition || {};
    const mc = mini.criteriaDefinition || {};
    const missing = Object.keys(pc).filter((k) => !(k in mc));
    const pw = deriveScoringWeights(pc, parent.scoringWeights || null);
    const mw = deriveScoringWeights(mc, mini.scoringWeights || null);
    const weightDiff = Object.keys(pw).filter((k) => k in mw && mw[k] !== pw[k]);
    if (!missing.length && !weightDiff.length) continue;
    wrong += 1;
    const reviews = (await db.collection('lists').doc(mini.parentListId).collection('reviews')
      .where('sublistId', '==', id).count().get()).data().count;
    console.log(`- ${id} "${mini.name || ''}" (madre "${parent.name || ''}"): faltan [${missing.join(', ')}] · peso distinto [${weightDiff.join(', ')}] · ${reviews} valoraciones`);
  }
  console.log(`\nMinilistas: ${total} · con diferencias: ${wrong}`);
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
