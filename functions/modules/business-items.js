// functions/modules/business-items.js
//
// Gestión Pro de la carta sobre los items canónicos comunitarios
// (places/{placeId}/items/{itemId}). Modelo de identidad en
// lib/canonical-resolve.js; en resumen:
// - El id de un elemento no cambia; canonicalName es su nombre visible y
//   curatedAliasesNormalized (y curatedRawAliases, para nombres sin letras
//   latinas ni cifras) los nombres que el negocio o un admin declararon
//   suyos (alta, renombrados, fusiones). El rebuild nunca toca esos campos.
// - Cuando un elemento está curado, el servidor reescribe itemName de sus
//   reseñas con el canonicalName (el texto escrito queda en originalItemName),
//   así listas, búsqueda y GroupPage lo muestran con el nombre de la carta.
//
// Callables:
// - createBusinessItem: el negocio añade un elemento oficial (con sección y
//   precio). En transacción, rechaza nombres que ya son de otro elemento.
// - submitItemProposal: propuestas sensibles (fusionar duplicados por
//   erratas, renombrar, mover una reseña a otro elemento). Quedan pendientes
//   de aprobación admin.
// - reviewItemProposal: el admin aprueba/rechaza. Al aprobar se registran los
//   alias curados y se reconstruye el lugar, que renombra las reseñas y pone al
//   día los platos destacados.
// - adminRepairPlaceItems: reparación (jefe) de los datos anteriores a este
//   modelo: siembra alias curados, arregla fusiones reactivadas y reconstruye.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { assertJefeAccess, writeAuditLog } = require("./lib/auth");
const { assertBusinessProAccess, assertBusinessMenuAccess, sanitizeItemBusinessData } = require("./business-pro");
const {
  rebuildCanonicalItemsForPlace,
  fetchReviewCopiesForPlace,
  fetchExistingItems,
  getReviewItemId,
  toFirestoreData,
} = require("./canonical-items");
const {
  REVIEW_PATH,
  normalizeItemName,
  itemDocIdFromName,
  safeDocId,
  buildAliasIndex,
  createResolveContext,
  rawNameKey,
  rawAliasesOf,
  splitCuratedNames,
  sameItemName,
  followMerged,
  planReassignStamp,
  planPlaceRebuild,
  seedRepairPlan,
} = require("./lib/canonical-resolve");
const { syncSpotlightsForPlace } = require("./sponsored");
const { sendNotification } = require("./notifications");

const db = getFirestore();

const asString = (value, maxLength = 500) => (typeof value === "string" ? value.trim().slice(0, maxLength) : "");

const PROPOSAL_TYPES = new Set(["merge", "rename", "reassign_review"]);
const MAX_PENDING_PROPOSALS_PER_PLACE = 20;
const MAX_SUFFIX_ATTEMPTS = 50;
const REPAIR_MAX_PLACES = 300;
// Margen sobre los 540 s del callable para devolver el informe.
const REPAIR_TIME_BUDGET_MS = 480 * 1000;

const ZERO_STATS = Object.freeze({
  reviewCount: 0,
  ratingCount: 0,
  ratingTotal: 0,
  averageRating: null,
  photoCount: 0,
  criteriaStats: {},
});

async function getItemOrThrow(placeId, itemId) {
  const snap = await db.collection("places").doc(placeId).collection("items").doc(itemId).get();
  if (!snap.exists) throw new HttpsError("not-found", `El elemento ${itemId} no existe.`);
  return { id: snap.id, ...snap.data() };
}

function itemsMapFromSnap(snap) {
  const itemsById = new Map();
  snap.docs.forEach((docSnap) => itemsById.set(docSnap.id, { id: docSnap.id, ...docSnap.data() }));
  return itemsById;
}

