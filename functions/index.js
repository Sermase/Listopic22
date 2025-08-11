// functions/index.js
const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const {setGlobalOptions} = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const cors = require("cors")({origin: true});
const fetch = require("node-fetch");
const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");


if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

setGlobalOptions({ region: "europe-west1" });

// En functions/index.js

// En functions/index.js

// En functions/index.js

exports.groupedReviews = onRequest(
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
exports.updateListReviewCount = onDocumentWritten("lists/{listId}/reviews/{reviewId}", async (event) => {
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
      // Capturamos latitud y longitud de la petición
      const { query, latitude, longitude } = req.query;
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  
      if (!query) {
        logger.warn("placesTextSearch: El término de búsqueda (query) es requerido.", {query: req.query, structuredData: true});
        return res.status(400).json({ message: "El término de búsqueda (query) es requerido." });
      }
      if (!apiKey) {
          logger.error("placesTextSearch: GOOGLE_PLACES_API_KEY no está disponible.", {structuredData: true});
          return res.status(500).json({ message: "Error de configuración del servidor (Places API Key no encontrada)." });
      }
  
      // Construimos la URL base para la API de Google
      let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}&language=es&type=establishment`;
      
      // --- ¡AQUÍ ESTÁ LA MAGIA! ---
      // Si hemos recibido latitud y longitud, las usamos para darle preferencia a la cercanía.
      if (latitude && longitude) {
        // El parámetro 'location' le dice a Google dónde estás.
        // El 'radius' (en metros) crea un área donde los resultados son más relevantes.
        url += `&location=${latitude},${longitude}&radius=50000`; // 50km de radio
      }
      // --- FIN DE LA MAGIA ---
  
      logger.info("placesTextSearch: Fetching Google Places", {url: url.replace(apiKey, "REDACTED_API_KEY"), structuredData: true});
      
      try {
        const placesResponse = await fetch(url);
        const placesData = await placesResponse.json();
  
        if (placesData.status === "OK" || placesData.status === "ZERO_RESULTS") {
          res.status(200).json(placesData.results || []);
        } else {
          logger.error("placesTextSearch: Error desde Google Places API", {status: placesData.status, error_message: placesData.error_message, structuredData: true});
          res.status(500).json({ message: `Error de la API de Google Places: ${placesData.status}`, details: placesData.error_message });
        }
      } catch (error) {
        logger.error("placesTextSearch: Error al contactar Google Places API", error, {structuredData: true});
        res.status(500).json({ message: "Error interno al buscar lugares por texto.", error: error.message });
      }
    });
  });

// --- FUNCIÓN getPlaceDetailsFromGoogle ---
exports.getPlaceDetailsFromGoogle = onRequest(async (req, res) => {
  cors(req, res, async () => {
    const { placeid } = req.query;
    const apiKey = 'AIzaSyDXUk2b2VZu6Ui-HlBMZeMeQGBvzaSpHvE'; // TEMPORARY DEBUGGING

    if (!placeid) {
      logger.warn("getPlaceDetailsFromGoogle: El ID del lugar (placeid) es requerido.", {query: req.query, structuredData: true});
      return res.status(400).json({ message: "El ID del lugar (placeid) es requerido." });
    }
    if (!apiKey) {
        logger.error("getPlaceDetailsFromGoogle: GOOGLE_PLACES_API_KEY no está disponible.", {structuredData: true});
        return res.status(500).json({ message: "Error de configuración del servidor (Places API Key no encontrada)." });
    }

    const fields = "name,place_id,formatted_address,geometry,url,photos,price_level,website,international_phone_number,vicinity,address_components";
    const url = `https://maps.googleapis.com/maps/api/place/details/json?placeid=${placeid}&key=${apiKey}&fields=${fields}&language=es`;

    logger.info("getPlaceDetailsFromGoogle: Fetching Google Place Details", {url: url.replace(apiKey, "REDACTED_API_KEY"), structuredData: true});

    try {
      const placeDetailsResponse = await fetch(url);
      const placeDetailsData = await placeDetailsResponse.json();

      if (placeDetailsData.status === "OK") {
        res.status(200).json(placeDetailsData.result);
      } else {
        logger.error("getPlaceDetailsFromGoogle: Error desde Google Places API", {status: placeDetailsData.status, error_message: placeDetailsData.error_message, structuredData: true});
        res.status(500).json({ message: `Error de la API de Google Places: ${placeDetailsData.status}`, details: placeDetailsData.error_message });
      }
    } catch (error) {
      logger.error("getPlaceDetailsFromGoogle: Error al contactar Google Places API", error, {structuredData: true});
      res.status(500).json({ message: "Error interno al buscar detalles del lugar.", error: error.message });
    }
  });
});

