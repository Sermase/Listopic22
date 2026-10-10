// functions/modules/lib/item-proposals.js
//
// B7: revisión segura de propuestas de carta (reviewItemProposal en
// business-items.js). Reglas puras, sin Firestore, para probarlas con
// node --test (functions/test/item-proposals.test.js).
//
// Estados de itemProposals/{id}:
//   pending ──aprobar──▶ applying ──bien──▶ approved (applyResult)
//      ▲                    │
//      └──── falla ─────────┘ (applyError, vuelve a pending)
//   pending ──rechazar──▶ rejected
//
// - Aprobar reserva antes la propuesta en una transacción (pending → applying
//   con reviewedBy y applyingAt). Así dos jefes no aplican la misma fusión dos
//   veces: el segundo ve 'applying' y se le dice que espere.
// - Si la función muere a medias (timeout, despliegue), la propuesta se queda
//   en 'applying'. Pasados APPLY_STALE_MS (más que el timeout de 300 s del
//   callable, así que nadie la está aplicando ya) se puede reintentar; la
//   bandeja la marca «⏳ Atascada». Rechazarla no: parte del cambio puede estar
//   ya escrito (la fusión se guarda antes de reconstruir la carta). Si el
//   reintento falla, vuelve a 'pending' y entonces se puede rechazar (salvo
//   que el cambio ya esté en la carta, ver abajo). Aplicar es idempotente:
//   los alias van con arrayUnion y una fusión ya hecha se reconoce
//   (alreadyMerged).
// - Una 'pending' con applyError también puede estar aplicada en parte (la
//   fusión o el nombre nuevo se guardaron y falló el rebuild). Rechazarla la
//   marcaría rechazada con el cambio dentro, así que si el cambio ya se ve en
//   la carta (rejectAfterApplyErrorCheck) se pide reintentarla.
// - Lo que escribe la llamada al acabar (approved, o la vuelta a pending) solo
//   se guarda si la reserva sigue siendo suya (holdsApplyReservation): una
//   llamada que se pasó de tiempo y sigue viva no pisa a quien la retomó.
// - Antes de aplicar se comprueba que el origen y el destino siguen activos
//   con el modelo de identidad de lib/canonical-resolve.js (followMerged).

const { HttpsError } = require("firebase-functions/v2/https");
const { safeDocId, followMerged } = require("./canonical-resolve");

const APPLY_STALE_MS = 10 * 60 * 1000;
const APPLY_ERROR_MAX_LENGTH = 300;

const millisOf = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
};

/** Desde cuándo está la propuesta en 'applying' (0 si no se sabe). */
function applyingSinceMs(data) {
  if (!data) return 0;
  return millisOf(data.applyingAt) || millisOf(data.reviewedAt);
}

/** 'applying' desde hace más de APPLY_STALE_MS (o sin hora): nadie la está aplicando ya. */
function isStaleApplying(data, now = Date.now()) {
  if (!data || data.status !== "applying") return false;
  const since = applyingSinceMs(data);
  return !since || now - since >= APPLY_STALE_MS;
}

/**
 * ¿Se puede tomar esta decisión ('approve' | 'reject') ahora? Vale 'pending';
 * un 'applying' atascado solo se puede reintentar (aprobar). Devuelve
 * { ok: true, retry } o { ok: false, code, message }.
 */
function proposalReviewCheck(data, now = Date.now(), decision = "approve") {
  if (!data) return { ok: false, code: "not-found", message: "La propuesta no existe." };
  if (data.status === "pending") return { ok: true, retry: false };
  if (data.status === "applying") {
    if (!isStaleApplying(data, now)) {
      return {
        ok: false,
        code: "failed-precondition",
        message: "Otro administrador está aplicando esta propuesta ahora mismo. Espera un momento y actualiza.",
      };
    }
    if (decision !== "approve") {
      return {
        ok: false,
        code: "failed-precondition",
        message: "Esta propuesta se quedó a medias al aplicarla y puede que parte del cambio ya esté hecho. Reinténtala para terminarla; si no se puede aplicar, volverá a pendiente y entonces podrás rechazarla.",
      };
    }
    return { ok: true, retry: true };
  }
  return { ok: false, code: "failed-precondition", message: "Esta propuesta ya fue revisada." };
}

