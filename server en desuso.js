// server.js - Backend con MongoDB y Mongoose (Estructura Correcta + Google Places API)

require('dotenv').config(); // Carga variables de entorno desde .env AL PRINCIPIO
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fetch = require('node-fetch');
const path = require('path');
const admin = require('firebase-admin');

const app = express();
const port = process.env.PORT || 3000;

// --- Middlewares ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.static(path.join(__dirname)));
app.use('/images', express.static(path.join(__dirname, 'images')));

try {
    const serviceAccount = require('./listopic-ser-firebase-adminsdk-key.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin SDK inicializado correctamente.");
} catch (error) {
    console.error("Error inicializando Firebase Admin SDK:", error.message);
}

// --- Mongoose Schemas and Models ---
const criterionSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    label_left: { type: String, trim: true },
    label_right: { type: String, trim: true },
    isWeighted: { type: Boolean, default: true }
}, { _id: false });

const listSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    criteria: [criterionSchema],
    tags: [{ type: String, trim: true }],
    userId: { type: String, required: true, index: true } // Added userId
});
const List = mongoose.model('List', listSchema);

const googlePlaceSchema = new mongoose.Schema({
    placeId: { type: String, trim: true, index: true },
    name: { type: String, trim: true },
    address: { type: String, trim: true },
    latitude: { type: Number },
    longitude: { type: Number }
}, { _id: false });

const reviewSchema = new mongoose.Schema({
    listId: { type: String, required: true, index: true },
    listName: { type: String, trim: true },
    restaurant: { type: String, required: true, trim: true },
    dish: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    ratings: { type: mongoose.Schema.Types.Mixed },
    location: {
        url: { type: String, trim: true },
        text: { type: String, trim: true }
    },
    googlePlaceInfo: googlePlaceSchema,
    comment: { type: String, trim: true },
    tags: [{ type: String, trim: true }],
    generalScore: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    userId: { type: String, required: true, index: true } // Added userId
});
const Review = mongoose.model('Review', reviewSchema);

// --- Helper Functions ---
async function calculateGeneralScore(listId, ratings) {
    if (!ratings || typeof ratings !== 'object' || Object.keys(ratings).length === 0) {
        return 0;
    }
    const list = await List.findById(listId).lean(); // Consider checking list ownership here if called from unprotected context
    if (!list || !list.criteria || list.criteria.length === 0) {
        return 0;
    }
    let totalScore = 0;
    let numWeightedRatings = 0;
    for (const ratingKey in ratings) {
        const criterionDef = list.criteria.find(c => c.title.toLowerCase().replace(/[^a-z0-9]/g, '') === ratingKey);
        if (criterionDef && criterionDef.isWeighted !== false) {
            totalScore += parseFloat(ratings[ratingKey]);
            numWeightedRatings++;
        }
    }
    return numWeightedRatings > 0 ? parseFloat((totalScore / numWeightedRatings).toFixed(2)) : 0;
}

// --- Middleware de Verificación de Token de Firebase ---
async function verifyFirebaseToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: "Acceso no autorizado. Token no proporcionado o mal formateado." });
    }
    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        console.log(`Token verificado para UID: ${req.user.uid}`);
        next();
    } catch (error) {
        console.error("Error verificando token de Firebase:", error.message);
        if (error.code === 'auth/id-token-expired') {
            return res.status(403).json({ message: "Token expirado. Por favor, inicia sesión de nuevo.", code: "TOKEN_EXPIRED" });
        }
        return res.status(403).json({ message: "Token inválido.", code: "TOKEN_INVALID" });
    }
}

// --- Rutas API ---
// -- LISTAS --
app.get('/api/lists', verifyFirebaseToken, async (req, res) => { // Protected route, filtered by userId
    console.log(`GET /api/lists for user ${req.user.uid}`);
    try {
        const lists = await List.find({ userId: req.user.uid }, '_id name'); // Filter by userId
        const listInfo = lists.map(l => ({ id: l._id.toString(), name: l.name }));
        res.json(listInfo);
    } catch (e){
        console.error("Error GET /api/lists:", e);
        res.status(500).json({ message: "Error al obtener listas", error: e.message });
    }
});

