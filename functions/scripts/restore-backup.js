#!/usr/bin/env node
/**
 * Deshace lo que escribió un script con --apply, usando la copia que guardó antes
 * en functions/backups/. Devuelve cada campo a su valor anterior (o lo borra si
 * antes no existía). SOLO SIMULA por defecto.
 *
 *   cd functions
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/clave.json node scripts/restore-backup.js backups/<archivo>.json            # simulación
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/clave.json node scripts/restore-backup.js backups/<archivo>.json --apply    # restaura
 */
const fs = require('fs');
const admin = require('firebase-admin');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

const file = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!file || !fs.existsSync(file)) {
  console.error('Uso: node scripts/restore-backup.js backups/<archivo>.json [--apply]');
  process.exit(1);
}
const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || backup.project || 'listopic' });
const db = getFirestore();

(async () => {
  console.log(`Copia de «${backup.script}» del ${backup.createdAt}: ${backup.entries.length} documentos. Modo: ${APPLY ? 'RESTAURAR' : 'SIMULACIÓN'}`);
  const toPatch = (before) => Object.fromEntries(Object.entries(before).map(([k, v]) => [k, v && v.__absent ? FieldValue.delete() : v]));
  backup.entries.slice(0, 20).forEach((e) => console.log(`  ${e.path} ← ${JSON.stringify(e.before)}`));
  if (backup.entries.length > 20) console.log(`  … y ${backup.entries.length - 20} más`);
  if (!APPLY) {
    console.log('\nSimulación: no se ha escrito nada. Añade --apply para restaurar.');
    process.exit(0);
  }
  for (let i = 0; i < backup.entries.length; i += 400) {
    const batch = db.batch();
    backup.entries.slice(i, i + 400).forEach((e) => batch.update(db.doc(e.path), toPatch(e.before)));
    await batch.commit();
  }
  console.log(`Restaurados: ${backup.entries.length}.`);
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
