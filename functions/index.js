// functions/index.js
const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const {setGlobalOptions} = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const cors = require("cors")({origin: true});
const fetch = require("node-fetch");
const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");


if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

setGlobalOptions({ region: "europe-west1" });

// --- FUNCIÓN groupedReviews ---
exports.groupedReviews = onRequest(
  async (req, res) => {
    cors(req, res, async () => {
        const listId = req.query.listId;
        if (!listId) {
            logger.warn("groupedReviews: listId no proporcionado.", {structuredData: true});
            res.status(400).send({ error: "listId es requerido." });
            return;
        }
        logger.info(`groupedReviews: Procesando para listId: ${listId}`, {structuredData: true});
        try {
            const listDocRef = db.collection("lists").doc(listId);
            const reviewsSnapshot = await listDocRef.collection("reviews").get();
            
            const reviews = [];
            reviewsSnapshot.forEach(doc => {
                const reviewData = doc.data();
                reviews.push({ id: doc.id, ...reviewData });
                // LOG DETALLADO DE CADA RESEÑA Y SU placeId
                logger.info(`groupedReviews: Review ID: ${doc.id} leída, con Place ID: ${reviewData.placeId || "No encontrado/Nulo"}`, {reviewData: reviewData});
            });
            logger.info(`groupedReviews: Encontradas ${reviews.length} reseñas para listId: ${listId}`, {structuredData: true});

            if (reviews.length === 0) {
                const listDocEmpty = await listDocRef.get();
                const listDataEmpty = listDocEmpty.exists ? listDocEmpty.data() : {};
                logger.info(`groupedReviews: No hay reseñas para listId: ${listId}. Devolviendo lista vacía de grupos.`);
                res.status(200).json({ 
                    listName: listDataEmpty.name || "Lista Desconocida",
                    criteria: listDataEmpty.criteriaDefinition || {},
                    tags: listDataEmpty.availableTags || [],
                    groupedReviews: [] 
                });
                return;
            }

            const placeIds = [...new Set(reviews.map(r => r.placeId).filter(id => !!id))];
            const placesDataMap = new Map();

            if (placeIds.length > 0) {
                logger.info("groupedReviews: Intentando obtener los siguientes placeIds de /places:", placeIds, {structuredData: true});
                const placePromises = placeIds.map(id => db.collection('places').doc(id).get());
                const placeDocsSnapshots = await Promise.all(placePromises);
                placeDocsSnapshots.forEach(docSnap => {
                    if (docSnap.exists) {
                        placesDataMap.set(docSnap.id, docSnap.data());
                        logger.info(`groupedReviews: Datos del lugar ${docSnap.id} obtenidos de /places:`, docSnap.data(), {structuredData: true});
                    } else {
                        logger.warn(`groupedReviews: Documento de lugar no encontrado en /places para placeId: ${docSnap.id}`, {structuredData: true});
                    }
                });
            }
            logger.info(`groupedReviews: Datos de ${placesDataMap.size} lugares distintos obtenidos de /places.`, {structuredData: true});

            const grouped = {};
            reviews.forEach(review => {
                logger.info(`groupedReviews: Procesando review para agrupación - ID: ${review.id}, Place ID: ${review.placeId || "N/A"}`, {structuredData: true});
                const placeInfo = review.placeId ? placesDataMap.get(review.placeId) : null;
                
                let establishmentNameFromPlace = "Lugar Desconocido";
                if (placeInfo && placeInfo.name) {
                    establishmentNameFromPlace = placeInfo.name;
                } else if (placeInfo) {
                    logger.warn(`groupedReviews: placeInfo encontrado para placeId ${review.placeId}, pero no tiene campo 'name'. Usando 'Lugar Desconocido'.`, {placeInfoData: placeInfo});
                } else if (review.placeId) {
                    logger.warn(`groupedReviews: No se encontró información del lugar en placesDataMap para placeId: ${review.placeId}. Usando 'Lugar Desconocido'.`);
                } else {
                    logger.warn(`groupedReviews: La reseña ${review.id} no tiene placeId. Usando 'Lugar Desconocido'.`);
                }
                logger.info(`groupedReviews: Establishment name para la reseña ${review.id} será: "${establishmentNameFromPlace}"`, {structuredData: true});
                
                const key = `${establishmentNameFromPlace}-${review.itemName || ""}`;
                
                if (!grouped[key]) {
                    grouped[key] = {
                        establishmentName: establishmentNameFromPlace,
                        itemName: review.itemName || "", // Asegurar que no sea null/undefined
                        itemCount: 0,
                        totalGeneralScore: 0,
                        avgGeneralScore: 0,
                        thumbnailUrl: placeInfo ? placeInfo.mainImageUrl : null,
                        groupTags: new Set(),
                        listId: listId, 
                        reviewIds: [],
                        placeId: review.placeId // Mantener placeId para el grupo
                    };
                }
                grouped[key].itemCount++;
                grouped[key].totalGeneralScore += review.overallRating || 0;
                if (review.photoUrl && (!grouped[key].thumbnailUrl || !placeInfo?.mainImageUrl) ) { 
                    grouped[key].thumbnailUrl = review.photoUrl; 
                }
                if (review.userTags && Array.isArray(review.userTags)) {
                    review.userTags.forEach(tag => grouped[key].groupTags.add(tag));
                }
                grouped[key].reviewIds.push(review.id);
            });

            const groupedReviewsArray = Object.values(grouped).map(group => {
                group.avgGeneralScore = group.itemCount > 0 ? parseFloat((group.totalGeneralScore / group.itemCount).toFixed(1)) : 0;
                group.groupTags = Array.from(group.groupTags);
                delete group.totalGeneralScore;
                return group;
            });
            
            groupedReviewsArray.sort((a, b) => (b.avgGeneralScore || 0) - (a.avgGeneralScore || 0));

            const listDoc = await listDocRef.get();
            const listData = listDoc.exists ? listDoc.data() : {};
            logger.info(`groupedReviews: Datos de lista obtenidos para listId: ${listId}, Nombre: ${listData.name}`, {structuredData: true});

            const responsePayload = { 
                listName: listData.name || "Lista Desconocida",
                criteria: listData.criteriaDefinition || {},
                tags: listData.availableTags || [],
                groupedReviews: groupedReviewsArray 
            };
            
            logger.info(`groupedReviews: Respuesta enviada para listId: ${listId} con ${groupedReviewsArray.length} grupos. Payload:`, responsePayload, {structuredData: true});
            res.status(200).json(responsePayload);

        } catch (error) {
            logger.error(`Error en Cloud Function groupedReviews para listId: ${listId}`, error, {structuredData: true});
            res.status(500).send({ error: "Error interno del servidor al obtener reseñas agrupadas.", details: error.message });
        }
    });
});