app.post('/api/lists', verifyFirebaseToken, async (req, res) => {
    console.log('POST /api/lists by user:', req.user.uid, req.body);
    try {
        const d = req.body;
        if (!d || !d.name || d.name.trim() === "") {
            return res.status(400).json({ message: "El nombre de la lista es obligatorio." });
        }
        const criteriaData = d.criteria || [];
        const criteria = criteriaData.filter(c => c && c.title && c.title.trim() !== "").map(crit => ({
            title: crit.title.trim(),
            label_left: (crit.label_left || '').trim(),
            label_right: (crit.label_right || '').trim(),
            isWeighted: typeof crit.isWeighted === 'boolean' ? crit.isWeighted : true
        }));
        const tags = Array.isArray(d.tags) ? d.tags.map(t => t.trim()).filter(t => t !== "") : [];
        const listToSave = new List({
            name: d.name.trim(),
            criteria: criteria,
            tags: tags,
            userId: req.user.uid // Populate userId
        });
        const savedList = await listToSave.save();
        console.log('Lista guardada en DB:', savedList);
        res.status(201).json({ ...savedList.toObject(), id: savedList._id.toString() });
    } catch (e){
        console.error("Error POST /api/lists:", e);
        if (e.name === 'ValidationError') return res.status(400).json({ message: "Error de validación", errors: e.errors });
        res.status(500).json({ message: "Error al crear la lista", error: e.message });
    }
});

app.put('/api/lists/:id', verifyFirebaseToken, async (req, res) => {
    const id = req.params.id;
    const d = req.body;
    console.log(`PUT /api/lists/${id} by user ${req.user.uid}:`, d);
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message:"ID de lista inválido"});
        if (!d || !d.name || d.name.trim() === "") return res.status(400).json({ message: "El nombre de la lista es obligatorio." });
        
        const list = await List.findById(id);
        if (!list) return res.status(404).json({ message: "Lista no encontrada" });
        if (list.userId !== req.user.uid) return res.status(403).json({ message: "Acceso denegado. No eres el propietario de esta lista." });

        const criteriaData = d.criteria || [];
        list.criteria = criteriaData.filter(c => c && c.title && c.title.trim() !== "").map(crit => ({
            title: crit.title.trim(),
            label_left: (crit.label_left || '').trim(),
            label_right: (crit.label_right || '').trim(),
            isWeighted: typeof crit.isWeighted === 'boolean' ? crit.isWeighted : true
        }));
        list.tags = Array.isArray(d.tags) ? d.tags.map(t => t.trim()).filter(t => t !== "") : [];
        list.name = d.name.trim();
        
        const updatedList = await list.save();
        console.log('Lista actualizada en DB:', updatedList);
        res.json({ ...updatedList.toObject(), id: updatedList._id.toString() });
    } catch (e){
        console.error(`Error PUT /api/lists/${id}:`, e);
        if (e.name === 'ValidationError') return res.status(400).json({ message: "Error de validación", errors: e.errors });
        res.status(500).json({ message: "Error al actualizar la lista", error: e.message });
    }
});

app.delete('/api/lists/:id', verifyFirebaseToken, async (req, res) => {
    const id = req.params.id;
    console.log(`DELETE /api/lists/${id} by user ${req.user.uid}`);
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message:"ID de lista inválido"});
        
        const list = await List.findById(id);
        if (!list) return res.status(404).json({ message: "Lista no encontrada" });
        if (list.userId !== req.user.uid) return res.status(403).json({ message: "Acceso denegado. No eres el propietario de esta lista." });

        await List.findByIdAndDelete(id);
        console.log('Lista eliminada de DB.');
        await Review.deleteMany({ listId: id.toString() }); // Also delete associated reviews
        console.log('Reseñas asociadas eliminadas.');
        res.status(204).send();
    } catch (e){
        console.error(`Error DELETE /api/lists/${id}:`, e);
        res.status(500).json({ message: "Error al eliminar la lista", error: e.message });
    }
});

