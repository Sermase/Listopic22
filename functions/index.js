// functions/index.js
const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https"); // Añadido onCall y HttpsError
const {setGlobalOptions} = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const cors = require("cors")({origin: true});
const fetch = require("node-fetch"); // Para v2 de node-fetch (CommonJS)

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

setGlobalOptions({ region: "europe-west1" });

// --- FUNCIÓN groupedReviews ---
exports.groupedReviews = onRequest(
  // Opciones (si no usas setGlobalOptions o quieres sobrescribir para esta función)
  // { region: "europe-west1" },
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
            reviewsSnapshot.forEach(doc => reviews.push({ id: doc.id, ...doc.data() }));
            logger.info(`groupedReviews: Encontradas ${reviews.length} reseñas para listId: ${listId}`, {structuredData: true});

            const grouped = {};
            reviews.forEach(review => {
                const key = `${review.establishmentName || "N/A"}-${review.itemName || ""}`;
                if (!grouped[key]) {
                    grouped[key] = {
                        establishmentName: review.establishmentName,
                        itemName: review.itemName,
                        itemCount: 0,
                        totalGeneralScore: 0,
                        avgGeneralScore: 0,
                        thumbnailUrl: null,
                        groupTags: new Set(),
                        listId: listId,
                        reviewIds: [],
                    };
                }
                grouped[key].itemCount++;
                grouped[key].totalGeneralScore += review.overallRating || 0;
                if (review.photoUrl && !grouped[key].thumbnailUrl) {
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
                groupedReviews: groupedReviewsArray,
            };
            logger.info(`groupedReviews: Respuesta enviada para listId: ${listId} con ${groupedReviewsArray.length} grupos.`, {structuredData: true});
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
      logger.warn("placesNearbyRestaurants: Latitud y longitud son requeridas.", {query: req.query});
      return res.status(400).json({ message: "Latitud y longitud son requeridas." });
    }
    if (!apiKey) {
      logger.error("placesNearbyRestaurants: GOOGLE_PLACES_API_KEY no está disponible como variable de entorno del proceso.", {env_keys: Object.keys(process.env)});
      return res.status(500).json({ message: "Error de configuración del servidor (Places API Key no encontrada)." });
    }
    const radius = 2000;
    const types = "restaurant|cafe|bar|bakery|meal_takeaway|food|point_of_interest";
    let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=${radius}&type=${encodeURIComponent(types)}&key=${apiKey}&language=es`;
    if (keywords && keywords.trim() !== "") {
      url += `&keyword=${encodeURIComponent(keywords.trim())}`;
    }
    logger.info("placesNearbyRestaurants: Fetching Google Places", {url: url.replace(apiKey, "REDACTED_API_KEY")});
    try {
      const placesResponse = await fetch(url);
      const placesData = await placesResponse.json();
      if (placesData.status === "OK" || placesData.status === "ZERO_RESULTS") {
        res.status(200).json(placesData.results || []);
      } else {
        logger.error("placesNearbyRestaurants: Error desde Google Places API", {status: placesData.status, error_message: placesData.error_message, info_messages: placesData.info_messages});
        res.status(500).json({ message: `Error de la API de Google Places: ${placesData.status}`, details: placesData.error_message || placesData.info_messages });
      }
    } catch (error) {
      logger.error("placesNearbyRestaurants: Error al contactar Google Places API", error);
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
      logger.warn("placesTextSearch: El término de búsqueda (query) es requerido.", {query: req.query});
      return res.status(400).json({ message: "El término de búsqueda (query) es requerido." });
    }
    if (!apiKey) {
        logger.error("placesTextSearch: GOOGLE_PLACES_API_KEY no está disponible como variable de entorno del proceso.", {env_keys: Object.keys(process.env)});
        return res.status(500).json({ message: "Error de configuración del servidor (Places API Key no encontrada)." });
    }
    let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}&language=es&type=establishment`;
    if (latitude && longitude) {
      url += `&location=${latitude},${longitude}&radius=20000`;
    }
    logger.info("placesTextSearch: Fetching Google Places", {url: url.replace(apiKey, "REDACTED_API_KEY")});
    try {
      const placesResponse = await fetch(url);
      const placesData = await placesResponse.json();
      if (placesData.status === "OK" || placesData.status === "ZERO_RESULTS") {
        res.status(200).json(placesData.results || []);
      } else {
        logger.error("placesTextSearch: Error desde Google Places API", {status: placesData.status, error_message: placesData.error_message, info_messages: placesData.info_messages});
        res.status(500).json({ message: `Error de la API de Google Places: ${placesData.status}`, details: placesData.error_message || placesData.info_messages });
      }
    } catch (error) {
      logger.error("placesTextSearch: Error al contactar Google Places API", error);
      res.status(500).json({ message: "Error interno al buscar lugares por texto.", error: error.message });
    }
  });
});

