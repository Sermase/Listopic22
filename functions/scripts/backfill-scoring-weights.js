#!/usr/bin/env node
/**
 * Rellena `scoringWeights` en todas las listas a partir de `ponderable`
 * (×1 lo que cuenta, ×0 lo que no) y deja cada Minilista con todos los
 * criterios y pesos de su madre. No cambia ninguna nota: con ×1/×0 el
 * resultado es idéntico al cálculo actual.
 *
 * SOLO SIMULA por defecto; para escribir: --apply
 *   cd functions
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/service-account.json node scripts/backfill-scoring-weights.js [--apply]
 *
 * Con --apply guarda antes una copia en functions/backups/ (se deshace con
 * scripts/restore-backup.js).
 */
const admin = require('firebase-admin');
const { deriveScoringWeights } = require('../modules/lib/scoring');
const { syncMinilistCriteria, sameValue } = require('../modules/lib/minilist-criteria');
const { snapshotFields, writeBackup } = require('./lib/backup');

const APPLY = process.argv.includes('--apply');
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'listopic' });
const db = admin.firestore();

(async () => {
  console.log(`Modo: ${APPLY ? 'APLICAR' : 'SIMULACIÓN'}`);
  const snap = await db.collection('lists').get();
  const lists = new Map(snap.docs.map((d) => [d.id, { ref: d.ref, data: d.data() || {} }]));
  const parents = [...lists.entries()].filter(([, l]) => !l.data.parentListId);
  const minis = [...lists.entries()].filter(([, l]) => l.data.parentListId);
  let parentUpdates = 0;
  let miniUpdates = 0;
  const orphanMinis = [];
  const writes = []; // { ref, before, patch }

  // 1) Madres (y listas normales)
  for (const [id, list] of parents) {
    const weights = deriveScoringWeights(list.data.criteriaDefinition, list.data.scoringWeights || null);
    if (sameValue(weights, list.data.scoringWeights || null)) continue;
    parentUpdates += 1;
    console.log(`- Lista ${id} "${list.data.name || ''}": ${JSON.stringify(list.data.scoringWeights || null)} → ${JSON.stringify(weights)}`);
    writes.push({ ref: list.ref, before: snapshotFields(list.data, ['scoringWeights']), patch: { scoringWeights: weights } });
    list.data.scoringWeights = weights; // Para que las Minilistas hereden lo nuevo.
  }

  // 2) Minilistas: todos los criterios y pesos de la madre
  for (const [id, mini] of minis) {
    const parent = lists.get(mini.data.parentListId);
    if (!parent) { orphanMinis.push(id); continue; }
    const result = syncMinilistCriteria({
      parentBefore: parent.data.criteriaDefinition,
      parentAfter: parent.data.criteriaDefinition,
      parentWeights: parent.data.scoringWeights,
      child: mini.data.criteriaDefinition,
      childWeights: mini.data.scoringWeights,
    });
    if (!result.changed) continue;
    miniUpdates += 1;
    const missing = Object.keys(parent.data.criteriaDefinition || {}).filter((k) => !(k in (mini.data.criteriaDefinition || {})));
    console.log(`- Minilista ${id} "${mini.data.name || ''}" (madre ${mini.data.parentListId}): faltaban ${missing.length ? missing.join(', ') : 'ninguno'} · pesos → ${JSON.stringify(result.scoringWeights)}`);
    writes.push({ ref: mini.ref, before: snapshotFields(mini.data, ['criteriaDefinition', 'scoringWeights']), patch: { criteriaDefinition: result.criteriaDefinition, scoringWeights: result.scoringWeights } });
  }

  console.log(`\nListas: ${parents.length} · a actualizar: ${parentUpdates}`);
  console.log(`Minilistas: ${minis.length} · a actualizar: ${miniUpdates}`);
  if (orphanMinis.length) console.log(`Minilistas sin madre (no se tocan): ${orphanMinis.join(', ')}`);
  if (APPLY && writes.length) {
    const file = writeBackup('backfill-scoring-weights', writes.map((w) => ({ path: w.ref.path, before: w.before })));
    console.log(`Copia previa: ${file}`);
    for (const w of writes) await w.ref.update(w.patch);
  }
  console.log(APPLY ? 'Hecho.' : 'Simulación: no se ha escrito nada. Repite con --apply.');
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
