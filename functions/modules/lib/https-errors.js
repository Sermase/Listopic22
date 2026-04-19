// functions/modules/lib/https-errors.js
//
// Constantes y helpers para normalizar códigos de error HTTPS en Cloud Functions.

const { HttpsError } = require('firebase-functions/v2/https');

const VALID_HTTPS_ERROR_CODES = new Set([
  'ok',
  'cancelled',
  'unknown',
  'invalid-argument',
  'deadline-exceeded',
  'not-found',
  'already-exists',
  'permission-denied',
  'resource-exhausted',
  'failed-precondition',
  'aborted',
  'out-of-range',
  'unimplemented',
  'internal',
  'unavailable',
  'data-loss',
  'unauthenticated'
]);

const FRIENDLY_ERROR_MESSAGES = Object.freeze({
  'permission-denied': 'No tienes permisos para realizar esta acción.',
  'already-exists': 'Ya existe un recurso con estos datos.',
  'not-found': 'El recurso solicitado no está disponible.',
  'resource-exhausted': 'Has alcanzado el límite de esta operación. Inténtalo más tarde.',
  'deadline-exceeded': 'La operación tardó demasiado en completarse. Inténtalo de nuevo.',
  'unavailable': 'El servicio no está disponible temporalmente. Inténtalo nuevamente en unos minutos.'
});

function normalizeHttpsErrorCode(code, fallback = 'internal') {
  if (!code || typeof code !== 'string') {
    return fallback;
  }
  const normalized = code.toLowerCase();
  return VALID_HTTPS_ERROR_CODES.has(normalized) ? normalized : fallback;
}

function buildHttpsErrorFrom(error, fallbackMessage, fallbackCode = 'internal') {
  if (!error) {
    return new HttpsError(fallbackCode, fallbackMessage);
  }
  if (error instanceof HttpsError) {
    return error;
  }

  const normalizedCode = normalizeHttpsErrorCode(error.code, fallbackCode);
  const message = FRIENDLY_ERROR_MESSAGES[normalizedCode] || fallbackMessage;

  const details = {};
  if (error.message) {
    details.originalMessage = error.message;
  }
  if (error.status) {
    details.httpStatus = error.status;
  }
  if (error.response?.status) {
    details.httpStatus = error.response.status;
  }
  if (error.response?.data) {
    details.responseData = error.response.data;
  }

  return new HttpsError(normalizedCode, message, Object.keys(details).length ? details : undefined);
}

module.exports = {
  VALID_HTTPS_ERROR_CODES,
  FRIENDLY_ERROR_MESSAGES,
  normalizeHttpsErrorCode,
  buildHttpsErrorFrom,
};
