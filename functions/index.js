// functions/index.js (Sintaxis para firebase-functions v5.x.x / v6.x.x y Cloud Functions 2ª Gen)
const {onRequest} = require("firebase-functions/v2/https");
const {setGlobalOptions} = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const cors = require("cors")({origin: true}); // Habilita CORS para todos los orígenes
const fetch = require("node-fetch"); // Para v2 de node-fetch (CommonJS)

// Inicializar Firebase Admin SDK solo una vez
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

// Establecer la región globalmente para todas las funciones v2 en este archivo
setGlobalOptions({ region: "europe-west1" }); // Asegúrate que esta es tu región

exports.groupedReviews = onRequest(
  {
    // Opciones específicas de la función si son necesarias, ej:
    // memory: "256MiB", timeoutSeconds: 60
  },
  async (req, res) => {
    // Usa el middleware de CORS para manejar la solicitud
    cors(req, res, async () => {
        const listId = req.query.listId;

        if (!listId) {
            logger.warn("groupedReviews: listId no proporcionado.", {structuredData: true});
            // Asegúrate de que la respuesta de error también sea manejada por CORS si es necesario,
            // aunque el envoltorio principal de cors() debería cubrir esto.
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
                        reviewIds: [] 
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
                groupedReviews: groupedReviewsArray 
            };
            
            logger.info(`groupedReviews: Respuesta enviada para listId: ${listId} con ${groupedReviewsArray.length} grupos.`, {structuredData: true});
            res.status(200).json(responsePayload);

        } catch (error) {
            logger.error(`Error en Cloud Function groupedReviews para listId: ${listId}`, error, {structuredData: true});
            res.status(500).send({ error: "Error interno del servidor al obtener reseñas agrupadas.", details: error.message });
        }
    }); // Cierre del manejador cors
  }
);

// NUEVA FUNCIÓN: placesNearbyRestaurants
exports.placesNearbyRestaurants = onRequest(async (req, res) => {
  cors(req, res, async () => {
    const { latitude, longitude, keywords } = req.query;
    // Acceder a la clave de API desde las variables de entorno configuradas en Firebase/Google Cloud
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;

    if (!latitude || !longitude) {
      logger.warn("placesNearbyRestaurants: Latitud y longitud son requeridas.", {query: req.query});
      return res.status(400).json({ message: "Latitud y longitud son requeridas." });
    }
    if (!apiKey) {
      logger.error("placesNearbyRestaurants: GOOGLE_PLACES_API_KEY no está disponible como variable de entorno del proceso.", {env_keys: Object.keys(process.env)});
      return res.status(500).json({ message: "Error de configuración del servidor (Places API Key no encontrada)." });
    }

    const radius = 2000; // Radio en metros (ajusta según necesidad)
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

// NUEVA FUNCIÓN: placesTextSearch
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

    let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}&language=es&type=establishment`; // 'establishment' es más general

    if (latitude && longitude) {
      url += `&location=${latitude},${longitude}&radius=20000`; // Radio más grande para búsquedas por texto
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