/**
 * ¿Sigue siendo de esta llamada la reserva? Está en 'applying' con el mismo
 * revisor y la misma hora de reserva (applyingAt) que escribió al reservarla.
 */
function holdsApplyReservation(data, uid, applyingAtMs) {
  return Boolean(data)
    && data.status === "applying"
    && data.reviewedBy === uid
    && applyingAtMs > 0
    && millisOf(data.applyingAt) === applyingAtMs;
}

/** Lo que se guarda si aplicar falla (y la propuesta vuelve a 'pending'). */
function applyErrorInfo(error, uid) {
  const rawMessage = error && typeof error.message === "string" && error.message.trim()
    ? error.message.trim()
    : "Error desconocido al aplicar la propuesta.";
  const rawCode = error ? error.code : null;
  return {
    message: rawMessage.slice(0, APPLY_ERROR_MAX_LENGTH),
    code: rawCode === undefined || rawCode === null || rawCode === "" ? null : String(rawCode).slice(0, 60),
    by: uid || null,
  };
}

const nameOf = (item, itemId) => (item && typeof item.canonicalName === "string" && item.canonicalName.trim()) || itemId;

/**
 * Fusión: origen y destino (siguiendo fusiones) activos y distintos.
 * Devuelve { sourceId, targetId, alreadyMerged }. alreadyMerged: el origen ya
 * está fusionado en ese destino (un reintento tras un fallo o la misma fusión
 * hecha por otra vía); se completa sin volver a tocar el origen.
 */
function checkMergeItems(itemsById, payload = {}) {
  const sourceId = safeDocId(payload.sourceItemId);
  const source = itemsById.get(sourceId);
  if (!source) throw new HttpsError("not-found", `El elemento ${sourceId} no existe.`);
  const requestedTargetId = safeDocId(payload.targetItemId);
  if (!itemsById.has(requestedTargetId)) {
    throw new HttpsError("not-found", `El elemento ${payload.targetItemId} no existe.`);
  }
  const targetId = followMerged(requestedTargetId, itemsById);
  const target = itemsById.get(targetId);
  if (!target || target.status === "inactive") {
    throw new HttpsError("failed-precondition", "El elemento destino ya no está activo.");
  }
  if (source.status === "inactive") {
    const sourceResolvedId = followMerged(sourceId, itemsById);
    if (sourceResolvedId === targetId && sourceResolvedId !== sourceId) {
      return { sourceId, targetId, alreadyMerged: true };
    }
    if (source.mergedInto && sourceResolvedId !== sourceId) {
      const otherName = nameOf(itemsById.get(sourceResolvedId), sourceResolvedId);
      throw new HttpsError(
        "failed-precondition",
        `«${nameOf(source, sourceId)}» ya se fusionó con «${otherName}». Propón la fusión sobre ese elemento.`,
        { itemId: sourceResolvedId, canonicalName: otherName },
      );
    }
    throw new HttpsError("failed-precondition", `El elemento origen «${nameOf(source, sourceId)}» ya no está activo en la carta.`);
  }
  if (targetId === sourceId) throw new HttpsError("failed-precondition", "Los dos elementos ya son el mismo.");
  return { sourceId, targetId, alreadyMerged: false };
}

/** Renombrado: el elemento existe y sigue activo. Devuelve { itemId, item }. */
function checkRenameItem(itemsById, payload = {}) {
  const itemId = safeDocId(payload.itemId);
  const item = itemsById.get(itemId);
  if (!item) throw new HttpsError("not-found", `El elemento ${itemId} no existe.`);
  if (item.status === "inactive" && item.mergedInto) {
    const targetId = followMerged(itemId, itemsById);
    const targetName = nameOf(itemsById.get(targetId), targetId);
    throw new HttpsError(
      "failed-precondition",
      `Este elemento se fusionó con «${targetName}». Propón el cambio de nombre sobre ese elemento.`,
      { itemId: targetId, canonicalName: targetName },
    );
  }
  if (item.status === "inactive") {
    throw new HttpsError("failed-precondition", `«${nameOf(item, itemId)}» ya no está activo en la carta.`);
  }
  return { itemId, item };
}

