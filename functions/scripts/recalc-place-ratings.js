#!/usr/bin/env node
/**
 * Nota pública de cada sitio con las reglas nuevas (lib/place-rating.js):
 * solo valoraciones públicas, sin bots, y la de críticos verificados aparte
 * (criticRating / criticReviewsCount).
 *
 * SOLO LECTURA por defecto:
 *   cd functions
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/service-account.json node scripts/recalc-place-ratings.js
 *   … --details        (todos los sitios que cambian, no solo el resumen y los 40 primeros)
 *
 * Escribir (reviewsCount, averageRating, criticRating, criticReviewsCount; antes, copia en backups/):
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

const FIELDS = ['reviewsCount', 'averageRating', 'criticRating', 'criticReviewsCount'];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const fmt = (v) => (v === undefined || v === null ? '—' : String(v));

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
    const changed = FIELDS.filter((f) => !same(place[f], next[f]));
    if (changed.length === 0) return;
    rows.push({
      id: doc.id,
      name: place.name || doc.id,
      before: place,
      next,
      lostAll: (place.reviewsCount || 0) > 0 && next.reviewsCount === 0,
      privates: reviews.filter((r) => r.visibility !== 'public').length,
      bots: reviews.filter((r) => r.visibility === 'public' && roles.bots.has(authorOf(r))).length,
    });
  });

  const shown = DETAILS ? rows : rows.slice(0, 40);
  console.log('Sitio | valoraciones | nota | críticos (nota · nº) | quitadas: privadas · bots');
  shown.forEach((r) => {
    const cell = (f) => (same(r.before[f], r.next[f]) ? fmt(r.next[f]) : `${fmt(r.before[f])} → ${fmt(r.next[f])}`);
    console.log(`${r.name} | ${cell('reviewsCount')} | ${cell('averageRating')} | ${cell('criticRating')} · ${cell('criticReviewsCount')} | ${r.privates} · ${r.bots}`);
  });
  if (!DETAILS && rows.length > shown.length) console.log(`… y ${rows.length - shown.length} más (--details para verlos todos)`);

  const lostAll = rows.filter((r) => r.lostAll);
  const withCritics = rows.filter((r) => r.next.criticReviewsCount > 0);
  console.log(`\nSitios: ${placesSnap.size} · cambian: ${rows.length}`);
  console.log(`Se quedan sin nota pública (solo tenían valoraciones privadas o de bots): ${lostAll.length}. Dejan de salir en Buscar → Sitios (filtra reviewsCount > 0).`);
  console.log(`Con nota de críticos: ${withCritics.length} (provisional por debajo de 3 críticos).`);

  if (!APPLY) {
    console.log(`\nSimulación: no se ha escrito nada. Para escribir: --apply --expect=${rows.length}`);
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
  console.log(`Escritos ${rows.length} sitios. Deshacer: node scripts/restore-backup.js ${file} --apply`);
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
