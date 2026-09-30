#!/usr/bin/env node
/**
 * Migra las portadas de lista guardadas en base64 dentro del documento
 * (photoUrl / mainImageUrl = "data:image/...") a Firebase Storage.
 *
 * SOLO SIMULA por defecto. Para escribir: --apply
 *
 *   cd functions
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/service-account.json node scripts/migrate-base64-list-covers.js
 *   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/migrate-base64-list-covers.js --apply
 *
 * Qué hace con --apply, por cada lista afectada:
 *   1. Sube la imagen a list-images/{listId}/{timestamp}_cover.{ext} con caché larga.
 *   2. Actualiza photoUrl, mainImageUrl y mainImagePath con la URL de descarga.
 * No borra nada. Es idempotente: una lista ya migrada no vuelve a aparecer.
 */
const admin = require('firebase-admin');
const crypto = require('crypto');

const APPLY = process.argv.includes('--apply');
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'listopic';
const BUCKET = process.env.STORAGE_BUCKET || 'listopic.firebasestorage.app';

admin.initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
const db = admin.firestore();
const bucket = admin.storage().bucket();

const parseDataUrl = (value) => {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(value || '');
  if (!match) return null;
  return { contentType: match[1].toLowerCase(), buffer: Buffer.from(match[2], 'base64') };
};

const extensionFor = (contentType) => ({
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
}[contentType] || 'img');

(async () => {
  console.log(`Modo: ${APPLY ? 'APLICAR (escribe en producción)' : 'SIMULACIÓN (no escribe nada)'}`);
  const snapshot = await db.collection('lists').get();
  let affected = 0;
  for (const listDoc of snapshot.docs) {
    const data = listDoc.data();
    const inline = [data.photoUrl, data.mainImageUrl].find((v) => typeof v === 'string' && v.startsWith('data:'));
    if (!inline) continue;
    affected += 1;
    const parsed = parseDataUrl(inline);
    const sizeKb = Math.round(inline.length / 1024);
    console.log(`- ${listDoc.id} "${data.name || ''}" (${data.isPublic ? 'pública' : 'privada'}) · ${sizeKb} KB en el documento`);
    if (!parsed) {
      console.log('  ! Formato no reconocido, se omite.');
      continue;
    }
    if (!APPLY) continue;

    const path = `list-images/${listDoc.id}/${Date.now()}_cover.${extensionFor(parsed.contentType)}`;
    const token = crypto.randomUUID();
    await bucket.file(path).save(parsed.buffer, {
      contentType: parsed.contentType,
      metadata: {
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    await listDoc.ref.update({ photoUrl: url, mainImageUrl: url, mainImagePath: path });
    console.log(`  ✓ Migrada a ${path}`);
  }
  console.log(`Listas con portada en base64: ${affected}${APPLY ? '' : ' (nada modificado)'}`);
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
