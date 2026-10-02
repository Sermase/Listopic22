#!/usr/bin/env node
/**
 * Contadores de cada Lista con las reglas nuevas (red-de-seguridad.md, bloque C):
 * en una Lista pública solo cuentan las valoraciones públicas (una Minilista
 * privada no suma en su madre), las medias por criterio solo con los criterios
 * de la propia Lista, y `itemCount` = elementos como los agrupa la web.
 * También resume qué tendrá Buscar (Algolia) tras reindexar.
 *
 * SOLO LECTURA por defecto:
 *   cd functions
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/service-account.json node scripts/recalc-list-metrics.js
 *   … --details        (todas las Listas, no solo las que cambian)
 *
 * Escribir (reviewCount, averageRating, criteriaAverages e itemCount; antes, copia en backups/):
 *   … node scripts/recalc-list-metrics.js --apply --expect=N
 *   (N = nº de Listas que cambian según la simulación; si no coincide, NO escribe nada)
 */
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'listopic' });
const db = getFirestore();

const APPLY = process.argv.includes('--apply');
const DETAILS = process.argv.includes('--details');
const EXPECT = (process.argv.find((a) => a.startsWith('--expect=')) || '').slice('--expect='.length);

const { computeListMetrics } = require('../modules/lib/list-metrics');
const { aggregateGroups } = require('../modules/grouped-aggregator');
const { listVisibility, filterPublicReviews } = require('../modules/lib/list-visibility');
const { isBotUserType } = require('../modules/lib/list-elements');
const { snapshotFields, writeBackup } = require('./lib/backup');

const FIELDS = ['reviewCount', 'averageRating', 'criteriaAverages', 'itemCount'];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const fmt = (v) => (v === undefined || v === null ? '—' : typeof v === 'object' ? Object.keys(v).sort().join(',') || '{}' : String(v));

(async () => {
  const [listsSnap, reviewsSnap, profilesSnap, placesSnap] = await Promise.all([
    db.collection('lists').get(),
    db.collectionGroup('reviews').get(),
    db.collection('publicProfiles').get(),
    db.collection('places').get(),
  ]);
  const bots = new Set(profilesSnap.docs.filter((d) => isBotUserType((d.data() || {}).userType)).map((d) => d.id));
  const places = new Map(placesSnap.docs.map((d) => [d.id, d.data() || {}]));

  // Valoraciones guardadas en cada lists/{id}/reviews.
  const storedIn = new Map();
  reviewsSnap.forEach((doc) => {
    const segments = doc.ref.path.split('/');
    if (segments[0] !== 'lists') return;
    const bucket = storedIn.get(segments[1]) || [];
    bucket.push({ id: doc.id, ...doc.data() });
    storedIn.set(segments[1], bucket);
  });

  const rows = [];
  let algoliaRecords = 0;
  let algoliaBotOnly = 0;
  listsSnap.forEach((doc) => {
    const list = { id: doc.id, ...(doc.data() || {}) };
    // Igual que list-metrics: la madre, su subcolección; la Minilista, las suyas en la madre + las antiguas propias.
    const reviews = list.parentListId
      ? [...(storedIn.get(list.parentListId) || []).filter((r) => r.sublistId === doc.id), ...(storedIn.get(doc.id) || [])]
      : (storedIn.get(doc.id) || []);
    const metrics = computeListMetrics(list, reviews);
    const isPublic = listVisibility(list) === 'public';
    const groups = aggregateGroups(doc.id, list, isPublic ? filterPublicReviews(reviews) : reviews, places, bots);
    const next = { ...metrics, itemCount: groups.length };
    if (isPublic) {
      algoliaRecords += groups.length;
      algoliaBotOnly += groups.filter((g) => g.botOnly).length;
    }
    const changed = FIELDS.filter((f) => !same(list[f], next[f]));
    rows.push({ id: doc.id, name: list.name || doc.id, minilista: Boolean(list.parentListId), isPublic, before: list, next, changed });
  });

  const changes = rows.filter((r) => r.changed.length > 0);
  const shown = DETAILS ? rows : changes;
  console.log('Lista | tipo | valoraciones | nota | elementos | criterios');
  shown.forEach((r) => {
    const cell = (f) => (same(r.before[f], r.next[f]) ? fmt(r.next[f]) : `${fmt(r.before[f])} → ${fmt(r.next[f])}`);
    console.log(`${r.name} | ${r.minilista ? 'Minilista' : 'Lista'} ${r.isPublic ? 'pública' : 'privada'} | ${cell('reviewCount')} | ${cell('averageRating')} | ${cell('itemCount')} | ${cell('criteriaAverages')}`);
  });
  console.log(`\nListas: ${rows.length} · cambian: ${changes.length}`);
  console.log(`Buscar tras reindexar grouped_items: ${algoliaRecords} elementos de Listas públicas (${algoliaBotOnly} solo de bots: ocultos salvo con el filtro «Bots»).`);

  if (!APPLY) {
    console.log(`\nSimulación: no se ha escrito nada. Para escribir: --apply --expect=${changes.length}`);
    process.exit(0);
  }
  if (String(changes.length) !== EXPECT) {
    console.error(`\n--expect=${EXPECT || '(vacío)'} no coincide con ${changes.length} Listas a cambiar. No se escribe nada.`);
    process.exit(1);
  }
  const file = writeBackup('recalc-list-metrics', changes.map((r) => ({ path: `lists/${r.id}`, before: snapshotFields(r.before, FIELDS) })));
  console.log(`\nCopia de seguridad: ${file}`);
  for (let i = 0; i < changes.length; i += 400) {
    const batch = db.batch();
    changes.slice(i, i + 400).forEach((r) => {
      const update = {};
      FIELDS.forEach((f) => { update[f] = r.next[f] ?? null; });
      batch.update(db.collection('lists').doc(r.id), update);
    });
    await batch.commit();
  }
  console.log(`Escritas ${changes.length} Listas. Deshacer: node scripts/restore-backup.js ${file} --apply`);
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
