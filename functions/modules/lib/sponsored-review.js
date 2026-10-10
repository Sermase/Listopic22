// functions/modules/lib/sponsored-review.js
//
// B5: lo que escriben reviewSponsoredPlacement y reviewItemSpotlight
// (sponsored.js) cuando un jefe activa, rechaza o finaliza una campaña. Reglas
// puras, sin Firestore, para probarlas con node --test
// (functions/test/sponsored-review.test.js).
//
// Campos de cada decisión:
// - activar:   activatedBy / activatedAt (quién la puso en marcha y cuándo).
// - rechazar:  closedBy / closedAt.
// - finalizar: endedBy / endedAt y closedBy / closedAt. No toca activatedBy /
//   activatedAt; si la campaña es anterior a B5 y no los tiene, se copian de
//   reviewedBy / reviewedAt, que en una campaña activa son la activación (lo
//   mismo que hace el cierre automático en lib/sponsored-expiry.js).
// reviewedBy / reviewedAt / adminNotes siguen siendo la última decisión, como
// hasta ahora (el panel y el negocio los leen así).
//
// Activar una campaña cuyo último día (endsAt, incluido) ya pasó se rechaza:
// se serviría cero días y el cierre nocturno la cerraría esa misma noche.
// Solo en las campañas de home/búsqueda, cuyas fechas elige el negocio al
// pedirla. Un plato destacado recibe fechas nuevas al activarlo (las que
// guardaban las solicitudes antiguas no cuentan): { checkEndsAt: false }.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const CAMPAIGN_DECISIONS = Object.freeze({
  activate: Object.freeze({ fromStatus: "requested", toStatus: "active" }),
  reject: Object.freeze({ fromStatus: "requested", toStatus: "rejected" }),
  end: Object.freeze({ fromStatus: "active", toStatus: "ended" }),
});

const STATE_MISMATCH_MESSAGE = "La campaña ya no está en un estado compatible con esa acción.";

const isIsoDate = (value) => typeof value === "string" && ISO_DATE.test(value);

/** Fecha 'YYYY-MM-DD' de hoy en Madrid (las fechas de las campañas son de calendario español). */
function madridToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** '2026-10-05' → '05/10/2026' para los mensajes al jefe. */
function formatIsoDate(iso) {
  if (!isIsoDate(iso)) return String(iso || "");
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Motivo para no aplicar la decisión, o null si se puede.
 * Devuelve { code, message } (código de HttpsError).
 * checkEndsAt: false si activar fija fechas nuevas (platos destacados).
 */
function campaignDecisionError(decision, data, today, { checkEndsAt = true } = {}) {
  const rule = CAMPAIGN_DECISIONS[decision];
  if (!rule) return { code: "invalid-argument", message: "Decisión no válida." };
  if (!data || data.status !== rule.fromStatus) {
    return { code: "failed-precondition", message: STATE_MISMATCH_MESSAGE };
  }
  if (decision === "activate" && checkEndsAt && isIsoDate(data.endsAt) && isIsoDate(today) && data.endsAt < today) {
    return {
      code: "failed-precondition",
      message: `Esta campaña terminaba el ${formatIsoDate(data.endsAt)} y esa fecha ya ha pasado. Recházala o pide al negocio una con fechas nuevas.`,
    };
  }
  return null;
}

/**
 * Patch (merge) de la decisión. `serverTimestamp` es FieldValue.serverTimestamp()
 * (se recibe para no importar Firebase aquí).
 */
function campaignReviewPatch(decision, data = {}, { uid, adminNotes = "", serverTimestamp }) {
  const rule = CAMPAIGN_DECISIONS[decision];
  if (!rule) throw new Error(`campaignReviewPatch: decisión desconocida ${decision}`);
  const patch = {
    status: rule.toStatus,
    adminNotes: adminNotes || null,
    reviewedBy: uid,
    reviewedAt: serverTimestamp,
  };
  if (decision === "activate") {
    patch.activatedBy = uid;
    patch.activatedAt = serverTimestamp;
    return patch;
  }
  patch.closedBy = uid;
  patch.closedAt = serverTimestamp;
  if (decision === "end") {
    patch.endedBy = uid;
    patch.endedAt = serverTimestamp;
    // Campañas activadas antes de B5: reviewedBy/At era la activación y ahora
    // pasa a ser el cierre. Se guarda antes de perderlo.
    if (!data.activatedBy && typeof data.reviewedBy === "string" && data.reviewedBy) patch.activatedBy = data.reviewedBy;
    if (!data.activatedAt && data.reviewedAt) patch.activatedAt = data.reviewedAt;
  }
  return patch;
}

module.exports = {
  CAMPAIGN_DECISIONS,
  STATE_MISMATCH_MESSAGE,
  madridToday,
  formatIsoDate,
  campaignDecisionError,
  campaignReviewPatch,
};