// --- NUEVA FUNCIÓN CALLABLE: deleteListAndAssociatedReviews ---
exports.deleteListAndAssociatedReviews = onCall( // Usando onCall para funciones Callable
  // Puedes añadir opciones aquí si son específicas para esta función, ej: { region: 'europe-west1' }
  // si no usaste setGlobalOptions o quieres sobrescribir la región.
  async (data, context) => {
    // 1. Verificar autenticación del usuario
    if (!context.auth) {
        logger.warn("deleteListAndAssociatedReviews: Intento de llamada no autenticado.");
        throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado para eliminar una lista.');
    }
    
    const callerUserId = context.auth.uid;
    const listId = data.listId;

    if (!listId) {
        logger.warn(`deleteListAndAssociatedReviews: listId no proporcionado por el usuario ${callerUserId}.`);
        throw new HttpsError('invalid-argument', 'Se requiere el ID de la lista (listId).');
    }

    logger.info(`deleteListAndAssociatedReviews: Usuario ${callerUserId} intentando eliminar lista ${listId}`);
    const listRef = db.collection('lists').doc(listId);

    try {
        // 2. Verificar propiedad de la lista
        const listDoc = await listRef.get();
        if (!listDoc.exists) {
            logger.warn(`deleteListAndAssociatedReviews: Lista ${listId} no encontrada para el usuario ${callerUserId}.`);
            throw new HttpsError('not-found', 'La lista no existe.');
        }

        const listData = listDoc.data();
        if (listData.userId !== callerUserId) {
            logger.error(`deleteListAndAssociatedReviews: Usuario ${callerUserId} no es propietario de la lista ${listId} (propietario: ${listData.userId}).`);
            throw new HttpsError('permission-denied', 'No tienes permiso para eliminar esta lista.');
        }

        // 3. NUEVA LÓGICA: Verificar si hay reseñas de otros usuarios si la lista es pública
        if (listData.isPublic === true) { // Solo aplicar esta lógica si la lista es pública
            const reviewsRef = listRef.collection('reviews');
            const otherUserReviewsSnapshot = await reviewsRef.where('userId', '!=', callerUserId).limit(1).get();

            if (!otherUserReviewsSnapshot.empty) {
                logger.warn(`deleteListAndAssociatedReviews: Intento de borrado de lista pública ${listId} por ${callerUserId} fallido: contiene reseñas de otros usuarios.`);
                throw new HttpsError('failed-precondition', 'No se puede eliminar la lista porque es pública y contiene reseñas de otros usuarios.');
            }
        }
        
        // 4. Si llegamos aquí, se puede borrar. Eliminar todas las reseñas de la subcolección.
        const allReviewsSnapshot = await listRef.collection('reviews').get();
        if (!allReviewsSnapshot.empty) {
            const batch = db.batch();
            allReviewsSnapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            logger.info(`deleteListAndAssociatedReviews: Eliminadas ${allReviewsSnapshot.size} reseñas de la lista ${listId}`);
        }

        // 5. Eliminar el documento de la lista
        await listRef.delete();
        logger.info(`deleteListAndAssociatedReviews: Lista ${listId} eliminada exitosamente por el usuario ${callerUserId}`);
        
        return { success: true, message: 'Lista y sus reseñas eliminadas correctamente.' };

    } catch (error) {
        logger.error(`Error al eliminar la lista ${listId} para el usuario ${callerUserId}:`, error);
        if (error.code && error.message) { // Si ya es un HttpsError
             throw error;
        }
        // Para otros errores, envolverlos en un HttpsError genérico
        throw new HttpsError('internal', 'Ocurrió un error al eliminar la lista.', error.message);
    }
});