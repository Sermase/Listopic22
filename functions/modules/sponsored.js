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
const { isCheckoutEnabled } = require("./lib/billing-flags");
const {
  IMPULSE_RADIUS_STEP_KM,
  loadImpulsePricing,
  validateImpulsePricingInput,
  campaignImpulses,
  impulsesPriceEur,
  normalizeCampaignRequest,
} = require("./lib/impulse-pricing");
const {
  spotlightCenterFromPlace,
  resolveSpotlightItem,
  buildSpotlightSyncPatch,
} = require("./lib/spotlight-sync");

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
// 1 impulso = 0,2 km de radio × 1 día × 1 papeleta (lib/impulse-pricing.js).
// El negocio elige plato, radio, días e intensidad (papeletas en el sorteo del
// carrusel: ×2 = doble probabilidad que ×1 frente a otras campañas de la zona).
// La campaña gasta impulsos del saldo del local (spotlightCredits); el precio por
// impulso, los límites y los paquetes se editan en Developer (config/sponsoredPricing).
// El reloj de la campaña arranca cuando el admin la activa.

const getSpotlightPricing = () => loadImpulsePricing(db);

const adminUpdateSpotlightPricing = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  await assertJefeAccess(uid, "Solo un administrador puede cambiar el precio de los impulsos.");

  const validated = validateImpulsePricingInput(request.data || {});
  if (validated.error) throw new HttpsError("invalid-argument", validated.error);
  const { pricing } = validated;

  await db.collection("config").doc("sponsoredPricing").set({
    ...pricing,
    radiusStepKm: IMPULSE_RADIUS_STEP_KM,
    updatedBy: uid,
    updatedAt: FieldValue.serverTimestamp(),
    // Campos de la fórmula anterior por semanas.
    pricePerRadiusStepPerWeek: FieldValue.delete(),
    pricePerKmPerWeek: FieldValue.delete(),
    maxUnitsPerCampaign: FieldValue.delete(),
    maxWeeks: FieldValue.delete(),
  }, { merge: true });
  await writeAuditLog(uid, "sponsored.pricingUpdated", { ...pricing, radiusStepKm: IMPULSE_RADIUS_STEP_KM });

  return { ok: true, pricing };
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

  if (!itemId) throw new HttpsError("invalid-argument", "Falta el elemento a destacar.");

  const pricing = await getSpotlightPricing();
  const campaign = normalizeCampaignRequest(request.data || {}, pricing);
  if (campaign.error) throw new HttpsError(campaign.code || "invalid-argument", campaign.error);
  const { intensity, days, radiusKm } = campaign;
  const impulses = campaignImpulses(campaign, pricing);

  const { placeRef, place } = await assertBusinessProAccess(placeId, uid);

  const itemSnap = await placeRef.collection("items").doc(itemId).get();
  if (!itemSnap.exists || itemSnap.data()?.status === "inactive") {
    throw new HttpsError("not-found", "El elemento no existe o está inactivo.");
  }
  const item = itemSnap.data() || {};

  // Acepta todas las formas de coordenadas de places/ (location o coordinates
  // como GeoPoint o mapa, geopoint, lat/lng sueltos).
  if (!spotlightCenterFromPlace(place)) {
    throw new HttpsError("failed-precondition", "El lugar no tiene coordenadas; no se puede calcular el radio.");
  }

  const openSnap = await db.collection("sponsoredItemSpotlights")
    .where("placeId", "==", placeId)
    .where("status", "in", ["requested", "active"])
    .get();
  if (openSnap.size >= MAX_OPEN_SPOTLIGHTS_PER_PLACE) {
    throw new HttpsError("resource-exhausted", "Ya hay demasiadas campañas de platos abiertas para este negocio.");
  }

  // Con la compra online abierta, la campaña se paga entera con impulsos del
  // saldo. Durante la beta (sin compra online) se permite pedirla igualmente y
  // lo que falte queda anotado como importe pendiente.
  const prepaidOnly = isCheckoutEnabled(process.env);
  const spotlightRef = db.collection("sponsoredItemSpotlights").doc();
  // El saldo y la campaña se escriben en una sola transacción para que dos
  // solicitudes simultáneas no puedan gastar los mismos impulsos.
  const billing = await db.runTransaction(async (tx) => {
    const freshPlaceSnap = await tx.get(placeRef);
    if (!freshPlaceSnap.exists) throw new HttpsError("not-found", "El negocio no existe.");
    const freshPlace = freshPlaceSnap.data() || {};
    const center = spotlightCenterFromPlace(freshPlace);
    if (!center) {
      throw new HttpsError("failed-precondition", "El lugar no tiene coordenadas; no se puede calcular el radio.");
    }
    // Los saldos regalados antes de este modelo (1 crédito = 1 papeleta) se
    // leen 1:1 como impulsos: eran regalos y se pueden ajustar desde Developer.
    const availableCredits = Number(freshPlace.spotlightCredits) > 0
      ? Math.floor(Number(freshPlace.spotlightCredits))
      : 0;
    const creditsUsed = Math.min(availableCredits, impulses);
    const billedImpulses = impulses - creditsUsed;
    if (prepaidOnly && billedImpulses > 0) {
      throw new HttpsError(
        "failed-precondition",
        `Te faltan ${billedImpulses} impulsos para esta campaña. Compra un paquete o lo que falta y vuelve a solicitarla.`,
        { missingImpulses: billedImpulses },
      );
    }
    const totalPriceEur = impulsesPriceEur(billedImpulses, pricing);

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
      // `units` es el peso en el sorteo del carrusel (papeletas).
      units: intensity,
      intensity,
      days,
      impulses,
      pricePerImpulseEur: pricing.pricePerImpulseEur,
      creditsUsed,
      billedImpulses,
      totalPriceEur,
      pricingSnapshot: pricing,
      startsAt: null,
      endsAt: null,
      status: "requested",
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { creditsUsed, billedImpulses, totalPriceEur };
  });

  const { creditsUsed, billedImpulses, totalPriceEur } = billing;

  await writeAuditLog(uid, "sponsored.itemSpotlightRequested", {
    spotlightId: spotlightRef.id,
    placeId,
    placeName: place.name || null,
    itemId,
    itemName: item.canonicalName || itemId,
    intensity,
    radiusKm,
    days,
    impulses,
    creditsUsed,
    billedImpulses,
    totalPriceEur,
  });

  return { ok: true, spotlightId: spotlightRef.id, impulses, creditsUsed, billedImpulses, totalPriceEur };
});

