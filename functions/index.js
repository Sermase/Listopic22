const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({origin: true}); // Asegúrate de haber ejecutado: npm install cors

// Inicializar Firebase Admin SDK solo una vez
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

exports.groupedReviews = functions
    .region('europe-west1') // Especifica tu región aquí
    .https.onRequest((req, res) => {
    
    cors(req, res, async () => {
        const listId = req.query.listId;

        if (!listId) {
            functions.logger.warn("groupedReviews: listId no proporcionado.");
            res.status(400).send({ error: "listId es requerido." });
            return;
        }

        functions.logger.info(`groupedReviews: Procesando para listId: ${listId}`);

        try {
            const listDocRef = db.collection("lists").doc(listId);
            const reviewsSnapshot = await listDocRef.collection("reviews").get();
            
            const reviews = [];
            reviewsSnapshot.forEach(doc => reviews.push({ id: doc.id, ...doc.data() }));
            functions.logger.info(`groupedReviews: Encontradas ${reviews.length} reseñas para listId: ${listId}`);

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
            functions.logger.info(`groupedReviews: Datos de lista obtenidos para listId: ${listId}, Nombre: ${listData.name}`);

            const responsePayload = { 
                listName: listData.name || "Lista Desconocida",
                criteria: listData.criteriaDefinition || {},
                tags: listData.availableTags || [],
                groupedReviews: groupedReviewsArray 
            };
            
            functions.logger.info(`groupedReviews: Respuesta enviada para listId: ${listId} con ${groupedReviewsArray.length} grupos.`);
            res.status(200).json(responsePayload);

        } catch (error) {
            functions.logger.error(`Error en Cloud Function groupedReviews para listId: ${listId}`, error);
            res.status(500).send({ error: "Error interno del servidor al obtener reseñas agrupadas.", details: error.message });
        }
    });
});

// Puedes añadir otras funciones aquí si es necesario
// exports.otraFuncion = functions.region('europe-west1').https.onRequest(...);