// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Permitir CORS para todas las funciones HTTP (ajusta para producción)
const cors = require("cors")({origin: true}); // Asegúrate de haber ejecutado npm install cors en la carpeta functions

exports.groupedReviews = functions.https.onRequest((req, res) => { // INICIO DE LA FUNCIÓN PRINCIPAL
    cors(req, res, async () => { // INICIO DE LA FUNCIÓN ASÍNCRONA DENTRO DE CORS
        const listId = req.query.listId;

        if (!listId) {
            res.status(400).send({ error: "listId es requerido." });
            return;
        }

        try { // INICIO DEL BLOQUE TRY
            const reviewsSnapshot = await db.collection("lists").doc(listId).collection("reviews").get();
            const reviews = [];
            reviewsSnapshot.forEach(doc => reviews.push({ id: doc.id, ...doc.data() }));

            const grouped = {};
            reviews.forEach(review => { // INICIO DEL BUCLE reviews.forEach
                // Usamos establishmentName e itemName como se discutió
                const key = `${review.establishmentName || "N/A"}-${review.itemName || ""}`;
                if (!grouped[key]) { // INICIO DEL IF !grouped[key]
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
                } // CIERRE DEL IF !grouped[key]
                grouped[key].itemCount++;
                grouped[key].totalGeneralScore += review.overallRating || 0;
                if (review.photoUrl && !grouped[key].thumbnailUrl) {
                    grouped[key].thumbnailUrl = review.photoUrl;
                }
                if (review.userTags && Array.isArray(review.userTags)) { // INICIO DEL IF review.userTags
                    review.userTags.forEach(tag => grouped[key].groupTags.add(tag));
                } // CIERRE DEL IF review.userTags
                grouped[key].reviewIds.push(review.id);
            }); // CIERRE DEL BUCLE reviews.forEach

            const groupedReviewsArray = Object.values(grouped).map(group => { // INICIO DEL MAP
                group.avgGeneralScore = group.itemCount > 0 ? parseFloat((group.totalGeneralScore / group.itemCount).toFixed(1)) : 0;
                group.groupTags = Array.from(group.groupTags);
                delete group.totalGeneralScore;
                return group;
            }); // CIERRE DEL MAP
            
            groupedReviewsArray.sort((a, b) => (b.avgGeneralScore || 0) - (a.avgGeneralScore || 0));

            const listDoc = await db.collection("lists").doc(listId).get();
            const listData = listDoc.exists ? listDoc.data() : {};

            res.status(200).json({ 
                listName: listData.name || "Lista Desconocida",
                criteria: listData.criteriaDefinition || {},
                tags: listData.availableTags || [],
                groupedReviews: groupedReviewsArray 
            });

        } catch (error) { // INICIO DEL BLOQUE CATCH
            console.error("Error en Cloud Function groupedReviews:", error);
            res.status(500).send({ error: "Error interno del servidor al obtener reseñas agrupadas." });
        } // CIERRE DEL BLOQUE CATCH
    }); // CIERRE DE LA FUNCIÓN ASÍNCRONA DENTRO DE CORS
}); // CIERRE DE LA FUNCIÓN PRINCIPAL exports.groupedReviews