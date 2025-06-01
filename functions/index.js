// functions/index.js (Para firebase-functions v5.x.x y v6.x.x)
const {onRequest} = require("firebase-functions/v2/https");
const {setGlobalOptions} = require("firebase-functions/v2"); // Para opciones globales
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const cors = require("cors")({origin: true});

// Inicializar Firebase Admin SDK solo una vez
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

// Establecer opciones globales, como la región, para todas las funciones en este archivo
// (Si solo tienes una función, también puedes pasar las opciones directamente a onRequest)
setGlobalOptions({ region: "europe-west1" }); // Asegúrate que esta es tu región deseada

exports.groupedReviews = onRequest(
  // Si no usas setGlobalOptions, puedes poner las opciones aquí:
  // { region: "europe-west1", memory: "256MiB", timeoutSeconds: 60 },
  async (req, res) => { // El manejador de la solicitud
    // Usa el middleware de CORS
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
  } // Cierre del manejador de la solicitud
); // Cierre de onRequest