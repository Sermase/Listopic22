// functions/modules/business-items.js
//
// Gestión Pro de la carta sobre los items canónicos comunitarios:
// - createBusinessItem: el negocio añade un elemento oficial nuevo (sin
//   reseñas todavía). No toca memoria comunitaria, así que es directo.
// - submitItemProposal: propuestas sensibles (fusionar items duplicados por
//   erratas, renombrar el nombre canónico, mover una reseña a otro elemento).
//   Nunca se aplican directamente: quedan pendientes de aprobación admin.
// - reviewItemProposal: el admin aprueba/rechaza. Al aprobar se aplica el
//   cambio escribiendo canonicalItemId en las reseñas afectadas (el nombre
//   escrito por el usuario se conserva) y se reconstruyen los items del lugar.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { assertJefeAccess, writeAuditLog } = require("./lib/auth");
const { assertBusinessProAccess, sanitizeItemBusinessData } = require("./business-pro");
const {
  rebuildCanonicalItemsForPlace,
  fetchReviewsForPlace,
  normalizeItemName,
  itemDocIdFromName,
  getReviewItemId,
} = require("./canonical-items");
const { sendNotification } = require("./notifications");

const db = getFirestore();

const asString = (value, maxLength = 500) => (typeof value === "string" ? value.trim().slice(0, maxLength) : "");

const PROPOSAL_TYPES = new Set(["merge", "rename", "reassign_review"]);
const MAX_PENDING_PROPOSALS_PER_PLACE = 20;

async function getItemOrThrow(placeId, itemId) {
  const snap = await db.collection("places").doc(placeId).collection("items").doc(itemId).get();
  if (!snap.exists) throw new HttpsError("not-found", `El elemento ${itemId} no existe.`);
  return { id: snap.id, ...snap.data() };
}

// Reconstruye los items canónicos de un lugar a petición de su gestor. Sirve
// para "curar" lugares con reseñas anteriores al sistema de items persistidos
// (sin esto, la gestión Pro no vería los elementos de la comunidad). No exige
// plan Pro: es mantenimiento de datos comunitarios, no una función de pago.
const rebuildPlaceItemsForManager = onCall({ invoker: "public", timeoutSeconds: 300 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const placeId = asString(request.data?.placeId, 300);
  if (!placeId) throw new HttpsError("invalid-argument", "Falta placeId.");

  const placeSnap = await db.collection("places").doc(placeId).get();
  if (!placeSnap.exists) throw new HttpsError("not-found", "El negocio no existe.");
  const place = placeSnap.data() || {};
  const managerIds = Array.isArray(place.businessManagerIds) ? place.businessManagerIds : [];
  let isAdmin = false;
  try {
    await assertJefeAccess(uid);
    isAdmin = true;
  } catch (_) { /* no-op */ }
  if (place.businessOwnerUserId !== uid && !managerIds.includes(uid) && !isAdmin) {
    throw new HttpsError("permission-denied", "No puedes gestionar este negocio.");
  }

  const result = await rebuildCanonicalItemsForPlace(placeId);
  logger.info("businessItems: rebuild manual de items", { placeId, actorUid: uid, ...result });
  return { ok: true, ...result };
});

