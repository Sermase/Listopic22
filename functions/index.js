// functions/index.js
const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const {setGlobalOptions} = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const cors = require("cors")({origin: true});
const fetch = require("node-fetch");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

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

// --- FUNCIÓN CALLABLE: deleteListAndAssociatedReviews ---
exports.deleteListAndAssociatedReviews = onCall(
  async (data, context) => {
    if (!context.auth) {
        logger.warn("deleteListAndAssociatedReviews: Intento de llamada no autenticado.", {structuredData: true});
        throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado para eliminar una lista.');
    }
    const callerUserId = context.auth.uid;
    const listId = data.listId;
    if (!listId) {
        logger.warn(`deleteListAndAssociatedReviews: listId no proporcionado por el usuario ${callerUserId}.`, {structuredData: true});
        throw new HttpsError('invalid-argument', 'Se requiere el ID de la lista (listId).');
    }
    logger.info(`deleteListAndAssociatedReviews: Usuario ${callerUserId} intentando eliminar lista ${listId}`, {structuredData: true});
    const listRef = db.collection('lists').doc(listId);
    try {
        const listDoc = await listRef.get();
        if (!listDoc.exists) {
            logger.warn(`deleteListAndAssociatedReviews: Lista ${listId} no encontrada para el usuario ${callerUserId}.`, {structuredData: true});
            throw new HttpsError('not-found', 'La lista no existe.');
        }
        const listData = listDoc.data();
        if (listData.userId !== callerUserId) {
            logger.error(`deleteListAndAssociatedReviews: Usuario ${callerUserId} no es propietario de la lista ${listId} (propietario: ${listData.userId}).`, {structuredData: true});
            throw new HttpsError('permission-denied', 'No tienes permiso para eliminar esta lista.');
        }
        if (listData.isPublic === true) {
            const reviewsRef = listRef.collection('reviews');
            const otherUserReviewsSnapshot = await reviewsRef.where('userId', '!=', callerUserId).limit(1).get();
            if (!otherUserReviewsSnapshot.empty) {
                logger.warn(`deleteListAndAssociatedReviews: Intento de borrado de lista pública ${listId} por ${callerUserId} fallido: contiene reseñas de otros usuarios.`, {structuredData: true});
                throw new HttpsError('failed-precondition', 'No se puede eliminar la lista porque es pública y contiene reseñas de otros usuarios.');
            }
        }
        const allReviewsSnapshot = await listRef.collection('reviews').get();
        if (!allReviewsSnapshot.empty) {
            const batch = db.batch();
            allReviewsSnapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            logger.info(`deleteListAndAssociatedReviews: Eliminadas ${allReviewsSnapshot.size} reseñas de la lista ${listId}`, {structuredData: true});
        }
        await listRef.delete();
        logger.info(`deleteListAndAssociatedReviews: Lista ${listId} eliminada exitosamente por el usuario ${callerUserId}`, {structuredData: true});
        return { success: true, message: 'Lista y sus reseñas eliminadas correctamente.' };
    } catch (error) {
        logger.error(`Error al eliminar la lista ${listId} para el usuario ${callerUserId}:`, error, {structuredData: true});
        if (error.code && typeof error.code === 'string' && error.message ) { // Comprobar si es un HttpsError
             throw error;
        }
        throw new HttpsError('internal', 'Ocurrió un error al eliminar la lista.', error.message);
    }
});

// NUEVA FUNCIÓN: reverseGeocode
exports.reverseGeocode = onRequest(async (req, res) => {
  cors(req, res, async () => {
    const { lat, lon } = req.query;
    const apiKey = process.env.GOOGLE_PLACES_API_KEY; // Reutilizamos la misma clave de API

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
        
        // Extraer componentes específicos si se necesitan
        let region = '';
        let city = '';
        let postalCode = '';

        firstResult.address_components.forEach(component => {
            if (component.types.includes('administrative_area_level_2') && !region) { // Provincia
                region = component.long_name;
            }
            if (component.types.includes('administrative_area_level_1') && !region) { // Comunidad Autónoma / Estado más general
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
            region: region, // Para autocompletar el campo región si lo tienes
            city: city,
            postalCode: postalCode
            // puedes añadir más componentes si los necesitas
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