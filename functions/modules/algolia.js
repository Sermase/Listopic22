// Algolia module (ampliado): sincroniza lists, users, places y reviews

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const algoliasearch = require("algoliasearch");

// Inicialización segura de Algolia
let defaultListsIndex;
let algoliaClient;

try {
  const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID;
  const ALGOLIA_ADMIN_KEY = process.env.ALGOLIA_API_KEY;

  if (!ALGOLIA_APP_ID || !ALGOLIA_ADMIN_KEY) {
    logger.error("FATAL: Variables de entorno de Algolia no definidas. Las funciones de Algolia no operarán.");
  } else {
    algoliaClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY);
    defaultListsIndex = algoliaClient.initIndex("lists");
    logger.info("Cliente de Algolia inicializado correctamente desde variables de entorno.");
  }
} catch (e) {
  logger.error("FATAL: Excepción al inicializar el cliente de Algolia.", e);
}

function getIndex(name) {
  if (!algoliaClient) return null;
  try { return algoliaClient.initIndex(name); } catch { return null; }
}

// Sincronización automática: lists
const onListCreated = onDocumentCreated("lists/{listId}", (event) => {
  if (!defaultListsIndex) { logger.error("onListCreated: Índice 'lists' no disponible."); return; }
  const snap = event.data; if (!snap) return;
  const data = snap.data();
  data.objectID = snap.id;
  return defaultListsIndex.saveObject(data)
    .then(() => logger.info(`lists: añadido ${data.objectID}`))
    .catch(err => logger.error(`lists: error al añadir ${data.objectID}`, err));
});

const onListUpdated = onDocumentUpdated("lists/{listId}", (event) => {
  if (!defaultListsIndex) { logger.error("onListUpdated: Índice 'lists' no disponible."); return; }
  const snap = event.data?.after; if (!snap) return;
  const data = snap.data();
  data.objectID = snap.id;
  return defaultListsIndex.saveObject(data)
    .then(() => logger.info(`lists: actualizado ${data.objectID}`))
    .catch(err => logger.error(`lists: error al actualizar ${data.objectID}`, err));
});

const onListDeleted = onDocumentDeleted("lists/{listId}", (event) => {
  if (!defaultListsIndex) { logger.error("onListDeleted: Índice 'lists' no disponible."); return; }
  const snap = event.data; if (!snap) return;
  const objectID = snap.id;
  return defaultListsIndex.deleteObject(objectID)
    .then(() => logger.info(`lists: eliminado ${objectID}`))
    .catch(err => logger.error(`lists: error al eliminar ${objectID}`, err));
});

// Sincronización automática: users
const onUserCreated = onDocumentCreated("users/{userId}", (event) => {
  const idx = getIndex("users"); if (!idx) { logger.error("onUserCreated: Índice 'users' no disponible."); return; }
  const snap = event.data; if (!snap) return;
  const d = snap.data();
  const record = {
    objectID: snap.id,
    displayName: d.displayName || d.name || "",
    bio: d.bio || "",
    photoURL: d.photoURL || d.avatarUrl || "",
    username: d.username || "",
  };
  return idx.saveObject(record)
    .then(() => logger.info(`users: añadido ${record.objectID}`))
    .catch(err => logger.error(`users: error al añadir ${record.objectID}`, err));
});

const onUserUpdated = onDocumentUpdated("users/{userId}", (event) => {
  const idx = getIndex("users"); if (!idx) { logger.error("onUserUpdated: Índice 'users' no disponible."); return; }
  const snap = event.data?.after; if (!snap) return;
  const d = snap.data();
  const record = {
    objectID: snap.id,
    displayName: d.displayName || d.name || "",
    bio: d.bio || "",
    photoURL: d.photoURL || d.avatarUrl || "",
    username: d.username || "",
  };
  return idx.saveObject(record)
    .then(() => logger.info(`users: actualizado ${record.objectID}`))
    .catch(err => logger.error(`users: error al actualizar ${record.objectID}`, err));
});

const onUserDeleted = onDocumentDeleted("users/{userId}", (event) => {
  const idx = getIndex("users"); if (!idx) { logger.error("onUserDeleted: Índice 'users' no disponible."); return; }
  const objectID = event.data?.id; if (!objectID) return;
  return idx.deleteObject(objectID)
    .then(() => logger.info(`users: eliminado ${objectID}`))
    .catch(err => logger.error(`users: error al eliminar ${objectID}`, err));
});

