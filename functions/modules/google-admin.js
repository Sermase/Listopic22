'use strict';

// Developer (solo jefe): consumo de Google por SKU en el mes y «Actualizar imagen rota».
// Ver Mejoras/google-places-skus.md.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const fetch = require('node-fetch');
const { assertJefeAccess, writeAuditLog } = require('./lib/auth');
const { logApiUsage } = require('./lib/apiLogger');
const { GOOGLE_SKUS, billingMonth, usageRows, refreshStamp } = require('./lib/google-usage');
const { googlePlacesApiKey: GOOGLE_PLACES_API_KEY_SECRET, getGooglePlacesApiKey } = require('./lib/secrets');

const db = getFirestore();
const PHOTO_MAX_WIDTH = 800;

async function monthUsage(month = billingMonth()) {
  const snap = await db.collection('googleUsage').doc(month).get();
  return snap.exists ? (snap.data() || {}) : {};
}

const adminGoogleUsage = onCall(async (request) => {
  await assertJefeAccess(request.auth?.uid);
  const month = typeof request.data?.month === 'string' && /^\d{4}-\d{2}$/.test(request.data.month) ? request.data.month : billingMonth();
  const usage = await monthUsage(month);
  const rows = usageRows(usage.skus || {});
  return {
    month,
    rows,
    actions: usage.actions || {},
    estimatedUsd: Math.round(rows.reduce((sum, row) => sum + row.estimatedUsd, 0) * 100) / 100,
    note: 'Solo cuenta lo que pasa por las Functions. Lo que pide el navegador (autocompletar, fotos con getURI) se factura aparte y no sale aquí.',
  };
});

/** ¿La URL sirve una imagen? Las URL de fotos heredadas con clave se dan por rotas sin pedirlas (cada petición se factura). */
async function imageWorks(url) {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url) || /[?&]key=/.test(url)) return false;
  try {
    let response = await fetch(url, { method: 'HEAD', redirect: 'follow', timeout: 8000 });
    if (response.status === 405) response = await fetch(url, { method: 'GET', redirect: 'follow', timeout: 8000, headers: { Range: 'bytes=0-0' } });
    return response.ok && String(response.headers.get('content-type') || '').startsWith('image/');
  } catch (_) {
    return false;
  }
}

/** photoUri fresca de una foto de Places (New). SKU Place Details Photos. null si el nombre ya no vale. */
async function photoUriFor(photoName, apiKey) {
  const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${PHOTO_MAX_WIDTH}&skipHttpRedirect=true`;
  const response = await fetch(url, { headers: { 'X-Goog-Api-Key': apiKey }, timeout: 10000 });
  const data = await response.json().catch(() => ({}));
  return response.ok && typeof data.photoUri === 'string' ? data.photoUri : null;
}

/** Nombre de la primera foto del sitio. Campo `photos` → Place Details Essentials (IDs Only), sin coste. */
async function firstPhotoName(googlePlaceId, apiKey) {
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(googlePlaceId)}`, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'photos' },
    timeout: 10000,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpsError('unavailable', `Google no devolvió las fotos: ${data?.error?.message || response.status}`);
  return Array.isArray(data.photos) && data.photos[0]?.name ? data.photos[0].name : null;
}

// «Actualizar imagen rota»: solo si el sitio no tiene foto propia y la de Google ya no carga.
// Por defecto no gasta más allá del cupo gratis de Place Details Photos.
const adminRefreshPlacePhoto = onCall({ secrets: [GOOGLE_PLACES_API_KEY_SECRET] }, async (request) => {
  const uid = request.auth?.uid;
  await assertJefeAccess(uid);
  const { documentId, force = false, allowPaid = false } = request.data || {};
  if (typeof documentId !== 'string' || !documentId || documentId.includes('/')) {
    throw new HttpsError('invalid-argument', 'Falta documentId.');
  }

  const placeRef = db.collection('places').doc(documentId);
  const snap = await placeRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'El sitio no existe.');
  const place = snap.data() || {};

  const ownPhotos = place.userPhotoUrl ? null : await placeRef.collection('photos').limit(1).get();
  if (place.userPhotoUrl || (ownPhotos && !ownPhotos.empty)) {
    return { updated: false, reason: 'foto-propia', message: 'Tiene foto propia: no se usa la de Google.' };
  }
  if (!force && await imageWorks(place.mainImageUrl)) {
    return { updated: false, reason: 'funciona', message: 'La imagen carga bien: no hace falta gastar una llamada.' };
  }

  const free = GOOGLE_SKUS.details_photos.freePerMonth;
  const used = Number((await monthUsage()).skus?.details_photos) || 0;
  if (!allowPaid && used >= free) {
    return { updated: false, reason: 'sin-cupo-gratis', used, free, message: `Ya se han usado ${used} de ${free} fotos gratis este mes.` };
  }

  const apiKey = await getGooglePlacesApiKey();
  if (!apiKey) throw new HttpsError('internal', 'Error de configuración del servidor.');
  await writeAuditLog(uid, 'adminRefreshPlacePhoto', { documentId });

  const skus = [];
  let photoName = typeof place.mainImagePhotoReference === 'string' && place.mainImagePhotoReference.startsWith('places/')
    ? place.mainImagePhotoReference
    : null;
  let photoUri = photoName ? await photoUriFor(photoName, apiKey) : null;
  if (!photoUri) {
    // Los nombres de foto caducan: se piden de nuevo (gratis) y se vuelve a intentar.
    photoName = await firstPhotoName(place.googlePlaceId || documentId, apiKey);
    skus.push('details_ids_only');
    photoUri = photoName ? await photoUriFor(photoName, apiKey) : null;
  }
  if (photoUri) skus.push('details_photos');

  logApiUsage({ action: 'place_photo_refresh', userId: uid, details: { placeId: documentId, updated: Boolean(photoUri) }, skus }).catch(() => {});
  if (!photoUri) {
    await placeRef.set(refreshStamp('imagen', skus), { merge: true });
    return { updated: false, reason: 'sin-fotos-en-google', message: 'Google no tiene fotos de este sitio.' };
  }

  await placeRef.set({
    mainImageUrl: photoUri,
    mainImagePhotoReference: photoName,
    mainImageRefreshedAt: FieldValue.serverTimestamp(),
    ...refreshStamp('imagen', skus),
  }, { merge: true });
  logger.info(`adminRefreshPlacePhoto: ${documentId} con foto nueva de Google.`, { skus });
  return { updated: true, url: photoUri, skus };
});

module.exports = { adminGoogleUsage, adminRefreshPlacePhoto };