// --- FUNCIÓN updateListReviewCount ---
// ESTA FUNCIÓN QUEDA OBSOLETA, LA NUEVA "updateAggregatesOnReviewChange" HACE ESTO Y MÁS.
// LA DEJAMOS COMENTADA POR SI ACASO, PERO LA NUEVA ES MEJOR.
/*
exports.updateListReviewCount = onDocumentWritten("lists/{listId}/reviews/{reviewId}", async (event) => {
  const listId = event.params.listId;
  const listRef = getFirestore().collection('lists').doc(listId);
  if (!event.data.before.exists && event.data.after.exists) {
      logger.info(`Nueva reseña creada en lista ${listId}, incrementando contador.`);
      return listRef.update({
          reviewCount: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp()
      });
  }
  else if (event.data.before.exists && !event.data.after.exists) {
      logger.info(`Reseña eliminada de lista ${listId}, decrementando contador.`);
      return listRef.update({
          reviewCount: FieldValue.increment(-1),
          updatedAt: FieldValue.serverTimestamp()
      });
  }
  else {
      logger.info(`Reseña actualizada en lista ${listId}, contador no afectado.`);
      return null;
  }
});
*/

// --- FUNCIÓN placesNearbyRestaurants ---
exports.placesNearbyRestaurants = onRequest(async (req, res) => {
  cors(req, res, async () => {
    const { latitude, longitude, keywords } = req.query;
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!latitude || !longitude) {
      logger.warn("placesNearbyRestaurants: Latitud y longitud son requeridas.", {query: req.query, structuredData: true});
      return res.status(400).json({ message: "Latitud y longitud son requeridas." });
    }
    if (!apiKey) {
      logger.error("placesNearbyRestaurants: GOOGLE_PLACES_API_KEY no está disponible como variable de entorno del proceso.", {env_keys: Object.keys(process.env), structuredData: true});
      return res.status(500).json({ message: "Error de configuración del servidor (Places API Key no encontrada)." });
    }
    const radius = 2000;
    const types = "restaurant|cafe|bar|bakery|meal_takeaway|food|point_of_interest";
    let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=${radius}&type=${encodeURIComponent(types)}&key=${apiKey}&language=es`;
    if (keywords && keywords.trim() !== "") {
      url += `&keyword=${encodeURIComponent(keywords.trim())}`;
    }
    logger.info("placesNearbyRestaurants: Fetching Google Places", {url: url.replace(apiKey, "REDACTED_API_KEY"), structuredData: true});
    try {
      const placesResponse = await fetch(url);
      const placesData = await placesResponse.json();
      if (placesData.status === "OK" || placesData.status === "ZERO_RESULTS") {
        res.status(200).json(placesData.results || []);
      } else {
        logger.error("placesNearbyRestaurants: Error desde Google Places API", {status: placesData.status, error_message: placesData.error_message, info_messages: placesData.info_messages, structuredData: true});
        res.status(500).json({ message: `Error de la API de Google Places: ${placesData.status}`, details: placesData.error_message || placesData.info_messages });
      }
    } catch (error) {
      logger.error("placesNearbyRestaurants: Error al contactar Google Places API", error, {structuredData: true});
      res.status(500).json({ message: "Error interno al buscar lugares cercanos.", error: error.message });
    }
  });
});

// --- FUNCIÓN placesTextSearch ---
exports.placesTextSearch = onRequest(async (req, res) => {
  cors(req, res, async () => {
    const { query, latitude, longitude } = req.query;
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!query) {
      logger.warn("placesTextSearch: El término de búsqueda (query) es requerido.", {query: req.query, structuredData: true});
      return res.status(400).json({ message: "El término de búsqueda (query) es requerido." });
    }
    if (!apiKey) {
        logger.error("placesTextSearch: GOOGLE_PLACES_API_KEY no está disponible como variable de entorno del proceso.", {env_keys: Object.keys(process.env), structuredData: true});
        return res.status(500).json({ message: "Error de configuración del servidor (Places API Key no encontrada)." });
    }
    let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}&language=es&type=establishment`;
    if (latitude && longitude) {
      url += `&location=${latitude},${longitude}&radius=20000`;
    }
    logger.info("placesTextSearch: Fetching Google Places", {url: url.replace(apiKey, "REDACTED_API_KEY"), structuredData: true});
    try {
      const placesResponse = await fetch(url);
      const placesData = await placesResponse.json();
      if (placesData.status === "OK" || placesData.status === "ZERO_RESULTS") {
        res.status(200).json(placesData.results || []);
      } else {
        logger.error("placesTextSearch: Error desde Google Places API", {status: placesData.status, error_message: placesData.error_message, info_messages: placesData.info_messages, structuredData: true});
        res.status(500).json({ message: `Error de la API de Google Places: ${placesData.status}`, details: placesData.error_message || placesData.info_messages });
      }
    } catch (error) {
      logger.error("placesTextSearch: Error al contactar Google Places API", error, {structuredData: true});
      res.status(500).json({ message: "Error interno al buscar lugares por texto.", error: error.message });
    }
  });
});