// Sincronización automática: places
const onPlaceCreated = onDocumentCreated("places/{placeId}", (event) => {
  const idx = getIndex("places"); if (!idx) { logger.error("onPlaceCreated: Índice 'places' no disponible."); return; }
  const snap = event.data; if (!snap) return;
  const d = snap.data();
  const record = { objectID: snap.id, ...d };
  return idx.saveObject(record)
    .then(() => logger.info(`places: añadido ${record.objectID}`))
    .catch(err => logger.error(`places: error al añadir ${record.objectID}`, err));
});

const onPlaceUpdated = onDocumentUpdated("places/{placeId}", (event) => {
  const idx = getIndex("places"); if (!idx) { logger.error("onPlaceUpdated: Índice 'places' no disponible."); return; }
  const snap = event.data?.after; if (!snap) return;
  const d = snap.data();
  const record = { objectID: snap.id, ...d };
  return idx.saveObject(record)
    .then(() => logger.info(`places: actualizado ${record.objectID}`))
    .catch(err => logger.error(`places: error al actualizar ${record.objectID}`, err));
});

const onPlaceDeleted = onDocumentDeleted("places/{placeId}", (event) => {
  const idx = getIndex("places"); if (!idx) { logger.error("onPlaceDeleted: Índice 'places' no disponible."); return; }
  const objectID = event.data?.id; if (!objectID) return;
  return idx.deleteObject(objectID)
    .then(() => logger.info(`places: eliminado ${objectID}`))
    .catch(err => logger.error(`places: error al eliminar ${objectID}`, err));
});

// Sincronización automática: reviews (collection group)
const onReviewCreated = onDocumentCreated("{path=**}/reviews/{reviewId}", (event) => {
  const idx = getIndex("reviews"); if (!idx) { logger.warn("onReviewCreated: Índice 'reviews' no disponible. Saltando."); return; }
  const snap = event.data; if (!snap) return;
  const d = snap.data();
  const listId = snap.ref.parent?.parent?.id || null;
  const record = { objectID: snap.id, listId, ...d };
  return idx.saveObject(record)
    .then(() => logger.info(`reviews: añadido ${record.objectID}`))
    .catch(err => logger.error(`reviews: error al añadir ${record.objectID}`, err));
});

const onReviewUpdated = onDocumentUpdated("{path=**}/reviews/{reviewId}", (event) => {
  const idx = getIndex("reviews"); if (!idx) { logger.warn("onReviewUpdated: Índice 'reviews' no disponible. Saltando."); return; }
  const snap = event.data?.after; if (!snap) return;
  const d = snap.data();
  const listId = snap.ref.parent?.parent?.id || null;
  const record = { objectID: snap.id, listId, ...d };
  return idx.saveObject(record)
    .then(() => logger.info(`reviews: actualizado ${record.objectID}`))
    .catch(err => logger.error(`reviews: error al actualizar ${record.objectID}`, err));
});

const onReviewDeleted = onDocumentDeleted("{path=**}/reviews/{reviewId}", (event) => {
  const idx = getIndex("reviews"); if (!idx) { logger.warn("onReviewDeleted: Índice 'reviews' no disponible. Saltando."); return; }
  const objectID = event.data?.id; if (!objectID) return;
  return idx.deleteObject(objectID)
    .then(() => logger.info(`reviews: eliminado ${objectID}`))
    .catch(err => logger.error(`reviews: error al eliminar ${objectID}`, err));
});

// ==============================================================
// Agrupador: construye índice 'grouped_items' a partir de reviews
// ==============================================================

function normalizeString(s) {
  return (s || "").toString().trim().toLowerCase();
}

