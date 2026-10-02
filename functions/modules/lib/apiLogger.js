// functions/modules/lib/apiLogger.js
// Helper no-bloqueante para registrar lecturas a Google Places API.

const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions/v2');
const { ACTION_SKUS, recordGoogleSkus } = require('./google-usage');

const db = getFirestore();

const ACTION_LABELS = {
  nearby_search_google:  'Búsqueda cercana (Google)',
  text_search_google:    'Búsqueda por texto (Google)',
  place_details_google:  'Detalle de lugar (Google)',
  reverse_geocode:       'Geocodificación inversa',
  photo_refresh:         'Refresco de foto',
  admin_bulk_update:     'Actualización masiva (admin)',
  admin_single_update:   'Actualización individual (admin)',
  admin_update_place_google: 'Actualizar sitio desde Google (Developer)',
  admin_refresh_place_location: 'Solo ubicación (Developer)',
  sync_place_status_google: 'Estado abierto/cerrado (Developer)',
  place_photo_refresh:   'Actualizar imagen rota (Developer)',
  client_text_search:    'Búsqueda por texto (cliente)',
  client_nearby_search:  'Búsqueda cercana (cliente)',
  client_place_details:  'Detalle de lugar (cliente)',
};

/**
 * Registra una llamada a API externa en Firestore.
 * Fire-and-forget: los errores se loggean pero no rompen el flujo del llamador.
 *
 * @param {object} params
 * @param {string} params.action         - clave de ACTION_LABELS
 * @param {string} [params.userId]       - UID del usuario autenticado
 * @param {object} [params.details]      - contexto extra (query, placeId, etc.)
 * @param {number} [params.count=1]      - nº de llamadas (>1 para operaciones bulk)
 * @param {string[]} [params.skus]       - SKUs de Google consumidas (por defecto, las de la acción)
 */
async function logApiUsage({ action, userId = null, details = {}, count = 1, skus = ACTION_SKUS[action] }) {
  // Contador por SKU y mes para Developer → Uso de API (cupos gratis restantes).
  const skusPromise = recordGoogleSkus(skus, { action, count });
  try {
    const now = new Date();
    const date  = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const month = now.toISOString().slice(0, 7);  // YYYY-MM

    const batch = db.batch();

    // Entrada individual (para el listado de logs recientes)
    const logRef = db.collection('apiUsageLogs').doc();
    batch.set(logRef, {
      action,
      label:  ACTION_LABELS[action] || action,
      userId,
      details,
      count,
      date,
      month,
      timestamp: FieldValue.serverTimestamp(),
    });

    // Acumulado diario. Mapa anidado: con set+merge, una clave «byAction.x» se guarda
    // como campo literal con punto (no dentro de byAction) y Developer no la veía.
    const dailyRef = db.collection('apiUsageStats').doc(`day_${date}`);
    batch.set(dailyRef, {
      date,
      month,
      total: FieldValue.increment(count),
      byAction: { [action]: FieldValue.increment(count) },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Acumulado mensual
    const monthlyRef = db.collection('apiUsageStats').doc(`month_${month}`);
    batch.set(monthlyRef, {
      month,
      total: FieldValue.increment(count),
      byAction: { [action]: FieldValue.increment(count) },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await batch.commit();
  } catch (err) {
    logger.warn('apiLogger: error escribiendo log de uso', { action, error: err.message });
  }
  await skusPromise;
}

module.exports = { logApiUsage, ACTION_LABELS };
