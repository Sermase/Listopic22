// functions/modules/lib/notify-jefes.js
//
// Avisos in-app (y push) a los jefes del panel Developer.
//
// Un jefe es un usuario con 'jefe' en `userType`, que puede ser un string o
// un array (ver normalizeUserTypes en lib/auth.js). Firestore no tiene una
// consulta que cubra los dos casos: `array-contains` solo ve arrays y `==`
// solo ve strings, así que se lanzan las dos y se unen por id.
//
// Antes `reports.js` buscaba `role in ['admin','developer']`, un campo que
// nadie escribe, y ningún jefe recibía `new_report` (bug 3 del plan).
//
// El texto de cada aviso se arma aquí con funciones puras para poder
// probarlo sin Firestore (functions/test/notify-jefes.test.js).
//
// Ojo con el payload: `getNotificationLink` (frontend/src/utils/
// notificationLinks.ts) manda a /place/<placeId> si el aviso lleva `placeId`.
// Los avisos para jefes NO llevan `placeId` para que el clic abra Developer.
//
// B8: lo que llega a la bandeja (solicitudes de negocio, propuestas de carta,
// campañas y platos destacados) avisa con tipo `admin_pending`, id
// `admin_pending_<colección>_<id>` (uno por elemento: la lista de avisos no los
// junta) y un enlace al elemento en su pestaña de Developer
// (?tab=…&view=…&focus=<id>, ver developerTabs.ts y targetFor en adminQueues.ts).
// Un fallo al avisar nunca tumba la callable: usa safeNotifyJefes.

const logger = require("firebase-functions/logger");

const JEFE_QUERY_LIMIT = 25;

const REPORT_ISSUE_LABELS = {
  inappropriate: "Contenido inapropiado",
  child_safety: "Seguridad infantil",
  spam: "Spam",
  fake: "Falso o engañoso",
  place_closed: "El sitio ha cerrado",
  item_missing: "El elemento ya no existe",
  duplicate: "Duplicado",
  item_not_available: "Ya no está disponible",
  incorrect_info: "Información incorrecta",
  wrong_place: "Sitio equivocado",
  harassment: "Acoso",
  impersonation: "Suplantación",
  other: "Otro motivo",
};

// Mismo criterio que la bandeja (URGENT_REPORT_ISSUES en adminQueues.ts).
const URGENT_REPORT_ISSUES = new Set(["child_safety", "harassment", "impersonation"]);

const text = (value, maxLength = 120) => (typeof value === "string" ? value.trim().slice(0, maxLength) : "");

const quote = (value) => `«${value}»`;

/** Enlace a un elemento en su pestaña de Developer (mismo contrato que targetFor en adminQueues.ts). */
function developerLink(tab, view, focusId) {
  return `/developer?tab=${tab}&view=${view}&focus=${encodeURIComponent(focusId)}`;
}

/**
 * uids de los jefes, sin repetir. Si una de las dos consultas falla se usa
 * la otra: mejor avisar a algunos que a ninguno.
 */
async function findJefeUids(db, { limit = JEFE_QUERY_LIMIT } = {}) {
  const users = db.collection("users");
  const results = await Promise.allSettled([
    users.where("userType", "array-contains", "jefe").limit(limit).get(),
    users.where("userType", "==", "jefe").limit(limit).get(),
  ]);

  const uids = [];
  results.forEach((result, index) => {
    if (result.status !== "fulfilled") {
      logger.warn("notifyJefes: falló una consulta de jefes", {
        query: index === 0 ? "array-contains" : "==",
        error: result.reason?.message || String(result.reason),
      });
      return;
    }
    result.value.docs.forEach((docSnap) => {
      if (!uids.includes(docSnap.id)) uids.push(docSnap.id);
    });
  });
  return uids;
}

/**
 * Envía el mismo aviso a todos los jefes menos a `excludeUids` (quien lo
 * provocó, si es jefe). `send` es sendNotification(uid, type, payload, options).
 * Devuelve a quién se avisó.
 */
