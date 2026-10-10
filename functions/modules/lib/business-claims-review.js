// functions/modules/lib/business-claims-review.js
//
// Reglas puras de la revisión de solicitudes de negocio (businessClaims),
// separadas de business-claims.js para probarlas sin Firestore
// (functions/test/business-claims-review.test.js).
//
// B3 · Reenvío: el cliente reenvía una solicitud rechazada con un setDoc
//      completo (BusinessClaimService.createBusinessClaim), que borra la
//      decisión anterior. onBusinessClaimUpdated la guarda en
//      `previousReviews` con estas funciones.
// B4 · Transferencia: aprobar una solicitud sobre un lugar ya verificado por
//      otra persona le quita la propiedad. Solo se permite si el jefe lo
//      confirma (`allowOwnerTransfer: true`).

// Tope de decisiones anteriores guardadas en el documento (las más recientes).
const MAX_PREVIOUS_REVIEWS = 10;

const millisOf = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value._seconds === "number") return value._seconds * 1000;
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
};

/** Un reenvío es el paso de `rejected` a `pending`. */
function isClaimResubmission(before, after) {
  return Boolean(before && after) && before.status === "rejected" && after.status === "pending";
}

/**
 * La decisión que el reenvío va a borrar, tal y como la lee el panel
 * (claimUtils.toClaim: status, adminNotes, reviewedBy, reviewedAt, proofs).
 * `archivedAt` es un Timestamp ya resuelto: Firestore no admite
 * serverTimestamp() dentro de un array.
 */
function buildPreviousReview(before = {}, archivedAt = null) {
  return {
    status: typeof before.status === "string" && before.status ? before.status : "rejected",
    adminNotes: typeof before.adminNotes === "string" && before.adminNotes ? before.adminNotes : null,
    reviewedBy: typeof before.reviewedBy === "string" && before.reviewedBy ? before.reviewedBy : null,
    reviewedAt: before.reviewedAt || null,
    submittedAt: before.createdAt || null,
    proofs: Array.isArray(before.proofs) ? before.proofs : [],
    archivedAt,
  };
}

// Misma decisión = mismo estado, autor, nota y fechas. Sirve para no
// duplicarla si Firestore entrega el evento dos veces.
const reviewKey = (review = {}) => [
  review.status || "",
  review.reviewedBy || "",
  millisOf(review.reviewedAt),
  millisOf(review.submittedAt),
  review.adminNotes || "",
].join("|");

/**
 * Añade `entry` al final del historial si no estaba ya. Guarda como mucho
 * `max` entradas (las últimas).
 */
function appendPreviousReview(existing, entry, max = MAX_PREVIOUS_REVIEWS) {
  const list = Array.isArray(existing) ? existing.filter((item) => item && typeof item === "object") : [];
  const key = reviewKey(entry);
  if (list.some((item) => reviewKey(item) === key)) {
    return { list, appended: false };
  }
  const next = [...list, entry];
  return { list: next.length > max ? next.slice(next.length - max) : next, appended: true };
}

/**
 * B4. ¿Aprobar esta solicitud quitaría la propiedad a otra persona?
 * Devuelve el propietario actual que se sustituiría (o null) y si hay que
 * bloquear la aprobación porque el jefe no lo ha confirmado.
 */
function ownerTransferCheck(place, claimUserId, allowOwnerTransfer) {
  const data = place || {};
  const currentOwner = typeof data.businessOwnerUserId === "string" ? data.businessOwnerUserId : "";
  const replacesOwner = Boolean(data.businessVerified) && Boolean(currentOwner) && currentOwner !== claimUserId;
  return {
    previousOwnerUserId: replacesOwner ? currentOwner : null,
    blocked: replacesOwner && allowOwnerTransfer !== true,
  };
}

module.exports = {
  MAX_PREVIOUS_REVIEWS,
  isClaimResubmission,
  buildPreviousReview,
  appendPreviousReview,
  ownerTransferCheck,
};
