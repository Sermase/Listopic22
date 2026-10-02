#!/usr/bin/env node
/**
 * Recalcula itemCount de las colecciones (users/{uid}/archives/{id}) contando
 * sus elementos reales. Antes de la corrección, guardar dos veces el mismo
 * elemento sumaba dos. SOLO SIMULA por defecto; para escribir: --apply
 *
 *   cd functions
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/service-account.json node scripts/recount-collection-items.js [--apply]
 */
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

const APPLY = process.argv.includes('--apply');
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'listopic' });
const db = getFirestore();

(async () => {
  console.log(`Modo: ${APPLY ? 'APLICAR' : 'SIMULACIÓN'}`);
  const archives = await db.collectionGroup('archives').get();
  let wrong = 0;
  for (const archive of archives.docs) {
    const real = (await archive.ref.collection('items').count().get()).data().count;
    const stored = archive.data().itemCount ?? 0;
    if (real === stored) continue;
    wrong += 1;
    console.log(`- ${archive.ref.path} "${archive.data().name || ''}": guardado ${stored}, real ${real}`);
    if (APPLY) await archive.ref.update({ itemCount: real });
  }
  console.log(`Colecciones con contador incorrecto: ${wrong}${APPLY ? ' (corregidas)' : ''}`);
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