async function recomputeGroupedItem(listId, baseReview) {
  try {
    const idx = getIndex("grouped_items");
    if (!idx) { logger.warn("grouped_items: índice no disponible. Saltando."); return; }
    if (!listId || !baseReview) return;

    const db = admin.firestore();
    const listRef = db.collection("lists").doc(listId);

    const itemName = baseReview.itemName || "";
    const placeId = baseReview.placeId || null;
    const establishmentName = baseReview.establishmentName || "";

    // Obtener reviews candidatas por itemName y filtrar
    const snap = await listRef.collection("reviews").where("itemName", "==", itemName).get();
    const docs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r => {
        if (placeId) return r.placeId === placeId;
        return normalizeString(r.establishmentName) === normalizeString(establishmentName);
      });

    // Si no quedan reviews para este grupo tras un borrado, elimina de Algolia
    const groupKey = `${listId}__${placeId || 'none'}__${normalizeString(itemName)}__${normalizeString(establishmentName)}`;

    if (docs.length === 0) {
      await idx.deleteObject(groupKey).catch(() => {});
      logger.info(`grouped_items: eliminado grupo vacío ${groupKey}`);
      return;
    }

    // Cargar info del lugar si aplica
    let placeData = null;
    if (placeId) {
      try {
        const pDoc = await db.collection('places').doc(placeId).get();
        if (pDoc.exists) placeData = pDoc.data();
      } catch (_) {}
    }

    // Agregados
    let itemCount = 0;
    let sumOverall = 0;
    const criteriaTotals = {};
    const criteriaCounts = {};
    const allTags = new Set();
    let thumbnailUrl = placeData?.mainImageUrl || null;

    docs.forEach(r => {
      itemCount += 1;
      if (typeof r.overallRating === 'number') sumOverall += r.overallRating;
      if (!thumbnailUrl && r.photoUrl) thumbnailUrl = r.photoUrl;
      if (Array.isArray(r.userTags)) r.userTags.forEach(t => allTags.add(t));
      if (r.scores && typeof r.scores === 'object') {
        Object.entries(r.scores).forEach(([k, v]) => {
          if (typeof v === 'number') {
            criteriaTotals[k] = (criteriaTotals[k] || 0) + v;
            criteriaCounts[k] = (criteriaCounts[k] || 0) + 1;
          }
        });
      }
    });

    const avgGeneralScore = itemCount > 0 ? Number((sumOverall / itemCount).toFixed(1)) : 0;
    const criteriaAvg = {};
    Object.keys(criteriaTotals).forEach(k => {
      const c = criteriaCounts[k] || 1;
      criteriaAvg[k] = Number((criteriaTotals[k] / c).toFixed(1));
    });

    const estNameOut = placeData?.name || establishmentName || baseReview.establishmentName || "";
    const record = {
      objectID: groupKey,
      listId,
      placeId: placeId || null,
      establishmentName: estNameOut,
      itemName: itemName || "",
      itemCount,
      avgGeneralScore,
      criteriaAvg,
      allTags: Array.from(allTags),
      thumbnailUrl: thumbnailUrl || null,
      googleMapsUrl: placeData?.googleMapsUrl || null,
      updatedAt: Date.now(),
    };

    await idx.saveObject(record);
    logger.info(`grouped_items: actualizado ${groupKey} (${itemCount} reseñas)`);
  } catch (err) {
    logger.error("grouped_items: error al recomputar grupo", err);
  }
}

const updateGroupedItemsOnReviewCreated = onDocumentCreated("lists/{listId}/reviews/{reviewId}", async (event) => {
  const listId = event.params.listId;
  const snap = event.data; if (!snap) return;
  await recomputeGroupedItem(listId, snap.data());
});

const updateGroupedItemsOnReviewUpdated = onDocumentUpdated("lists/{listId}/reviews/{reviewId}", async (event) => {
  const listId = event.params.listId;
  const snap = event.data?.after; if (!snap) return;
  await recomputeGroupedItem(listId, snap.data());
});

const updateGroupedItemsOnReviewDeleted = onDocumentDeleted("lists/{listId}/reviews/{reviewId}", async (event) => {
  const listId = event.params.listId;
  const before = event.data; if (!before) return;
  await recomputeGroupedItem(listId, before.data());
});

