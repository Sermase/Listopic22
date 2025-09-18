// functions/modules/core.js

const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const cors = require("cors")({origin: true});
const fetch = require("node-fetch");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const db = getFirestore();


const groupedReviews = onRequest(
    async (req, res) => {
      cors(req, res, async () => {
          const listId = req.query.listId;
          if (!listId) {
              return res.status(400).send({ error: "listId es requerido." });
          }

          try {
              const listDocRef = db.collection("lists").doc(listId);
              const reviewsSnapshot = await listDocRef.collection("reviews").get();
              
              const reviews = [];
              reviewsSnapshot.forEach(doc => reviews.push({ id: doc.id, ...doc.data() }));

              if (reviews.length === 0) {
                  // Manejar lista vacía (tu código para esto está bien)
                  const listDocEmpty = await listDocRef.get();
                  const listDataEmpty = listDocEmpty.exists ? listDocEmpty.data() : {};
                  return res.status(200).json({ 
                      listName: listDataEmpty.name || "Lista Desconocida",
                      criteria: listDataEmpty.criteriaDefinition || {},
                      tags: listDataEmpty.availableTags || [],
                      groupedReviews: [] 
                  });
              }

              // Obtener datos de places (tu código para esto está bien)
              const placeIds = [...new Set(reviews.map(r => r.placeId).filter(id => !!id))];
              const placesDataMap = new Map();
              if (placeIds.length > 0) {
                  const placeDocs = await db.collection('places').where(admin.firestore.FieldPath.documentId(), 'in', placeIds).get();
                  placeDocs.forEach(doc => placesDataMap.set(doc.id, doc.data()));
              }

              // --- BUCLE DE AGRUPACIÓN ---
              const grouped = {};
              reviews.forEach(review => {
                  const placeInfo = review.placeId ? placesDataMap.get(review.placeId) : null;
                  const establishmentName = placeInfo?.name || review.establishmentName || "Lugar Desconocido";
                  const key = `${establishmentName}-${review.itemName || ""}`;
                  
                  if (!grouped[key]) {
                      grouped[key] = {
                          establishmentName: establishmentName,
                          itemName: review.itemName || "",
                          itemCount: 0,
                          totalGeneralScore: 0,
                          thumbnailUrl: placeInfo?.mainImageUrl,
                          googleMapsUrl: placeInfo?.googleMapsUrl,
                          listId: listId, 
                          placeId: review.placeId,
                          allTags: [],
                          // REINTEGRAMOS LOS CRITERIOS
                          criteriaTotals: {},
                          criteriaCounts: {},
                      };
                  }

                  const group = grouped[key];
                  group.itemCount++;
                  group.totalGeneralScore += review.overallRating || 0;

                  if (review.photoUrl && !group.thumbnailUrl) { 
                      group.thumbnailUrl = review.photoUrl; 
                  }
                  
                  if (review.userTags && Array.isArray(review.userTags)) {
                    group.allTags.push(...review.userTags);
                  }
                  
                  // ¡¡REINTEGRAMOS LA LÓGICA DE CRITERIOS!!
                  if (review.scores && typeof review.scores === 'object') {
                      for (const [critKey, score] of Object.entries(review.scores)) {
                          if (typeof score === 'number') {
                              group.criteriaTotals[critKey] = (group.criteriaTotals[critKey] || 0) + score;
                              group.criteriaCounts[critKey] = (group.criteriaCounts[critKey] || 0) + 1;
                          }
                      }
                  }
              });

              // --- MAPEO FINAL Y CÁLCULOS ---
              const groupedReviewsArray = Object.values(grouped).map(group => {
                  // Calcular puntuación general media
                  group.avgGeneralScore = group.itemCount > 0 ? parseFloat((group.totalGeneralScore / group.itemCount).toFixed(1)) : 0;
                  
                  // Calcular puntuaciones medias de criterios
                  const avgScores = {};
                  for (const critKey in group.criteriaTotals) {
                      if (group.criteriaCounts[critKey] > 0) {
                          const avg = group.criteriaTotals[critKey] / group.criteriaCounts[critKey];
                          avgScores[critKey] = parseFloat(avg.toFixed(1));
                      }
                  }
                  group.avgScores = avgScores;

                  // Calcular etiquetas relevantes
                  const tagCounts = {};
                  group.allTags.forEach(tag => {
                      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                  });
                  const minOccurrences = Math.ceil(group.itemCount / 2);
                  
                  // ASIGNAMOS AL CAMPO CORRECTO: 'groupTags'
                  group.groupTags = Object.keys(tagCounts).filter(tag => tagCounts[tag] >= minOccurrences);
                  
                  // Limpiamos los datos de cálculo que no necesitamos en el frontend
                  delete group.allTags;
                  delete group.totalGeneralScore;
                  delete group.criteriaTotals;
                  delete group.criteriaCounts;
                  
                  return group;
              });
              
              groupedReviewsArray.sort((a, b) => (b.avgGeneralScore || 0) - (a.avgGeneralScore || 0));

              // Devolver respuesta final
              const listDoc = await listDocRef.get();
              const listData = listDoc.exists ? listDoc.data() : {};
              res.status(200).json({ 
                  listName: listData.name || "Lista Desconocida",
                  criteria: listData.criteriaDefinition || {},
                  tags: listData.availableTags || [],
                  groupedReviews: groupedReviewsArray 
              });

          } catch (error) {
              console.error("Error definitivo en groupedReviews:", error);
              res.status(500).send({ error: "El servidor se ha liado. Error interno.", details: error.message });
          }
      });
    });

