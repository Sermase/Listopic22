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

// ── Platos destacados por radio (sorteo ponderado por unidades) ─────────────
//
// El negocio compra "unidades" para destacar un plato en un radio de X km.
// Precio por unidad = basePricePerUnit + pricePerExtraKm * max(0, radio - baseRadiusKm),
// con la fórmula editable en Developer (config/sponsoredPricing). En el
// carrusel, cada plato candidato (activo y cuyo radio cubre al usuario) entra
// en un sorteo con peso = unidades: comprar 2 unidades dobla la probabilidad.

const DEFAULT_SPOTLIGHT_PRICING = {
  baseRadiusKm: 1,
  basePricePerUnit: 2,
  pricePerExtraKm: 2,
  maxRadiusKm: 20,
  maxUnitsPerCampaign: 10,
};

async function getSpotlightPricing() {
  const snap = await db.collection("config").doc("sponsoredPricing").get().catch(() => null);
  const data = snap?.exists ? snap.data() || {} : {};
  const merged = { ...DEFAULT_SPOTLIGHT_PRICING };
  Object.keys(DEFAULT_SPOTLIGHT_PRICING).forEach((key) => {
    if (typeof data[key] === "number" && Number.isFinite(data[key]) && data[key] > 0) merged[key] = data[key];
  });
  return merged;
}

function computeSpotlightUnitPrice(pricing, radiusKm) {
  const extraKm = Math.max(0, radiusKm - pricing.baseRadiusKm);
  return Number((pricing.basePricePerUnit + pricing.pricePerExtraKm * extraKm).toFixed(2));
}

const MAX_OPEN_SPOTLIGHTS_PER_PLACE = 10;

const requestItemSpotlight = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  const placeId = asString(request.data?.placeId, 300);
  const itemId = asString(request.data?.itemId, 300);
  const units = Number(request.data?.units);
  const radiusKm = Number(request.data?.radiusKm);
  const startsAt = sanitizeDateString(request.data?.startsAt);
  const endsAt = sanitizeDateString(request.data?.endsAt);

  if (!itemId) throw new HttpsError("invalid-argument", "Falta el elemento a destacar.");
  if (startsAt && endsAt && endsAt < startsAt) {
    throw new HttpsError("invalid-argument", "La fecha de fin no puede ser anterior a la de inicio.");
  }

  const pricing = await getSpotlightPricing();
  if (!Number.isInteger(units) || units < 1 || units > pricing.maxUnitsPerCampaign) {
    throw new HttpsError("invalid-argument", `Las unidades deben estar entre 1 y ${pricing.maxUnitsPerCampaign}.`);
  }
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > pricing.maxRadiusKm) {
    throw new HttpsError("invalid-argument", `El radio debe estar entre 1 y ${pricing.maxRadiusKm} km.`);
  }

  const { placeRef, place } = await assertBusinessProAccess(placeId, uid);

  const itemSnap = await placeRef.collection("items").doc(itemId).get();
  if (!itemSnap.exists || itemSnap.data()?.status === "inactive") {
    throw new HttpsError("not-found", "El elemento no existe o está inactivo.");
  }
  const item = itemSnap.data() || {};

  const center = place.location && typeof place.location.latitude === "number"
    ? { lat: place.location.latitude, lng: place.location.longitude }
    : null;
  if (!center) {
    throw new HttpsError("failed-precondition", "El lugar no tiene coordenadas; no se puede calcular el radio.");
  }

  const openSnap = await db.collection("sponsoredItemSpotlights")
    .where("placeId", "==", placeId)
    .where("status", "in", ["requested", "active"])
    .get();
  if (openSnap.size >= MAX_OPEN_SPOTLIGHTS_PER_PLACE) {
    throw new HttpsError("resource-exhausted", "Ya hay demasiadas campañas de platos abiertas para este negocio.");
  }

  const unitPriceEur = computeSpotlightUnitPrice(pricing, radiusKm);
  const totalPriceEur = Number((unitPriceEur * units).toFixed(2));

  const spotlightRef = db.collection("sponsoredItemSpotlights").doc();
  await spotlightRef.set({
    placeId,
    placeName: place.name || null,
    placePhotoUrl: place.userPhotoUrl || place.mainImageUrl || null,
    itemId,
    itemName: item.canonicalName || itemId,
    linkedListIds: Array.isArray(item.linkedListIds) ? item.linkedListIds.slice(0, 40) : [],
    itemAverageRating: typeof item.stats?.averageRating === "number" ? item.stats.averageRating : null,
    itemReviewCount: typeof item.stats?.reviewCount === "number" ? item.stats.reviewCount : 0,
    center,
    radiusKm,
    units,
    unitPriceEur,
    totalPriceEur,
    pricingSnapshot: pricing,
    startsAt: startsAt || null,
    endsAt: endsAt || null,
    status: "requested",
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog(uid, "sponsored.itemSpotlightRequested", {
    spotlightId: spotlightRef.id,
    placeId,
    placeName: place.name || null,
    itemId,
    itemName: item.canonicalName || itemId,
    units,
    radiusKm,
    totalPriceEur,
  });

  return { ok: true, spotlightId: spotlightRef.id, unitPriceEur, totalPriceEur };
});

const reviewItemSpotlight = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  await assertJefeAccess(uid, "Solo un administrador puede gestionar platos destacados.");

  const spotlightId = asString(request.data?.spotlightId, 300);
  const decision = asString(request.data?.decision, 20);
  const adminNotes = asString(request.data?.adminNotes, 500).replace(/[<>]/g, "");
  if (!spotlightId) throw new HttpsError("invalid-argument", "Falta spotlightId.");
  if (!["activate", "reject", "end"].includes(decision)) {
    throw new HttpsError("invalid-argument", "Decisión no válida.");
  }

  const spotlightRef = db.collection("sponsoredItemSpotlights").doc(spotlightId);
  const spotlightSnap = await spotlightRef.get();
  if (!spotlightSnap.exists) throw new HttpsError("not-found", "La campaña no existe.");
  const spotlight = spotlightSnap.data() || {};

  const nextStatus = decision === "activate" ? "active" : decision === "reject" ? "rejected" : "ended";
  await spotlightRef.set({
    status: nextStatus,
    adminNotes: adminNotes || null,
    reviewedBy: uid,
    reviewedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await writeAuditLog(uid, "sponsored.itemSpotlightReviewed", {
    spotlightId,
    placeId: spotlight.placeId || null,
    itemName: spotlight.itemName || null,
    decision,
    nextStatus,
  });

  if (spotlight.createdBy) {
    const statusMessages = {
      active: `Tu plato destacado "${spotlight.itemName}" está activo.`,
      rejected: `Tu solicitud de plato destacado "${spotlight.itemName}" ha sido rechazada${adminNotes ? `: ${adminNotes}` : "."}`,
      ended: `Tu campaña del plato "${spotlight.itemName}" ha finalizado.`,
    };
    await sendNotification(spotlight.createdBy, "business_pro_update", {
      message: statusMessages[nextStatus],
      link: `/businesses/${spotlight.placeId}/manage`,
      placeId: spotlight.placeId,
    }, { notificationId: `item_spotlight_${spotlightId}` });
  }

  logger.info("sponsored: plato destacado revisado", { spotlightId, decision, actorUid: uid });
  return { ok: true, spotlightId, status: nextStatus };
});

module.exports = {
  requestSponsoredPlacement,
  reviewSponsoredPlacement,
  requestItemSpotlight,
  reviewItemSpotlight,
};