app.get('/api/lists/:id', verifyFirebaseToken, async (req, res) => { // Protected route
    const listId = req.params.id;
    console.log(`GET /api/lists/${listId} for user ${req.user.uid}`);
    try {
        if (!mongoose.Types.ObjectId.isValid(listId)) return res.status(400).json({ message: "ID de lista inválido" });
        
        const list = await List.findById(listId);
        if (!list) return res.status(404).json({ message: "Lista no encontrada" });
        if (list.userId !== req.user.uid) return res.status(403).json({ message: "Acceso denegado. No eres el propietario de esta lista." });
        
        res.json({ id: list._id.toString(), name: list.name, criteria: list.criteria, tags: list.tags });
    } catch (error) {
        console.error(`Error GET /api/lists/${listId}:`, error);
        res.status(500).json({ message: "Error al obtener detalles de la lista", error: error.message });
    }
});

// -- RESEÑAS --
// This route's access is indirectly protected if /api/lists/:listId is protected.
// If a user can only get their own list IDs, they can only get reviews for their lists.
app.get('/api/lists/:listId/reviews', verifyFirebaseToken, async (req, res) => {
    const listId = req.params.listId;
    console.log(`GET /api/lists/${listId}/reviews by user ${req.user.uid}`);
    try {
        if (!mongoose.Types.ObjectId.isValid(listId)) return res.status(400).json({ message: "ID de lista inválido" });
        
        const list = await List.findById(listId).lean(); // Fetch to check ownership
        if (!list) return res.status(404).json({ message: "Lista no encontrada" });
        if (list.userId !== req.user.uid) return res.status(403).json({ message: "Acceso denegado a las reseñas de esta lista." });

        const reviews = await Review.find({ listId: listId.toString() }).sort({ createdAt: -1 });
        console.log(`Encontradas ${reviews.length} reseñas para la lista ${listId}`);
        res.json({
            listName: list.name,
            reviews: reviews.map(r => ({...r.toObject(), id: r._id.toString() }))
        });
    } catch(e){
        console.error(`Error GET /api/lists/${listId}/reviews:`, e);
        res.status(500).json({ message: "Error al obtener reseñas", error: e.message });
    }
});

app.get('/api/reviews/:id', verifyFirebaseToken, async (req, res) => { // Protected route
    const id = req.params.id;
    console.log(`GET /api/reviews/${id} by user ${req.user.uid}`);
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message:"ID de reseña inválido"});
        
        const review = await Review.findById(id);
        if (!review) return res.status(404).json({ message: "Reseña no encontrada" });
        if (review.userId !== req.user.uid) return res.status(403).json({ message: "Acceso denegado. No eres el propietario de esta reseña." });
        
        res.json({...review.toObject(), id: review._id.toString() });
    } catch(e){
        console.error(`Error GET /api/reviews/${id}:`, e);
        res.status(500).json({ message: "Error al obtener la reseña", error: e.message });
    }
});

app.post('/api/reviews', verifyFirebaseToken, async (req, res) => {
    console.log('POST /api/reviews by user:', req.user.uid, req.body.restaurant);
    try {
        const d = req.body;
        if (!d || !d.restaurant || d.restaurant.trim() === "" || !d.listId) {
            return res.status(400).json({ message: "Faltan datos obligatorios (restaurante/elemento o ID de lista)." });
        }
        
        const list = await List.findById(d.listId);
        if (!list) return res.status(404).json({ message: "La lista asociada no existe."});
        // Check if user owns the list they are adding a review to
        if (list.userId !== req.user.uid) return res.status(403).json({ message: "No puedes añadir reseñas a una lista que no te pertenece." });

        d.listName = list.name;
        d.generalScore = await calculateGeneralScore(d.listId, d.ratings);

        const newReview = new Review({
            ...d,
            userId: req.user.uid // Populate userId
        });
        const savedReview = await newReview.save();
        console.log('Reseña guardada en DB:', savedReview._id);
        res.status(201).json({...savedReview.toObject(), id: savedReview._id.toString() });
    } catch (e){
        console.error("Error POST /api/reviews:", e);
        if (e.name === 'ValidationError') return res.status(400).json({ message: "Error de validación", errors: e.errors });
        res.status(500).json({ message: "Error al crear la reseña", error: e.message });
    }
});