async function notifyJefes({ db, send, type, payload, notificationId = null, excludeUids = [] }) {
  const exclude = new Set((excludeUids || []).filter(Boolean));
  const uids = (await findJefeUids(db)).filter((uid) => !exclude.has(uid));

  if (uids.length === 0) {
    logger.info("notifyJefes: no hay jefes a los que avisar", { type });
    return { notified: 0, uids: [] };
  }

  const options = notificationId ? { notificationId } : {};
  await Promise.all(uids.map((uid) => send(uid, type, payload, options)));
  return { notified: uids.length, uids };
}

/**
 * notifyJefes con un aviso ya armado ({ type, payload, notificationId,
 * excludeUids }) que nunca lanza: el aviso es secundario y no puede hacer
 * fallar la solicitud del negocio. Devuelve el resultado o null si falló.
 */
async function safeNotifyJefes({ db, send, alert }) {
  try {
    const { type, payload, notificationId, excludeUids } = alert;
    return await notifyJefes({ db, send, type, payload, notificationId, excludeUids });
  } catch (error) {
    logger.error("notifyJefes: no se pudo avisar a los jefes", {
      notificationId: alert?.notificationId || null,
      error: error?.message || String(error),
    });
    return null;
  }
}

// ── Avisos concretos ────────────────────────────────────────────────────────

/** Aviso de reporte nuevo (B2). */
function reportAlert(reportId, report = {}) {
  const issueType = text(report.issueType, 60) || "other";
  const issueLabel = REPORT_ISSUE_LABELS[issueType] || issueType;
  const target = text(report.targetName, 120) || text(report.itemName, 120) || text(report.targetId, 120) || "un contenido";
  const urgent = URGENT_REPORT_ISSUES.has(issueType);
  const reporterUid = report.userId || report.reportedByUserId || report.reporterUid || null;

  return {
    type: "new_report",
    notificationId: `report_${reportId}`,
    excludeUids: [reporterUid],
    payload: {
      message: urgent
        ? `🚨 Reporte urgente: ${issueLabel} en «${target}»`
        : `🚩 Nuevo reporte: ${issueLabel} en «${target}»`,
      link: `/developer?tab=reports&view=pending&focus=${encodeURIComponent(reportId)}`,
      reportId,
      targetType: report.targetType || null,
      issueType,
      urgent,
    },
  };
}

/** Aviso de solicitud de negocio nueva o reenviada (B8, solo solicitudes). */
function businessClaimAlert(claimId, claim = {}, { resubmission = false } = {}) {
  const placeName = text(claim.placeName, 120) || text(claim.placeId, 120) || "un negocio";
  const claimant = text(claim.userName, 80) || text(claim.userEmail, 120) || text(claim.contactEmail, 120);
  const who = claimant ? ` (${claimant})` : "";

  return {
    type: "admin_pending",
    notificationId: `admin_pending_businessClaims_${claimId}`,
    excludeUids: [claim.userId || null],
    payload: {
      message: resubmission
        ? `🔁 Solicitud de negocio reenviada: ${placeName}${who}`
        : `🏪 Nueva solicitud de negocio: ${placeName}${who}`,
      link: developerLink("businessClaims", "pending", claimId),
      queue: "businessClaims",
      itemId: claimId,
      placeName,
      resubmission,
    },
  };
}

// Mismas etiquetas que la bandeja (PROPOSAL_TYPES en adminQueues.ts).
const PROPOSAL_TYPE_LABELS = {
  merge: "🔀 Fusión",
  rename: "✏️ Renombre",
  reassign_review: "↪️ Mover reseña",
};

function proposalSummary(type, payload = {}) {
  if (type === "merge") {
    return `${quote(text(payload.sourceItemName) || text(payload.sourceItemId))} → ${quote(text(payload.targetItemName) || text(payload.targetItemId))}`;
  }
  if (type === "rename") {
    return `${quote(text(payload.currentName) || text(payload.itemId))} → ${quote(text(payload.newName))}`;
  }
  if (type === "reassign_review") {
    const author = text(payload.reviewAuthorName, 60);
    return `${quote(text(payload.reviewItemName) || "reseña")}${author ? ` de ${author}` : ""} → ${quote(text(payload.targetItemName) || text(payload.targetItemId))}`;
  }
  return "";
}

