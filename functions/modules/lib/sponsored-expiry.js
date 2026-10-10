// functions/modules/lib/sponsored-expiry.js
//
// Cierre automático de campañas patrocinadas vencidas (B1), llamado a diario
// por expireManualPlans (admin/admin-plans.js). Recibe `db` y las funciones de
// aviso y auditoría para poder probarlo con un Firestore falso
// (functions/test/sponsored-expiry.test.js).
//
// Antes la consulta era where('endsAt','<',hoy).limit(200) sin estado: con
// 200 campañas viejas ya cerradas o rechazadas, el lote se llenaba con ellas
// y las activas vencidas no se cerraban nunca (bug 7). Ahora cada paso filtra
// por estado, con el índice compuesto (status, endsAt ASC) de
// firestore.indexes.json. Si el índice aún no existe (se despliega aparte con
// `firebase deploy --only firestore:indexes`) se consulta solo por estado y
// endsAt se filtra en memoria, para no dejar de cerrar nada mientras tanto.
//
// Las solicitudes (`requested`) de campañas home/búsqueda cuyas fechas ya
// pasaron se rechazan solas: ocupaban cupo para siempre (bug 8). Los platos
// destacados no tienen fechas hasta que se activan, así que no entran aquí.

const { FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const { isMissingIndex } = require("./user-reviews");

const SYSTEM_ACTOR = "system";
const CAMPAIGN_EXPIRY_LIMIT = 200;
const EXPIRED_REQUEST_NOTE = "Caducada sin revisar";

// Cómo se llama cada colección en la auditoría y en los avisos (igual que
// sponsored.js en el cierre manual).
const CAMPAIGN_COLLECTIONS = {
  sponsoredItemSpotlights: { idKey: "spotlightId", notificationPrefix: "item_spotlight_" },
  sponsoredPlacements: { idKey: "placementId", notificationPrefix: "sponsored_" },
};

// Primero se cierran las activas (liberan cupo) y después caducan las solicitudes.
const CAMPAIGN_EXPIRY_STEPS = [
  { collection: "sponsoredItemSpotlights", fromStatus: "active", toStatus: "ended" },
  { collection: "sponsoredPlacements", fromStatus: "active", toStatus: "ended" },
  { collection: "sponsoredPlacements", fromStatus: "requested", toStatus: "rejected" },
];

const isIsoDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** ¿Este documento lo tiene que cerrar este paso? (`endsAt` es el último día, incluido). */
function isCampaignExpired(data, step, today) {
  return Boolean(data)
    && data.status === step.fromStatus
    && isIsoDate(data.endsAt)
    && data.endsAt < today;
}

/**
 * Lo que se escribe al cerrar. Las activas pasan a `ended` con endedBy/closedBy
 * 'system'; las solicitudes vencidas pasan a `rejected` con la nota
 * «Caducada sin revisar». Si una activa no tiene activatedBy/activatedAt (las
 * anteriores a B5), se copian de reviewedBy/reviewedAt, que en una activa es
 * la activación: así no se pierde quién la activó.
 */
function campaignExpiryPatch(step, data = {}, serverTimestamp = FieldValue.serverTimestamp()) {
  if (step.toStatus === "ended") {
    const patch = {
      status: "ended",
      endedAt: serverTimestamp,
      endedBy: SYSTEM_ACTOR,
      closedAt: serverTimestamp,
      closedBy: SYSTEM_ACTOR,
    };
    if (!data.activatedBy && typeof data.reviewedBy === "string" && data.reviewedBy) patch.activatedBy = data.reviewedBy;
    if (!data.activatedAt && data.reviewedAt) patch.activatedAt = data.reviewedAt;
    return patch;
  }
  return {
    status: "rejected",
    adminNotes: EXPIRED_REQUEST_NOTE,
    closedAt: serverTimestamp,
    closedBy: SYSTEM_ACTOR,
  };
}

/** Aviso al negocio, con el mismo tipo, enlace e id que el cierre manual. */
function campaignExpiredNotification(step, campaignId, data = {}) {
  const config = CAMPAIGN_COLLECTIONS[step.collection];
  const placeName = data.placeName || "tu negocio";
  let message;
  if (step.collection === "sponsoredItemSpotlights") {
    message = data.itemName
      ? `Tu campaña del plato "${data.itemName}" ha finalizado.`
      : "Tu campaña de plato destacado ha finalizado.";
  } else if (step.toStatus === "ended") {
    message = `Tu campaña patrocinada de ${placeName} ha finalizado.`;
  } else {
    message = `Tu solicitud de patrocinio de ${placeName} ha caducado sin revisarse porque sus fechas ya han pasado. Si quieres, pide otra con fechas nuevas.`;
  }
  return {
    userId: data.createdBy || null,
    type: "business_pro_update",
    payload: {
      message,
      link: `/businesses/${data.placeId}/manage`,
      placeId: data.placeId,
    },
    options: { notificationId: `${config.notificationPrefix}${campaignId}` },
  };
}

function campaignExpiredAudit(step, campaignId, data = {}) {
  const config = CAMPAIGN_COLLECTIONS[step.collection];
  return {
    collection: step.collection,
    [config.idKey]: campaignId,
    placeId: data.placeId || null,
    placeName: data.placeName || null,
    itemName: data.itemName || null,
    previousStatus: step.fromStatus,
    nextStatus: step.toStatus,
    endsAt: data.endsAt || null,
  };
}

// Páginas como máximo del fallback sin índice (lotes de `limit` campañas abiertas).
const FALLBACK_MAX_PAGES = 10;

// Documentos candidatos del paso. Con índice: solo los del estado, por endsAt.
// Sin índice: solo por estado (índice simple, siempre existe), paginando, y
// endsAt se filtra en memoria. No se vuelve a la consulta antigua por endsAt:
// las campañas cerradas crecen sin parar y llenaban el lote (bug 7); las
// abiertas son pocas (cupo de 5-10 por local).
async function findExpiredCampaigns(db, step, today, limit) {
  const collection = db.collection(step.collection);
  try {
    const snap = await collection
      .where("status", "==", step.fromStatus)
      .where("endsAt", "<", today)
      .limit(limit)
      .get();
    return { docs: snap.docs, degraded: false, full: snap.size >= limit };
  } catch (error) {
    if (!isMissingIndex(error)) throw error;
    logger.warn("expireSponsoredCampaigns: falta el índice (status, endsAt); se filtra en memoria", {
      collection: step.collection,
      status: step.fromStatus,
    });
    const docs = [];
    let cursor = null;
    let more = false;
    for (let page = 0; page < FALLBACK_MAX_PAGES && docs.length < limit; page += 1) {
      let pageQuery = collection.where("status", "==", step.fromStatus).limit(limit);
      if (cursor) pageQuery = pageQuery.startAfter(cursor);
      const snap = await pageQuery.get();
      snap.docs.forEach((docSnap) => {
        if (isCampaignExpired(docSnap.data(), step, today)) docs.push(docSnap);
      });
      more = snap.size >= limit;
      if (!more) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
    return { docs: docs.slice(0, limit), degraded: true, full: more || docs.length > limit };
  }
}

/**
 * Cierra las campañas vencidas. `today` es 'YYYY-MM-DD'.
 * `send(uid, type, payload, options)` y `audit(actor, action, details)` son
 * sendNotification y writeAuditLog (ninguno lanza). Cada cierre va en una
 * transacción que vuelve a comprobar el estado, por si un jefe la está
 * revisando a la vez.
 */
async function expireSponsoredCampaigns({ db, today, send, audit, limit = CAMPAIGN_EXPIRY_LIMIT }) {
  const summary = { closed: 0, steps: [] };

  for (const step of CAMPAIGN_EXPIRY_STEPS) {
    const stepSummary = { ...step, found: 0, closed: 0, degraded: false, truncated: false, error: null };
    summary.steps.push(stepSummary);

    let found;
    try {
      found = await findExpiredCampaigns(db, step, today, limit);
    } catch (error) {
      stepSummary.error = error.message || String(error);
      logger.error("expireSponsoredCampaigns: error en la consulta", { collection: step.collection, status: step.fromStatus, error: stepSummary.error });
      continue;
    }
    stepSummary.found = found.docs.length;
    stepSummary.degraded = found.degraded;
    stepSummary.truncated = found.full;

    for (const campaignDoc of found.docs) {
      let closedData = null;
      try {
        closedData = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(campaignDoc.ref);
          const data = fresh.exists ? fresh.data() : null;
          if (!isCampaignExpired(data, step, today)) return null;
          tx.set(campaignDoc.ref, campaignExpiryPatch(step, data), { merge: true });
          return data;
        });
      } catch (error) {
        logger.error("expireSponsoredCampaigns: no se pudo cerrar", { collection: step.collection, id: campaignDoc.id, error: error.message || String(error) });
        continue;
      }
      if (!closedData) continue;

      stepSummary.closed += 1;
      summary.closed += 1;
      await audit(SYSTEM_ACTOR, "sponsored.campaignExpired", campaignExpiredAudit(step, campaignDoc.id, closedData));
      const notification = campaignExpiredNotification(step, campaignDoc.id, closedData);
      if (notification.userId && closedData.placeId) {
        await send(notification.userId, notification.type, notification.payload, notification.options);
      }
    }

    if (stepSummary.truncated) {
      logger.warn("expireSponsoredCampaigns: lote lleno; el resto se cierra en la próxima ejecución", {
        collection: step.collection,
        status: step.fromStatus,
        limit,
      });
    }
  }

  return summary;
}

module.exports = {
  SYSTEM_ACTOR,
  CAMPAIGN_EXPIRY_LIMIT,
  EXPIRED_REQUEST_NOTE,
  CAMPAIGN_EXPIRY_STEPS,
  isCampaignExpired,
  campaignExpiryPatch,
  campaignExpiredNotification,
  campaignExpiredAudit,
  expireSponsoredCampaigns,
};