app.put('/api/reviews/:id', verifyFirebaseToken, async (req, res) => {
    const reviewIdToUpdate = req.params.id;
    const updatedData = req.body;
    console.log(`PUT /api/reviews/${reviewIdToUpdate} by user ${req.user.uid}`);
    try {
        if (!mongoose.Types.ObjectId.isValid(reviewIdToUpdate)) return res.status(400).json({ message:"ID de reseña inválido"});
        if (!updatedData || !updatedData.restaurant || updatedData.restaurant.trim() === "") return res.status(400).json({ message: "El nombre del restaurante/elemento es obligatorio." });

        const review = await Review.findById(reviewIdToUpdate);
        if (!review) return res.status(404).json({ message: "Reseña no encontrada" });
        if (review.userId !== req.user.uid) return res.status(403).json({ message: "Acceso denegado. No eres el propietario de esta reseña." });

        review.restaurant = updatedData.restaurant;
        review.dish = updatedData.dish;
        review.comment = updatedData.comment;
        review.ratings = updatedData.ratings;
        review.tags = updatedData.tags;
        review.location = updatedData.location;
        review.googlePlaceInfo = updatedData.googlePlaceInfo;
        if (updatedData.imageUrl !== undefined) review.imageUrl = updatedData.imageUrl;
        if (updatedData.ratings) {
            const listIdForScore = updatedData.listId || review.listId; // listId should not change for a review
            review.generalScore = await calculateGeneralScore(listIdForScore, updatedData.ratings);
        }
        
        const reviewAfterUpdate = await review.save();
        console.log('Reseña actualizada en DB:', reviewAfterUpdate._id);
        res.json({...reviewAfterUpdate.toObject(), id: reviewAfterUpdate._id.toString() });
    } catch (e){
        console.error(`Error PUT /api/reviews/${reviewIdToUpdate}:`, e);
        if (e.name === 'ValidationError') return res.status(400).json({ message: "Error de validación", errors: e.errors });
        res.status(500).json({ message: "Error al actualizar la reseña", error: e.message });
    }
});

app.delete('/api/reviews/:id', verifyFirebaseToken, async (req, res) => {
    const id = req.params.id;
    console.log(`DELETE /api/reviews/${id} by user ${req.user.uid}`);
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message:"ID de reseña inválido"});
        
        const review = await Review.findById(id);
        if (!review) return res.status(404).json({ message: "Reseña no encontrada" });
        if (review.userId !== req.user.uid) return res.status(403).json({ message: "Acceso denegado. No eres el propietario de esta reseña." });

        await Review.findByIdAndDelete(id);
        console.log('Reseña eliminada de DB.');
        res.status(204).send();
    } catch (e){
        console.error(`Error DELETE /api/reviews/${id}:`, e);
        res.status(500).json({ message: "Error al eliminar la reseña", error: e.message });
    }
});

app.get('/api/lists/:listId/grouped-reviews', verifyFirebaseToken, async (req, res) => {
    const { listId } = req.params;
    console.log(`GET /api/lists/${listId}/grouped-reviews by user ${req.user.uid}`);
    try {
        if (!mongoose.Types.ObjectId.isValid(listId)) return res.status(400).json({ message: "ID de lista inválido" });

        const list = await List.findById(listId).lean();
        if (!list) return res.status(404).json({ message: "Lista no encontrada" });
        if (list.userId !== req.user.uid) return res.status(403).json({ message: "Acceso denegado a esta lista." });
        
        const groupedReviews = await Review.aggregate([
            { $match: { listId: listId.toString() } }, // Already filtered by listId which is owned by user
            {
                $group: {
                    _id: { restaurant: "$restaurant", dish: { $ifNull: ["$dish", ""] } },
                    restaurantName: { $first: "$restaurant" },
                    dishName: { $first: { $ifNull: ["$dish", ""] } },
                    itemCount: { $sum: 1 },
                    avgGeneralScore: { $avg: "$generalScore" },
                    firstImageUrl: { $first: "$imageUrl" },
                    allImageUrls: { $push: "$imageUrl" },
                    allTagsInGroup: { $push: "$tags" },
                    reviewIds: { $push: "$_id" }
                }
            },
            {
                $project: {
                    _id: 0,
                    id: { $concat: ["$restaurantName", "-", { $toString: "$dishName" }] },
                    restaurant: "$restaurantName",
                    dish: "$dishName",
                    itemCount: "$itemCount",
                    avgGeneralScore: { $ifNull: [{ $round: ["$avgGeneralScore", 1] }, 0] },
                    thumbnailUrl: "$firstImageUrl",
                    allImageUrls: { $filter: { input: "$allImageUrls", as: "url", cond: { $ne: ["$$url", null] } } },
                    reviewIds: "$reviewIds",
                    listId: listId,
                    groupTags: {
                        $reduce: {
                            input: "$allTagsInGroup",
                            initialValue: [],
                            in: { $let: { vars: { currentTags: { $ifNull: ["$$this", []] } }, in: { $setUnion: ["$$value", "$$currentTags"] } } }
                        }
                    }
                }
            },
            { $sort: { avgGeneralScore: -1, restaurant: 1, dish: 1 } }
        ]);
        res.json({ listName: list.name, criteria: list.criteria, tags: list.tags, groupedReviews });
    } catch (error) {
        console.error(`Error GET /api/lists/${listId}/grouped-reviews:`, error);
        res.status(500).json({ message: "Error al obtener reseñas agrupadas", error: error.message });
    }
});