/**
 * ¿Hay que mirar la carta antes de rechazar esta propuesta? Solo si falló al
 * aplicarse (pending con applyError) y es una fusión o un renombre, los dos
 * cambios que se pueden quedar escritos a medias y se ven en los elementos.
 */
function needsAppliedChangeCheck(data) {
  return Boolean(data)
    && data.status === "pending"
    && Boolean(data.applyError)
    && (data.type === "merge" || data.type === "rename")
    && typeof data.placeId === "string"
    && data.placeId.trim() !== ""
    && !data.placeId.includes("/");
}

/**
 * Rechazar una propuesta que falló al aplicarse: si su cambio ya está en la
 * carta, rechazarla no lo desharía. Fusión: el origen (siguiendo fusiones) ya
 * llega al destino. Renombre: el elemento ya se llama como el nombre nuevo.
 * Devuelve { ok: true } o { ok: false, code, message } (pide «🔁 Reintentar»).
 */
function rejectAfterApplyErrorCheck(data, itemsById) {
  if (!needsAppliedChangeCheck(data)) return { ok: true };
  const payload = data.payload || {};
  if (data.type === "merge") {
    const sourceId = safeDocId(payload.sourceItemId);
    const requestedTargetId = safeDocId(payload.targetItemId);
    if (!itemsById.has(sourceId) || !itemsById.has(requestedTargetId)) return { ok: true };
    const targetId = followMerged(requestedTargetId, itemsById);
    const sourceResolvedId = followMerged(sourceId, itemsById);
    if (sourceResolvedId === sourceId || sourceResolvedId !== targetId) return { ok: true };
    const sourceName = nameOf(itemsById.get(sourceId), sourceId);
    const targetName = nameOf(itemsById.get(targetId), targetId);
    return {
      ok: false,
      code: "failed-precondition",
      message: `Esta fusión ya está hecha: «${sourceName}» ya forma parte de «${targetName}». Lo que falló fue terminar de aplicarla, así que rechazarla no la desharía. Pulsa «🔁 Reintentar» para completarla.`,
    };
  }
  const itemId = safeDocId(payload.itemId);
  const item = itemsById.get(itemId);
  const newName = typeof payload.newName === "string" ? payload.newName.trim() : "";
  const currentName = item && typeof item.canonicalName === "string" ? item.canonicalName.trim() : "";
  if (!newName || currentName !== newName) return { ok: true };
  return {
    ok: false,
    code: "failed-precondition",
    message: `El nombre ya se cambió a «${newName}». Lo que falló fue terminar de aplicarlo, así que rechazarlo no lo desharía. Pulsa «🔁 Reintentar» para completarlo.`,
  };
}

/** Mover reseña: el destino (siguiendo fusiones) sigue activo. Devuelve { targetId, target }. */
function checkReassignTarget(itemsById, payload = {}) {
  const requestedId = safeDocId(payload.targetItemId);
  if (!itemsById.has(requestedId)) throw new HttpsError("not-found", `El elemento ${requestedId} no existe.`);
  const targetId = followMerged(requestedId, itemsById);
  const target = itemsById.get(targetId);
  if (!target || target.status === "inactive") {
    throw new HttpsError("failed-precondition", "El elemento destino ya no está activo.");
  }
  return { targetId, target };
}

module.exports = {
  APPLY_STALE_MS,
  APPLY_ERROR_MAX_LENGTH,
  applyingSinceMs,
  isStaleApplying,
  proposalReviewCheck,
  holdsApplyReservation,
  applyErrorInfo,
  checkMergeItems,
  checkRenameItem,
  checkReassignTarget,
  needsAppliedChangeCheck,
  rejectAfterApplyErrorCheck,
};