// Regala impulsos a un negocio desde Developer: se suman a su saldo y se
// consumen automáticamente al solicitar campañas.
// Sirve para probar el sistema y para invitar a negocios concretos.
const adminGrantSpotlightCredits = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  await assertJefeAccess(uid, "Solo un administrador puede regalar impulsos.");

  const placeId = asString(request.data?.placeId, 300);
  const credits = Number(request.data?.credits);
  const notes = asString(request.data?.notes, 300).replace(/[<>]/g, "");
  if (!placeId) throw new HttpsError("invalid-argument", "Falta placeId.");
  if (!Number.isInteger(credits) || credits === 0 || Math.abs(credits) > 100000) {
    throw new HttpsError("invalid-argument", "Los impulsos deben ser un entero entre -100.000 y 100.000 (negativo para retirar).");
  }

  // En transacción: el webhook de Stripe y las solicitudes también tocan el
  // saldo, y una escritura con un valor leído antes podría borrar sus cambios.
  const placeRef = db.collection("places").doc(placeId);
  const { current, next, placeName } = await db.runTransaction(async (tx) => {
    const placeSnap = await tx.get(placeRef);
    if (!placeSnap.exists) throw new HttpsError("not-found", "El negocio no existe.");
    const place = placeSnap.data() || {};
    const balance = Number(place.spotlightCredits) > 0 ? Math.floor(Number(place.spotlightCredits)) : 0;
    const updated = Math.max(0, balance + credits);
    tx.set(placeRef, {
      spotlightCredits: updated,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { current: balance, next: updated, placeName: place.name || null };
  });

  await writeAuditLog(uid, "sponsored.creditsGranted", {
    placeId,
    placeName,
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
  let itemName = spotlight.itemName;
  if (decision === "activate") {
    // Al activar se refrescan el centro (desde el lugar) y el plato (nombre
    // actual, listas y stats; si se fusionó, el plato destino).
    const placeRef = db.collection("places").doc(spotlight.placeId);
    const [placeSnap, itemsSnap] = await Promise.all([placeRef.get(), placeRef.collection("items").get()]);
    const center = spotlightCenterFromPlace(placeSnap.data() || {});
    if (!center) {
      throw new HttpsError("failed-precondition", "El lugar no tiene coordenadas; no se puede activar la campaña.");
    }
    const itemsById = new Map(itemsSnap.docs.map((docSnap) => [docSnap.id, { id: docSnap.id, ...docSnap.data() }]));
    if (!resolveSpotlightItem(spotlight, itemsById)) {
      throw new HttpsError("failed-precondition", "El plato de esta campaña ya no está activo en la carta.");
    }
    Object.assign(patch, buildSpotlightSyncPatch(spotlight, itemsById) || {}, { center });
    itemName = patch.itemName || spotlight.itemName;

    // El periodo contratado empieza a contar al activar. Las campañas
    // anteriores al cambio guardaban semanas en vez de días.
    const days = Number.isInteger(spotlight.days) && spotlight.days >= 1
      ? spotlight.days
      : (Number(spotlight.weeks) >= 1 ? Number(spotlight.weeks) * 7 : 1);
    patch.startsAt = isoDatePlusDays(0);
    patch.endsAt = isoDatePlusDays(days);
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
    itemName: itemName || null,
    decision,
    nextStatus,
  });

  if (spotlight.createdBy) {
    const statusMessages = {
      active: `Tu plato destacado "${itemName}" está activo.`,
      rejected: `Tu solicitud de plato destacado "${itemName}" ha sido rechazada${adminNotes ? `: ${adminNotes}` : "."}`,
      ended: `Tu campaña del plato "${itemName}" ha finalizado.`,
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

// Pone al día las campañas abiertas (solicitadas o activas) de un lugar con sus
// elementos: nombre canónico, listas, nota y nº de reseñas; si el plato se
// fusionó, la campaña pasa al plato destino; si ya no existe, se marca
// itemInactive para que un admin decida. La llama el rebuild de elementos
// (canonical-items.js) y la reparación de cartas. Devuelve cuántas cambian.
async function syncSpotlightsForPlace(placeId, itemsById, { dryRun = false } = {}) {
  if (!placeId || !itemsById) return 0;
  const snap = await db.collection("sponsoredItemSpotlights")
    .where("placeId", "==", placeId)
    .where("status", "in", ["requested", "active"])
    .get();
  let updated = 0;
  let batch = db.batch();
  let pending = 0;
  for (const docSnap of snap.docs) {
    const patch = buildSpotlightSyncPatch(docSnap.data() || {}, itemsById);
    if (!patch) continue;
    updated += 1;
    if (dryRun) continue;
    batch.set(docSnap.ref, patch, { merge: true });
    pending += 1;
    if (pending >= 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();
  if (updated > 0) logger.info("sponsored: platos destacados sincronizados", { placeId, updated, dryRun });
  return updated;
}

module.exports = {
  requestSponsoredPlacement,
  reviewSponsoredPlacement,
  requestItemSpotlight,
  reviewItemSpotlight,
  adminGrantSpotlightCredits,
  adminUpdateSpotlightPricing,
  recordSponsoredEvent,
  // Helper compartido con canonical-items.js y business-items.js.
  syncSpotlightsForPlace,
};