/** B8: propuesta de carta nueva (submitItemProposal). */
function itemProposalAlert(proposalId, proposal = {}) {
  const placeName = text(proposal.placeName, 120) || text(proposal.placeId, 120) || "un negocio";
  const label = PROPOSAL_TYPE_LABELS[proposal.type] || "📝 Cambio";
  const summary = proposalSummary(proposal.type, proposal.payload || {});
  return {
    type: "admin_pending",
    notificationId: `admin_pending_itemProposals_${proposalId}`,
    excludeUids: [proposal.createdBy || null],
    payload: {
      message: `📝 Propuesta de carta en ${placeName}: ${label}${summary ? ` ${summary}` : ""}`,
      link: developerLink("proProposals", "inbox", proposalId),
      queue: "itemProposals",
      itemId: proposalId,
      placeName,
      proposalType: proposal.type || null,
    },
  };
}

function campaignDates(startsAt, endsAt) {
  const short = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || "") ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
  const from = short(startsAt);
  const to = short(endsAt);
  if (from && to) return `del ${from} al ${to}`;
  if (to) return `hasta el ${to}`;
  if (from) return `desde el ${from}`;
  return "";
}

/** B8: campaña de home o búsqueda solicitada (requestSponsoredPlacement). */
function sponsoredPlacementAlert(placementId, placement = {}) {
  const placeName = text(placement.placeName, 120) || text(placement.placeId, 120) || "un negocio";
  const headline = text(placement.headline, 120);
  const parts = [
    placement.type === "search" ? "Búsqueda" : "Home",
    headline && quote(headline),
    campaignDates(placement.startsAt, placement.endsAt),
  ].filter(Boolean);
  return {
    type: "admin_pending",
    notificationId: `admin_pending_sponsoredPlacements_${placementId}`,
    excludeUids: [placement.createdBy || null],
    payload: {
      message: `📣 Campaña solicitada: ${placeName} · ${parts.join(" · ")}`,
      link: developerLink("proProposals", "inbox", placementId),
      queue: "sponsoredPlacements",
      itemId: placementId,
      placeName,
    },
  };
}

/** B8: plato destacado solicitado (requestItemSpotlight). */
function itemSpotlightAlert(spotlightId, spotlight = {}) {
  const placeName = text(spotlight.placeName, 120) || text(spotlight.placeId, 120) || "un negocio";
  const itemName = text(spotlight.itemName, 120) || text(spotlight.itemId, 120) || "un plato";
  const radiusKm = Number(spotlight.radiusKm);
  const days = Number(spotlight.days);
  const impulses = Number(spotlight.impulses);
  const reach = [
    Number.isFinite(radiusKm) && radiusKm > 0 ? `${radiusKm.toLocaleString("es-ES")} km` : "",
    Number.isFinite(days) && days > 0 ? `${days} d` : "",
  ].filter(Boolean).join(" × ");
  const parts = [
    placeName,
    reach,
    Number.isFinite(impulses) && impulses > 0 ? `${impulses.toLocaleString("es-ES")} impulsos` : "",
  ].filter(Boolean);
  return {
    type: "admin_pending",
    notificationId: `admin_pending_sponsoredItemSpotlights_${spotlightId}`,
    excludeUids: [spotlight.createdBy || null],
    payload: {
      message: `🍽️ Plato destacado solicitado: ${quote(itemName)} · ${parts.join(" · ")}`,
      link: developerLink("proProposals", "inbox", spotlightId),
      queue: "sponsoredItemSpotlights",
      itemId: spotlightId,
      placeName,
    },
  };
}

module.exports = {
  JEFE_QUERY_LIMIT,
  REPORT_ISSUE_LABELS,
  URGENT_REPORT_ISSUES,
  findJefeUids,
  notifyJefes,
  safeNotifyJefes,
  developerLink,
  reportAlert,
  businessClaimAlert,
  itemProposalAlert,
  sponsoredPlacementAlert,
  itemSpotlightAlert,
};