// --- FUNCIÓN CALLABLE: deleteListAndContent ---
exports.deleteOrOrphanList = onCall({cors: true}, async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) {
      logger.warn("deleteOrOrphanList: Intento de llamada no autenticado.");
      throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado.');
  }

  const callerUserId = contextAuth.uid;
  const listId = request.data.listId;

  if (!listId) {
      logger.warn(`deleteOrOrphanList: listId no proporcionado por el usuario ${callerUserId}.`);
      throw new HttpsError('invalid-argument', 'Se requiere el ID de la lista (listId).');
  }

  logger.info(`deleteOrOrphanList: Usuario ${callerUserId} solicitando acción sobre lista ${listId}.`);
  const listRef = db.collection('lists').doc(listId);
  const reviewsRef = listRef.collection('reviews');

  try {
      const listDoc = await listRef.get();
      if (!listDoc.exists) {
          throw new HttpsError('not-found', 'La lista no existe.');
      }

      const listData = listDoc.data();
      if (listData.userId !== callerUserId) {
          throw new HttpsError('permission-denied', 'No tienes permiso para modificar esta lista.');
      }

      // --- INICIO DE LA NUEVA LÓGICA ---

      // Buscar si existen reseñas de OTROS usuarios en esta lista.
      const otherUserReviewsSnapshot = await reviewsRef.where('userId', '!=', callerUserId).limit(1).get();

      // Escenario 1: NO hay reseñas de otros usuarios. Procedemos a borrar todo.
      if (otherUserReviewsSnapshot.empty) {
          logger.info(`La lista ${listId} no tiene reseñas de otros usuarios. Procediendo con la eliminación completa.`);
          
          // Borrar todas las reseñas (que sabemos que son solo del propietario).
          const allReviewsSnapshot = await reviewsRef.get();
          if (!allReviewsSnapshot.empty) {
              const deleteBatch = db.batch();
              allReviewsSnapshot.docs.forEach(doc => deleteBatch.delete(doc.ref));
              await deleteBatch.commit();
              logger.info(`Eliminadas ${allReviewsSnapshot.size} reseñas del propietario de la lista ${listId}.`);
          }
          
          // Borrar la lista en sí.
          await listRef.delete();
          logger.info(`Lista ${listId} eliminada exitosamente por ${callerUserId}.`);
          
          return { success: true, message: 'La lista y todas tus reseñas han sido eliminadas.' };
      
      // Escenario 2: SÍ hay reseñas de otros. Procedemos a desvincular/archivar.
      } else {
          logger.info(`La lista ${listId} tiene reseñas de otros usuarios. Procediendo a desvincular al propietario ${callerUserId}.`);
          
          const ownerReviewsSnapshot = await reviewsRef.where('userId', '==', callerUserId).get();

          // Borrar solo las reseñas del propietario original.
          if (!ownerReviewsSnapshot.empty) {
              const deleteOwnerReviewsBatch = db.batch();
              ownerReviewsSnapshot.docs.forEach(doc => deleteOwnerReviewsBatch.delete(doc.ref));
              await deleteOwnerReviewsBatch.commit();
              logger.info(`Eliminadas ${ownerReviewsSnapshot.size} reseñas del propietario de la lista ${listId} para archivarla.`);
          }

          // Actualizar la lista para "orfanarla".
          await listRef.update({
              userId: null, // Desvinculamos al usuario.
              originalUserId: callerUserId, // Guardamos un registro de quién la creó.
              name: `[Archivada] ${listData.name}`, // Cambiamos el nombre para que sea visible su estado.
              updatedAt: FieldValue.serverTimestamp()
          });

          logger.info(`Lista ${listId} desvinculada del usuario ${callerUserId} y archivada.`);
          
          return { success: true, message: 'Te has desvinculado de la lista. Tus reseñas han sido eliminadas, pero la lista permanece activa para los demás usuarios.' };
      }
      // --- FIN DE LA NUEVA LÓGICA ---

  } catch (error) {
      logger.error(`Error en deleteOrOrphanList para lista ${listId} y usuario ${callerUserId}:`, error);
      if (error.code) { // Si ya es un HttpsError, lo relanzamos.
          throw error;
      }
      throw new HttpsError('internal', 'Ocurrió un error inesperado.');
  }
});

