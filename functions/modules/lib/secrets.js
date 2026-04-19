// functions/modules/lib/secrets.js
//
// Gestión de secretos.
//
// Orden de precedencia para obtener la Google Places API Key:
//   1. Variable de entorno GOOGLE_PLACES_API_KEY (útil en local/dev).
//   2. Secret Manager (via firebase-functions `defineSecret`) — recomendado.
//   3. Firestore `config/serverSecrets.googlePlacesApiKey` (LEGACY, se elimina).
//
// PARA ROTAR LA CLAVE DE GOOGLE:
//   1. `firebase functions:secrets:set GOOGLE_PLACES_API_KEY`
//   2. Declarar la secret en la función que la use:
//        const { googlePlacesApiKey } = require('./lib/secrets');
//        exports.miFuncion = onRequest({ secrets: [googlePlacesApiKey] }, ...)
//   3. Borrar `config/serverSecrets.googlePlacesApiKey` de Firestore.
//   4. Rotar la API Key en Google Cloud Console (la anterior ha estado
//      públicamente accesible y DEBE considerarse comprometida).

const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const { getFirestore } = require("firebase-admin/firestore");

const db = getFirestore();

// Declaración de la secret. Debe añadirse a `secrets: [...]` en la definición
// de cada función que la use.
const googlePlacesApiKey = defineSecret("GOOGLE_PLACES_API_KEY");

let cachedKey = null;
let cachedAt = 0;

/**
 * Devuelve la Google Places API key aplicando la cascada de fuentes.
 * Cacheada 15 minutos para minimizar lecturas.
 */
async function getGooglePlacesApiKey() {
  const now = Date.now();
  if (cachedKey && (now - cachedAt) < 15 * 60 * 1000) {
    return cachedKey;
  }

  // 1. Env (dev/local override).
  if (process.env.GOOGLE_PLACES_API_KEY) {
    cachedKey = process.env.GOOGLE_PLACES_API_KEY;
    cachedAt = now;
    return cachedKey;
  }

  // 2. Secret Manager.
  try {
    const v = googlePlacesApiKey.value();
    if (v) {
      cachedKey = v;
      cachedAt = now;
      return cachedKey;
    }
  } catch (_) { /* secret no enlazada a esta función, probamos Firestore */ }

  // 3. Firestore (LEGACY — migrar y eliminar cuanto antes).
  try {
    const snap = await db.collection('config').doc('serverSecrets').get();
    if (snap.exists) {
      const data = snap.data() || {};
      if (typeof data.googlePlacesApiKey === 'string' && data.googlePlacesApiKey.trim()) {
        cachedKey = data.googlePlacesApiKey.trim();
        cachedAt = now;
        logger.warn('getGooglePlacesApiKey: usando valor LEGACY en Firestore. Migrar a Secret Manager.');
        return cachedKey;
      }
    }
  } catch (error) {
    logger.error("getGooglePlacesApiKey: no se pudo leer config/serverSecrets.", error);
  }

  logger.error('getGooglePlacesApiKey: ninguna fuente ha devuelto la API key.');
  return null;
}

module.exports = {
  googlePlacesApiKey,       // SecretParam — incluir en `secrets: [...]`
  getGooglePlacesApiKey,
};
