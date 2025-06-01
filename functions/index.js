// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({origin: true}); // Importa y configura cors para permitir todas las peticiones (para desarrollo)

// admin.initializeApp() debería estar aquí si no lo has inicializado en otro lugar globalmente en este archivo.
// Si ya está inicializado arriba, no lo repitas.
if (admin.apps.length === 0) { // Evita re-inicializar la app
  admin.initializeApp();
}
const db = admin.firestore();

exports.groupedReviews = functions
    // Especifica la región si no es us-central1 o si quieres ser explícito.
    // Si tu función está en europe-west1 (como indica tu URL), debes especificarlo:
    .region('europe-west1') 
    .https.onRequest((req, res) => {
    // Usa el middleware de CORS. Esto manejará automáticamente las solicitudes OPTIONS (preflight)
    // y añadirá las cabeceras necesarias a tus respuestas.
    cors(req, res, async () => {
        const listId = req.query.listId;

        if (!listId) {
            res.status(400).send({ error: "listId es requerido." });
            return;
        }

        try {
            // ... (resto de tu lógica para obtener y agrupar reseñas) ...
            // Asegúrate de que toda tu lógica esté DENTRO de este callback de cors

            const reviewsSnapshot = await db.collection("lists").doc(listId).collection("reviews").get();
            const reviews = [];
            reviewsSnapshot.forEach(doc => reviews.push({ id: doc.id, ...doc.data() }));

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

            const listDoc = await db.collection("lists").doc(listId).get();
            const listData = listDoc.exists ? listDoc.data() : {};

            res.status(200).json({ 
                listName: listData.name || "Lista Desconocida",
                criteria: listData.criteriaDefinition || {},
                tags: listData.availableTags || [],
                groupedReviews: groupedReviewsArray 
            });

        } catch (error) {
            console.error("Error en Cloud Function groupedReviews:", error);
            // Es importante que incluso en caso de error, las cabeceras CORS se envíen si es posible,
            // aunque 'cors(req, res, () => {...})' debería manejar esto si el error ocurre dentro del callback.
            res.status(500).send({ error: "Error interno del servidor al obtener reseñas agrupadas." });
        }
    }); // Cierre del callback de cors
});