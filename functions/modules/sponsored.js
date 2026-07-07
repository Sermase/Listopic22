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

// ── Impulsos: platos destacados por radio y tiempo ──────────────────────────
//
// El negocio compra "impulsos" para destacar un plato en un radio de X km
// durante N semanas. Precio por impulso = €/km·semana × radio × semanas
// (fórmula editable en Developer, config/sponsoredPricing; pensada barata:
// 0,40 €/km·semana ≈ 0,20 € por semana y medio km). Quien quiera más
// visibilidad no paga tarifas más caras: compra más impulsos, que son pesos
// en el sorteo del carrusel — 2 impulsos = doble probabilidad que 1.
// El reloj de la campaña arranca cuando el admin la activa.

const DEFAULT_SPOTLIGHT_PRICING = {
  pricePerKmPerWeek: 0.4,
  minRadiusKm: 0.5,
  maxRadiusKm: 20,
  maxUnitsPerCampaign: 10,
  maxWeeks: 8,
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

function computeSpotlightUnitPrice(pricing, radiusKm, weeks) {
  const effectiveRadius = Math.max(pricing.minRadiusKm, radiusKm);
  return Number((pricing.pricePerKmPerWeek * effectiveRadius * weeks).toFixed(2));
}

function isoDatePlusDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const MAX_OPEN_SPOTLIGHTS_PER_PLACE = 10;

const requestItemSpotlight = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  const placeId = asString(request.data?.placeId, 300);
  const itemId = asString(request.data?.itemId, 300);
  const units = Number(request.data?.units);
  const radiusKm = Number(request.data?.radiusKm);
  const weeks = Number(request.data?.weeks);

  if (!itemId) throw new HttpsError("invalid-argument", "Falta el elemento a destacar.");

  const pricing = await getSpotlightPricing();
  if (!Number.isInteger(units) || units < 1 || units > pricing.maxUnitsPerCampaign) {
    throw new HttpsError("invalid-argument", `Los impulsos deben estar entre 1 y ${pricing.maxUnitsPerCampaign}.`);
  }
  if (!Number.isFinite(radiusKm) || radiusKm < pricing.minRadiusKm || radiusKm > pricing.maxRadiusKm) {
    throw new HttpsError("invalid-argument", `El radio debe estar entre ${pricing.minRadiusKm} y ${pricing.maxRadiusKm} km.`);
  }
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > pricing.maxWeeks) {
    throw new HttpsError("invalid-argument", `La duración debe estar entre 1 y ${pricing.maxWeeks} semanas.`);
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

  const unitPriceEur = computeSpotlightUnitPrice(pricing, radiusKm, weeks);

  // Impulsos de regalo (otorgados desde Developer): se consumen antes de
  // cobrar. Cuando haya micropagos, solo se facturarán los impulsos restantes.
  const availableCredits = Number(place.spotlightCredits) > 0 ? Math.floor(Number(place.spotlightCredits)) : 0;
  const creditsUsed = Math.min(availableCredits, units);
  const billedUnits = units - creditsUsed;
  const totalPriceEur = Number((unitPriceEur * billedUnits).toFixed(2));

  if (creditsUsed > 0) {
    await placeRef.set({
      spotlightCredits: FieldValue.increment(-creditsUsed),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

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
    weeks,
    unitPriceEur,
    creditsUsed,
    billedUnits,
    totalPriceEur,
    pricingSnapshot: pricing,
    // El reloj arranca al activar: reviewItemSpotlight fija startsAt/endsAt.
    startsAt: null,
    endsAt: null,
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
    weeks,
    creditsUsed,
    totalPriceEur,
  });

  return { ok: true, spotlightId: spotlightRef.id, unitPriceEur, creditsUsed, totalPriceEur };
});

// Regala impulsos a un negocio desde Developer: se acumulan en el lugar y se
// consumen automáticamente al solicitar campañas (antes de cobrar nada).
// Sirve para probar el sistema y para invitar a negocios concretos.
const adminGrantSpotlightCredits = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  await assertJefeAccess(uid, "Solo un administrador puede regalar impulsos.");

  const placeId = asString(request.data?.placeId, 300);
  const credits = Number(request.data?.credits);
  const notes = asString(request.data?.notes, 300).replace(/[<>]/g, "");
  if (!placeId) throw new HttpsError("invalid-argument", "Falta placeId.");
  if (!Number.isInteger(credits) || credits === 0 || Math.abs(credits) > 500) {
    throw new HttpsError("invalid-argument", "Los impulsos deben ser un entero entre -500 y 500 (negativo para retirar).");
  }

  const placeRef = db.collection("places").doc(placeId);
  const placeSnap = await placeRef.get();
  if (!placeSnap.exists) throw new HttpsError("not-found", "El negocio no existe.");
  const place = placeSnap.data() || {};
  const current = Number(place.spotlightCredits) > 0 ? Math.floor(Number(place.spotlightCredits)) : 0;
  const next = Math.max(0, current + credits);

  await placeRef.set({
    spotlightCredits: next,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await writeAuditLog(uid, "sponsored.creditsGranted", {
    placeId,
    placeName: place.name || null,
    credits,
    previousBalance: current,
    newBalance: next,
    notes: notes || null,
  });

  return { ok: true, placeId, balance: next };
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
  const patch = {
    status: nextStatus,
    adminNotes: adminNotes || null,
    reviewedBy: uid,
    reviewedAt: FieldValue.serverTimestamp(),
  };
  if (decision === "activate") {
    // El periodo contratado (semanas) empieza a contar al activar.
    const weeks = Number(spotlight.weeks) >= 1 ? Number(spotlight.weeks) : 1;
    patch.startsAt = isoDatePlusDays(0);
    patch.endsAt = isoDatePlusDays(weeks * 7);
  }
  await spotlightRef.set(patch, { merge: true });

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
  adminGrantSpotlightCredits,
};
