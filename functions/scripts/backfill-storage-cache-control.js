#!/usr/bin/env node
/**
 * Pone Cache-Control de un año a las imágenes ya subidas (reseñas, fotos de
 * sitios, perfiles, portadas y branding). Sus nombres son únicos, así que no
 * cambian nunca. Hoy Storage las sirve con "private, max-age=0" y se vuelven a
 * descargar en cada visita. SOLO SIMULA por defecto; para escribir: --apply
 *
 *   cd functions
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/service-account.json node scripts/backfill-storage-cache-control.js [--apply]
 */
const admin = require('firebase-admin');
const { getStorage } = require('firebase-admin/storage');

const APPLY = process.argv.includes('--apply');
const BUCKET = process.env.STORAGE_BUCKET || 'listopic.firebasestorage.app';
const PREFIXES = ['reviews/', 'places/', 'profile_images/', 'profile-photos/', 'user-profiles/', 'list-images/', 'branding/', 'badges/'];
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'listopic', storageBucket: BUCKET });
const bucket = getStorage().bucket();

(async () => {
  console.log(`Modo: ${APPLY ? 'APLICAR' : 'SIMULACIÓN'}`);
  let pending = 0;
  for (const prefix of PREFIXES) {
    const [files] = await bucket.getFiles({ prefix });
    for (const file of files) {
      if (file.metadata.cacheControl === CACHE_CONTROL) continue;
      pending += 1;
      if (APPLY) await file.setMetadata({ cacheControl: CACHE_CONTROL });
    }
    console.log(`${prefix}: ${files.length} archivos revisados`);
  }
  console.log(`Archivos sin caché larga: ${pending}${APPLY ? ' (actualizados)' : ''}`);
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
