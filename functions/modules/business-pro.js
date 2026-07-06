// functions/modules/business-pro.js
//
// Escrituras de las funcionalidades Business Pro del panel de gestión del negocio:
// - updateBusinessVisual: personalización visual (places/{placeId}/businessPro/visual).
// - updateCanonicalItemBusinessData: ficha oficial de un elemento canónico
//   (campo businessData en places/{placeId}/items/{itemId}; el nombre canónico
//   y las stats siguen siendo de la comunidad y solo cambian vía admin).
// - saveBusinessOffer / deleteBusinessOffer: ofertas en places/{placeId}/offers.
//
// Todas exigen gestor/propietario del negocio + plan Business Pro activo
// (el jefe puede escribir siempre, para pruebas y soporte). Las reglas de
// Firestore dejan estas colecciones en solo lectura para el cliente.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { assertJefeAccess, rateLimit, writeAuditLog } = require("./lib/auth");
const { hasActiveBusinessPro } = require("./lib/business-plan");

const db = getFirestore();

const asString = (value, maxLength = 500) => (typeof value === "string" ? value.trim().slice(0, maxLength) : "");

const VALID_VISUAL_STYLES = new Set(["editorial", "clean", "warm", "night"]);
const VALID_OFFER_STATUSES = new Set(["draft", "active"]);
const MAX_OFFERS = 20;

const sanitizeHexColor = (value) => {
  const raw = asString(value, 9);
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : "";
};

const sanitizeUrl = (value) => {
  const raw = asString(value, 500);
  if (!raw) return "";
  try {
    const url = new URL(raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString().slice(0, 500);
  } catch (_) {
    return "";
  }
};

const sanitizeDateString = (value) => {
  const raw = asString(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
};

async function assertBusinessProAccess(placeId, uid) {
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  if (!placeId) throw new HttpsError("invalid-argument", "Falta placeId.");

  const placeRef = db.collection("places").doc(placeId);
  const placeSnap = await placeRef.get();
  if (!placeSnap.exists) throw new HttpsError("not-found", "El negocio no existe.");
  const place = placeSnap.data() || {};

  const managerIds = Array.isArray(place.businessManagerIds) ? place.businessManagerIds : [];
  const isOwner = place.businessOwnerUserId === uid;
  const isManager = managerIds.includes(uid);
  let isAdmin = false;
  try {
    await assertJefeAccess(uid);
    isAdmin = true;
  } catch (_) {
    isAdmin = false;
  }

  if (!isOwner && !isManager && !isAdmin) {
    throw new HttpsError("permission-denied", "No puedes gestionar este negocio.");
  }
  if (!isAdmin && !hasActiveBusinessPro(place)) {
    throw new HttpsError("permission-denied", "Este local no tiene Business Pro activo.");
  }

  const rate = await rateLimit("businessProUpdate", `${uid}_${placeId}`, 100, 24 * 60 * 60);
  if (!rate.allowed) {
    throw new HttpsError("resource-exhausted", "Has hecho demasiados cambios hoy en este negocio.");
  }

  return { placeRef, place };
}

// invoker: 'public' fuerza la invocación no autenticada a nivel de Cloud Run;
// la autorización real la hacen Firebase Auth + assertBusinessProAccess.
const updateBusinessVisual = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  const placeId = asString(request.data?.placeId, 300);
  const { placeRef, place } = await assertBusinessProAccess(placeId, uid);

  const raw = request.data?.data || {};
  const visualStyle = asString(raw.visualStyle, 20);
  const data = {
    accentColor: sanitizeHexColor(raw.accentColor),
    visualStyle: VALID_VISUAL_STYLES.has(visualStyle) ? visualStyle : "editorial",
    heroText: asString(raw.heroText, 300).replace(/[<>]/g, ""),
    heroImageUrl: sanitizeUrl(raw.heroImageUrl),
  };

  await placeRef.collection("businessPro").doc("visual").set({
    ...data,
    updatedBy: uid,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await writeAuditLog(uid, "businessPro.visualUpdated", {
    placeId,
    placeName: place.name || null,
  });

  return { ok: true, data };
});

const updateCanonicalItemBusinessData = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  const placeId = asString(request.data?.placeId, 300);
  const itemId = asString(request.data?.itemId, 300);
  if (!itemId) throw new HttpsError("invalid-argument", "Falta itemId.");

  const { placeRef, place } = await assertBusinessProAccess(placeId, uid);

  const itemRef = placeRef.collection("items").doc(itemId);
  const itemSnap = await itemRef.get();
  if (!itemSnap.exists) throw new HttpsError("not-found", "El elemento no existe.");

  const raw = request.data?.data || {};
  const businessData = {
    group: asString(raw.group, 60),
    price: asString(raw.price, 40),
    discount: asString(raw.discount, 80),
    ingredients: asString(raw.ingredients, 300).replace(/[<>]/g, ""),
    description: asString(raw.description, 500).replace(/[<>]/g, ""),
    available: raw.available !== false,
  };

  await itemRef.set({
    businessData: {
      ...businessData,
      updatedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    },
  }, { merge: true });

  await writeAuditLog(uid, "businessPro.itemDataUpdated", {
    placeId,
    placeName: place.name || null,
    itemId,
    itemName: itemSnap.data()?.canonicalName || null,
  });

  return { ok: true, itemId, data: businessData };
});

