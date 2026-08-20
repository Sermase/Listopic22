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

const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { assertJefeAccess, rateLimit, rateLimitKey, writeAuditLog } = require("./lib/auth");
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

  const allowedPlacementTransition = (decision === "activate" || decision === "reject")
    ? placement.status === "requested"
    : placement.status === "active";
  if (!allowedPlacementTransition) {
    throw new HttpsError("failed-precondition", "La campaña ya no está en un estado compatible con esa acción.");
  }

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
// durante N semanas. El radio se vende en tramos de 0,2 km y el precio de
// cada tramo es editable en Developer (config/sponsoredPricing). Quien quiera más
// visibilidad no paga tarifas más caras: compra más impulsos, que son pesos
// en el sorteo del carrusel — 2 impulsos = doble probabilidad que 1.
// El reloj de la campaña arranca cuando el admin la activa.

const SPOTLIGHT_RADIUS_STEP_KM = 0.2;
const DEFAULT_SPOTLIGHT_PRICING = {
  pricePerRadiusStepPerWeek: 0.08,
  minRadiusKm: 0.2,
  maxRadiusKm: 20,
  maxUnitsPerCampaign: 10,
  maxWeeks: 8,
};

const roundRadius = (value) => Number(value.toFixed(1));

async function getSpotlightPricing() {
  const snap = await db.collection("config").doc("sponsoredPricing").get().catch(() => null);
  const data = snap?.exists ? snap.data() || {} : {};
  const merged = { ...DEFAULT_SPOTLIGHT_PRICING };
  Object.keys(DEFAULT_SPOTLIGHT_PRICING).forEach((key) => {
    if (typeof data[key] === "number" && Number.isFinite(data[key]) && data[key] > 0) merged[key] = data[key];
  });
  // Compatibilidad con la fórmula anterior mientras existan documentos que
  // solo tengan pricePerKmPerWeek.
  if (!(typeof data.pricePerRadiusStepPerWeek === "number" && data.pricePerRadiusStepPerWeek > 0)
      && typeof data.pricePerKmPerWeek === "number" && data.pricePerKmPerWeek > 0) {
    merged.pricePerRadiusStepPerWeek = Number((data.pricePerKmPerWeek * SPOTLIGHT_RADIUS_STEP_KM).toFixed(2));
  }
  merged.minRadiusKm = roundRadius(Math.ceil(merged.minRadiusKm / SPOTLIGHT_RADIUS_STEP_KM) * SPOTLIGHT_RADIUS_STEP_KM);
  merged.maxRadiusKm = roundRadius(Math.floor(merged.maxRadiusKm / SPOTLIGHT_RADIUS_STEP_KM) * SPOTLIGHT_RADIUS_STEP_KM);
  if (merged.maxRadiusKm < merged.minRadiusKm) merged.maxRadiusKm = merged.minRadiusKm;
  return merged;
}

function computeSpotlightUnitPrice(pricing, radiusKm, weeks) {
  const effectiveRadius = Math.max(pricing.minRadiusKm, radiusKm);
  const radiusSteps = Math.ceil((effectiveRadius / SPOTLIGHT_RADIUS_STEP_KM) - 1e-9);
  return Number((pricing.pricePerRadiusStepPerWeek * radiusSteps * weeks).toFixed(2));
}