// --- FUNCIÓN CALLABLE: deleteListAndContent ---
exports.deleteOrOrphanList = onCall({cors: true}, async (request) => {
  const contextAuth = request.auth;
  if (!contextAuth) {
      logger.warn("deleteOrOrphanList: Intento de llamada no autenticado.");
      throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado.');
  }

  const callerUserId = contextAuth.uid;
  const listId = request.data.listId;

  if (!listId) {
      logger.warn(`deleteOrOrphanList: listId no proporcionado por el usuario ${callerUserId}.`);
      throw new HttpsError('invalid-argument', 'Se requiere el ID de la lista (listId).');
  }

  logger.info(`deleteOrOrphanList: Usuario ${callerUserId} solicitando acción sobre lista ${listId}.`);
  const listRef = db.collection('lists').doc(listId);
  const reviewsRef = listRef.collection('reviews');

  try {
      const listDoc = await listRef.get();
      if (!listDoc.exists) {
          throw new HttpsError('not-found', 'La lista no existe.');
      }

      const listData = listDoc.data();
      if (listData.userId !== callerUserId) {
          throw new HttpsError('permission-denied', 'No tienes permiso para modificar esta lista.');
      }

      // --- INICIO DE LA NUEVA LÓGICA ---

      // Buscar si existen reseñas de OTROS usuarios en esta lista.
      const otherUserReviewsSnapshot = await reviewsRef.where('userId', '!=', callerUserId).limit(1).get();

      // Escenario 1: NO hay reseñas de otros usuarios. Procedemos a borrar todo.
      if (otherUserReviewsSnapshot.empty) {
          logger.info(`La lista ${listId} no tiene reseñas de otros usuarios. Procediendo con la eliminación completa.`);
          
          // Borrar todas las reseñas (que sabemos que son solo del propietario).
          const allReviewsSnapshot = await reviewsRef.get();
          if (!allReviewsSnapshot.empty) {
              const deleteBatch = db.batch();
              allReviewsSnapshot.docs.forEach(doc => deleteBatch.delete(doc.ref));
              await deleteBatch.commit();
              logger.info(`Eliminadas ${allReviewsSnapshot.size} reseñas del propietario de la lista ${listId}.`);
          }
          
          // Borrar la lista en sí.
          await listRef.delete();
          logger.info(`Lista ${listId} eliminada exitosamente por ${callerUserId}.`);
          
          return { success: true, message: 'La lista y todas tus reseñas han sido eliminadas.' };
      
      // Escenario 2: SÍ hay reseñas de otros. Procedemos a desvincular/archivar.
      } else {
          logger.info(`La lista ${listId} tiene reseñas de otros usuarios. Procediendo a desvincular al propietario ${callerUserId}.`);
          
          const ownerReviewsSnapshot = await reviewsRef.where('userId', '==', callerUserId).get();

          // Borrar solo las reseñas del propietario original.
          if (!ownerReviewsSnapshot.empty) {
              const deleteOwnerReviewsBatch = db.batch();
              ownerReviewsSnapshot.docs.forEach(doc => deleteOwnerReviewsBatch.delete(doc.ref));
              await deleteOwnerReviewsBatch.commit();
              logger.info(`Eliminadas ${ownerReviewsSnapshot.size} reseñas del propietario de la lista ${listId} para archivarla.`);
          }

          // Actualizar la lista para "orfanarla".
          await listRef.update({
              userId: null, // Desvinculamos al usuario.
              originalUserId: callerUserId, // Guardamos un registro de quién la creó.
              name: `[Archivada] ${listData.name}`, // Cambiamos el nombre para que sea visible su estado.
              updatedAt: FieldValue.serverTimestamp()
          });

          logger.info(`Lista ${listId} desvinculada del usuario ${callerUserId} y archivada.`);
          
          return { success: true, message: 'Te has desvinculado de la lista. Tus reseñas han sido eliminadas, pero la lista permanece activa para los demás usuarios.' };
      }
      // --- FIN DE LA NUEVA LÓGICA ---

  } catch (error) {
      logger.error(`Error en deleteOrOrphanList para lista ${listId} y usuario ${callerUserId}:`, error);
      if (error.code) { // Si ya es un HttpsError, lo relanzamos.
          throw error;
      }
      throw new HttpsError('internal', 'Ocurrió un error inesperado.');
  }
});

