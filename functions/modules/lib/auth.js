// functions/modules/lib/auth.js
//
// Helpers compartidos de autenticación y autorización para Cloud Functions.

const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore } = require("firebase-admin/firestore");

const db = getFirestore();

function normalizeUserTypes(userType) {
  if (Array.isArray(userType)) return userType;
  if (typeof userType === 'string' && userType) return [userType];
  return [];
}

/**
 * Comprueba que el usuario autenticado es `jefe`. Si no, lanza HttpsError.
 * Para uso dentro de funciones onCall (tienen `request.auth`).
 */
async function assertJefeAccess(uid, permissionMessage = 'No tienes permiso para ejecutar esta operación.') {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }
  // Primero intenta custom claim (barato, sin lectura).
  try {
    const userRecord = await admin.auth().getUser(uid);
    if (userRecord.customClaims?.admin === true) return userRecord;
  } catch (_) { /* ignore, fallback below */ }

  // Fallback: leer Firestore.
  const userProfileDoc = await db.collection('users').doc(uid).get();
  const userTypes = normalizeUserTypes(userProfileDoc.data()?.userType);
  if (!userProfileDoc.exists || !userTypes.includes('jefe')) {
    throw new HttpsError('permission-denied', permissionMessage);
  }
  return userProfileDoc;
}

/**
 * Valida un Bearer token en onRequest handlers.
 * Responde 401 y devuelve null si falla; si éxito devuelve el decodedToken.
 */
async function requireAuthFromRequest(req, res) {
  const authHeader = req.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ message: 'No autorizado: falta token Bearer.' });
    return null;
  }
  try {
    return await admin.auth().verifyIdToken(match[1]);
  } catch (error) {
    logger.warn('requireAuthFromRequest: token inválido', { error: error.message });
    res.status(401).json({ message: 'No autorizado: token inválido.' });
    return null;
  }
}

/**
 * Rate-limit simple basado en Firestore.
 * @param {string} bucket Nombre del bucket (p.ej. "reverseGeocode").
 * @param {string} key    Identificador del cliente (UID o IP).
 * @param {number} limit  Máximo número de peticiones en la ventana.
 * @param {number} windowSeconds Ventana en segundos.
 * @returns {Promise<{allowed: boolean, remaining: number}>}
 *
 * Utiliza una colección `rateLimits/{bucket}_{key}` con un contador y
 * un timestamp de ventana. No es perfecto frente a abuso masivo
 * concurrente, pero detiene bucles triviales y reduce coste de APIs externas.
 */
async function rateLimit(bucket, key, limit, windowSeconds) {
  if (!key) return { allowed: false, remaining: 0 };
  const docId = `${bucket}__${key}`.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 1500);
  const ref = db.collection('rateLimits').doc(docId);
  const now = Date.now();

  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : null;
      const windowStart = data?.windowStart || 0;
      let count = data?.count || 0;

      if (!data || now - windowStart > windowSeconds * 1000) {
        tx.set(ref, { windowStart: now, count: 1, bucket, key, updatedAt: new Date() });
        return { allowed: true, remaining: limit - 1 };
      }
      if (count >= limit) {
        return { allowed: false, remaining: 0 };
      }
      tx.update(ref, { count: count + 1, updatedAt: new Date() });
      return { allowed: true, remaining: limit - (count + 1) };
    });
    return result;
  } catch (error) {
    logger.error('rateLimit: error en transacción', { bucket, key, error: error.message });
    // Fail-open: preferimos servir si Firestore falla, en vez de bloquear usuarios.
    return { allowed: true, remaining: -1 };
  }
}

/**
 * Obtiene una clave razonable para rate-limiting: UID si hay auth, si no IP.
 */
function rateLimitKey(req, decodedAuth) {
  if (decodedAuth?.uid) return `uid_${decodedAuth.uid}`;
  const forwarded = req.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0].trim() || req.ip || req.connection?.remoteAddress || 'unknown';
  return `ip_${ip}`;
}

/**
 * Guarda una entrada en el audit log de admin.
 * Solo se invoca desde Cloud Functions (admin SDK bypassa reglas).
 */
async function writeAuditLog(actorUid, action, details = {}) {
  try {
    await db.collection('adminAuditLog').add({
      actorUid: actorUid || null,
      action,
      details,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.error('writeAuditLog: fallo al escribir audit log', { action, error: error.message });
  }
}

module.exports = {
  normalizeUserTypes,
  assertJefeAccess,
  requireAuthFromRequest,
  rateLimit,
  rateLimitKey,
  writeAuditLog,
};
