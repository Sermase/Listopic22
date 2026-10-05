// functions/modules/lib/gdpr.js
//
// Piezas puras del RGPD (exportar y borrar los datos de una persona), separadas
// para poder probarlas sin Firestore.

const DELETED_USER_NAME = 'Usuario eliminado';

/** Cuánto se guarda la prueba de una baja o de una exportación (Política de privacidad: 3 años). */
const GDPR_AUDIT_RETAIN_DAYS = 3 * 365;

/** Carpetas de Storage que son siempre de la persona (se borran con la cuenta). */
const PERSONAL_STORAGE_FOLDERS = ['profile-photos', 'profile_images', 'user-profiles', 'business-claims'];

/** Convierte valores de Firestore a JSON legible: fechas ISO, GeoPoint y referencias. */
function toExportValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toExportValue);
  if (typeof value === 'object') {
    if (typeof value.latitude === 'number' && typeof value.longitude === 'number' && Object.keys(value).length <= 2) {
      return { latitude: value.latitude, longitude: value.longitude };
    }
    if (typeof value.isEqual === 'function' && typeof value.path === 'string') return value.path;
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toExportValue(v)]));
  }
  return value;
}

/** Documento exportable: ruta + datos. */
function exportDoc(docSnap) {
  return { path: docSnap.ref.path, ...toExportValue(docSnap.data() || {}) };
}

/**
 * Qué hacer con un chat al borrar una cuenta: los privados se borran enteros
 * (con sus mensajes); de los grupos, la persona sale y se borran sus mensajes.
 */
function planChatCleanup(chat, uid) {
  const participants = Array.isArray(chat.participants) ? chat.participants : [];
  const isGroup = chat.type === 'group' || chat.isGroup === true;
  if (!isGroup) return { action: 'delete' };

  const remaining = participants.filter((p) => p !== uid);
  if (remaining.length === 0) return { action: 'delete' };

  const fields = { participants: remaining };
  for (const mapField of ['unreadCount', 'unreadCounts', 'participantProfiles']) {
    const current = chat[mapField];
    if (current && typeof current === 'object' && uid in current) {
      const next = { ...current };
      delete next[uid];
      fields[mapField] = next;
    }
  }
  if (chat.ownerId === uid) fields.ownerId = remaining[0];
  if (chat.lastMessageSenderId === uid) {
    fields.lastMessage = 'Mensaje eliminado';
    fields.lastMessageSenderId = null;
  }
  return { action: 'leave', fields };
}

/** Campos para dejar anónima una aportación que se conserva. */
const ANONYMOUS_COMMENT = { userId: null, userName: DELETED_USER_NAME, userPhoto: null };
const ANONYMOUS_FORUM_MESSAGE = { userId: null, userName: DELETED_USER_NAME };
const ANONYMOUS_PLACE_PHOTO = { userId: null, userName: DELETED_USER_NAME, userPhoto: '' };
const ANONYMOUS_REPORTER = {
  userId: null, reportedByUserId: null, reporterUid: null,
  userName: DELETED_USER_NAME, reportedByName: DELETED_USER_NAME, userEmail: null,
};

/** Prefijo de las URL de descarga de Storage de una carpeta (para encontrar portadas que la usan). */
function downloadUrlPrefix(bucketName, folderPath) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(folderPath)}`;
}

module.exports = {
  DELETED_USER_NAME,
  GDPR_AUDIT_RETAIN_DAYS,
  PERSONAL_STORAGE_FOLDERS,
  ANONYMOUS_COMMENT,
  ANONYMOUS_FORUM_MESSAGE,
  ANONYMOUS_PLACE_PHOTO,
  ANONYMOUS_REPORTER,
  toExportValue,
  exportDoc,
  planChatCleanup,
  downloadUrlPrefix,
};
