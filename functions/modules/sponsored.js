// functions/modules/sponsored.js
//
// Contenido patrocinado Business Pro más allá de las ofertas del propio lugar:
// el negocio SOLICITA un emplazamiento (destacado en la home, en búsqueda...)
// y el admin lo activa, rechaza o finaliza desde Developer. Los emplazamientos
// activos se muestran siempre con etiqueta "Patrocinado" y nunca alteran
// valoraciones ni rankings orgánicos.
//
// Colección global `sponsoredPlacements/{id}` (lectura pública, escritura solo
// por estas funciones).

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { assertJefeAccess, writeAuditLog } = require("./lib/auth");
const { assertBusinessProAccess } = require("./business-pro");
const { sendNotification } = require("./notifications");

const db = getFirestore();

const asString = (value, maxLength = 500) => (typeof value === "string" ? value.trim().slice(0, maxLength) : "");

const PLACEMENT_TYPES = new Set(["home", "search"]);
const MAX_OPEN_PLACEMENTS_PER_PLACE = 5;

const sanitizeDateString = (value) => {
  const raw = asString(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
};

const requestSponsoredPlacement = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  const placeId = asString(request.data?.placeId, 300);
  const type = asString(request.data?.type, 20);
  const headline = asString(request.data?.headline, 120).replace(/[<>]/g, "");
  const startsAt = sanitizeDateString(request.data?.startsAt);
  const endsAt = sanitizeDateString(request.data?.endsAt);

  if (!PLACEMENT_TYPES.has(type)) throw new HttpsError("invalid-argument", "Tipo de emplazamiento no válido.");
  if (startsAt && endsAt && endsAt < startsAt) {
    throw new HttpsError("invalid-argument", "La fecha de fin no puede ser anterior a la de inicio.");
  }

  const { place } = await assertBusinessProAccess(placeId, uid);

  const openSnap = await db.collection("sponsoredPlacements")
    .where("placeId", "==", placeId)
    .where("status", "in", ["requested", "active"])
    .get();
  if (openSnap.size >= MAX_OPEN_PLACEMENTS_PER_PLACE) {
    throw new HttpsError("resource-exhausted", "Ya hay demasiadas solicitudes o campañas abiertas para este negocio.");
  }

  const placementRef = db.collection("sponsoredPlacements").doc();
  await placementRef.set({
    placeId,
    placeName: place.name || null,
    placePhotoUrl: place.userPhotoUrl || place.mainImageUrl || null,
    placeAddress: place.address || null,
    type,
    headline: headline || null,
    startsAt: startsAt || null,
    endsAt: endsAt || null,
    status: "requested",
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog(uid, "sponsored.placementRequested", {
    placementId: placementRef.id,
    placeId,
    placeName: place.name || null,
    type,
    headline: headline || null,
  });

  return { ok: true, placementId: placementRef.id };
});

const reviewSponsoredPlacement = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  await assertJefeAccess(uid, "Solo un administrador puede gestionar patrocinios.");

  const placementId = asString(request.data?.placementId, 300);
  const decision = asString(request.data?.decision, 20);
  const adminNotes = asString(request.data?.adminNotes, 500).replace(/[<>]/g, "");
  if (!placementId) throw new HttpsError("invalid-argument", "Falta placementId.");
  if (!["activate", "reject", "end"].includes(decision)) {
    throw new HttpsError("invalid-argument", "Decisión no válida.");
  }

  const placementRef = db.collection("sponsoredPlacements").doc(placementId);
  const placementSnap = await placementRef.get();
  if (!placementSnap.exists) throw new HttpsError("not-found", "El emplazamiento no existe.");
  const placement = placementSnap.data() || {};

  const nextStatus = decision === "activate" ? "active" : decision === "reject" ? "rejected" : "ended";
  await placementRef.set({
    status: nextStatus,
    adminNotes: adminNotes || null,
    reviewedBy: uid,
    reviewedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await writeAuditLog(uid, "sponsored.placementReviewed", {
    placementId,
    placeId: placement.placeId || null,
    decision,
    nextStatus,
    adminNotes: adminNotes || null,
  });

  if (placement.createdBy) {
    const statusMessages = {
      active: `Tu campaña patrocinada de ${placement.placeName || "tu negocio"} está activa.`,
      rejected: `Tu solicitud de patrocinio de ${placement.placeName || "tu negocio"} ha sido rechazada${adminNotes ? `: ${adminNotes}` : "."}`,
      ended: `Tu campaña patrocinada de ${placement.placeName || "tu negocio"} ha finalizado.`,
    };
    await sendNotification(placement.createdBy, "business_pro_update", {
      message: statusMessages[nextStatus],
      link: `/businesses/${placement.placeId}/manage`,
      placeId: placement.placeId,
    }, { notificationId: `sponsored_${placementId}` });
  }

  logger.info("sponsored: emplazamiento revisado", { placementId, decision, actorUid: uid });
  return { ok: true, placementId, status: nextStatus };
});

module.exports = {
  requestSponsoredPlacement,
  reviewSponsoredPlacement,
};