const createBusinessItem = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  const placeId = asString(request.data?.placeId, 300);
  const name = asString(request.data?.name, 120).replace(/[<>]/g, "");
  if (!name) throw new HttpsError("invalid-argument", "El elemento necesita un nombre.");

  const { placeRef, place } = await assertBusinessProAccess(placeId, uid);

  const itemId = itemDocIdFromName(name);
  const itemRef = placeRef.collection("items").doc(itemId);
  const existing = await itemRef.get();
  if (existing.exists && existing.data()?.status !== "inactive") {
    throw new HttpsError("already-exists", `Ya existe un elemento equivalente: "${existing.data()?.canonicalName || itemId}".`);
  }

  const businessData = {
    ...sanitizeItemBusinessData(request.data?.businessData),
    updatedBy: uid,
    updatedAt: FieldValue.serverTimestamp(),
  };

  await placeRef.set({
    businessMenuUpdatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await itemRef.set({
    canonicalName: name,
    aliasesNormalized: [normalizeItemName(name)],
    sourceNames: [],
    linkedListIds: [],
    source: "business",
    status: "active",
    businessData,
    stats: {
      reviewCount: 0,
      ratingCount: 0,
      ratingTotal: 0,
      averageRating: null,
      photoCount: 0,
      criteriaStats: {},
    },
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await writeAuditLog(uid, "businessPro.itemCreated", {
    placeId,
    placeName: place.name || null,
    itemId,
    itemName: name,
  });

  return { ok: true, itemId, name };
});

const submitItemProposal = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  const placeId = asString(request.data?.placeId, 300);
  const type = asString(request.data?.type, 30);
  const note = asString(request.data?.note, 500).replace(/[<>]/g, "");
  if (!PROPOSAL_TYPES.has(type)) throw new HttpsError("invalid-argument", "Tipo de propuesta no válido.");

  const { place } = await assertBusinessProAccess(placeId, uid);

  const pendingSnap = await db.collection("itemProposals")
    .where("placeId", "==", placeId)
    .where("status", "==", "pending")
    .get();
  if (pendingSnap.size >= MAX_PENDING_PROPOSALS_PER_PLACE) {
    throw new HttpsError("resource-exhausted", "Hay demasiadas propuestas pendientes para este negocio. Espera a que se revisen.");
  }

  const raw = request.data?.payload || {};
  let payload;

  if (type === "merge") {
    const sourceItemId = asString(raw.sourceItemId, 300);
    const targetItemId = asString(raw.targetItemId, 300);
    if (!sourceItemId || !targetItemId || sourceItemId === targetItemId) {
      throw new HttpsError("invalid-argument", "La fusión necesita dos elementos distintos.");
    }
    const [source, target] = await Promise.all([
      getItemOrThrow(placeId, sourceItemId),
      getItemOrThrow(placeId, targetItemId),
    ]);
    payload = {
      sourceItemId,
      sourceItemName: source.canonicalName || sourceItemId,
      targetItemId,
      targetItemName: target.canonicalName || targetItemId,
    };
  } else if (type === "rename") {
    const itemId = asString(raw.itemId, 300);
    const newName = asString(raw.newName, 120).replace(/[<>]/g, "");
    if (!itemId || !newName) throw new HttpsError("invalid-argument", "El cambio de nombre necesita elemento y nombre nuevo.");
    const item = await getItemOrThrow(placeId, itemId);
    if ((item.canonicalName || "").trim() === newName) {
      throw new HttpsError("invalid-argument", "El nombre propuesto es igual al actual.");
    }
    payload = {
      itemId,
      currentName: item.canonicalName || itemId,
      newName,
    };
  } else {
    // reassign_review
    const reviewPath = asString(raw.reviewPath, 500);
    const targetItemId = asString(raw.targetItemId, 300);
    if (!reviewPath || !targetItemId) throw new HttpsError("invalid-argument", "Faltan la reseña o el elemento destino.");
    const segments = reviewPath.split("/").filter(Boolean);
    const isValidPath = (segments.length === 4 && segments[0] === "lists" && segments[2] === "reviews")
      || (segments.length === 2 && segments[0] === "reviews");
    if (!isValidPath) throw new HttpsError("invalid-argument", "Ruta de reseña no válida.");
    const reviewSnap = await db.doc(reviewPath).get();
    if (!reviewSnap.exists) throw new HttpsError("not-found", "La reseña no existe.");
    const review = reviewSnap.data() || {};
    if (review.placeId !== placeId) throw new HttpsError("invalid-argument", "La reseña no pertenece a este negocio.");
    const target = await getItemOrThrow(placeId, targetItemId);
    payload = {
      reviewPath,
      reviewId: reviewSnap.id,
      reviewItemName: review.itemName || review.itemNameOriginal || "",
      reviewAuthorName: review.authorName || "",
      currentItemId: getReviewItemId(review),
      targetItemId,
      targetItemName: target.canonicalName || targetItemId,
    };
  }

  const proposalRef = db.collection("itemProposals").doc();
  await proposalRef.set({
    placeId,
    placeName: place.name || null,
    type,
    payload,
    note: note || null,
    status: "pending",
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog(uid, "businessPro.itemProposalSubmitted", {
    placeId,
    placeName: place.name || null,
    proposalId: proposalRef.id,
    type,
    payload,
  });

  return { ok: true, proposalId: proposalRef.id, type, payload };
});

async function applyMerge(placeId, payload) {
  const reviews = await fetchReviewsForPlace(placeId);
  const affected = reviews.filter((review) => getReviewItemId(review) === payload.sourceItemId);

  for (const review of affected) {
    await db.doc(review.refPath).set({
      canonicalItemId: payload.targetItemId,
      canonicalItemName: payload.targetItemName,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  // El item origen queda inactivo; su businessData no se pierde por si el
  // admin quiere recuperar algo, pero deja de mostrarse.
  await db.collection("places").doc(placeId).collection("items").doc(payload.sourceItemId).set({
    status: "inactive",
    mergedInto: payload.targetItemId,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await rebuildCanonicalItemsForPlace(placeId);
  return { reassignedReviews: affected.length };
}

async function applyRename(placeId, payload) {
  const itemRef = db.collection("places").doc(placeId).collection("items").doc(payload.itemId);
  await itemRef.set({
    canonicalName: payload.newName,
    aliasesNormalized: FieldValue.arrayUnion(normalizeItemName(payload.newName)),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { renamed: true };
}

async function applyReassignReview(placeId, payload) {
  const reviewSnap = await db.doc(payload.reviewPath).get();
  if (!reviewSnap.exists) throw new HttpsError("not-found", "La reseña ya no existe.");
  await reviewSnap.ref.set({
    canonicalItemId: payload.targetItemId,
    canonicalItemName: payload.targetItemName,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await rebuildCanonicalItemsForPlace(placeId);
  return { reassignedReviews: 1 };
}

const reviewItemProposal = onCall({ invoker: "public", timeoutSeconds: 300 }, async (request) => {
  const uid = request.auth?.uid;
  await assertJefeAccess(uid, "Solo un administrador puede revisar propuestas.");

  const proposalId = asString(request.data?.proposalId, 300);
  const decision = asString(request.data?.decision, 20);
  const adminNotes = asString(request.data?.adminNotes, 500).replace(/[<>]/g, "");
  if (!proposalId) throw new HttpsError("invalid-argument", "Falta proposalId.");
  if (decision !== "approve" && decision !== "reject") throw new HttpsError("invalid-argument", "Decisión no válida.");

  const proposalRef = db.collection("itemProposals").doc(proposalId);
  const proposalSnap = await proposalRef.get();
  if (!proposalSnap.exists) throw new HttpsError("not-found", "La propuesta no existe.");
  const proposal = proposalSnap.data() || {};
  if (proposal.status !== "pending") throw new HttpsError("failed-precondition", "Esta propuesta ya fue revisada.");

  let applyResult = null;
  if (decision === "approve") {
    if (proposal.type === "merge") applyResult = await applyMerge(proposal.placeId, proposal.payload);
    else if (proposal.type === "rename") applyResult = await applyRename(proposal.placeId, proposal.payload);
    else if (proposal.type === "reassign_review") applyResult = await applyReassignReview(proposal.placeId, proposal.payload);
  }

  await proposalRef.set({
    status: decision === "approve" ? "approved" : "rejected",
    adminNotes: adminNotes || null,
    reviewedBy: uid,
    reviewedAt: FieldValue.serverTimestamp(),
    applyResult: applyResult || null,
  }, { merge: true });

  await writeAuditLog(uid, `businessPro.itemProposal${decision === "approve" ? "Approved" : "Rejected"}`, {
    proposalId,
    placeId: proposal.placeId,
    type: proposal.type,
    payload: proposal.payload,
    adminNotes: adminNotes || null,
    applyResult,
  });

  if (proposal.createdBy) {
    const typeLabels = {
      merge: "fusión de elementos",
      rename: "cambio de nombre",
      reassign_review: "reasignación de reseña",
    };
    await sendNotification(proposal.createdBy, "business_pro_update", {
      message: decision === "approve"
        ? `Tu propuesta de ${typeLabels[proposal.type] || "cambio"} en ${proposal.placeName || "tu negocio"} ha sido aprobada.`
        : `Tu propuesta de ${typeLabels[proposal.type] || "cambio"} en ${proposal.placeName || "tu negocio"} ha sido rechazada${adminNotes ? `: ${adminNotes}` : "."}`,
      link: `/businesses/${proposal.placeId}/manage`,
      placeId: proposal.placeId,
    }, { notificationId: `item_proposal_${proposalId}` });
  }

  logger.info("businessItems: propuesta revisada", { proposalId, decision, actorUid: uid });
  return { ok: true, proposalId, decision, applyResult };
});

module.exports = {
  createBusinessItem,
  submitItemProposal,
  reviewItemProposal,
  rebuildPlaceItemsForManager,
};