// --- FUNCIÓN CALLABLE: createList ---
exports.createList = onCall(async (data, context) => {
    if (!context.auth) {
        logger.warn("createList: Intento de llamada no autenticado.", {structuredData: true});
        throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado para crear una lista.');
    }

    const userId = context.auth.uid;
    const { listName, criteriaDefinition, availableTags, isPublic, categoryId } = data;

    if (!listName || typeof listName !== 'string' || listName.trim() === "") {
        logger.warn(`createList: listName no proporcionado o inválido por el usuario ${userId}.`, {listNameProvided: listName, structuredData: true});
        throw new HttpsError('invalid-argument', 'El nombre de la lista es obligatorio y debe ser una cadena de texto.');
    }

    const listsRef = db.collection('lists');
    try {
        // Comprobar si ya existe una lista con ese nombre para este usuario
        const existingListQuery = await listsRef
                                    .where('userId', '==', userId)
                                    .where('name', '==', listName.trim()) // Comparar con el nombre saneado
                                    .limit(1)
                                    .get();

        if (!existingListQuery.empty) {
            logger.warn(`createList: Usuario ${userId} intentó crear lista duplicada: "${listName.trim()}"`, {structuredData: true});
            throw new HttpsError('already-exists', 'Ya tienes una lista con ese nombre.');
        }

        // Si no existe, proceder a crear la lista
        const newListData = {
            name: listName.trim(),
            userId: userId,
            criteriaDefinition: criteriaDefinition || {},
            availableTags: Array.isArray(availableTags) ? availableTags.map(tag => String(tag).trim()).filter(tag => tag) : [],
            isPublic: typeof isPublic === 'boolean' ? isPublic : true, // Por defecto pública
            categoryId: categoryId || "defaultCategory",
            reviewCount: 0,
            reactions: {},
            commentsCount: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const newListRef = await listsRef.add(newListData);
        logger.info(`createList: Lista "${listName.trim()}" creada con ID ${newListRef.id} por el usuario ${userId}`, {structuredData: true});
        return { listId: newListRef.id, message: 'Lista creada con éxito' };

    } catch (error) {
        logger.error(`Error en createList para el usuario ${userId} al intentar crear lista "${listName}":`, error, {structuredData: true});
        if (error.code && typeof error.code === 'string' && error.message) { // Re-lanzar HttpsError
            throw error;
        }
        throw new HttpsError('internal', 'Ocurrió un error al crear la lista.', error.message);
    }
});

// --- NUEVA FUNCIÓN CALLABLE: createListWithValidation ---
exports.createListWithValidation = onCall(
  async (request) => { 
    const data = request.data;
    const contextAuth = request.auth;

    if (!contextAuth) {
        logger.warn("createListWithValidation: Intento de llamada no autenticado.", {structuredData: true});
        throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado para crear una lista.');
    }
    
    const userId = contextAuth.uid;
    const listName = data.name;

    if (!listName || typeof listName !== 'string' || listName.trim() === '') {
        logger.warn(`createListWithValidation: Nombre de lista no proporcionado o inválido por el usuario ${userId}.`, {structuredData: true});
        throw new HttpsError('invalid-argument', 'El nombre de la lista es requerido.');
    }

    logger.info(`createListWithValidation: Usuario ${userId} intentando crear lista "${listName}"`, {structuredData: true});
    const listsRef = db.collection('lists');

    try {
        const existingListQuery = await listsRef
                                    .where('userId', '==', userId)
                                    .where('name', '==', listName.trim())
                                    .limit(1)
                                    .get();

        if (!existingListQuery.empty) {
            logger.warn(`createListWithValidation: Usuario ${userId} ya tiene una lista llamada "${listName.trim()}".`, {structuredData: true});
            throw new HttpsError('already-exists', `Ya tienes una lista llamada "${listName.trim()}". Por favor, elige otro nombre.`);
        }

        const newListData = {
            userId: userId,
            name: listName.trim(),
            isPublic: data.isPublic !== undefined ? data.isPublic : false,
            criteriaDefinition: data.criteriaDefinition || {},
            availableTags: data.availableTags || [],
            categoryId: data.categoryId || "defaultCategory",
            reviewCount: 0,
            reactions: {},
            commentsCount: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        Object.keys(newListData).forEach(key => newListData[key] === undefined && delete newListData[key]);

        const newListRef = await listsRef.add(newListData);
        logger.info(`createListWithValidation: Lista "${listName.trim()}" creada con ID ${newListRef.id} por el usuario ${userId}`, {structuredData: true});
        
        return { listId: newListRef.id, message: 'Lista creada con éxito.' };

    } catch (error) {
        logger.error(`Error en createListWithValidation para usuario ${userId}, lista "${listName}":`, error, {structuredData: true});
        if (error.code && typeof error.code === 'string' && error.message ) {
             throw error;
        }
        throw new HttpsError('internal', 'Ocurrió un error al crear la lista.', error.message);
    }
});

// NUEVA FUNCIÓN: reverseGeocode
exports.reverseGeocode = onRequest(async (req, res) => {
  cors(req, res, async () => {
    const { lat, lon } = req.query;
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;

    if (!lat || !lon) {
      logger.warn("reverseGeocode: Latitud (lat) y longitud (lon) son requeridas.", {query: req.query, structuredData: true});
      return res.status(400).json({ message: "Latitud y longitud son requeridas." });
    }
    if (!apiKey) {
      logger.error("reverseGeocode: GOOGLE_PLACES_API_KEY no está disponible como variable de entorno del proceso.", {structuredData: true});
      return res.status(500).json({ message: "Error de configuración del servidor (API Key no encontrada)." });
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${apiKey}&language=es`;
    
    logger.info("reverseGeocode: Fetching Google Geocoding API", {url: url.replace(apiKey, "REDACTED_API_KEY"), structuredData: true});

    try {
      const geocodeResponse = await fetch(url);
      const geocodeData = await geocodeResponse.json();

      if (geocodeData.status === "OK" && geocodeData.results && geocodeData.results.length > 0) {
        const firstResult = geocodeData.results[0];
        const formattedAddress = firstResult.formatted_address;
        
        let region = '';
        let city = '';
        let postalCode = '';

        firstResult.address_components.forEach(component => {
            if (component.types.includes('administrative_area_level_2') && !region) {
                region = component.long_name;
            }
            if (component.types.includes('administrative_area_level_1') && !region) {
                region = component.long_name;
            }
            if (component.types.includes('locality')) {
                city = component.long_name;
            }
            if (component.types.includes('postal_code')) {
                postalCode = component.long_name;
            }
        });

        res.status(200).json({ 
            address: formattedAddress,
            region: region,
            city: city,
            postalCode: postalCode
        });
      } else if (geocodeData.status === "ZERO_RESULTS") {
        logger.warn("reverseGeocode: Google Geocoding API devolvió ZERO_RESULTS para:", {lat, lon, structuredData: true} );
        res.status(404).json({ message: "No se encontró dirección para las coordenadas proporcionadas." });
      } else {
        logger.error("reverseGeocode: Error desde Google Geocoding API", {status: geocodeData.status, error_message: geocodeData.error_message, structuredData: true});
        res.status(500).json({ message: `Error de la API de Geocodificación de Google: ${geocodeData.status}`, details: geocodeData.error_message });
      }
    } catch (error) {
      logger.error("reverseGeocode: Error al contactar Google Geocoding API", error, {structuredData: true});
      res.status(500).json({ message: "Error interno al obtener la dirección.", error: error.message });
    }
  });
});

// ===================================================================
// === NUEVAS FUNCIONES PARA CONTADORES Y DATOS AGREGADOS          ===
// ===================================================================

/**
 * Trigger que se dispara cuando una reseña es creada o eliminada.
 * Actualiza los contadores de reseñas en los documentos de usuario, lugar y lista.
 */
exports.updateAggregatesOnReviewChange = onDocumentWritten("lists/{listId}/reviews/{reviewId}", async (event) => {
  // Si es una actualización de la reseña, no afecta a los contadores. Salimos para no hacer trabajo innecesario.
  if (event.data.before.exists && event.data.after.exists) {
      logger.info(`Reseña ${event.params.reviewId} actualizada. No se modifican contadores.`);
      return null;
  }

  // Determina si es una creación (+1) o una eliminación (-1)
  const change = event.data.after.exists ? 1 : -1;
  const listId = event.params.listId;
  // Obtenemos los datos del documento que existía (antes del borrado) o que se acaba de crear (después de la creación)
  const data = change === 1 ? event.data.after.data() : event.data.before.data();
  
  const {userId, placeId} = data;
  
  // Comprobación de seguridad: si no hay userId, no podemos actualizar su contador.
  if (!userId) {
      logger.warn(`La reseña ${event.params.reviewId} no tiene userId. No se puede actualizar contador de usuario.`);
      return null;
  }

  const batch = db.batch();

  // 1. Actualizar contador de la LISTA
  const listRef = db.collection('lists').doc(listId);
  batch.update(listRef, { reviewCount: FieldValue.increment(change) });
  logger.info(`Programando actualización de 'reviewCount' en lista ${listId} en ${change}.`);

  // 2. Actualizar contador de reseñas del USUARIO
  const userRef = db.collection('users').doc(userId);
  batch.update(userRef, { reviewsCount: FieldValue.increment(change) });
  logger.info(`Programando actualización de 'reviewsCount' en usuario ${userId} en ${change}.`);

  // 3. Actualizar contador de reseñas del LUGAR (solo si la reseña tiene un placeId asociado)
  if (placeId) {
      const placeRef = db.collection('places').doc(placeId);
      batch.update(placeRef, { reviewsCount: FieldValue.increment(change) });
      logger.info(`Programando actualización de 'reviewsCount' en lugar ${placeId} en ${change}.`);
  }
  
  // Ejecutar todas las actualizaciones en un solo lote atómico.
  try {
      await batch.commit();
      logger.info("Lote de actualización de contadores de reseña completado exitosamente.");
  } catch (error) {
      logger.error("Error al ejecutar el lote de actualización de contadores de reseña:", error);
  }
});


/**
* Trigger que se dispara cuando una lista es creada, actualizada o eliminada.
* Actualiza los contadores de listas públicas y privadas en el documento del usuario.
*/
exports.updateUserStatsOnListChange = onDocumentWritten("lists/{listId}", async (event) => {
  let userRef;
  let updates = {};

  // Caso 1: Se crea una lista NUEVA
  if (!event.data.before.exists && event.data.after.exists) {
      const listData = event.data.after.data();
      if (!listData.userId) return null; // Lista "huérfana", no hacer nada
      userRef = db.collection('users').doc(listData.userId);
      const fieldToIncrement = listData.isPublic ? 'publicListsCount' : 'privateListsCount';
      updates[fieldToIncrement] = FieldValue.increment(1);
      logger.info(`Nueva lista creada por ${listData.userId}. Incrementando ${fieldToIncrement}.`);
  }
  // Caso 2: Se elimina una lista
  else if (event.data.before.exists && !event.data.after.exists) {
      const listData = event.data.before.data();
      if (!listData.userId) return null; // Lista "huérfana" eliminada, no hay usuario que actualizar
      userRef = db.collection('users').doc(listData.userId);
      const fieldToDecrement = listData.isPublic ? 'publicListsCount' : 'privateListsCount';
      updates[fieldToDecrement] = FieldValue.increment(-1);
      logger.info(`Lista eliminada por ${listData.userId}. Decrementando ${fieldToDecrement}.`);
  }
  // Caso 3: Se actualiza una lista (nos interesa si cambia la privacidad o el dueño)
  else if (event.data.before.exists && event.data.after.exists) {
      const beforeData = event.data.before.data();
      const afterData = event.data.after.data();
      
      // Cambio de propietario (cuando una lista se "orfana")
      if (beforeData.userId && !afterData.userId) {
          userRef = db.collection('users').doc(beforeData.userId);
          const fieldToDecrement = beforeData.isPublic ? 'publicListsCount' : 'privateListsCount';
          updates[fieldToDecrement] = FieldValue.increment(-1);
          logger.info(`Lista desvinculada del usuario ${beforeData.userId}. Decrementando contadores.`);
      }
      // Cambio de privacidad
      else if (beforeData.isPublic !== afterData.isPublic) {
          if(!afterData.userId) return null;
          userRef = db.collection('users').doc(afterData.userId);
          const oldField = beforeData.isPublic ? 'publicListsCount' : 'privateListsCount';
          const newField = afterData.isPublic ? 'publicListsCount' : 'privateListsCount';
          updates[oldField] = FieldValue.increment(-1);
          updates[newField] = FieldValue.increment(1);
          logger.info(`Visibilidad de lista cambiada por ${afterData.userId}. Actualizando contadores.`);
      } else {
          return null; // No hay cambio relevante, no hacemos nada
      }
  }

  if (userRef && Object.keys(updates).length > 0) {
      try {
          await userRef.update(updates);
          logger.info("Contadores de listas del usuario actualizados correctamente.");
      } catch(error) {
          logger.error("Error actualizando contadores de listas del usuario:", error);
      }
  }
});


/**
* Trigger que se dispara cuando un comentario es creado o eliminado.
* Actualiza el contador de comentarios en el documento de la lista y del usuario.
* (Asume que los comentarios están en lists/{listId}/comments/{commentId})
*/
exports.updateAggregatesOnCommentChange = onDocumentWritten("lists/{listId}/comments/{commentId}", async (event) => {
  if (event.data.before.exists && event.data.after.exists) {
      return null;
  }

  const change = event.data.after.exists ? 1 : -1;
  const listId = event.params.listId;
  const data = change === 1 ? event.data.after.data() : event.data.before.data();
  const userId = data.userId;

  const batch = db.batch();

  // Actualizar contador de la LISTA
  const listRef = db.collection('lists').doc(listId);
  batch.update(listRef, { commentsCount: FieldValue.increment(change) });
  logger.info(`Contador 'commentsCount' en lista ${listId} se actualizará en ${change}.`);
  
  // Actualizar contador del USUARIO (si tiene userId)
  if (userId) {
      const userRef = db.collection('users').doc(userId);
      batch.update(userRef, { commentsCount: FieldValue.increment(change) });
      logger.info(`Contador 'commentsCount' en usuario ${userId} se actualizará en ${change}.`);
  }
  
  try {
      await batch.commit();
      logger.info("Contadores de comentarios actualizados.");
  } catch(error) {
      logger.error("Error actualizando contadores de comentarios:", error);
  }
});


exports.toggleFollowUser = onCall(async (request) => {
    const contextAuth = request.auth;
    if (!contextAuth) {
        throw new HttpsError('unauthenticated', 'Debes estar autenticado para seguir a otros usuarios.');
    }

    const currentUserId = contextAuth.uid;
    const userIdToFollow = request.data.userIdToFollow;

    if (!userIdToFollow) {
        throw new HttpsError('invalid-argument', 'Se requiere el ID del usuario a seguir (userIdToFollow).');
    }

    if (currentUserId === userIdToFollow) {
        throw new HttpsError('invalid-argument', 'No te puedes seguir a ti mismo, genio.');
    }

    const currentUserRef = db.collection('users').doc(currentUserId);
    const userToFollowRef = db.collection('users').doc(userIdToFollow);
    const followingRef = currentUserRef.collection('following').doc(userIdToFollow);
    const followerRef = userToFollowRef.collection('followers').doc(currentUserId);

    try {
        const doc = await followingRef.get();
        const batch = db.batch();

        if (doc.exists) {
            // --- Lógica para DEJAR DE SEGUIR ---
            batch.delete(followingRef);
            batch.delete(followerRef);
            batch.update(currentUserRef, { followingCount: FieldValue.increment(-1) });
            batch.update(userToFollowRef, { followersCount: FieldValue.increment(-1) });
            
            await batch.commit();
            logger.info(`Usuario ${currentUserId} ha dejado de seguir a ${userIdToFollow}.`);
            return { status: 'unfollowed', message: 'Has dejado de seguir a este usuario.' };
        } else {
            // --- Lógica para SEGUIR ---
            batch.set(followingRef, { followedAt: FieldValue.serverTimestamp() });
            batch.set(followerRef, { followedAt: FieldValue.serverTimestamp() });
            batch.update(currentUserRef, { followingCount: FieldValue.increment(1) });
            batch.update(userToFollowRef, { followersCount: FieldValue.increment(1) });

            await batch.commit();
            logger.info(`Usuario ${currentUserId} ahora sigue a ${userIdToFollow}.`);
            return { status: 'followed', message: 'Ahora sigues a este usuario.' };
        }
    } catch (error) {
        logger.error(`Error en toggleFollowUser para ${currentUserId} -> ${userIdToFollow}:`, error);
        throw new HttpsError('internal', 'Ocurrió un error al procesar la solicitud.');
    }
});

// En functions/index.js, reemplaza la función getPlacesForList entera por esta:

exports.getPlacesForList = onCall({cors: true}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado.');
    }
    const listId = request.data.listId;
    if (!listId) {
        throw new HttpsError('invalid-argument', 'Se requiere el ID de la lista.');
    }

    try {
        const reviewsSnapshot = await db.collection('lists').doc(listId).collection('reviews').get();
        if (reviewsSnapshot.empty) {
            return { places: [] };
        }

        // Agrupamos reseñas por placeId para calcular la media
        const placesAggregates = {};

        reviewsSnapshot.forEach(doc => {
            const review = doc.data();
            if (review.placeId) {
                if (!placesAggregates[review.placeId]) {
                    placesAggregates[review.placeId] = {
                        totalScore: 0,
                        count: 0,
                        placeId: review.placeId
                    };
                }
                placesAggregates[review.placeId].totalScore += review.overallRating || 0;
                placesAggregates[review.placeId].count++;
            }
        });

        const placeIds = Object.keys(placesAggregates);
        if (placeIds.length === 0) {
            return { places: [] };
        }

        const placeDocs = await db.collection('places').where(admin.firestore.FieldPath.documentId(), 'in', placeIds).get();

        const placesForMap = [];
        placeDocs.forEach(doc => {
            const place = doc.data();
            const aggregate = placesAggregates[doc.id];
            
            if (place.location && place.location.latitude && place.location.longitude) {
                placesForMap.push({
                    id: doc.id,
                    name: place.name,
                    location: place.location,
                    mainImageUrl: place.mainImageUrl || null,
                    // ¡AÑADIMOS LA PUNTUACIÓN MEDIA!
                    avgGeneralScore: (aggregate.totalScore / aggregate.count)
                });
            }
        });

        return { places: placesForMap };

    } catch (error) {
        logger.error(`Error en getPlacesForList para lista ${listId}:`, error);
        throw new HttpsError('internal', 'No se pudieron obtener los lugares para el mapa.');
    }
});