// Backfill administrado (solo rol jefe)
const adminBackfillAlgolia = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes estar autenticado para realizar esta operación.");
  }

  const uid = request.auth.uid;
  const userDoc = await admin.firestore().collection("users").doc(uid).get();
  if (!userDoc.exists) {
    throw new HttpsError("permission-denied", "No se encontró tu perfil de usuario.");
  }
  const userData = userDoc.data();
  if (!userData.userType || !userData.userType.includes("jefe")) {
    logger.error(`Intento no autorizado de ejecutar adminBackfillAlgolia por el usuario: ${uid}`);
    throw new HttpsError("permission-denied", "Solo los usuarios de tipo 'jefe' pueden ejecutar esta operación.");
  }

  const { collectionName } = request.data;
  const allowedCollections = ["lists", "reviews", "places", "users", "grouped_items"];
  if (!allowedCollections.includes(collectionName)) {
    throw new HttpsError("invalid-argument", `La colección "${collectionName}" no está permitida.`);
  }
  if (!algoliaClient) {
    throw new HttpsError("internal", "El servicio de Algolia no está configurado.");
  }

  const targetIndex = algoliaClient.initIndex(collectionName);
  const db = admin.firestore();

  try {
    if (collectionName !== "grouped_items") {
      const snapshot = collectionName === "reviews"
        ? await db.collectionGroup("reviews").get()
        : await db.collection(collectionName).get();

      if (snapshot.empty) {
        return { success: true, message: `La colección "${collectionName}" está vacía.` };
      }

      const records = snapshot.docs.map(doc => ({
        ...doc.data(),
        ...(collectionName === "reviews" && doc.ref.parent.parent ? { listId: doc.ref.parent.parent.id } : {}),
        objectID: doc.id,
      }));

      const { objectIDs } = await targetIndex.saveObjects(records);
      const message = `Sincronización completada. ${objectIDs.length} registros de "${collectionName}" enviados a Algolia.`;
      logger.info(message);
      return { success: true, message };
    }

    // Backfill especial para grouped_items
    const listsSnap = await db.collection('lists').get();
    if (listsSnap.empty) {
      return { success: true, message: 'No hay listas para agrupar.' };
    }

    const placeCache = new Map();
    const groupMap = new Map(); // key -> aggregator

    for (const listDoc of listsSnap.docs) {
      const listId = listDoc.id;
      const reviewsSnap = await db.collection('lists').doc(listId).collection('reviews').get();
      for (const rDoc of reviewsSnap.docs) {
        const r = rDoc.data();
        const itemName = r.itemName || '';
        const placeId = r.placeId || null;
        const estName = r.establishmentName || '';
        const key = `${listId}__${placeId || 'none'}__${normalizeString(itemName)}__${normalizeString(estName)}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            listId,
            placeId,
            establishmentName: estName,
            itemName,
            itemCount: 0,
            sumOverall: 0,
            criteriaTotals: {},
            criteriaCounts: {},
            allTags: new Set(),
            thumbnailUrl: null,
          });
        }
        const agg = groupMap.get(key);
        agg.itemCount += 1;
        if (typeof r.overallRating === 'number') agg.sumOverall += r.overallRating;
        if (!agg.thumbnailUrl && r.photoUrl) agg.thumbnailUrl = r.photoUrl;
        if (Array.isArray(r.userTags)) r.userTags.forEach(t => agg.allTags.add(t));
        if (r.scores && typeof r.scores === 'object') {
          Object.entries(r.scores).forEach(([k, v]) => {
            if (typeof v === 'number') {
              agg.criteriaTotals[k] = (agg.criteriaTotals[k] || 0) + v;
              agg.criteriaCounts[k] = (agg.criteriaCounts[k] || 0) + 1;
            }
          });
        }
      }
    }

    const records = [];
    for (const [key, agg] of groupMap.entries()) {
      let placeData = null;
      if (agg.placeId) {
        if (placeCache.has(agg.placeId)) {
          placeData = placeCache.get(agg.placeId);
        } else {
          try {
            const p = await db.collection('places').doc(agg.placeId).get();
            placeData = p.exists ? p.data() : null;
            placeCache.set(agg.placeId, placeData);
          } catch (_) {}
        }
      }
      const avgGeneralScore = agg.itemCount > 0 ? Number((agg.sumOverall / agg.itemCount).toFixed(1)) : 0;
      const criteriaAvg = {};
      Object.keys(agg.criteriaTotals).forEach(k => {
        const c = agg.criteriaCounts[k] || 1;
        criteriaAvg[k] = Number((agg.criteriaTotals[k] / c).toFixed(1));
      });

      records.push({
        objectID: key,
        listId: agg.listId,
        placeId: agg.placeId || null,
        establishmentName: placeData?.name || agg.establishmentName || '',
        itemName: agg.itemName || '',
        itemCount: agg.itemCount,
        avgGeneralScore,
        criteriaAvg,
        allTags: Array.from(agg.allTags),
        thumbnailUrl: agg.thumbnailUrl || placeData?.mainImageUrl || null,
        googleMapsUrl: placeData?.googleMapsUrl || null,
        updatedAt: Date.now(),
      });
    }

    if (records.length === 0) {
      return { success: true, message: 'No se encontraron grupos para enviar.' };
    }

    const { objectIDs } = await targetIndex.saveObjects(records);
    const message = `Sincronización completada. ${objectIDs.length} grupos enviados a Algolia (grouped_items).`;
    logger.info(message);
    return { success: true, message };
  } catch (error) {
    logger.error(`Error durante el backfill de "${collectionName}":`, error);
    throw new HttpsError("internal", "Error al procesar la sincronización.");
  }
});

module.exports = {
  onListCreated,
  onListUpdated,
  onListDeleted,
  onUserCreated,
  onUserUpdated,
  onUserDeleted,
  onPlaceCreated,
  onPlaceUpdated,
  onPlaceDeleted,
  onReviewCreated,
  onReviewUpdated,
  onReviewDeleted,
  updateGroupedItemsOnReviewCreated,
  updateGroupedItemsOnReviewUpdated,
  updateGroupedItemsOnReviewDeleted,
  adminBackfillAlgolia,
};