app.get('/api/lists/:listId/grouped-reviews/details', verifyFirebaseToken, async (req, res) => {
    const { listId } = req.params;
    const { restaurant, dish } = req.query;
    console.log(`GET /api/lists/${listId}/grouped-reviews/details by user ${req.user.uid}`);
    try {
        if (!mongoose.Types.ObjectId.isValid(listId)) return res.status(400).json({ message: "ID de lista inválido" });
        if (!restaurant) return res.status(400).json({ message: "El nombre del restaurante es requerido" });

        const list = await List.findById(listId).lean();
        if (!list) return res.status(404).json({ message: "Lista no encontrada" });
        if (list.userId !== req.user.uid) return res.status(403).json({ message: "Acceso denegado a los detalles de esta lista." });

        const matchQuery = { listId: listId.toString(), restaurant: restaurant };
        matchQuery.dish = (dish === undefined || dish === null || dish === "null" || dish === "undefined") ? "" : dish;
        
        const individualReviews = await Review.find(matchQuery).sort({ createdAt: -1 }).lean();
        if (individualReviews.length === 0) return res.status(404).json({ message: "No se encontraron reseñas para este grupo." });

        let totalGeneralScoreSum = 0;
        const allImageUrlsForGroup = [];
        individualReviews.forEach(r => {
            totalGeneralScoreSum += r.generalScore || 0;
            if (r.imageUrl) allImageUrlsForGroup.push(r.imageUrl);
        });
        const groupSummary = {
            restaurant: restaurant,
            dish: dish || "",
            itemCount: individualReviews.length,
            avgGeneralScore: individualReviews.length > 0 ? parseFloat((totalGeneralScoreSum / individualReviews.length).toFixed(1)) : 0,
            allImageUrls: [...new Set(allImageUrlsForGroup)],
            listName: list.name,
            criteria: list.criteria
        };
        res.json({ groupSummary, individualReviews: individualReviews.map(r => ({...r, id: r._id.toString()})) });
    } catch (error) {
        console.error(`Error GET /api/lists/${listId}/grouped-reviews/details:`, error);
        res.status(500).json({ message: "Error al obtener detalles del grupo de reseñas", error: error.message });
    }
});

// --- GOOGLE PLACES API ENDPOINTS (remain public as they don't expose user data) ---
app.get('/api/places/nearby-restaurants', async (req, res) => { /* ... existing code ... */ });
app.get('/api/places/text-search', async (req, res) => { /* ... existing code ... */ });


// --- Conexión a MongoDB e inicio del servidor ---
const dbUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/listopicAppDb';
async function startServerAndConnectDB() {
    try {
        console.log('Intentando conectar a MongoDB...');
        await mongoose.connect(dbUrl);
    } catch (error) {
        console.error('** Error CRÍTICO inicial conectando a MongoDB - Servidor NO iniciado **:', error);
        process.exit(1);
    }
}
const dbConnection = mongoose.connection;
dbConnection.on('error', (error) => console.error('-----> Error de conexión MongoDB:', error));
dbConnection.once('open', () => {
    console.log(`-----> MongoDB conectada exitosamente a ${dbUrl}`);
    app.listen(port, () => {
      console.log(`-----> Servidor Listopic escuchando en http://localhost:${port}`);
      console.log(`-----> Accede a la app en http://localhost:${port}/Index.html (o la página principal que uses)`);
    });
});
dbConnection.on('disconnected', () => console.log('-----> MongoDB desconectada.'));