const adminUpdateSpotlightPricing = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  await assertJefeAccess(uid, "Solo un administrador puede cambiar el precio de los impulsos.");

  const pricePerRadiusStepPerWeek = Number(request.data?.pricePerRadiusStepPerWeek);
  const minRadiusKm = Number(request.data?.minRadiusKm);
  const maxRadiusKm = Number(request.data?.maxRadiusKm);
  const maxUnitsPerCampaign = Number(request.data?.maxUnitsPerCampaign);
  const maxWeeks = Number(request.data?.maxWeeks);

  if (!Number.isFinite(pricePerRadiusStepPerWeek) || pricePerRadiusStepPerWeek < 0.01 || pricePerRadiusStepPerWeek > 100) {
    throw new HttpsError("invalid-argument", "El precio por cada 0,2 km y semana debe estar entre 0,01 € y 100 €.");
  }
  const isRadiusStep = (value) => Number.isFinite(value)
    && Math.abs((value / SPOTLIGHT_RADIUS_STEP_KM) - Math.round(value / SPOTLIGHT_RADIUS_STEP_KM)) < 1e-6;
  if (!isRadiusStep(minRadiusKm) || minRadiusKm < SPOTLIGHT_RADIUS_STEP_KM || minRadiusKm > 100) {
    throw new HttpsError("invalid-argument", "El radio mínimo debe ser un múltiplo de 0,2 km.");
  }
  if (!isRadiusStep(maxRadiusKm) || maxRadiusKm < minRadiusKm || maxRadiusKm > 100) {
    throw new HttpsError("invalid-argument", "El radio máximo debe ser un múltiplo de 0,2 km y no puede ser menor que el mínimo.");
  }
  if (!Number.isInteger(maxUnitsPerCampaign) || maxUnitsPerCampaign < 1 || maxUnitsPerCampaign > 100) {
    throw new HttpsError("invalid-argument", "El máximo de impulsos debe ser un entero entre 1 y 100.");
  }
  if (!Number.isInteger(maxWeeks) || maxWeeks < 1 || maxWeeks > 52) {
    throw new HttpsError("invalid-argument", "El máximo de semanas debe ser un entero entre 1 y 52.");
  }

  const pricing = {
    pricePerRadiusStepPerWeek: Number(pricePerRadiusStepPerWeek.toFixed(2)),
    radiusStepKm: SPOTLIGHT_RADIUS_STEP_KM,
    minRadiusKm: roundRadius(minRadiusKm),
    maxRadiusKm: roundRadius(maxRadiusKm),
    maxUnitsPerCampaign,
    maxWeeks,
    updatedBy: uid,
    updatedAt: FieldValue.serverTimestamp(),
    pricePerKmPerWeek: FieldValue.delete(),
  };
  await db.collection("config").doc("sponsoredPricing").set(pricing, { merge: true });
  await writeAuditLog(uid, "sponsored.pricingUpdated", {
    pricePerRadiusStepPerWeek: pricing.pricePerRadiusStepPerWeek,
    radiusStepKm: SPOTLIGHT_RADIUS_STEP_KM,
    minRadiusKm: pricing.minRadiusKm,
    maxRadiusKm: pricing.maxRadiusKm,
    maxUnitsPerCampaign,
    maxWeeks,
  });

  return {
    ok: true,
    pricing: {
      pricePerRadiusStepPerWeek: pricing.pricePerRadiusStepPerWeek,
      minRadiusKm: pricing.minRadiusKm,
      maxRadiusKm: pricing.maxRadiusKm,
      maxUnitsPerCampaign,
      maxWeeks,
    },
  };
});

function isoDatePlusDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const MAX_OPEN_SPOTLIGHTS_PER_PLACE = 10;

