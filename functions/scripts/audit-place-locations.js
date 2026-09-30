#!/usr/bin/env node
/**
 * SOLO LECTURA. Cobertura de ciudad / provincia / CCAA / país en `places`,
 * valores distintos y sitios sin ubicación (para actualizarlos desde
 * Developer → Sitios → «Seleccionar sin ubicación» → Actualizar desde Google).
 *
 *   cd functions
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/service-account.json node scripts/audit-place-locations.js
 */
const admin = require('firebase-admin');
const { normalizeCcaa } = require('../modules/lib/geo-areas');

admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'listopic' });
const db = admin.firestore();

const text = (v) => (typeof v === 'string' ? v.trim() : '');

(async () => {
  const snap = await db.collection('places').get();
  const counts = { city: 0, province: 0, region: 0, country: 0 };
  const values = { city: new Map(), province: new Map(), region: new Map() };
  const missing = [];
  const aliasFixes = new Map();
  snap.forEach((doc) => {
    const d = doc.data() || {};
    ['city', 'province', 'region', 'country'].forEach((k) => { if (text(d[k])) counts[k] += 1; });
    ['city', 'province', 'region'].forEach((k) => {
      const v = text(d[k]);
      if (v) values[k].set(v, (values[k].get(v) || 0) + 1);
    });
    const region = text(d.region);
    const normalized = normalizeCcaa(region);
    if (region && normalized !== region) aliasFixes.set(`${region} → ${normalized}`, (aliasFixes.get(`${region} → ${normalized}`) || 0) + 1);
    if (!text(d.city) || !text(d.province) || !text(d.region)) missing.push(`${doc.id} ${text(d.name)}`);
  });
  const n = snap.size || 1;
  console.log(`Sitios: ${snap.size}`);
  Object.entries(counts).forEach(([k, c]) => console.log(`  ${k}: ${c} (${Math.round((100 * c) / n)} %)`));
  ['region', 'province', 'city'].forEach((k) => {
    const top = [...values[k].entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
    console.log(`\n${k} (${values[k].size} distintos):`, top.map(([v, c]) => `${v} ${c}`).join(' · '));
  });
  if (aliasFixes.size) console.log('\nCCAA con nombre alternativo (se normalizarán):', [...aliasFixes.entries()].map(([v, c]) => `${v} (${c})`).join(' · '));
  console.log(`\nSin ciudad, provincia o CCAA (${missing.length}):`);
  missing.forEach((m) => console.log(`  - ${m}`));
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