// --- FUNCIÓN CALLABLE: createList ---
exports.createList = onCall(async (data, context) => {
    if (!context.auth) {
        logger.warn("createList: Intento de llamada no autenticado.", {structuredData: true});
        throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado para crear una lista.');
    }

    const userId = context.auth.uid;
    const { listName, criteriaDefinition, availableTags, isPublic, categoryId } = data;

    if (!listName || typeof listName !== 'string' || listName.trim() === "") {
        logger.warn(`createList: listName no proporcionado o inválido por el usuario ${userId}.`, {listNameProvided: listName, structuredData: true});
        throw new HttpsError('invalid-argument', 'El nombre de la lista es obligatorio y debe ser una cadena de texto.');
    }

    const listsRef = db.collection('lists');
    try {
        // Comprobar si ya existe una lista con ese nombre para este usuario
        const existingListQuery = await listsRef
                                    .where('userId', '==', userId)
                                    .where('name', '==', listName.trim()) // Comparar con el nombre saneado
                                    .limit(1)
                                    .get();

        if (!existingListQuery.empty) {
            logger.warn(`createList: Usuario ${userId} intentó crear lista duplicada: "${listName.trim()}"`, {structuredData: true});
            throw new HttpsError('already-exists', 'Ya tienes una lista con ese nombre.');
        }

        // Si no existe, proceder a crear la lista
        const newListData = {
            name: listName.trim(),
            userId: userId,
            criteriaDefinition: criteriaDefinition || {},
            availableTags: Array.isArray(availableTags) ? availableTags.map(tag => String(tag).trim()).filter(tag => tag) : [],
            isPublic: typeof isPublic === 'boolean' ? isPublic : true, // Por defecto pública
            categoryId: categoryId || "defaultCategory",
            reviewCount: 0,
            reactions: {},
            commentsCount: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const newListRef = await listsRef.add(newListData);
        logger.info(`createList: Lista "${listName.trim()}" creada con ID ${newListRef.id} por el usuario ${userId}`, {structuredData: true});
        return { listId: newListRef.id, message: 'Lista creada con éxito' };

    } catch (error) {
        logger.error(`Error en createList para el usuario ${userId} al intentar crear lista "${listName}":`, error, {structuredData: true});
        if (error.code && typeof error.code === 'string' && error.message) { // Re-lanzar HttpsError
            throw error;
        }
        throw new HttpsError('internal', 'Ocurrió un error al crear la lista.', error.message);
    }
});


// --- NUEVA FUNCIÓN CALLABLE: createListWithValidation ---

exports.createListWithValidation = onCall(async (request) => {
  const data = request.data;
  const contextAuth = request.auth;

  if (!contextAuth) {
      throw new HttpsError('unauthenticated', 'Debes estar autenticado para crear una lista.');
  }

  const userId = contextAuth.uid;
  const listName = data.name;

  if (!listName || typeof listName !== 'string' || listName.trim() === '') {
      throw new HttpsError('invalid-argument', 'El nombre de la lista es requerido.');
  }
  
  const listsRef = db.collection('lists');
  
  try {
      // 1. Verificar si ya existe una lista con ese nombre para este usuario
      const existingListQuery = await listsRef
                                  .where('userId', '==', userId)
                                  .where('name', '==', listName.trim())
                                  .limit(1)
                                  .get();

      if (!existingListQuery.empty) {
          throw new HttpsError('already-exists', `Ya tienes una lista llamada "${listName.trim()}".`);
      }

      // 2. Crear la lista si no existe
      const newListData = {
          ...data, // Usamos todos los datos enviados desde el cliente (name, isPublic, etc.)
          userId: userId,
          reviewCount: 0,
          reactions: {},
          commentsCount: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
      };

      const newListRef = await listsRef.add(newListData);
      
      return { listId: newListRef.id, message: '¡Lista creada con éxito!' };

  } catch (error) {
      logger.error(`Error en createListWithValidation para usuario ${userId}, lista "${listName}":`, error);
      if (error.code) {
           throw error;
      }
      throw new HttpsError('internal', 'Ocurrió un error al crear la lista.');
  }
});

// --- NUEVA FUNCIÓN CALLABLE: createListWithValidation ---
exports.updateListWithValidation = onCall(async (request) => {
  const data = request.data;
  const contextAuth = request.auth;

  // 1. Verificar autenticación
  if (!contextAuth) {
      throw new HttpsError('unauthenticated', 'Debes estar autenticado para actualizar una lista.');
  }

  const { listId, data: listData } = data;

  if (!listId) {
      throw new HttpsError('invalid-argument', 'El ID de la lista es obligatorio.');
  }
  if (!listData.name || typeof listData.name !== 'string' || listData.name.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'El nombre de la lista no puede estar vacío.');
  }
  
  const userId = contextAuth.uid;
  const listRef = db.collection('lists').doc(listId);
  
  try {
      const doc = await listRef.get();

      if (!doc.exists) {
          throw new HttpsError('not-found', 'La lista que intentas editar no existe.');
      }

      // 2. ¡LA VERIFICACIÓN DE SEGURIDAD CLAVE!
      // Nos aseguramos de que solo el dueño pueda editar.
      if (doc.data().userId !== userId) {
          throw new HttpsError('permission-denied', 'No tienes permiso para editar esta lista.');
      }
      
      // 3. Preparar los datos para la actualización
      const updatePayload = {
          ...listData, // Usamos los datos que nos envía el cliente
          updatedAt: FieldValue.serverTimestamp(),
      };

      // 4. Actualizar la lista
      await listRef.update(updatePayload);

      return {
          status: 'success',
          message: '¡Lista actualizada con éxito!',
      };

  } catch (error) {
      logger.error(`Error en updateListWithValidation para lista ${listId} por usuario ${userId}:`, error);
      // Si el error ya es un HttpsError, lo relanzamos. Si no, devolvemos uno genérico.
      if (error.code) {
          throw error;
      }
      throw new HttpsError('internal', 'Ocurrió un error al actualizar la lista.');
  }
});