// --- FUNCIÓN updateListReviewCount ---
// ESTA FUNCIÓN QUEDA OBSOLETA, LA NUEVA "updateAggregatesOnReviewChange" HACE ESTO Y MÁS.
// LA DEJAMOS COMENTADA POR SI ACASO, PERO LA NUEVA ES MEJOR.
/*
const updateListReviewCount = onDocumentWritten("lists/{listId}/reviews/{reviewId}", async (event) => {
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

// --- FUNCIÓN placesNearbyRestaurants (MEJORADA) ---
const placesNearbyRestaurants = onRequest(async (req, res) => {
  cors(req, res, async () => {
    const { latitude, longitude, categoryId } = req.query;
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;

    if (!latitude || !longitude) {
      logger.warn("placesNearbyRestaurants: Latitud y longitud son requeridas.");
      return res.status(400).json({ message: "Latitud y longitud son requeridas." });
    }
    if (!categoryId) {
        logger.warn("placesNearbyRestaurants: categoryId no fue proporcionado.");
        return res.status(400).json({ message: "El ID de la categoría es requerido." });
    }
    if (!apiKey) {
      logger.error("placesNearbyRestaurants: GOOGLE_PLACES_API_KEY no está disponible.");
      return res.status(500).json({ message: "Error de configuración del servidor." });
    }

    let type = 'point_of_interest'; // Tipo por defecto si la categoría no especifica uno
    try {
        const categoryDoc = await db.collection('categories').doc(categoryId).get();
        if (categoryDoc.exists) {
            const categoryData = categoryDoc.data();
            type = categoryData.googlePlaceType || type;
            logger.info(`Búsqueda por cercanía para categoría ${categoryId} usando tipo: ${type}`);
        }
    } catch (error) {
        logger.error(`Error buscando la categoría ${categoryId}:`, error);
        return res.status(500).json({ message: "Error interno al buscar la categoría." });
    }

    // Usamos rankby=distance, que ordena por cercanía y requiere un 'type', 'keyword' o 'name'.
    // Es incompatible con 'radius'.
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&key=${apiKey}&language=es&rankby=distance&type=${encodeURIComponent(type)}`;
    
    logger.info("placesNearbyRestaurants: Fetching Google Places with rankby=distance", {url: url.replace(apiKey, "REDACTED_API_KEY")});
    
    try {
      const placesResponse = await fetch(url);
      const placesData = await placesResponse.json();
      if (placesData.status === "OK" || placesData.status === "ZERO_RESULTS") {
        res.status(200).json(placesData.results || []);
      } else {
        logger.error("placesNearbyRestaurants: Error desde Google Places API", {status: placesData.status, error_message: placesData.error_message});
        res.status(500).json({ message: `Error de la API de Google Places: ${placesData.status}`, details: placesData.error_message });
      }
    } catch (error) {
      logger.error("placesNearbyRestaurants: Error al contactar Google Places API", error);
      res.status(500).json({ message: "Error interno al buscar lugares cercanos." });
    }
  });
});

// --- FUNCIÓN placesTextSearch (MEJORADA CON REORDENAMIENTO) ---

// Función auxiliar para calcular la distancia entre dos puntos geográficos
const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distancia en km
};

const placesTextSearch = onRequest(async (req, res) => {
    cors(req, res, async () => {
        const { query, latitude, longitude } = req.query;
        const apiKey = process.env.GOOGLE_PLACES_API_KEY;

        if (!query) {