// Métricas deduplicadas por campaña, evento, sesión y día. Se cuenta una
// impresión cuando la tarjeta entra realmente en el viewport, no solo al
// descargar el documento de campaña.
const recordSponsoredEvent = onCall({ invoker: "public" }, async (request) => {
  const campaignType = asString(request.data?.campaignType, 20);
  const campaignId = asString(request.data?.campaignId, 300);
  const eventType = asString(request.data?.eventType, 20);
  const sessionId = asString(request.data?.sessionId, 128);
  if (!campaignId || !["placement", "spotlight"].includes(campaignType) || !["impression", "click"].includes(eventType)) {
    throw new HttpsError("invalid-argument", "Evento patrocinado no válido.");
  }
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(sessionId)) {
    throw new HttpsError("invalid-argument", "Sesión no válida.");
  }

  const rateKey = crypto.createHash("sha256")
    .update(rateLimitKey(request.rawRequest, request.auth))
    .digest("hex")
    .slice(0, 40);
  const rate = await rateLimit("sponsoredMetrics", rateKey, 180, 60);
  if (!rate.allowed) throw new HttpsError("resource-exhausted", "Demasiados eventos patrocinados.");

  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const dateValues = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));
  const date = `${dateValues.year}-${dateValues.month}-${dateValues.day}`;
  const collectionName = campaignType === "placement" ? "sponsoredPlacements" : "sponsoredItemSpotlights";
  const campaignRef = db.collection(collectionName).doc(campaignId);
  const dailyRef = campaignRef.collection("metricsDaily").doc(date);
  const markerId = crypto.createHash("sha256")
    .update(`${date}|${campaignType}|${campaignId}|${eventType}|${sessionId}`)
    .digest("hex");
  const markerRef = db.collection("sponsoredEventMarkers").doc(markerId);
  const metricField = eventType === "impression" ? "impressions" : "clicks";

  const result = await db.runTransaction(async (tx) => {
    const [campaignSnap, markerSnap] = await Promise.all([tx.get(campaignRef), tx.get(markerRef)]);
    if (!campaignSnap.exists) throw new HttpsError("not-found", "La campaña no existe.");
    const campaign = campaignSnap.data() || {};
    if (campaign.status !== "active") return { counted: false, reason: "inactive" };
    if ((campaign.startsAt && campaign.startsAt > date) || (campaign.endsAt && campaign.endsAt < date)) {
      return { counted: false, reason: "outside_date_window" };
    }
    if (markerSnap.exists) return { counted: false, reason: "duplicate" };

    tx.set(campaignRef, {
      [`metrics.${metricField}`]: FieldValue.increment(1),
      "metrics.updatedAt": FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(dailyRef, {
      date,
      [metricField]: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(markerRef, {
      date,
      expiresAt: Timestamp.fromMillis(Date.now() + (40 * 24 * 60 * 60 * 1000)),
    });
    return { counted: true };
  });

  return { ok: true, ...result };
});

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
  if (Math.abs((radiusKm / SPOTLIGHT_RADIUS_STEP_KM) - Math.round(radiusKm / SPOTLIGHT_RADIUS_STEP_KM)) >= 1e-6) {
    throw new HttpsError("invalid-argument", "El radio debe avanzar en tramos de 0,2 km.");
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
  const spotlightRef = db.collection("sponsoredItemSpotlights").doc();
  // El saldo y la campaña se escriben en una sola transacción para que dos
  // solicitudes simultáneas no puedan gastar los mismos impulsos regalo.
  const billing = await db.runTransaction(async (tx) => {
    const freshPlaceSnap = await tx.get(placeRef);
    if (!freshPlaceSnap.exists) throw new HttpsError("not-found", "El negocio no existe.");
    const freshPlace = freshPlaceSnap.data() || {};
    const availableCredits = Number(freshPlace.spotlightCredits) > 0
      ? Math.floor(Number(freshPlace.spotlightCredits))
      : 0;
    const creditsUsed = Math.min(availableCredits, units);
    const billedUnits = units - creditsUsed;
    const totalPriceEur = Number((unitPriceEur * billedUnits).toFixed(2));

    if (creditsUsed > 0) {
      tx.set(placeRef, {
        spotlightCredits: FieldValue.increment(-creditsUsed),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    tx.set(spotlightRef, {
      placeId,
      placeName: freshPlace.name || place.name || null,
      placePhotoUrl: freshPlace.userPhotoUrl || freshPlace.mainImageUrl || place.userPhotoUrl || place.mainImageUrl || null,
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
      startsAt: null,
      endsAt: null,
      status: "requested",
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { creditsUsed, billedUnits, totalPriceEur };
  });

  const { creditsUsed, totalPriceEur } = billing;

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

  const allowedSpotlightTransition = (decision === "activate" || decision === "reject")
    ? spotlight.status === "requested"
    : spotlight.status === "active";
  if (!allowedSpotlightTransition) {
    throw new HttpsError("failed-precondition", "La campaña ya no está en un estado compatible con esa acción.");
  }

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
  if (decision === "reject" && Number(spotlight.creditsUsed) > 0 && spotlight.creditsRefunded !== true) {
    const creditsToRefund = Math.floor(Number(spotlight.creditsUsed));
    const placeRef = db.collection("places").doc(spotlight.placeId);
    await db.runTransaction(async (tx) => {
      const freshSpotlightSnap = await tx.get(spotlightRef);
      const freshSpotlight = freshSpotlightSnap.data() || {};
      if (!freshSpotlightSnap.exists || freshSpotlight.status !== "requested") {
        throw new HttpsError("failed-precondition", "La campaña ya ha sido procesada.");
      }
      tx.set(placeRef, {
        spotlightCredits: FieldValue.increment(creditsToRefund),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.set(spotlightRef, {
        ...patch,
        creditsRefunded: true,
        creditsRefundedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  } else {
    await spotlightRef.set(patch, { merge: true });
  }

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
  adminUpdateSpotlightPricing,
  recordSponsoredEvent,
};