// NUEVA FUNCIÓN: reverseGeocode
exports.reverseGeocode = onRequest(async (req, res) => {
  cors(req, res, async () => {
    const { lat, lon } = req.query;
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;

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
        
        let region = '';
        let city = '';
        let postalCode = '';

        firstResult.address_components.forEach(component => {
            if (component.types.includes('administrative_area_level_2') && !region) {
                region = component.long_name;
            }
            if (component.types.includes('administrative_area_level_1') && !region) {
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
            region: region,
            city: city,
            postalCode: postalCode
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

// ===================================================================
// === NUEVAS FUNCIONES PARA CONTADORES Y DATOS AGREGADOS          ===
// ===================================================================

/**
 * Trigger que se dispara cuando una reseña es creada o eliminada.
 * Actualiza los contadores de reseñas en los documentos de usuario, lugar y lista.
 */
exports.updateAggregatesOnReviewChange = onDocumentWritten("lists/{listId}/reviews/{reviewId}", async (event) => {
  const listId = event.params.listId;
  const reviewId = event.params.reviewId;

  // Caso 1: CREACIÓN de reseña
  if (!event.data.before.exists && event.data.after.exists) {
    const newData = event.data.after.data();
    const {userId, placeId} = newData;

    if (!userId) {
      logger.warn(`La reseña ${reviewId} no tiene userId. No se puede actualizar contador de usuario.`);
      return null;
    }

    const batch = db.batch();

    // Actualizar contadores (+1)
    const listRef = db.collection('lists').doc(listId);
    batch.update(listRef, { reviewCount: FieldValue.increment(1) });
    logger.info(`Programando incremento de 'reviewCount' en lista ${listId}.`);

    const userRef = db.collection('users').doc(userId);
    batch.update(userRef, { reviewsCount: FieldValue.increment(1) });
    logger.info(`Programando incremento de 'reviewsCount' en usuario ${userId}.`);

    if (placeId) {
      const placeRef = db.collection('places').doc(placeId);
      batch.update(placeRef, { reviewsCount: FieldValue.increment(1) });
      logger.info(`Programando incremento de 'reviewsCount' en lugar ${placeId}.`);
    }

    try {
      await batch.commit();
      logger.info(`Contadores actualizados exitosamente para nueva reseña ${reviewId}.`);
    } catch (error) {
      logger.error("Error al actualizar contadores para nueva reseña:", error);
    }
    return null;
  }

  // Caso 2: ELIMINACIÓN de reseña
  if (event.data.before.exists && !event.data.after.exists) {
    const oldData = event.data.before.data();
    const {userId, placeId} = oldData;

    if (!userId) {
      logger.warn(`La reseña eliminada ${reviewId} no tenía userId. No se puede actualizar contador de usuario.`);
      return null;
    }

    const batch = db.batch();

    // Actualizar contadores (-1)
    const listRef = db.collection('lists').doc(listId);
    batch.update(listRef, { reviewCount: FieldValue.increment(-1) });
    logger.info(`Programando decremento de 'reviewCount' en lista ${listId}.`);

    const userRef = db.collection('users').doc(userId);
    batch.update(userRef, { reviewsCount: FieldValue.increment(-1) });
    logger.info(`Programando decremento de 'reviewsCount' en usuario ${userId}.`);

    if (placeId) {
      const placeRef = db.collection('places').doc(placeId);
      batch.update(placeRef, { reviewsCount: FieldValue.increment(-1) });
      logger.info(`Programando decremento de 'reviewsCount' en lugar ${placeId}.`);
    }

    try {
      await batch.commit();
      logger.info(`Contadores actualizados exitosamente para reseña eliminada ${reviewId}.`);
    } catch (error) {
      logger.error("Error al actualizar contadores para reseña eliminada:", error);
    }
    return null;
  }

  // Caso 3: ACTUALIZACIÓN de reseña
  if (event.data.before.exists && event.data.after.exists) {
    const oldData = event.data.before.data();
    const newData = event.data.after.data();

    const oldPlaceId = oldData.placeId;
    const newPlaceId = newData.placeId;

    // Solo proceder si cambió el placeId
    if (oldPlaceId !== newPlaceId) {
      logger.info(`Reseña ${reviewId} cambió de lugar: ${oldPlaceId || 'null'} -> ${newPlaceId || 'null'}`);

      const batch = db.batch();

      // Decrementar contador del lugar anterior (si existía)
      if (oldPlaceId) {
        const oldPlaceRef = db.collection('places').doc(oldPlaceId);
        batch.update(oldPlaceRef, { reviewsCount: FieldValue.increment(-1) });
        logger.info(`Programando decremento de 'reviewsCount' en lugar anterior ${oldPlaceId}.`);
      }

      // Incrementar contador del lugar nuevo (si existe)
      if (newPlaceId) {
        const newPlaceRef = db.collection('places').doc(newPlaceId);
        batch.update(newPlaceRef, { reviewsCount: FieldValue.increment(1) });
        logger.info(`Programando incremento de 'reviewsCount' en lugar nuevo ${newPlaceId}.`);
      }

      try {
        await batch.commit();
        logger.info(`Contadores de lugares actualizados exitosamente para reseña ${reviewId}.`);
      } catch (error) {
        logger.error("Error al actualizar contadores de lugares:", error);
      }
    } else {
      logger.info(`Reseña ${reviewId} actualizada sin cambio de lugar. No se modifican contadores.`);
    }
    return null;
  }

  logger.warn(`Caso no manejado en updateAggregatesOnReviewChange para reseña ${reviewId}`);
  return null;
});


/**
* Trigger que se dispara cuando una lista es creada, actualizada o eliminada.
* Actualiza los contadores de listas públicas y privadas en el documento del usuario.
*/
exports.updateUserStatsOnListChange = onDocumentWritten("lists/{listId}", async (event) => {
  let userRef;
  let updates = {};

  // Caso 1: Se crea una lista NUEVA
  if (!event.data.before.exists && event.data.after.exists) {
      const listData = event.data.after.data();
      if (!listData.userId) return null; // Lista "huérfana", no hacer nada
      userRef = db.collection('users').doc(listData.userId);
      const fieldToIncrement = listData.isPublic ? 'publicListsCount' : 'privateListsCount';
      updates[fieldToIncrement] = FieldValue.increment(1);
      logger.info(`Nueva lista creada por ${listData.userId}. Incrementando ${fieldToIncrement}.`);
  }
  // Caso 2: Se elimina una lista
  else if (event.data.before.exists && !event.data.after.exists) {
      const listData = event.data.before.data();
      if (!listData.userId) return null; // Lista "huérfana" eliminada, no hay usuario que actualizar
      userRef = db.collection('users').doc(listData.userId);
      const fieldToDecrement = listData.isPublic ? 'publicListsCount' : 'privateListsCount';
      updates[fieldToDecrement] = FieldValue.increment(-1);
      logger.info(`Lista eliminada por ${listData.userId}. Decrementando ${fieldToDecrement}.`);
  }
  // Caso 3: Se actualiza una lista (nos interesa si cambia la privacidad o el dueño)
  else if (event.data.before.exists && event.data.after.exists) {
      const beforeData = event.data.before.data();
      const afterData = event.data.after.data();
      
      // Cambio de propietario (cuando una lista se "orfana")
      if (beforeData.userId && !afterData.userId) {
          userRef = db.collection('users').doc(beforeData.userId);
          const fieldToDecrement = beforeData.isPublic ? 'publicListsCount' : 'privateListsCount';
          updates[fieldToDecrement] = FieldValue.increment(-1);
          logger.info(`Lista desvinculada del usuario ${beforeData.userId}. Decrementando contadores.`);
      }
      // Cambio de privacidad
      else if (beforeData.isPublic !== afterData.isPublic) {
          if(!afterData.userId) return null;
          userRef = db.collection('users').doc(afterData.userId);
          const oldField = beforeData.isPublic ? 'publicListsCount' : 'privateListsCount';
          const newField = afterData.isPublic ? 'publicListsCount' : 'privateListsCount';
          updates[oldField] = FieldValue.increment(-1);
          updates[newField] = FieldValue.increment(1);
          logger.info(`Visibilidad de lista cambiada por ${afterData.userId}. Actualizando contadores.`);
      } else {
          return null; // No hay cambio relevante, no hacemos nada
      }
  }

  if (userRef && Object.keys(updates).length > 0) {
      try {
          await userRef.update(updates);
          logger.info("Contadores de listas del usuario actualizados correctamente.");
      } catch(error) {
          logger.error("Error actualizando contadores de listas del usuario:", error);
      }
  }
});


/**
* Trigger que se dispara cuando un comentario es creado o eliminado.
* Actualiza el contador de comentarios en el documento de la lista y del usuario.
* (Asume que los comentarios están en lists/{listId}/comments/{commentId})
*/
exports.updateAggregatesOnCommentChange = onDocumentWritten("lists/{listId}/comments/{commentId}", async (event) => {
  if (event.data.before.exists && event.data.after.exists) {
      return null;
  }

  const change = event.data.after.exists ? 1 : -1;
  const listId = event.params.listId;
  const data = change === 1 ? event.data.after.data() : event.data.before.data();
  const userId = data.userId;

  const batch = db.batch();

  // Actualizar contador de la LISTA
  const listRef = db.collection('lists').doc(listId);
  batch.update(listRef, { commentsCount: FieldValue.increment(change) });
  logger.info(`Contador 'commentsCount' en lista ${listId} se actualizará en ${change}.`);
  
  // Actualizar contador del USUARIO (si tiene userId)
  if (userId) {
      const userRef = db.collection('users').doc(userId);
      batch.update(userRef, { commentsCount: FieldValue.increment(change) });
      logger.info(`Contador 'commentsCount' en usuario ${userId} se actualizará en ${change}.`);
  }
  
  try {
      await batch.commit();
      logger.info("Contadores de comentarios actualizados.");
  } catch(error) {
      logger.error("Error actualizando contadores de comentarios:", error);
  }
});


exports.toggleFollowUser = onCall(async (request) => {
    const contextAuth = request.auth;
    if (!contextAuth) {
        throw new HttpsError('unauthenticated', 'Debes estar autenticado para seguir a otros usuarios.');
    }

    const currentUserId = contextAuth.uid;
    const userIdToFollow = request.data.userIdToFollow;

    if (!userIdToFollow) {
        throw new HttpsError('invalid-argument', 'Se requiere el ID del usuario a seguir (userIdToFollow).');
    }

    if (currentUserId === userIdToFollow) {
        throw new HttpsError('invalid-argument', 'No te puedes seguir a ti mismo, genio.');
    }

    const currentUserRef = db.collection('users').doc(currentUserId);
    const userToFollowRef = db.collection('users').doc(userIdToFollow);
    const followingRef = currentUserRef.collection('following').doc(userIdToFollow);
    const followerRef = userToFollowRef.collection('followers').doc(currentUserId);

    try {
        const doc = await followingRef.get();
        const batch = db.batch();

        if (doc.exists) {
            // --- Lógica para DEJAR DE SEGUIR ---
            batch.delete(followingRef);
            batch.delete(followerRef);
            batch.update(currentUserRef, { followingCount: FieldValue.increment(-1) });
            batch.update(userToFollowRef, { followersCount: FieldValue.increment(-1) });
            
            await batch.commit();
            logger.info(`Usuario ${currentUserId} ha dejado de seguir a ${userIdToFollow}.`);
            return { status: 'unfollowed', message: 'Has dejado de seguir a este usuario.' };
        } else {
            // --- Lógica para SEGUIR ---
            batch.set(followingRef, { followedAt: FieldValue.serverTimestamp() });
            batch.set(followerRef, { followedAt: FieldValue.serverTimestamp() });
            batch.update(currentUserRef, { followingCount: FieldValue.increment(1) });
            batch.update(userToFollowRef, { followersCount: FieldValue.increment(1) });

            await batch.commit();
            logger.info(`Usuario ${currentUserId} ahora sigue a ${userIdToFollow}.`);
            return { status: 'followed', message: 'Ahora sigues a este usuario.' };
        }
    } catch (error) {
        logger.error(`Error en toggleFollowUser para ${currentUserId} -> ${userIdToFollow}:`, error);
        throw new HttpsError('internal', 'Ocurrió un error al procesar la solicitud.');
    }
});

// En functions/index.js, reemplaza la función getPlacesForList entera por esta:

exports.getPlacesForList = onCall({cors: true}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado.');
    }
    const listId = request.data.listId;
    if (!listId) {
        throw new HttpsError('invalid-argument', 'Se requiere el ID de la lista.');
    }

    try {
        const reviewsSnapshot = await db.collection('lists').doc(listId).collection('reviews').get();
        if (reviewsSnapshot.empty) {
            return { places: [] };
        }

        // Agrupamos reseñas por placeId para calcular la media
        const placesAggregates = {};

        reviewsSnapshot.forEach(doc => {
            const review = doc.data();
            if (review.placeId) {
                if (!placesAggregates[review.placeId]) {
                    placesAggregates[review.placeId] = {
                        totalScore: 0,
                        count: 0,
                        placeId: review.placeId
                    };
                }
                placesAggregates[review.placeId].totalScore += review.overallRating || 0;
                placesAggregates[review.placeId].count++;
            }
        });

        const placeIds = Object.keys(placesAggregates);
        if (placeIds.length === 0) {
            return { places: [] };
        }

        const placeDocs = await db.collection('places').where(admin.firestore.FieldPath.documentId(), 'in', placeIds).get();

        const placesForMap = [];
        placeDocs.forEach(doc => {
            const place = doc.data();
            const aggregate = placesAggregates[doc.id];
            
            if (place.location && place.location.latitude && place.location.longitude) {
                placesForMap.push({
                    id: doc.id,
                    name: place.name,
                    location: place.location,
                    mainImageUrl: place.mainImageUrl || null,
                    // ¡AÑADIMOS LA PUNTUACIÓN MEDIA!
                    avgGeneralScore: (aggregate.totalScore / aggregate.count)
                });
            }
        });

        return { places: placesForMap };

    } catch (error) {
        logger.error(`Error en getPlacesForList para lista ${listId}:`, error);
        throw new HttpsError('internal', 'No se pudieron obtener los lugares para el mapa.');
    }
});

exports.getPlaceDetails = onCall(async (request) => {
  // --- Usamos 'request' como parámetro, al estilo V2 ---
  logger.info("Función getPlaceDetails invocada. Payload recibido:", request.data);

  // Obtenemos los datos de request.data
  const placeId = request.data.placeId;

  if (!placeId) {
      logger.error("Error en getPlaceDetails: placeId no encontrado en el payload.", {
          payloadRecibido: request.data,
          auth: request.auth // La autenticación ahora es request.auth
      });
      throw new HttpsError('invalid-argument', 'El ID del lugar es requerido.');
  }

  try {
      // 1. Obtener datos básicos del lugar
      const placeDoc = await db.collection('places').doc(placeId).get();
      if (!placeDoc.exists) {
          throw new HttpsError('not-found', 'El lugar no fue encontrado.');
      }
      const placeData = { id: placeDoc.id, ...placeDoc.data() };

      // 2. Obtener todas las reseñas asociadas a este lugar
      // *** CORREGIDO: Usamos 'updatedAt' para ordenar ***
      const reviewsSnapshot = await db.collectionGroup('reviews').where('placeId', '==', placeId).orderBy('updatedAt', 'desc').get();
      const allReviews = reviewsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // 3. Agrupar reseñas por itemName para la pestaña "Grupos"
      const groupedByItem = {};
      allReviews.forEach(review => {
          const itemName = review.itemName || "General";
          if (!groupedByItem[itemName]) {
              groupedByItem[itemName] = {
                  itemName: itemName,
                  establishmentName: placeData.name,
                  placeId: placeId,
                  listId: review.listId, // Ojo: esto tomará el listId de la última reseña del grupo
                  itemCount: 0,
                  totalGeneralScore: 0,
                  avgScores: {},
                  criteriaTotals: {},
                  criteriaCounts: {},
                  allTags: [],
                  thumbnailUrl: review.photoUrl // Tomamos la foto de la primera reseña que encontramos
              };
          }
          const group = groupedByItem[itemName];
          group.itemCount++;
          group.totalGeneralScore += review.overallRating || 0;
          if (review.userTags) group.allTags.push(...review.userTags);
          if (review.scores) {
              for (const [critKey, score] of Object.entries(review.scores)) {
                  group.criteriaTotals[critKey] = (group.criteriaTotals[critKey] || 0) + score;
                  group.criteriaCounts[critKey] = (group.criteriaCounts[critKey] || 0) + 1;
              }
          }
      });
      
      const groupCards = Object.values(groupedByItem).map(group => {
          group.avgGeneralScore = group.itemCount > 0 ? parseFloat((group.totalGeneralScore / group.itemCount).toFixed(1)) : 0;
          group.groupTags = [...new Set(group.allTags)].slice(0, 5);
          for (const critKey in group.criteriaTotals) {
              group.avgScores[critKey] = group.criteriaTotals[critKey] / group.criteriaCounts[critKey];
          }
          delete group.criteriaTotals;
          delete group.criteriaCounts;
          delete group.allTags;
          delete group.totalGeneralScore;
          return group;
      });

      // 4. Devolver todo el paquete de datos
      return {
          placeInfo: placeData,
          groups: groupCards,
          latestReviews: allReviews.slice(0, 10)
      };

  } catch (error) {
      logger.error(`Error en getPlaceDetails para placeId ${placeId}:`, error);
      throw new HttpsError('internal', 'No se pudieron obtener los detalles del lugar.');
  }
});

// En functions/index.js

exports.getGroupsForPlace = onRequest(async (req, res) => {
  // *** LA SOLUCIÓN CLAVE: Envolvemos todo en cors ***
  cors(req, res, async () => {
      try {
          // En funciones onRequest, los datos vienen en req.body.data
          const { placeId } = req.body.data;

          if (!placeId) {
              logger.error("getGroupsForPlace: placeId no fue proporcionado en el cuerpo de la petición.");
              // Devolvemos un error usando res.status()
              return res.status(400).json({ error: "La función debe ser llamada con un 'placeId'." });
          }

          const groupsSnapshot = await db.collection("groups")
              .where("members", "array-contains", placeId).get();

          if (groupsSnapshot.empty) {
              logger.log(`No se encontraron grupos para el placeId: ${placeId}`);
              // Devolvemos la respuesta correcta usando res.json()
              return res.status(200).json({ data: [] });
          }

          const groupPromises = groupsSnapshot.docs.map(async (groupDoc) => {
              const groupData = groupDoc.data();
              const listId = groupData.listId;
              let listName = "Lista no especificada";

              if (listId) {
                  const listDoc = await db.collection("lists").doc(listId).get();
                  if (listDoc.exists) {
                      listName = listDoc.data().name;
                  } else {
                      listName = "Lista eliminada";
                  }
              }
              
              return {
                  id: groupDoc.id,
                  name: groupData.name,
                  icon: groupData.icon || "fa-users",
                  listName: listName,
              };
          });

          const enrichedGroups = await Promise.all(groupPromises);
          // Devolvemos la respuesta correcta en un objeto { data: ... }
          return res.status(200).json({ data: enrichedGroups });

      } catch (error) {
          logger.error("Error al buscar grupos para el lugar:", error);
          // Devolvemos un error usando res.status()
          return res.status(500).json({ error: "No se pudieron obtener los grupos." });
      }
  });
});

exports.updatePlaceAggregates = onDocumentWritten("reviews/{reviewId}", async (event) => {
  // Hemos usado un collectionGroup, por lo que el path es "reviews/{reviewId}"
  // Si tus reseñas estuvieran en "lists/{listId}/reviews/{reviewId}", el path sería ese.
  // ¡Asegúrate de que el path coincide con tu estructura!

  let placeId = null;
  let needsRecalculation = false;

  // Se crea o borra una reseña, o cambia su puntuación
  if (event.data.before.exists || event.data.after.exists) {
      const beforeData = event.data.before.data() || {};
      const afterData = event.data.after.data() || {};
      
      // Si se crea/borra o si la puntuación general cambia, recalculamos.
      if (beforeData.overallRating !== afterData.overallRating) {
          needsRecalculation = true;
      }
      placeId = afterData.placeId || beforeData.placeId;
  }

  if (!needsRecalculation || !placeId) {
      logger.info(`No se requiere recálculo para la reseña. PlaceId: ${placeId}, NeedsRecalculation: ${needsRecalculation}`);
      return null;
  }

  logger.info(`Recalculando agregados para el lugar: ${placeId}`);
  
  // 1. Obtenemos TODAS las reseñas para ese lugar
  const reviewsSnapshot = await db.collectionGroup('reviews').where('placeId', '==', placeId).get();
  
  const reviews = reviewsSnapshot.docs.map(doc => doc.data());
  
  if (reviews.length === 0) {
      // Si no quedan reseñas, reseteamos los contadores
      await db.collection('places').doc(placeId).update({
          reviewsCount: 0,
          averageRating: null // O 0, como prefieras
      });
      logger.info(`No quedan reseñas para ${placeId}. Contadores reseteados.`);
      return null;
  }
  
  // 2. Calculamos la nueva media
  const totalRating = reviews.reduce((sum, review) => sum + (review.overallRating || 0), 0);
  const averageRating = totalRating / reviews.length;
  const reviewsCount = reviews.length;

  // 3. Actualizamos el documento del lugar
  await db.collection('places').doc(placeId).update({
      reviewsCount: reviewsCount,
      averageRating: parseFloat(averageRating.toFixed(2)) // Guardamos con 2 decimales
  });

  logger.info(`Agregados para ${placeId} actualizados: ${reviewsCount} reseñas, valoración media ${averageRating.toFixed(2)}.`);
  return null;
});

/**
 * Trigger que se dispara cuando una reseña cambia en CUALQUIER lista,
 * para recalcular la valoración media y el contador de reseñas del LUGAR al que pertenece.
 */
exports.updatePlaceAggregatesOnReviewChange = onDocumentWritten("lists/{listId}/reviews/{reviewId}", async (event) => {
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();

  const placeIdToDecrement = beforeData?.placeId;
  const placeIdToIncrement = afterData?.placeId;

  // Si el placeId no ha cambiado (solo se ha editado el texto, por ejemplo),
  // pero la puntuación sí, recalculamos para ese único lugar.
  if (placeIdToDecrement && placeIdToDecrement === placeIdToIncrement) {
      if (beforeData.overallRating !== afterData.overallRating) {
          await recalculateAggregatesForPlace(placeIdToIncrement);
      } else {
           logger.info(`La reseña ${event.params.reviewId} se actualizó sin cambiar la puntuación. No se requiere recálculo.`);
      }
  } else {
      // Si el placeId ha cambiado, se ha creado o se ha borrado una reseña,
      // actualizamos los contadores de los lugares implicados.
      if (placeIdToDecrement) {
          await recalculateAggregatesForPlace(placeIdToDecrement);
      }
      if (placeIdToIncrement) {
          await recalculateAggregatesForPlace(placeIdToIncrement);
      }
  }
  return null;
});

// --- Función auxiliar para mantener el código limpio y reutilizable ---
async function recalculateAggregatesForPlace(placeId) {
  if (!placeId) {
      logger.warn("recalculateAggregatesForPlace fue llamada sin un placeId.");
      return;
  }

  logger.info(`Recalculando agregados para el lugar: ${placeId}.`);

  const reviewsSnapshot = await db.collectionGroup('reviews').where('placeId', '==', placeId).get();
  const reviews = reviewsSnapshot.docs.map(doc => doc.data());
  
  let averageRating = null;
  const reviewsCount = reviews.length;

  if (reviewsCount > 0) {
      const totalRating = reviews.reduce((sum, review) => sum + (review.overallRating || 0), 0);
      averageRating = parseFloat((totalRating / reviewsCount).toFixed(2));
  }

  const placeRef = db.collection('places').doc(placeId);
  try {
      await placeRef.update({
          reviewsCount: reviewsCount,
          averageRating: averageRating 
      });
      logger.info(`Agregados para ${placeId} actualizados: ${reviewsCount} reseñas, valoración media ${averageRating}.`);
  } catch (error) {
      logger.error(`Error al actualizar el documento del lugar ${placeId}:`, error);
  }
};exports.adminUpdateAllPlaces = onCall(async (request) => {
    const contextAuth = request.auth;
    if (!contextAuth) {
        throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
    }

    // Admin check
    try {
        const userProfileDoc = await db.collection('users').doc(contextAuth.uid).get();
        if (!userProfileDoc.exists || !Array.isArray(userProfileDoc.data().userType) || !userProfileDoc.data().userType.includes('jefe')) {
            throw new HttpsError('permission-denied', 'No tienes permiso para ejecutar esta operación.');
        }
    } catch (error) {
        logger.error("adminUpdateAllPlaces: Error al verificar permisos de admin", error);
        throw new HttpsError('internal', 'Error al verificar permisos.');
    }

    const apiKey = 'AIzaSyDXUk2b2VZu6Ui-HlBMZeMeQGBvzaSpHvE'; // TEMPORARY DEBUGGING - CHANGE TO process.env.GOOGLE_PLACES_API_KEY
    if (!apiKey) {
        logger.error("adminUpdateAllPlaces: GOOGLE_PLACES_API_KEY no está disponible.");
        throw new HttpsError('internal', 'Error de configuración del servidor (Places API Key no encontrada).');
    }

    const placesRef = db.collection('places');
    let batch = db.batch();
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let writeCount = 0;

    try {
        const snapshot = await placesRef.get();
        const places = snapshot.docs;

        for (const doc of places) {
            const placeData = doc.data();
            const placeId = placeData.googlePlaceId; // Assuming the field is named googlePlaceId

            if (!placeId) {
                skippedCount++;
                continue;
            }

            const fields = "name,formatted_address,geometry,url,photos,price_level,website,international_phone_number,vicinity,address_components";
            const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${apiKey}&fields=${fields}&language=es`;

            try {
                const response = await fetch(url);
                const details = await response.json();

                if (details.status === "OK" && details.result) {
                    const result = details.result;
                    const updateData = {
                        name: result.name,
                        formatted_address: result.formatted_address,
                        'location.latitude': result.geometry?.location?.lat,
                        'location.longitude': result.geometry?.location?.lng,
                        googleMapsUrl: result.url,
                        mainImageUrl: result.photos && result.photos.length > 0 ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${result.photos[0].photo_reference}&key=${apiKey}` : (placeData.mainImageUrl || null),
                        priceLevel: result.price_level,
                        website: result.website,
                        phone: result.international_phone_number,
                        vicinity: result.vicinity,
                        updatedAt: FieldValue.serverTimestamp()
                    };

                    // Clean undefined values
                    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

                    batch.update(doc.ref, updateData);
                    writeCount++;
                    updatedCount++;

                    if (writeCount >= 499) {
                        await batch.commit();
                        batch = db.batch();
                        writeCount = 0;
                    }
                } else {
                    logger.error(`Error fetching details for placeId ${placeId}: ${details.status} - ${details.error_message || ''}`);
                    errorCount++;
                }
            } catch (fetchError) {
                logger.error(`Exception fetching details for placeId ${placeId}:`, fetchError);
                errorCount++;
            }
        }

        if (writeCount > 0) {
            await batch.commit();
        }

        logger.info(`adminUpdateAllPlaces successful. Updated: ${updatedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);
        return { success: true, updated: updatedCount, skipped: skippedCount, errors: errorCount };

    } catch (error) {
        logger.error("Error masivo en adminUpdateAllPlaces:", error);
        throw new HttpsError('internal', 'Un error ocurrió durante la actualización masiva.');
    }
});

exports.adminGetCollection = onCall(async (request) => {
    const contextAuth = request.auth;
    if (!contextAuth) {
        throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
    }

    // Admin check
    try {
        const userProfileDoc = await db.collection('users').doc(contextAuth.uid).get();
        if (!userProfileDoc.exists || !Array.isArray(userProfileDoc.data().userType) || !userProfileDoc.data().userType.includes('jefe')) {
            throw new HttpsError('permission-denied', 'No tienes permiso para ejecutar esta operación.');
        }
    } catch (error) {
        logger.error("adminGetCollection: Error al verificar permisos de admin", error);
        throw new HttpsError('internal', 'Error al verificar permisos.');
    }

    const collectionName = request.data.collectionName;
    const allowedCollections = ['users', 'lists', 'places', 'categories', 'listForums', 'reviews'];

    if (!collectionName || !allowedCollections.includes(collectionName)) {
        throw new HttpsError('invalid-argument', 'Nombre de colección no válido o no permitido.');
    }

    try {
        const snapshot = await db.collection(collectionName).get();
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return { data: data };
    } catch (error) {
        logger.error(`Error masivo en adminGetCollection para la colección ${collectionName}:`, error);
        throw new HttpsError('internal', `Un error ocurrió al obtener la colección ${collectionName}.`);
    }
});