startServerAndConnectDB();

module.exports = app; // Para posibles pruebas
// Ensure existing Google Places API endpoints are preserved
app.get('/api/places/nearby-restaurants', async (req, res) => {
    const { latitude, longitude, keywords } = req.query;
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;

    if (!latitude || !longitude) {
        return res.status(400).json({ message: "Latitud y longitud son requeridas." });
    }
    if (!apiKey) {
        console.error("GOOGLE_PLACES_API_KEY no está configurada en el servidor.");
        return res.status(500).json({ message: "Error de configuración del servidor (Places API)." });
    }

    const radius = 100; // Consider making radius configurable or larger if needed
    const expandedTypes = "restaurant|cafe|bar|bakery|meal_takeaway|meal_delivery|food|point_of_interest|establishment";
    let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=${radius}&type=${encodeURIComponent(expandedTypes)}&key=${apiKey}&language=es`;

    let effectiveKeywords = "";
    if (keywords && keywords.trim() !== "") {
        const baseKeywordsForHmm = "comida bebida"; // General terms to broaden search
        effectiveKeywords = `${keywords.trim()} ${baseKeywordsForHmm}`;
        effectiveKeywords = [...new Set(effectiveKeywords.split(' '))].join(' '); // Unique keywords
        url += `&keyword=${encodeURIComponent(effectiveKeywords)}`;
    }

    console.log(`Fetching Google Places (Nearby): lat=${latitude}, lon=${longitude}, radius=${radius}, types="${expandedTypes}", keywords="${effectiveKeywords || 'N/A'}"`);
    try {
        const placesResponse = await fetch(url);
        const placesData = await placesResponse.json();

        if (placesData.status === "OK") {
            res.json(placesData.results);
        } else if (placesData.status === "ZERO_RESULTS") {
            console.log(`Google Places API: ZERO_RESULTS para lat=${latitude}, lon=${longitude}, radius=${radius}, types="${expandedTypes}", keywords="${effectiveKeywords || 'N/A'}"`);
            res.json([]);
        }
        else {
            console.error("Error desde Google Places API (Nearby):", placesData.status, placesData.error_message, placesData.info_messages);
            res.status(500).json({ message: `Error de la API de Google Places: ${placesData.status}`, details: placesData.error_message || placesData.info_messages });
        }
    } catch (error) {
        console.error("Error al contactar Google Places API (Nearby):", error);
        res.status(500).json({ message: "Error interno al buscar lugares cercanos.", error: error.message });
    }
});

app.get('/api/places/text-search', async (req, res) => {
    const { query, latitude, longitude } = req.query;
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;

    if (!query) {
        return res.status(400).json({ message: "El término de búsqueda (query) es requerido." });
    }
    if (!apiKey) {
        console.error("GOOGLE_PLACES_API_KEY no está configurada en el servidor.");
        return res.status(500).json({ message: "Error de configuración del servidor (Places API)." });
    }

    let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}&language=es&type=restaurant`; // Added type=restaurant

    if (latitude && longitude) {
        url += `&location=${latitude},${longitude}&radius=10000`; // Consider adjusting radius
    }

    console.log(`Fetching Google Places (TextSearch): query=${query}, location=${latitude || 'N/A'},${longitude || 'N/A'}`);
    try {
        const placesResponse = await fetch(url);
        const placesData = await placesResponse.json();

        if (placesData.status === "OK") {
            res.json(placesData.results);
        } else {
            console.error("Error desde Google Places API (TextSearch):", placesData.status, placesData.error_message, placesData.info_messages);
            res.status(500).json({ message: `Error de la API de Google Places: ${placesData.status}`, details: placesData.error_message || placesData.info_messages });
        }
    } catch (error) {
        console.error("Error al contactar Google Places API (TextSearch):", error);
        res.status(500).json({ message: "Error interno al buscar lugares por texto.", error: error.message });
    }
});
