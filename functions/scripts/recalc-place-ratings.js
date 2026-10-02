#!/usr/bin/env node
/**
 * Contadores y notas de cada sitio con las reglas de lib/place-rating.js:
 * - publicHumanReviewsCount / averageRating: públicas de personas (sin bots) → nota y ranking;
 * - totalVisibleReviewsCount (= reviewsCount): públicas con bots → actividad: decide que salga en Buscar;
 * - publicBotReviewsCount / botAverageRating: bots aparte (solo con el filtro «Bots»);
 * - criticReviewsCount / criticRating: críticos verificados aparte;
 * - publicReviewerTypes: quién ha valorado en público (faceta de Buscar).
 *
 * ORDEN: desplegar antes las Functions de esta rama. Cada sitio escrito se reindexa
 * solo en Algolia con la versión desplegada; con la anterior, un sitio solo con bots
 * entraría en el ranking como si tuviera nota 0.
 *
 * SOLO LECTURA por defecto:
 *   cd functions
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/service-account.json node scripts/recalc-place-ratings.js
 *   … --details        (todos los sitios que cambian, no solo los 40 primeros)
 *
 * Escribir (antes, copia de esos campos en backups/):
 *   … node scripts/recalc-place-ratings.js --apply --expect=N
 *   (N = nº de sitios que cambian según la simulación; si no coincide, NO escribe nada)
 */
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'listopic' });
const db = getFirestore();

const APPLY = process.argv.includes('--apply');
const DETAILS = process.argv.includes('--details');
const EXPECT = (process.argv.find((a) => a.startsWith('--expect=')) || '').slice('--expect='.length);

const { computePlaceRating } = require('../modules/lib/place-rating');
const { fetchAuthorRoles, authorOf } = require('../modules/lib/author-roles');
const { snapshotFields, writeBackup } = require('./lib/backup');

const FIELDS = [
  'publicHumanReviewsCount', 'averageRating',
  'totalVisibleReviewsCount', 'reviewsCount',
  'publicBotReviewsCount', 'botAverageRating',
  'criticReviewsCount', 'criticRating',
  'publicReviewerTypes',
];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const fmt = (v) => (v === undefined || v === null ? '—' : Array.isArray(v) ? v.join(',') || '—' : String(v));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// Buscar → Sitios enseña los que tienen reviewsCount > 0 (antes: cualquier valoración,
// también privadas; ahora: públicas, también de bots).
const inSearchBefore = (place) => num(place.reviewsCount) > 0;

(async () => {
  const [reviewsSnap, placesSnap] = await Promise.all([
    db.collectionGroup('reviews').get(),
    db.collection('places').get(),
  ]);
  const byPlace = new Map();
  reviewsSnap.forEach((doc) => {
    const r = doc.data() || {};
    if (!r.placeId) return;
    byPlace.set(r.placeId, [...(byPlace.get(r.placeId) || []), r]);
  });
  const roles = await fetchAuthorRoles([...byPlace.values()].flat().map(authorOf));

  const rows = [];
  placesSnap.forEach((doc) => {
    const place = doc.data() || {};
    const reviews = byPlace.get(doc.id) || [];
    const next = computePlaceRating(reviews, roles);
    if (FIELDS.every((f) => same(place[f], next[f]))) return;
    rows.push({
      id: doc.id,
      name: place.name || doc.id,
      before: place,
      next,
      privates: reviews.filter((r) => r.visibility !== 'public').length,
      wasInSearch: inSearchBefore(place),
      inSearch: next.totalVisibleReviewsCount > 0,
    });
  });

  const shown = DETAILS ? rows : rows.slice(0, 40);
  console.log('Sitio | personas: nº · nota | visibles (con bots) | bots: nº · nota | críticos: nota · nº | privadas | en Buscar');
  shown.forEach((r) => {
    const cell = (f) => (same(r.before[f], r.next[f]) ? fmt(r.next[f]) : `${fmt(r.before[f])} → ${fmt(r.next[f])}`);
    const search = r.wasInSearch === r.inSearch ? (r.inSearch ? 'sí' : 'no') : (r.inSearch ? 'no → SÍ' : 'sí → NO');
    console.log(`${r.name} | ${cell('publicHumanReviewsCount')} · ${cell('averageRating')} | ${cell('totalVisibleReviewsCount')} | ${cell('publicBotReviewsCount')} · ${cell('botAverageRating')} | ${cell('criticRating')} · ${cell('criticReviewsCount')} | ${r.privates} | ${search}`);
  });
  if (!DETAILS && rows.length > shown.length) console.log(`… y ${rows.length - shown.length} más (--details para verlos todos)`);

  const botOnly = rows.filter((r) => r.next.totalVisibleReviewsCount > 0 && r.next.publicHumanReviewsCount === 0);
  const leaving = rows.filter((r) => r.wasInSearch && !r.inSearch);
  const entering = rows.filter((r) => !r.wasInSearch && r.inSearch);
  const lostRating = rows.filter((r) => typeof r.before.averageRating === 'number' && r.next.averageRating === null);
  const withCritics = rows.filter((r) => r.next.criticReviewsCount > 0);

  console.log(`\nSitios: ${placesSnap.size} · cambian: ${rows.length}`);
  console.log(`Siguen en Buscar SIN nota pública («Sin nota pública todavía»; detrás al ordenar por nota): ${botOnly.length}`);
  botOnly.slice(0, 10).forEach((r) => console.log(`   · ${r.name}: ${r.next.publicBotReviewsCount} de bots${r.privates ? `, ${r.privates} privadas` : ''}`));
  console.log(`Dejan de salir en Buscar (sin ninguna valoración pública, ni de bots): ${leaving.length}`);
  leaving.slice(0, 10).forEach((r) => console.log(`   · ${r.name}: ${r.privates} privadas, 0 públicas`));
  console.log(`Empiezan a salir en Buscar: ${entering.length}`);
  console.log(`Pierden la nota (la tenían solo por privadas o bots): ${lostRating.length}`);
  console.log(`Con nota de críticos: ${withCritics.length} (provisional por debajo de 3 críticos).`);

  if (!APPLY) {
    console.log(`\nSimulación: no se ha escrito nada. Para escribir (con las Functions de esta rama ya desplegadas): --apply --expect=${rows.length}`);
    process.exit(0);
  }
  if (String(rows.length) !== EXPECT) {
    console.error(`\n--expect=${EXPECT || '(vacío)'} no coincide con ${rows.length} sitios a cambiar. No se escribe nada.`);
    process.exit(1);
  }
  const file = writeBackup('recalc-place-ratings', rows.map((r) => ({ path: `places/${r.id}`, before: snapshotFields(r.before, FIELDS) })));
  console.log(`\nCopia de seguridad: ${file}`);
  for (let i = 0; i < rows.length; i += 400) {
    const batch = db.batch();
    rows.slice(i, i + 400).forEach((r) => batch.update(db.collection('places').doc(r.id), r.next));
    await batch.commit();
  }
  console.log(`Escritos ${rows.length} sitios (Algolia se actualiza solo con cada escritura). Deshacer: node scripts/restore-backup.js ${file} --apply`);
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