const saveBusinessOffer = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  const placeId = asString(request.data?.placeId, 300);
  const offerId = asString(request.data?.offerId, 300);

  const { placeRef, place } = await assertBusinessProAccess(placeId, uid);

  const raw = request.data?.data || {};
  const title = asString(raw.title, 120).replace(/[<>]/g, "");
  if (!title) throw new HttpsError("invalid-argument", "La oferta necesita un título.");
  const status = asString(raw.status, 20);
  const startsAt = sanitizeDateString(raw.startsAt);
  const endsAt = sanitizeDateString(raw.endsAt);
  if (startsAt && endsAt && endsAt < startsAt) {
    throw new HttpsError("invalid-argument", "La fecha de fin no puede ser anterior a la de inicio.");
  }

  const data = {
    title,
    description: asString(raw.description, 500).replace(/[<>]/g, ""),
    conditions: asString(raw.conditions, 300).replace(/[<>]/g, ""),
    ctaUrl: sanitizeUrl(raw.ctaUrl),
    startsAt,
    endsAt,
    status: VALID_OFFER_STATUSES.has(status) ? status : "draft",
  };

  const offersRef = placeRef.collection("offers");
  let targetRef;
  if (offerId) {
    targetRef = offersRef.doc(offerId);
    const existing = await targetRef.get();
    if (!existing.exists) throw new HttpsError("not-found", "La oferta no existe.");
    await targetRef.set({
      ...data,
      updatedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } else {
    const currentOffers = await offersRef.count().get();
    if (currentOffers.data().count >= MAX_OFFERS) {
      throw new HttpsError("resource-exhausted", `Máximo ${MAX_OFFERS} ofertas por local. Borra alguna antigua antes de crear otra.`);
    }
    targetRef = offersRef.doc();
    await targetRef.set({
      ...data,
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await writeAuditLog(uid, offerId ? "businessPro.offerUpdated" : "businessPro.offerCreated", {
    placeId,
    placeName: place.name || null,
    offerId: targetRef.id,
    title,
    status: data.status,
  });

  return { ok: true, offerId: targetRef.id, data };
});

const deleteBusinessOffer = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  const placeId = asString(request.data?.placeId, 300);
  const offerId = asString(request.data?.offerId, 300);
  if (!offerId) throw new HttpsError("invalid-argument", "Falta offerId.");

  const { placeRef, place } = await assertBusinessProAccess(placeId, uid);

  const offerRef = placeRef.collection("offers").doc(offerId);
  const offerSnap = await offerRef.get();
  if (!offerSnap.exists) throw new HttpsError("not-found", "La oferta no existe.");

  await offerRef.delete();

  await writeAuditLog(uid, "businessPro.offerDeleted", {
    placeId,
    placeName: place.name || null,
    offerId,
    title: offerSnap.data()?.title || null,
  });

  logger.info("businessPro: oferta eliminada", { placeId, offerId, actorUid: uid });
  return { ok: true, offerId };
});

module.exports = {
  updateBusinessVisual,
  updateCanonicalItemBusinessData,
  saveBusinessOffer,
  deleteBusinessOffer,
  // Helper compartido con business-items.js y sponsored.js.
  assertBusinessProAccess,
};
