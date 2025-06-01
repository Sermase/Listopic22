const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Permitir CORS para todas las funciones HTTP (ajusta para producción)
const cors = require("cors")({origin: true});

exports.groupedReviews = functions.https.onRequest((req, res) => {
    cors(req, res, async () => { // Envolver en 'cors'
        const listId = req.query.listId;

        if (!listId) {
            res.status(400).send({ error: "listId es requerido." });
            return;
        }

        try {
            const reviewsSnapshot = await db.collection("lists").doc(listId).collection("reviews").get();
            const reviews = [];
            reviewsSnapshot.forEach(doc => reviews.push({ id: doc.id, ...doc.data() }));

            const grouped = {};
            reviews.forEach(review => {
                // Usamos establishmentName e itemName como se discutió
                const key = `<span class="math-inline">\{review\.establishmentName \|\| "N/A"\}\-</span>{review.itemName || ""}`;
                if (!grouped[key]) {
                    grouped[key] = {
                        establishmentName: review.establishmentName,
                        itemName: review.itemName,
                        itemCount: 0,
                        totalGeneralScore: 0,
                        avgGeneralScore: 0,
                        thumbnailUrl: null,
                        groupTags: new Set(),
                        // Incluye listId y los IDs de las reseñas si el frontend los necesita para la navegación
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

            // Para que page-list-view.js reciba el nombre de la lista y tags disponibles,
            // también podrías obtenerlos aquí y añadirlos a la respuesta.
            const listDoc = await db.collection("lists").doc(listId).get();
            const listData = listDoc.exists ? listDoc.data() : {};

            res.status(200).json({ 
                listName: listData.name || "Lista Desconocida",
                criteria: listData.criteriaDefinition || {}, // page-list-view.js puede necesitar esto
                tags: listData.availableTags || [],       // page-list-view.js puede necesitar esto
                groupedReviews: groupedReviewsArray 
            });

        } catch (error) {
            console.error("Error en Cloud Function groupedReviews:", error);
            res.status(500).send({ error: "Error interno del servidor al obtener reseñas agrupadas." });
        }
    });
});

// Aquí también irían tus futuras Cloud Functions para el proxy de Google Places,
// para eliminar listas y sus subcolecciones, etc.
```