async function bumpBusinessMenu(placeId) {
  await db.collection("places").doc(placeId).set({
    businessMenuUpdatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

// Elemento no inactivo que ya reclama un nombre (canonicalName o alias
// curado), distinto de `exceptItemId`. Null si el nombre está libre. Los
// nombres sin letras latinas ni cifras ("寿司", "🍺") se buscan tal cual,
// también entre los alias crudos.
function findNameOwner(itemsById, name, exceptItemId = null) {
  const normalized = normalizeItemName(name);
  let ownerId = null;
  if (normalized) ownerId = buildAliasIndex(itemsById).index.get(normalized);
  else if (rawNameKey(name)) ownerId = createResolveContext(itemsById).rawNameIndex.get(rawNameKey(name));
  if (!ownerId || ownerId === exceptItemId) return null;
  return { itemId: ownerId, item: itemsById.get(ownerId) || {} };
}

function assertRenameIsFree(itemsById, itemId, newName) {
  const owner = findNameOwner(itemsById, newName, itemId);
  if (!owner) return;
  const ownerName = owner.item.canonicalName || owner.itemId;
  throw new HttpsError(
    "already-exists",
    `Ya hay un elemento llamado «${ownerName}». Si son el mismo plato, propón fusionarlos.`,
    { itemId: owner.itemId, canonicalName: ownerName },
  );
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
  logger.info("businessItems: rebuild manual de items", { placeId, actorUid: uid, itemCount: result.itemCount });
  return { ok: true, ...result };
});

// Id libre para un elemento nuevo: el slug del nombre si está libre o es un
// elemento inactivo (se revive limpio); si no (elemento renombrado, o nombres
// sin letras latinas que dan todos 'sin-nombre'), `${slug}-2`, `${slug}-3`...
function pickNewItemId(itemsById, name) {
  const slug = itemDocIdFromName(name);
  const existing = itemsById.get(slug);
  if (!existing) return { itemId: slug, revived: false };
  if (existing.status === "inactive") return { itemId: slug, revived: true };
  for (let n = 2; n <= MAX_SUFFIX_ATTEMPTS + 1; n += 1) {
    const candidate = `${slug}-${n}`;
    if (!itemsById.has(candidate)) return { itemId: candidate, revived: false };
  }
  return { itemId: `${slug}-${Date.now().toString(36)}`, revived: false };
}

const createBusinessItem = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  const placeId = asString(request.data?.placeId, 300);
  const name = asString(request.data?.name, 120).replace(/[<>]/g, "");
  if (!name) throw new HttpsError("invalid-argument", "El elemento necesita un nombre.");

  const { placeRef, place } = await assertBusinessMenuAccess(placeId, uid);

  const sanitized = sanitizeItemBusinessData(request.data?.businessData);
  const itemsRef = placeRef.collection("items");

  // En transacción: dos altas seguidas del mismo nombre (doble Enter, dos
  // pestañas) no pueden crear dos elementos.
  const { itemId, revived } = await db.runTransaction(async (tx) => {
    const itemsById = itemsMapFromSnap(await tx.get(itemsRef));

    const owner = findNameOwner(itemsById, name);
    if (owner) {
      const ownerName = owner.item.canonicalName || owner.itemId;
      const formerName = !sameItemName(ownerName, name) ? ` Antes se llamaba «${name}».` : "";
      throw new HttpsError(
        "already-exists",
        `Ya existe «${ownerName}» en tu carta.${formerName}`,
        { itemId: owner.itemId, canonicalName: ownerName },
      );
    }
    const picked = pickNewItemId(itemsById, name);
    const curated = splitCuratedNames([name]);
    const aliases = curated.normalized;
    // set sin merge: un elemento inactivo se revive limpio (sin mergedInto,
    // stats ni listas viejas). Sus listStats los pone al día el próximo rebuild.
    tx.set(itemsRef.doc(picked.itemId), {
      canonicalName: name,
      aliasesNormalized: aliases,
      curatedAliasesNormalized: aliases,
      curatedRawAliases: curated.raw,
      sourceNames: [],
      linkedListIds: [],
      source: "business",
      businessCreated: true,
      status: "active",
      businessData: {
        ...sanitized,
        updatedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      stats: { ...ZERO_STATS, criteriaStats: {} },
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return picked;
  });

  await bumpBusinessMenu(placeId);

  await writeAuditLog(uid, "businessPro.itemCreated", {
    placeId,
    placeName: place.name || null,
    itemId,
    itemName: name,
    revived,
  });

  return {
    ok: true,
    itemId,
    name,
    item: {
      id: itemId,
      canonicalName: name,
      status: "active",
      source: "business",
      businessData: { ...sanitized, updatedBy: uid },
      stats: { ...ZERO_STATS, criteriaStats: {} },
    },
  };
});

const submitItemProposal = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  const placeId = asString(request.data?.placeId, 300);
  const type = asString(request.data?.type, 30);
  const note = asString(request.data?.note, 500).replace(/[<>]/g, "");
  if (!PROPOSAL_TYPES.has(type)) throw new HttpsError("invalid-argument", "Tipo de propuesta no válido.");

  const { placeRef, place } = await assertBusinessProAccess(placeId, uid);

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
    const itemsById = itemsMapFromSnap(await placeRef.collection("items").get());
    const item = itemsById.get(itemId);
    if (!item) throw new HttpsError("not-found", `El elemento ${itemId} no existe.`);
    if ((item.canonicalName || "").trim() === newName) {
      throw new HttpsError("invalid-argument", "El nombre propuesto es igual al actual.");
    }
    assertRenameIsFree(itemsById, itemId, newName);
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

// Fusión aprobada: los nombres del origen pasan a ser alias curados del
// destino y el origen queda inactivo apuntando a él. Las reseñas no se tocan
// aquí: el rebuild las lleva al destino (alias / mergedInto) y las renombra.
async function applyMerge(placeId, payload) {
  const itemsRef = db.collection("places").doc(placeId).collection("items");
  const itemsById = await fetchExistingItems(placeId);
  const sourceId = safeDocId(payload.sourceItemId);
  const source = itemsById.get(sourceId);
  if (!source) throw new HttpsError("not-found", `El elemento ${sourceId} no existe.`);
  if (!itemsById.has(safeDocId(payload.targetItemId))) {
    throw new HttpsError("not-found", `El elemento ${payload.targetItemId} no existe.`);
  }
  const targetId = followMerged(safeDocId(payload.targetItemId), itemsById);
  if (targetId === sourceId) throw new HttpsError("failed-precondition", "Los dos elementos ya son el mismo.");
  const target = itemsById.get(targetId);
  if (!target || target.status === "inactive") {
    throw new HttpsError("failed-precondition", "El elemento destino ya no está activo.");
  }

  const aliases = splitCuratedNames([
    source.canonicalName,
    ...(Array.isArray(source.curatedAliasesNormalized) ? source.curatedAliasesNormalized : []),
    ...rawAliasesOf(source),
    ...(Array.isArray(source.aliasesNormalized) ? source.aliasesNormalized : []),
  ]);
  const batch = db.batch();
  if (aliases.normalized.length > 0 || aliases.raw.length > 0) {
    batch.set(itemsRef.doc(targetId), {
      ...(aliases.normalized.length > 0 ? { curatedAliasesNormalized: FieldValue.arrayUnion(...aliases.normalized) } : {}),
      ...(aliases.raw.length > 0 ? { curatedRawAliases: FieldValue.arrayUnion(...aliases.raw) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  // El item origen queda inactivo; su businessData no se pierde por si el
  // admin quiere recuperar algo, pero deja de mostrarse.
  batch.set(itemsRef.doc(sourceId), {
    status: "inactive",
    mergedInto: targetId,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await batch.commit();
  await bumpBusinessMenu(placeId);

  const rebuild = await rebuildCanonicalItemsForPlace(placeId);
  return { reassignedReviews: rebuild.renamedReviews || 0, targetItemId: targetId };
}

// Renombrado aprobado: el nombre anterior, el que vio el negocio al proponerlo
// y el nuevo pasan a ser alias curados; el rebuild renombra las reseñas y los
// platos destacados.
async function applyRename(placeId, payload) {
  const itemsById = await fetchExistingItems(placeId);
  const itemId = safeDocId(payload.itemId);
  const item = itemsById.get(itemId);
  if (!item) throw new HttpsError("not-found", `El elemento ${itemId} no existe.`);
  if (item.status === "inactive" && item.mergedInto) {
    const targetId = followMerged(itemId, itemsById);
    const targetName = itemsById.get(targetId)?.canonicalName || targetId;
    throw new HttpsError(
      "failed-precondition",
      `Este elemento se fusionó con «${targetName}». Propón el cambio de nombre sobre ese elemento.`,
      { itemId: targetId, canonicalName: targetName },
    );
  }
  const newName = asString(payload.newName, 120).replace(/[<>]/g, "");
  if (!newName) throw new HttpsError("invalid-argument", "Falta el nombre nuevo.");
  assertRenameIsFree(itemsById, itemId, newName);

  // Los nombres sin letras latinas ni cifras van como alias crudos: si no, un
  // '🍺' renombrado a '🍷' perdería sus reseñas hacia el slug 'sin-nombre'.
  const aliases = splitCuratedNames([item.canonicalName, payload.currentName, newName]);
  await db.collection("places").doc(placeId).collection("items").doc(itemId).set({
    canonicalName: newName,
    ...(aliases.normalized.length > 0 ? {
      curatedAliasesNormalized: FieldValue.arrayUnion(...aliases.normalized),
      aliasesNormalized: FieldValue.arrayUnion(...aliases.normalized),
    } : {}),
    ...(aliases.raw.length > 0 ? { curatedRawAliases: FieldValue.arrayUnion(...aliases.raw) } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await bumpBusinessMenu(placeId);

  const rebuild = await rebuildCanonicalItemsForPlace(placeId);
  return { renamed: true, renamedReviews: rebuild.renamedReviews || 0 };
}

// Mover una reseña aprobado: todas sus copias (anidada y root antigua) pasan a
// llamarse como el elemento destino actual. El texto escrito NO se convierte
// en alias (un "1" no debe arrastrar futuras reseñas).
async function applyReassignReview(placeId, payload) {
  const itemsById = await fetchExistingItems(placeId);
  const requestedId = safeDocId(payload.targetItemId);
  if (!itemsById.has(requestedId)) throw new HttpsError("not-found", `El elemento ${requestedId} no existe.`);
  const targetId = followMerged(requestedId, itemsById);
  const target = itemsById.get(targetId);
  if (!target || target.status === "inactive") {
    throw new HttpsError("failed-precondition", "El elemento destino ya no está activo.");
  }

  const reviewId = String(payload.reviewId || String(payload.reviewPath || "").split("/").pop() || "");
  const { copies } = await fetchReviewCopiesForPlace(placeId);
  const reviewCopies = copies.filter((copy) => copy.id === reviewId && REVIEW_PATH.test(copy.refPath));
  if (reviewCopies.length === 0) throw new HttpsError("not-found", "La reseña ya no existe.");

  // Sin updatedAt: es una corrección del servidor, no una edición del autor.
  const batch = db.batch();
  reviewCopies.forEach((copy) => {
    batch.update(db.doc(copy.refPath), toFirestoreData(planReassignStamp(copy, targetId, target)));
  });
  await batch.commit();
  await bumpBusinessMenu(placeId);

  await rebuildCanonicalItemsForPlace(placeId);
  return { reassignedReviews: 1, targetItemId: targetId };
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

// ── Reparación de cartas (Developer → Propuestas Pro) ───────────────────────

const REPAIR_COUNTERS = [
  "renamedReviews",
  "stampedReviews",
  "deactivatedItems",
  "mergedItems",
  "fixedMergedItems",
  "spotlightsUpdated",
];

async function repairPlaceItems(placeId, { dryRun }) {
  const placeRef = db.collection("places").doc(placeId);
  const [placeSnap, items, proposalsSnap, { copies }] = await Promise.all([
    placeRef.get(),
    fetchExistingItems(placeId),
    db.collection("itemProposals").where("placeId", "==", placeId).where("status", "==", "approved").get(),
    fetchReviewCopiesForPlace(placeId),
  ]);
  const placeName = placeSnap.exists ? (placeSnap.data()?.name || null) : null;
  const proposals = proposalsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

  const seed = seedRepairPlan({ itemsById: items, proposals, reviews: copies });
  const plan = planPlaceRebuild({ reviews: seed.reviews, itemsById: seed.itemsById });

  const row = {
    placeId,
    placeName,
    renamedReviews: plan.summary.renamedReviews,
    stampedReviews: plan.summary.stampedReviews,
    deactivatedItems: plan.summary.deactivatedItems,
    mergedItems: plan.summary.mergedItems,
    fixedMergedItems: seed.fixedMergedItems,
    restoredReviewLinks: seed.reviewPins.length,
    spotlightsUpdated: 0,
    conflicts: plan.conflicts,
    duplicates: plan.duplicates,
  };

  if (dryRun) {
    row.spotlightsUpdated = await syncSpotlightsForPlace(placeId, plan.itemsAfter, { dryRun: true });
    return row;
  }

  // 1) Persistir lo sembrado: alias curados, fusiones arregladas y enlaces de
  //    reasignación perdidos (como enlace antiguo: el rebuild los respeta una
  //    vez y los normaliza).
  const itemsRef = placeRef.collection("items");
  let batch = db.batch();
  let pending = 0;
  const flush = async () => {
    if (pending === 0) return;
    await batch.commit();
    batch = db.batch();
    pending = 0;
  };
  for (const patch of seed.itemPatches) {
    const data = { updatedAt: FieldValue.serverTimestamp() };
    if (patch.addCuratedAliases.length > 0) data.curatedAliasesNormalized = FieldValue.arrayUnion(...patch.addCuratedAliases);
    if (patch.addCuratedRawAliases?.length > 0) data.curatedRawAliases = FieldValue.arrayUnion(...patch.addCuratedRawAliases);
    if (patch.status) data.status = patch.status;
    if (patch.clearMergedInto) data.mergedInto = FieldValue.delete();
    else if (patch.mergedInto) data.mergedInto = patch.mergedInto;
    batch.set(itemsRef.doc(patch.itemId), data, { merge: true });
    pending += 1;
    if (pending >= 400) await flush();
  }
  await flush();
  // Una a una: si la reseña ya no existe no debe tumbar el resto.
  await Promise.all(seed.reviewPins.map((pin) => db.doc(pin.refPath)
    .update({ canonicalItemId: pin.itemId })
    .catch((error) => logger.warn("businessItems: no se pudo restaurar el enlace de una reseña", {
      placeId,
      refPath: pin.refPath,
      error: error.message,
    }))));

  // 2) Rebuild real: aplica el mismo plan y sincroniza los platos destacados.
  const result = await rebuildCanonicalItemsForPlace(placeId);
  return {
    ...row,
    renamedReviews: result.renamedReviews,
    stampedReviews: result.stampedReviews,
    deactivatedItems: result.deactivatedItems,
    mergedItems: result.mergedItems,
    spotlightsUpdated: result.spotlightsUpdated,
    conflicts: result.conflicts,
    duplicates: plan.duplicates,
  };
}

async function listRepairPlaceIds() {
  const [proposalsSnap, verifiedSnap] = await Promise.all([
    db.collection("itemProposals").where("status", "==", "approved").select("placeId").get(),
    db.collection("places").where("businessVerified", "==", true).select().get(),
  ]);
  const ids = new Set();
  proposalsSnap.docs.forEach((docSnap) => {
    const placeId = asString(docSnap.get("placeId"), 300);
    if (placeId) ids.add(placeId);
  });
  verifiedSnap.docs.forEach((docSnap) => ids.add(docSnap.id));
  return Array.from(ids);
}

const adminRepairPlaceItems = onCall({ invoker: "public", timeoutSeconds: 540 }, async (request) => {
  const uid = request.auth?.uid;
  await assertJefeAccess(uid, "Solo un administrador puede reparar cartas.");
  const placeIdParam = asString(request.data?.placeId, 300);
  const dryRun = request.data?.dryRun !== false;
  const startedAt = Date.now();

  let placeIds;
  let truncated = false;
  if (placeIdParam) {
    placeIds = [placeIdParam];
  } else {
    placeIds = await listRepairPlaceIds();
    if (placeIds.length > REPAIR_MAX_PLACES) {
      logger.warn("businessItems: reparación limitada a los primeros lugares", {
        total: placeIds.length,
        processed: REPAIR_MAX_PLACES,
        dropped: placeIds.slice(REPAIR_MAX_PLACES),
      });
      placeIds = placeIds.slice(0, REPAIR_MAX_PLACES);
      truncated = true;
    }
  }

  const places = [];
  for (const placeId of placeIds) {
    if (Date.now() - startedAt > REPAIR_TIME_BUDGET_MS) {
      logger.warn("businessItems: reparación cortada por tiempo", { processed: places.length, total: placeIds.length });
      truncated = true;
      break;
    }
    try {
      places.push(await repairPlaceItems(placeId, { dryRun }));
    } catch (error) {
      logger.error("businessItems: error reparando un lugar", { placeId, error: error.message });
      places.push({
        placeId,
        placeName: null,
        ...Object.fromEntries(REPAIR_COUNTERS.map((key) => [key, 0])),
        conflicts: [],
        duplicates: [],
        error: error.message || "Error desconocido",
      });
    }
  }

  const totals = { places: places.length };
  REPAIR_COUNTERS.forEach((key) => {
    totals[key] = places.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
  });

  if (!dryRun) {
    await writeAuditLog(uid, "businessPro.repairPlaceItems", {
      placeId: placeIdParam || null,
      totals,
      truncated,
      placeIds: places.map((row) => row.placeId).slice(0, 300),
    });
  }
  logger.info("businessItems: reparación de cartas", { dryRun, totals, truncated, actorUid: uid });

  return { ok: true, dryRun, places, totals, truncated };
});

module.exports = {
  createBusinessItem,
  submitItemProposal,
  reviewItemProposal,
  rebuildPlaceItemsForManager,
  adminRepairPlaceItems,
};
