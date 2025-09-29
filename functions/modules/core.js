// functions/modules/core.js

const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const cors = require("cors")({origin: true});
const fetch = require("node-fetch");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { buildGroupedItemsForList } = require("./grouped-aggregator");

const db = getFirestore();

// Helper: fetch place docs by IDs in chunks of 10 (Firestore 'in' limit)
async function getPlaceDocsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < ids.length; i += 10) {
    chunks.push(ids.slice(i, i + 10));
  }
  const results = [];
  for (const chunk of chunks) {
    const snap = await db
      .collection('places')
      .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
      .get();
    results.push(...snap.docs);
  }
  return results;
}

const groupedReviews = onRequest(
    async (req, res) => {
      cors(req, res, async () => {
          const listId = req.query.listId;
          if (!listId) {
              return res.status(400).send({ error: "listId es requerido." });
          }

          try {
              const { listData, groupedReviews } = await buildGroupedItemsForList(listId);
              const responseListData = listData || {};
              res.status(200).json({
                  listName: responseListData.name || "Lista Desconocida",
                  categoryId: responseListData.categoryId || null,
                  criteria: responseListData.criteriaDefinition || {},
                  tags: Array.isArray(responseListData.availableTags) ? responseListData.availableTags : [],
                  groupedReviews: groupedReviews || []
              });
          } catch (error) {
              console.error("Error definitivo en groupedReviews:", error);
              res.status(500).send({ error: "El servidor se ha liado. Error interno.", details: error.message });
          }
      });
    });


// --- FUNCIÃ“N updateListReviewCount ---
// ESTA FUNCIÃ“N QUEDA OBSOLETA, LA NUEVA "updateAggregatesOnReviewChange" HACE ESTO Y MÃS.
// LA DEJAMOS COMENTADA POR SI ACASO, PERO LA NUEVA ES MEJOR.
/*
const updateListReviewCount = onDocumentWritten("lists/{listId}/reviews/{reviewId}", async (event) => {
  const listId = event.params.listId;
  const listRef = getFirestore().collection('lists').doc(listId);
  if (!event.data.before.exists && event.data.after.exists) {
      logger.info(`Nueva reseÃ±a creada en lista ${listId}, incrementando contador.`);
      return listRef.update({
          reviewCount: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp()
      });
  }
  else if (event.data.before.exists && !event.data.after.exists) {
      logger.info(`ReseÃ±a eliminada de lista ${listId}, decrementando contador.`);
      return listRef.update({
          reviewCount: FieldValue.increment(-1),
          updatedAt: FieldValue.serverTimestamp()
      });
  }
  else {
      logger.info(`ReseÃ±a actualizada en lista ${listId}, contador no afectado.`);
      return null;
  }
});
*/

// --- FUNCIÃ“N placesNearbyRestaurants (MEJORADA) ---
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
        return res.status(400).json({ message: "El ID de la categorÃ­a es requerido." });
    }
    if (!apiKey) {
      logger.error("placesNearbyRestaurants: GOOGLE_PLACES_API_KEY no estÃ¡ disponible.");
      return res.status(500).json({ message: "Error de configuraciÃ³n del servidor." });
    }

    let type = 'point_of_interest'; // Tipo por defecto si la categorÃ­a no especifica uno
    try {
        const categoryDoc = await db.collection('categories').doc(categoryId).get();
        if (categoryDoc.exists) {
            const categoryData = categoryDoc.data();
            type = categoryData.googlePlaceType || type;
            logger.info(`BÃºsqueda por cercanÃ­a para categorÃ­a ${categoryId} usando tipo: ${type}`);
        }
    } catch (error) {
        logger.error(`Error buscando la categorÃ­a ${categoryId}:`, error);
        return res.status(500).json({ message: "Error interno al buscar la categorÃ­a." });
    }

    // Usamos rankby=distance, que ordena por cercanÃ­a y requiere un 'type', 'keyword' o 'name'.
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

// --- FUNCIÃ“N placesTextSearch (MEJORADA CON REORDENAMIENTO) ---

// FunciÃ³n auxiliar para calcular la distancia entre dos puntos geogrÃ¡ficos
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
            return res.status(400).json({ message: "El tÃ©rmino de bÃºsqueda (query) es requerido." });
        }
        if (!apiKey) {
            return res.status(500).json({ message: "Error de configuraciÃ³n del servidor." });
        }

        let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}&language=es&type=establishment`;
        
        if (latitude && longitude) {
            url += `&location=${latitude},${longitude}&radius=40000`; // radio en metros (40km)
        }

        logger.info("placesTextSearch: Fetching Google Places", { url: url.replace(apiKey, "REDACTED_API_KEY") });
        
        try {
            const placesResponse = await fetch(url);
            const placesData = await placesResponse.json();

            if (placesData.status === "OK" || placesData.status === "ZERO_RESULTS") {
                let results = placesData.results || [];

                if (results.length > 0 && latitude && longitude) {
                    const userLat = parseFloat(latitude);
                    const userLon = parseFloat(longitude);
                    const lowerCaseQuery = query.toLowerCase();

                    results.forEach(place => {
                        const lowerCaseName = place.name.toLowerCase();
                        let matchScore = 0;
                        if (lowerCaseName === lowerCaseQuery) matchScore = 3;
                        else if (lowerCaseName.startsWith(lowerCaseQuery)) matchScore = 2;
                        else if (lowerCaseName.includes(lowerCaseQuery)) matchScore = 1;

                        const placeLat = place.geometry.location.lat;
                        const placeLon = place.geometry.location.lng;
                        const distance = getDistance(userLat, userLon, placeLat, placeLon);
                        place.distanceInKm = distance;

                        let distanceScore = 0;
                        if (distance < 25) distanceScore = 10;
                        else if (distance < 100) distanceScore = 5;
                        else if (distance < 800) distanceScore = 1;
                        else distanceScore = 0.1;

                        place.finalScore = matchScore * distanceScore;
                    });

                    results.sort((a, b) => b.finalScore - a.finalScore);
                }
                
                res.status(200).json(results);
            } else {
                logger.error("placesTextSearch: Error desde Google Places API", { status: placesData.status, error_message: placesData.error_message });
                res.status(500).json({ message: `Error de la API de Google Places: ${placesData.status}`, details: placesData.error_message });
            }
        } catch (error) {
            logger.error("placesTextSearch: Error al contactar Google Places API", error);
            res.status(500).json({ message: "Error interno al buscar lugares por texto." });
        }
    });
});


// --- FUNCIÃ“N getPlaceDetailsFromGoogle ---

const provinceMap = {
    '01': 'Ãlava', '02': 'Albacete', '03': 'Alicante', '04': 'AlmerÃ­a', '05': 'Ãvila',
    '06': 'Badajoz', '07': 'Baleares', '08': 'Barcelona', '09': 'Burgos', '10': 'CÃ¡ceres',
    '11': 'CÃ¡diz', '12': 'CastellÃ³n', '13': 'Ciudad Real', '14': 'CÃ³rdoba', '15': 'La CoruÃ±a',
    '16': 'Cuenca', '17': 'Gerona', '18': 'Granada', '19': 'Guadalajara', '20': 'GuipÃºzcoa',
    '21': 'Huelva', '22': 'Huesca', '23': 'JaÃ©n', '24': 'LeÃ³n', '25': 'LÃ©rida',
    '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid', '29': 'MÃ¡laga', '30': 'Murcia',
    '31': 'Navarra', '32': 'Orense', '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas',
    '36': 'Pontevedra', '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Cantabria', '40': 'Segovia',
    '41': 'Sevilla', '42': 'Soria', '43': 'Tarragona', '44': 'Teruel', '45': 'Toledo',
    '46': 'Valencia', '47': 'Valladolid', '48': 'Vizcaya', '49': 'Zamora', '50': 'Zaragoza',
    '51': 'Ceuta', '52': 'Melilla'
};

const getPlaceDetailsFromGoogle = onRequest(async (req, res) => {
    cors(req, res, async () => {
        // 1. AHORA ACEPTAMOS EL userId DESDE LA PETICIÃ“N
        // AutenticaciÃ³n: requerir ID token en Authorization: Bearer <token>
        try {
            const authHeader = req.get('Authorization') || '';
            const m = authHeader.match(/^Bearer\s+(.*)$/i);
            if (!m) {
                return res.status(401).json({ message: 'No autorizado: falta token Bearer.' });
            }
            const decoded = await admin.auth().verifyIdToken(m[1]);
            req.user = { uid: decoded.uid };
        } catch (e) {
            return res.status(401).json({ message: 'No autorizado: token invÃ¡lido.' });
        }

        const { placeid } = req.query;
        const apiKey = process.env.GOOGLE_PLACES_API_KEY;

        if (!placeid) {
            return res.status(400).json({ message: "El ID del lugar (placeid) es requerido." });
        }
        if (false) {
            return res.status(400).json({ message: "El ID del usuario (userId) es requerido para asignar la autorÃ­a." });
        }
        if (!apiKey) {
            logger.error("getPlaceDetailsFromGoogle: GOOGLE_PLACES_API_KEY no se encontrÃ³ en las variables de entorno.");
            return res.status(500).json({ message: "Error de configuraciÃ³n del servidor (API Key no encontrada)." });
        }

        // AÃ±adimos campos de accesibilidad y opciones de servicio (si el endpoint legacy los soporta, serÃ¡n devueltos)
        // Usamos solo campos soportados por el endpoint legacy de Place Details
        const fields = "name,place_id,formatted_address,geometry,url,photos,price_level,website,international_phone_number,address_components,rating,user_ratings_total,types";
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeid}&key=${apiKey}&fields=${fields}&language=es`;

        try {
            const placeDetailsResponse = await fetch(url);
            const placeDetailsData = await placeDetailsResponse.json();

            if (placeDetailsData.status === "OK") {
                const result = placeDetailsData.result;
                const placeRef = db.collection('places').doc(result.place_id);

                // 2. COMPROBAMOS SI EL DOCUMENTO YA EXISTE
                const docSnapshot = await placeRef.get();

                // ... (lÃ³gica para procesar la respuesta de Google, igual que antes)
                let city = '', region = '', country = '', postalCode = '', province = '';
                if (result.address_components) {
                    for (const component of result.address_components) {
                        if (component.types.includes('locality')) city = component.long_name;
                        if (component.types.includes('administrative_area_level_1')) region = component.long_name;
                        if (component.types.includes('country')) country = component.long_name;
                        if (component.types.includes('postal_code')) postalCode = component.long_name;
                    }
                }
                if (postalCode) {
                    const provinceCode = postalCode.substring(0, 2);
                    province = provinceMap[provinceCode] || '';
                }

                const placeDoc = {
                    name: result.name,
                    name_normalized: result.name.toLowerCase(),
                    googlePlaceId: result.place_id,
                    address: result.formatted_address,
                    address_normalized: result.formatted_address ? result.formatted_address.toLowerCase() : '',
                    coordinates: { latitude: result.geometry.location.lat, longitude: result.geometry.location.lng },
                    location: { latitude: result.geometry.location.lat, longitude: result.geometry.location.lng },
                    city: city, 
                    region: region, 
                    province: province, 
                    country: country, 
                    postalCode: postalCode,
                    googleMapsUrl: result.url, 
                    website: result.website || null, 
                    phone: result.international_phone_number || null,
                    priceLevel: result.price_level !== undefined ? result.price_level : null,
                    googleRating: result.rating || 0, googleUserRatingsTotal: result.user_ratings_total || 0,
                    types: result.types || [],
                    mainImageUrl: (result.photos && result.photos.length > 0) ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${result.photos[0].photo_reference}&key=${apiKey}`: null,
                    // Nuevos campos estructurados
                    // Estos campos pueden rellenarse vÃ­a otras fuentes o con endpoints v1 en el futuro
                    accessibility: result.accessibilityOptions ? {
                        wheelchairAccessibleEntrance: result.accessibilityOptions.wheelchairAccessibleEntrance ?? null,
                        wheelchairAccessibleSeating: result.accessibilityOptions.wheelchairAccessibleSeating ?? null,
                        wheelchairAccessibleParking: result.accessibilityOptions.wheelchairAccessibleParking ?? null,
                        wheelchairAccessibleRestroom: result.accessibilityOptions.wheelchairAccessibleRestroom ?? null,
                        hearingLoop: result.accessibilityOptions.hearingLoop ?? null,
                    } : (docSnapshot.exists ? (docSnapshot.data().accessibility || null) : null),
                    serviceOptions: (docSnapshot.exists ? (docSnapshot.data().serviceOptions || null) : null),
                    updatedAt: FieldValue.serverTimestamp(), lastGoogleSync: FieldValue.serverTimestamp(),
                };

                // 3. SI NO EXISTE, AÃ‘ADIMOS LOS CAMPOS DE CREACIÃ“N
                if (!docSnapshot.exists) {
                    placeDoc.createdByUserId = req.user.uid;
                    placeDoc.createdAt = FieldValue.serverTimestamp();
                    placeDoc.followersCount = 0; // Inicializar campos especÃ­ficos de la app
                    placeDoc.reviewsCount = 0;
                    placeDoc.averageRating = null; // null hasta que existan reseÃ±as
                }
                
                // 4. Guardamos los datos. `merge: true` sigue siendo Ãºtil para no borrar otros campos.
                await placeRef.set(placeDoc, { merge: true });

                // 5. DEVOLVEMOS EL DOCUMENTO LIMPIO Y GUARDADO, NO EL RESULTADO BRUTO DE GOOGLE
                // AÃ±adimos el ID al documento que devolvemos, ya que .data() no lo incluye.
                const finalDoc = { id: placeRef.id, ...placeDoc };
                res.status(200).json(finalDoc);
            } else {
                 logger.error("Error desde Google Places API", {status: placeDetailsData.status, error_message: placeDetailsData.error_message});
                 res.status(500).json({ message: `Error de la API de Google Places: ${placeDetailsData.status}`, details: placeDetailsData.error_message });
            }
        } catch (error) {
            logger.error("Error al contactar o procesar Google Places API", error);
            res.status(500).json({ message: "Error interno al buscar detalles del lugar.", error: error.message });
        }
    });
});

// --- FUNCIÃ“N CALLABLE: deleteListAndContent ---
const deleteOrOrphanList = onCall({cors: true}, async (request) => {
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

  logger.info(`deleteOrOrphanList: Usuario ${callerUserId} solicitando acciÃ³n sobre lista ${listId}.`);
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

      // --- INICIO DE LA NUEVA LÃ“GICA ---

      // Buscar si existen reseÃ±as de OTROS usuarios en esta lista.
      const otherUserReviewsSnapshot = await reviewsRef.where('userId', '!=', callerUserId).limit(1).get();

      // Escenario 1: NO hay reseÃ±as de otros usuarios. Procedemos a borrar todo.
      if (otherUserReviewsSnapshot.empty) {
          logger.info(`La lista ${listId} no tiene reseÃ±as de otros usuarios. Procediendo con la eliminaciÃ³n completa.`);
          
          // Borrar todas las reseÃ±as (que sabemos que son solo del propietario).
          const allReviewsSnapshot = await reviewsRef.get();
          if (!allReviewsSnapshot.empty) {
              const deleteBatch = db.batch();
              allReviewsSnapshot.docs.forEach(doc => deleteBatch.delete(doc.ref));
              await deleteBatch.commit();
              logger.info(`Eliminadas ${allReviewsSnapshot.size} reseÃ±as del propietario de la lista ${listId}.`);
          }
          
          // Borrar la lista en sÃ­.
          await listRef.delete();
          logger.info(`Lista ${listId} eliminada exitosamente por ${callerUserId}.`);
          
          return { success: true, message: 'La lista y todas tus reseÃ±as han sido eliminadas.' };
      
      // Escenario 2: SÃ hay reseÃ±as de otros. Procedemos a desvincular/archivar.
      } else {
          logger.info(`La lista ${listId} tiene reseÃ±as de otros usuarios. Procediendo a desvincular al propietario ${callerUserId}.`);
          
          const ownerReviewsSnapshot = await reviewsRef.where('userId', '==', callerUserId).get();

          // Borrar solo las reseÃ±as del propietario original.
          if (!ownerReviewsSnapshot.empty) {
              const deleteOwnerReviewsBatch = db.batch();
              ownerReviewsSnapshot.docs.forEach(doc => deleteOwnerReviewsBatch.delete(doc.ref));
              await deleteOwnerReviewsBatch.commit();
              logger.info(`Eliminadas ${ownerReviewsSnapshot.size} reseÃ±as del propietario de la lista ${listId} para archivarla.`);
          }

          // Actualizar la lista para "orfanarla".
          await listRef.update({
              userId: null, // Desvinculamos al usuario.
              originalUserId: callerUserId, // Guardamos un registro de quiÃ©n la creÃ³.
              name: `[Archivada] ${listData.name}`, // Cambiamos el nombre para que sea visible su estado.
              updatedAt: FieldValue.serverTimestamp()
          });

          logger.info(`Lista ${listId} desvinculada del usuario ${callerUserId} y archivada.`);
          
          return { success: true, message: 'Te has desvinculado de la lista. Tus reseÃ±as han sido eliminadas, pero la lista permanece activa para los demÃ¡s usuarios.' };
      }
      // --- FIN DE LA NUEVA LÃ“GICA ---

  } catch (error) {
      logger.error(`Error en deleteOrOrphanList para lista ${listId} y usuario ${callerUserId}:`, error);
      if (error.code) { // Si ya es un HttpsError, lo relanzamos.
          throw error;
      }
      throw new HttpsError('internal', 'OcurriÃ³ un error inesperado.');
  }
});

// --- FUNCIÃ“N CALLABLE: createList ---
const createList = onCall(async (data, context) => {
    if (!context.auth) {
        logger.warn("createList: Intento de llamada no autenticado.", {structuredData: true});
        throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado para crear una lista.');
    }

    const userId = context.auth.uid;
    const { listName, criteriaDefinition, availableTags, isPublic, categoryId } = data;

    if (!listName || typeof listName !== 'string' || listName.trim() === "") {
        logger.warn(`createList: listName no proporcionado o invÃ¡lido por el usuario ${userId}.`, {listNameProvided: listName, structuredData: true});
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
            logger.warn(`createList: Usuario ${userId} intentÃ³ crear lista duplicada: "${listName.trim()}"`, {structuredData: true});
            throw new HttpsError('already-exists', 'Ya tienes una lista con ese nombre.');
        }

        // Si no existe, proceder a crear la lista
        const newListData = {
            name: listName.trim(),
            userId: userId,
            criteriaDefinition: criteriaDefinition || {},
            availableTags: Array.isArray(availableTags) ? availableTags.map(tag => String(tag).trim()).filter(tag => tag) : [],
            isPublic: typeof isPublic === 'boolean' ? isPublic : true, // Por defecto pÃºblica
            categoryId: categoryId || "defaultCategory",
            reviewCount: 0,
            reactions: {},
            commentsCount: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const newListRef = await listsRef.add(newListData);
        logger.info(`createList: Lista "${listName.trim()}" creada con ID ${newListRef.id} por el usuario ${userId}`, {structuredData: true});
        return { listId: newListRef.id, message: 'Lista creada con Ã©xito' };

    } catch (error) {
        logger.error(`Error en createList para el usuario ${userId} al intentar crear lista "${listName}":`, error, {structuredData: true});
        if (error.code && typeof error.code === 'string' && error.message) { // Re-lanzar HttpsError
            throw error;
        }
        throw new HttpsError('internal', 'OcurriÃ³ un error al crear la lista.', error.message);
    }
});


// --- NUEVA FUNCIÃ“N CALLABLE: createListWithValidation ---

const createListWithValidation = onCall(async (request) => {
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
      
      return { listId: newListRef.id, message: 'Â¡Lista creada con Ã©xito!' };

  } catch (error) {
      logger.error(`Error en createListWithValidation para usuario ${userId}, lista "${listName}":`, error);
      if (error.code) {
           throw error;
      }
      throw new HttpsError('internal', 'OcurriÃ³ un error al crear la lista.');
  }
});

// --- NUEVA FUNCIÃ“N CALLABLE: createListWithValidation ---
const updateListWithValidation = onCall(async (request) => {
  const data = request.data;
  const contextAuth = request.auth;

  // 1. Verificar autenticaciÃ³n
  if (!contextAuth) {
      throw new HttpsError('unauthenticated', 'Debes estar autenticado para actualizar una lista.');
  }

  const { listId, data: listData } = data;

  if (!listId) {
      throw new HttpsError('invalid-argument', 'El ID de la lista es obligatorio.');
  }
  if (!listData.name || typeof listData.name !== 'string' || listData.name.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'El nombre de la lista no puede estar vacÃ­o.');
  }
  
  const userId = contextAuth.uid;
  const listRef = db.collection('lists').doc(listId);
  
  try {
      const doc = await listRef.get();

      if (!doc.exists) {
          throw new HttpsError('not-found', 'La lista que intentas editar no existe.');
      }

      // 2. Â¡LA VERIFICACIÃ“N DE SEGURIDAD CLAVE!
      // Nos aseguramos de que solo el dueÃ±o pueda editar.
      if (doc.data().userId !== userId) {
          throw new HttpsError('permission-denied', 'No tienes permiso para editar esta lista.');
      }
      
      // 3. Preparar los datos para la actualizaciÃ³n
      const updatePayload = {
          ...listData, // Usamos los datos que nos envÃ­a el cliente
          updatedAt: FieldValue.serverTimestamp(),
      };

      // 4. Actualizar la lista
      await listRef.update(updatePayload);

      return {
          status: 'success',
          message: 'Â¡Lista actualizada con Ã©xito!',
      };

  } catch (error) {
      logger.error(`Error en updateListWithValidation para lista ${listId} por usuario ${userId}:`, error);
      // Si el error ya es un HttpsError, lo relanzamos. Si no, devolvemos uno genÃ©rico.
      if (error.code) {
          throw error;
      }
      throw new HttpsError('internal', 'OcurriÃ³ un error al actualizar la lista.');
  }
});

// NUEVA FUNCIÃ“N: reverseGeocode
const reverseGeocode = onRequest(async (req, res) => {
  cors(req, res, async () => {
    const { lat, lon } = req.query;
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;

    if (!lat || !lon) {
      logger.warn("reverseGeocode: Latitud (lat) y longitud (lon) son requeridas.", {query: req.query, structuredData: true});
      return res.status(400).json({ message: "Latitud y longitud son requeridas." });
    }
    if (!apiKey) {
      logger.error("reverseGeocode: GOOGLE_PLACES_API_KEY no estÃ¡ disponible como variable de entorno del proceso.", {structuredData: true});
      return res.status(500).json({ message: "Error de configuraciÃ³n del servidor (API Key no encontrada)." });
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
        logger.warn("reverseGeocode: Google Geocoding API devolviÃ³ ZERO_RESULTS para:", {lat, lon, structuredData: true} );
        res.status(404).json({ message: "No se encontrÃ³ direcciÃ³n para las coordenadas proporcionadas." });
      } else {
        logger.error("reverseGeocode: Error desde Google Geocoding API", {status: geocodeData.status, error_message: geocodeData.error_message, structuredData: true});
        res.status(500).json({ message: `Error de la API de GeocodificaciÃ³n de Google: ${geocodeData.status}`, details: geocodeData.error_message });
      }
    } catch (error) {
      logger.error("reverseGeocode: Error al contactar Google Geocoding API", error, {structuredData: true});
      res.status(500).json({ message: "Error interno al obtener la direcciÃ³n.", error: error.message });
    }
  });
});

// ===================================================================
// === NUEVAS FUNCIONES PARA CONTADORES Y DATOS AGREGADOS          ===
// ===================================================================

/**
 * Trigger que se dispara cuando una reseÃ±a es creada o eliminada.
 * Actualiza los contadores de reseÃ±as en los documentos de usuario, lugar y lista.
 */
const updateAggregatesOnReviewChange = onDocumentWritten("lists/{listId}/reviews/{reviewId}", async (event) => {
  const listId = event.params.listId;
  const reviewId = event.params.reviewId;

  // Caso 1: CREACIÃ“N de reseÃ±a
  if (!event.data.before.exists && event.data.after.exists) {
    const newData = event.data.after.data();
    const {userId, placeId} = newData;

    if (!userId) {
      logger.warn(`La reseÃ±a ${reviewId} no tiene userId. No se puede actualizar contador de usuario.`);
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
      logger.info(`Contadores actualizados exitosamente para nueva reseÃ±a ${reviewId}.`);
    } catch (error) {
      logger.error("Error al actualizar contadores para nueva reseÃ±a:", error);
    }
    return null;
  }

  // Caso 2: ELIMINACIÃ“N de reseÃ±a
  if (event.data.before.exists && !event.data.after.exists) {
    const oldData = event.data.before.data();
    const {userId, placeId} = oldData;

    if (!userId) {
      logger.warn(`La reseÃ±a eliminada ${reviewId} no tenÃ­a userId. No se puede actualizar contador de usuario.`);
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
      logger.info(`Contadores actualizados exitosamente para reseÃ±a eliminada ${reviewId}.`);
    } catch (error) {
      logger.error("Error al actualizar contadores para reseÃ±a eliminada:", error);
    }
    return null;
  }

  // Caso 3: ACTUALIZACIÃ“N de reseÃ±a
  if (event.data.before.exists && event.data.after.exists) {
    const oldData = event.data.before.data();
    const newData = event.data.after.data();

    const oldPlaceId = oldData.placeId;
    const newPlaceId = newData.placeId;

    // Solo proceder si cambiÃ³ el placeId
    if (oldPlaceId !== newPlaceId) {
      logger.info(`ReseÃ±a ${reviewId} cambiÃ³ de lugar: ${oldPlaceId || 'null'} -> ${newPlaceId || 'null'}`);

      const batch = db.batch();

      // Decrementar contador del lugar anterior (si existÃ­a)
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
        logger.info(`Contadores de lugares actualizados exitosamente para reseÃ±a ${reviewId}.`);
      } catch (error) {
        logger.error("Error al actualizar contadores de lugares:", error);
      }
    } else {
      logger.info(`ReseÃ±a ${reviewId} actualizada sin cambio de lugar. No se modifican contadores.`);
    }
    return null;
  }

  logger.warn(`Caso no manejado en updateAggregatesOnReviewChange para reseÃ±a ${reviewId}`);
  return null;
});


/**
* Trigger que se dispara cuando una lista es creada, actualizada o eliminada.
* Actualiza los contadores de listas pÃºblicas y privadas en el documento del usuario.
*/
const updateUserStatsOnListChange = onDocumentWritten("lists/{listId}", async (event) => {
  let userRef;
  let updates = {};

  // Caso 1: Se crea una lista NUEVA
  if (!event.data.before.exists && event.data.after.exists) {
      const listData = event.data.after.data();
      if (!listData.userId) return null; // Lista "huÃ©rfana", no hacer nada
      userRef = db.collection('users').doc(listData.userId);
      const fieldToIncrement = listData.isPublic ? 'publicListsCount' : 'privateListsCount';
      updates[fieldToIncrement] = FieldValue.increment(1);
      logger.info(`Nueva lista creada por ${listData.userId}. Incrementando ${fieldToIncrement}.`);
  }
  // Caso 2: Se elimina una lista
  else if (event.data.before.exists && !event.data.after.exists) {
      const listData = event.data.before.data();
      if (!listData.userId) return null; // Lista "huÃ©rfana" eliminada, no hay usuario que actualizar
      userRef = db.collection('users').doc(listData.userId);
      const fieldToDecrement = listData.isPublic ? 'publicListsCount' : 'privateListsCount';
      updates[fieldToDecrement] = FieldValue.increment(-1);
      logger.info(`Lista eliminada por ${listData.userId}. Decrementando ${fieldToDecrement}.`);
  }
  // Caso 3: Se actualiza una lista (nos interesa si cambia la privacidad o el dueÃ±o)
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
* (Asume que los comentarios estÃ¡n en lists/{listId}/comments/{commentId})
*/
const updateAggregatesOnCommentChange = onDocumentWritten("lists/{listId}/comments/{commentId}", async (event) => {
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
  logger.info(`Contador 'commentsCount' en lista ${listId} se actualizarÃ¡ en ${change}.`);
  
  // Actualizar contador del USUARIO (si tiene userId)
  if (userId) {
      const userRef = db.collection('users').doc(userId);
      batch.update(userRef, { commentsCount: FieldValue.increment(change) });
      logger.info(`Contador 'commentsCount' en usuario ${userId} se actualizarÃ¡ en ${change}.`);
  }
  
  try {
      await batch.commit();
      logger.info("Contadores de comentarios actualizados.");
  } catch(error) {
      logger.error("Error actualizando contadores de comentarios:", error);
  }
});


const toggleFollowUser = onCall(async (request) => {
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
            // --- LÃ³gica para DEJAR DE SEGUIR ---
            batch.delete(followingRef);
            batch.delete(followerRef);
            batch.update(currentUserRef, { followingCount: FieldValue.increment(-1) });
            batch.update(userToFollowRef, { followersCount: FieldValue.increment(-1) });
            
            await batch.commit();
            logger.info(`Usuario ${currentUserId} ha dejado de seguir a ${userIdToFollow}.`);
            return { status: 'unfollowed', message: 'Has dejado de seguir a este usuario.' };
        } else {
            // --- LÃ³gica para SEGUIR ---
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
        throw new HttpsError('internal', 'OcurriÃ³ un error al procesar la solicitud.');
    }
});

// En functions/index.js, reemplaza la funciÃ³n getPlacesForList entera por esta:

const getPlacesForList = onCall({cors: true}, async (request) => {
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

        // Agrupamos reseÃ±as por placeId para calcular la media
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

        const placeDocs = await getPlaceDocsByIds(placeIds);

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
                    // Â¡AÃ‘ADIMOS LA PUNTUACIÃ“N MEDIA!
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

const getPlaceDetails = onCall(async (request) => {
  // --- Usamos 'request' como parÃ¡metro, al estilo V2 ---
  logger.info("FunciÃ³n getPlaceDetails invocada. Payload recibido:", request.data);

  // Obtenemos los datos de request.data
  const placeId = request.data.placeId;

  if (!placeId) {
      logger.error("Error en getPlaceDetails: placeId no encontrado en el payload.", {
          payloadRecibido: request.data,
          auth: request.auth // La autenticaciÃ³n ahora es request.auth
      });
      throw new HttpsError('invalid-argument', 'El ID del lugar es requerido.');
  }

  try {
      // 1. Obtener datos bÃ¡sicos del lugar
      const placeDoc = await db.collection('places').doc(placeId).get();
      if (!placeDoc.exists) {
          throw new HttpsError('not-found', 'El lugar no fue encontrado.');
      }
      const placeData = { id: placeDoc.id, ...placeDoc.data() };

      // 2. Obtener todas las reseÃ±as asociadas a este lugar
      // *** CORREGIDO: Usamos 'updatedAt' para ordenar ***
      const reviewsSnapshot = await db.collectionGroup('reviews').where('placeId', '==', placeId).orderBy('updatedAt', 'desc').get();
      const allReviews = reviewsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // 3. Agrupar reseÃ±as por itemName para la pestaÃ±a "Grupos"
      const groupedByItem = {};
      allReviews.forEach(review => {
          const itemName = review.itemName || "General";
          if (!groupedByItem[itemName]) {
              groupedByItem[itemName] = {
                  itemName: itemName,
                  establishmentName: placeData.name,
                  placeId: placeId,
                  listId: review.listId, // Ojo: esto tomarÃ¡ el listId de la Ãºltima reseÃ±a del grupo
                  itemCount: 0,
                  totalGeneralScore: 0,
                  avgScores: {},
                  criteriaTotals: {},
                  criteriaCounts: {},
                  allTags: [],
                  thumbnailUrl: review.photoUrl // Tomamos la foto de la primera reseÃ±a que encontramos
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

const getGroupsForPlace = onRequest(async (req, res) => {
  // *** LA SOLUCIÃ“N CLAVE: Envolvemos todo en cors ***
  cors(req, res, async () => {
      try {
          // En funciones onRequest, los datos vienen en req.body.data
          const { placeId } = req.body.data;

          if (!placeId) {
              logger.error("getGroupsForPlace: placeId no fue proporcionado en el cuerpo de la peticiÃ³n.");
              // Devolvemos un error usando res.status()
              return res.status(400).json({ error: "La funciÃ³n debe ser llamada con un 'placeId'." });
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

const updatePlaceAggregates = onDocumentWritten("reviews/{reviewId}", async (event) => {
  // Hemos usado un collectionGroup, por lo que el path es "reviews/{reviewId}"
  // Si tus reseÃ±as estuvieran en "lists/{listId}/reviews/{reviewId}", el path serÃ­a ese.
  // Â¡AsegÃºrate de que el path coincide con tu estructura!

  let placeId = null;
  let needsRecalculation = false;

  // Se crea o borra una reseÃ±a, o cambia su puntuaciÃ³n
  if (event.data.before.exists || event.data.after.exists) {
      const beforeData = event.data.before.data() || {};
      const afterData = event.data.after.data() || {};
      
      // Si se crea/borra o si la puntuaciÃ³n general cambia, recalculamos.
      if (beforeData.overallRating !== afterData.overallRating) {
          needsRecalculation = true;
      }
      placeId = afterData.placeId || beforeData.placeId;
  }

  if (!needsRecalculation || !placeId) {
      logger.info(`No se requiere recÃ¡lculo para la reseÃ±a. PlaceId: ${placeId}, NeedsRecalculation: ${needsRecalculation}`);
      return null;
  }

  logger.info(`Recalculando agregados para el lugar: ${placeId}`);
  
  // 1. Obtenemos TODAS las reseÃ±as para ese lugar
  const reviewsSnapshot = await db.collectionGroup('reviews').where('placeId', '==', placeId).get();
  
  const reviews = reviewsSnapshot.docs.map(doc => doc.data());
  
  if (reviews.length === 0) {
      // Si no quedan reseÃ±as, reseteamos los contadores
      await db.collection('places').doc(placeId).update({
          reviewsCount: 0,
          averageRating: null // O 0, como prefieras
      });
      logger.info(`No quedan reseÃ±as para ${placeId}. Contadores reseteados.`);
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

  logger.info(`Agregados para ${placeId} actualizados: ${reviewsCount} reseÃ±as, valoraciÃ³n media ${averageRating.toFixed(2)}.`);
  return null;
});

/**
 * Trigger que se dispara cuando una reseÃ±a cambia en CUALQUIER lista,
 * para recalcular la valoraciÃ³n media y el contador de reseÃ±as del LUGAR al que pertenece.
 */
const updatePlaceAggregatesOnReviewChange = onDocumentWritten("lists/{listId}/reviews/{reviewId}", async (event) => {
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();

  const placeIdToDecrement = beforeData?.placeId;
  const placeIdToIncrement = afterData?.placeId;

  // Si el placeId no ha cambiado (solo se ha editado el texto, por ejemplo),
  // pero la puntuaciÃ³n sÃ­, recalculamos para ese Ãºnico lugar.
  if (placeIdToDecrement && placeIdToDecrement === placeIdToIncrement) {
      if (beforeData.overallRating !== afterData.overallRating) {
          await recalculateAggregatesForPlace(placeIdToIncrement);
      } else {
           logger.info(`La reseÃ±a ${event.params.reviewId} se actualizÃ³ sin cambiar la puntuaciÃ³n. No se requiere recÃ¡lculo.`);
      }
  } else {
      // Si el placeId ha cambiado, se ha creado o se ha borrado una reseÃ±a,
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

// --- FunciÃ³n auxiliar para mantener el cÃ³digo limpio y reutilizable ---
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
      logger.info(`Agregados para ${placeId} actualizados: ${reviewsCount} reseÃ±as, valoraciÃ³n media ${averageRating}.`);
  } catch (error) {
      logger.error(`Error al actualizar el documento del lugar ${placeId}:`, error);
  }
};

const adminUpdateAllPlaces = onCall(async (request) => {
    const contextAuth = request.auth;
    if (!contextAuth) {
        throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
    }

    // Admin check
    try {
        const userProfileDoc = await db.collection('users').doc(contextAuth.uid).get();
        if (!userProfileDoc.exists || !Array.isArray(userProfileDoc.data().userType) || !userProfileDoc.data().userType.includes('jefe')) {
            throw new HttpsError('permission-denied', 'No tienes permiso para ejecutar esta operaciÃ³n.');
        }
    } catch (error) {
        logger.error("adminUpdateAllPlaces: Error al verificar permisos de admin", error);
        throw new HttpsError('internal', 'Error al verificar permisos.');
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
        logger.error("adminUpdateAllPlaces: GOOGLE_PLACES_API_KEY no estÃ¡ disponible.");
        throw new HttpsError('internal', 'Error de configuraciÃ³n del servidor (Places API Key no encontrada).');
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

            // Campos soportados por Place Details legacy
            const fields = "name,formatted_address,geometry,url,photos,price_level,website,international_phone_number,vicinity,address_components,rating,user_ratings_total";
            const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${apiKey}&fields=${fields}&language=es`;

            try {
                const response = await fetch(url);
                const details = await response.json();

                if (details.status === "OK" && details.result) {
                    const result = details.result;
                    const updateData = {
                        name: result.name,
                        formatted_address: result.formatted_address,
                        address: result.formatted_address,
                        address_normalized: result.formatted_address ? result.formatted_address.toLowerCase() : (placeData.address_normalized || null),
                        'location.latitude': result.geometry?.location?.lat,
                        'location.longitude': result.geometry?.location?.lng,
                        googleMapsUrl: result.url,
                        mainImageUrl: result.photos && result.photos.length > 0 ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${result.photos[0].photo_reference}&key=${apiKey}` : (placeData.mainImageUrl || null),
                        priceLevel: result.price_level,
                        website: result.website,
                        phone: result.international_phone_number,
                        vicinity: result.vicinity,
                        googleRating: typeof result.rating === 'number' ? result.rating : (placeData.googleRating ?? null),
                        googleUserRatingsTotal: typeof result.user_ratings_total === 'number' ? result.user_ratings_total : (placeData.googleUserRatingsTotal ?? null),
                        // Si en el futuro usamos Places v1, podremos mapear accessibilityOptions/serviceOptions.
                        // De momento, preservamos lo existente en la BD.
                        accessibility: placeData.accessibility || null,
                        serviceOptions: placeData.serviceOptions || null,
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
        throw new HttpsError('internal', 'Un error ocurriÃ³ durante la actualizaciÃ³n masiva.');
    }
});

const adminAuditStatistics = onCall(async (request) => {
    const contextAuth = request.auth;
    if (!contextAuth) {
        throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
    }

    const startTime = Date.now();
    const summary = {
        checked: { places: 0, users: 0, lists: 0 },
        updated: { places: 0, users: 0, lists: 0, groupedItems: 0 },
        errors: []
    };
    const details = {
        places: [],
        users: [],
        lists: [],
        groupedItems: []
    };

    try {
        const userProfileDoc = await db.collection('users').doc(contextAuth.uid).get();
        if (!userProfileDoc.exists || !Array.isArray(userProfileDoc.data().userType) || !userProfileDoc.data().userType.includes('jefe')) {
            throw new HttpsError('permission-denied', 'No tienes permiso para ejecutar esta operación.');
        }
    } catch (error) {
        logger.error('adminAuditStatistics: Error al verificar permisos de admin', error);
        throw new HttpsError('internal', 'Error al verificar permisos.');
    }

    const safeNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

    // --- AUDITAR LUGARES ---
    try {
        const placesSnap = await db.collection('places').get();
        summary.checked.places = placesSnap.size;

        for (const doc of placesSnap.docs) {
            const data = doc.data() || {};
            const updates = {};
            const diffs = [];

            try {
                const [reviewsCountSnap, followersCountSnap] = await Promise.all([
                    db.collectionGroup('reviews').where('placeId', '==', doc.id).count().get(),
                    doc.ref.collection('followers').count().get(),
                ]);

                const actualReviewCount = safeNumber(reviewsCountSnap.data().count);
                const actualFollowersCount = safeNumber(followersCountSnap.data().count);

                const storedReviewCount = safeNumber(data.reviewsCount);
                if (storedReviewCount !== actualReviewCount) {
                    updates.reviewsCount = actualReviewCount;
                    diffs.push({ field: 'reviewsCount', previous: storedReviewCount, value: actualReviewCount });
                }

                const storedFollowersCount = safeNumber(data.followersCount);
                if (storedFollowersCount !== actualFollowersCount) {
                    updates.followersCount = actualFollowersCount;
                    diffs.push({ field: 'followersCount', previous: storedFollowersCount, value: actualFollowersCount });
                }

                if (diffs.length > 0) {
                    await doc.ref.update(updates);
                    summary.updated.places += 1;
                    details.places.push({
                        id: doc.id,
                        name: data.name || null,
                        diffs
                    });
                }
            } catch (error) {
                logger.error(`adminAuditStatistics: Error auditando lugar ${doc.id}`, error);
                summary.errors.push({ type: 'place', id: doc.id, message: error.message });
            }
        }
    } catch (error) {
        logger.error('adminAuditStatistics: Error obteniendo lugares', error);
        summary.errors.push({ type: 'places', id: null, message: error.message });
    }

    // --- AUDITAR LISTAS ---
    try {
        const listsSnap = await db.collection('lists').get();
        summary.checked.lists = listsSnap.size;

        for (const doc of listsSnap.docs) {
            const data = doc.data() || {};
            const updates = {};
            const diffs = [];
            let groupedItemsDiffAdded = false;

            try {
                const [followersSnap, commentsSnap] = await Promise.all([
                    doc.ref.collection('followers').count().get(),
                    doc.ref.collection('comments').count().get().catch(() => ({ data: () => ({ count: 0 }) })),
                ]);

                // Contadores basados en reseñas y grupos
                let reviewCount = 0;
                let groupedItemsCount = 0;
                try {
                    const aggregation = await buildGroupedItemsForList(doc.id);
                    reviewCount = Array.isArray(aggregation.reviews) ? aggregation.reviews.length : 0;
                    groupedItemsCount = Array.isArray(aggregation.groupedReviews) ? aggregation.groupedReviews.length : 0;
                } catch (error) {
                    logger.error(`adminAuditStatistics: Error generando grupos para lista ${doc.id}`, error);
                    summary.errors.push({ type: 'list-grouped', id: doc.id, message: error.message });
                }

                // Contador de comentarios (incluye foro)
                let forumMessagesCount = 0;
                try {
                    const forumCountSnap = await db.collection('listForums').doc(doc.id).collection('messages').count().get();
                    forumMessagesCount = safeNumber(forumCountSnap.data().count);
                } catch (error) {
                    logger.error(`adminAuditStatistics: Error contando mensajes de foro para lista ${doc.id}`, error);
                    summary.errors.push({ type: 'list-forum', id: doc.id, message: error.message });
                }

                const commentsLegacyCount = safeNumber(commentsSnap.data().count);
                const totalCommentsCount = commentsLegacyCount + forumMessagesCount;

                const actualFollowersCount = safeNumber(followersSnap.data().count);

                const storedReviewCount = safeNumber(data.reviewCount);
                if (storedReviewCount !== reviewCount) {
                    updates.reviewCount = reviewCount;
                    diffs.push({ field: 'reviewCount', previous: storedReviewCount, value: reviewCount });
                }

                const storedFollowersCount = safeNumber(data.followersCount);
                if (storedFollowersCount !== actualFollowersCount) {
                    updates.followersCount = actualFollowersCount;
                    diffs.push({ field: 'followersCount', previous: storedFollowersCount, value: actualFollowersCount });
                }

                const storedCommentsCount = safeNumber(data.commentsCount);
                if (storedCommentsCount !== totalCommentsCount) {
                    updates.commentsCount = totalCommentsCount;
                    diffs.push({ field: 'commentsCount', previous: storedCommentsCount, value: totalCommentsCount });
                }

                const storedGroupedItemsCount = safeNumber(data.groupedItemsCount);
                if (Number.isFinite(groupedItemsCount) && storedGroupedItemsCount !== groupedItemsCount) {
                    updates.groupedItemsCount = groupedItemsCount;
                    diffs.push({ field: 'groupedItemsCount', previous: storedGroupedItemsCount, value: groupedItemsCount });
                    groupedItemsDiffAdded = true;
                }

                if (diffs.length > 0) {
                    await doc.ref.update(updates);
                    summary.updated.lists += 1;
                    if (groupedItemsDiffAdded) {
                        summary.updated.groupedItems += 1;
                        details.groupedItems.push({
                            listId: doc.id,
                            name: data.name || null,
                            newValue: updates.groupedItemsCount,
                            previousValue: storedGroupedItemsCount
                        });
                    }
                    details.lists.push({
                        id: doc.id,
                        name: data.name || null,
                        diffs
                    });
                }
            } catch (error) {
                logger.error(`adminAuditStatistics: Error auditando lista ${doc.id}`, error);
                summary.errors.push({ type: 'list', id: doc.id, message: error.message });
            }
        }
    } catch (error) {
        logger.error('adminAuditStatistics: Error obteniendo listas', error);
        summary.errors.push({ type: 'lists', id: null, message: error.message });
    }

    // --- AUDITAR USUARIOS ---
    try {
        const usersSnap = await db.collection('users').get();
        summary.checked.users = usersSnap.size;

        for (const doc of usersSnap.docs) {
            const data = doc.data() || {};
            const updates = {};
            const diffs = [];

            try {
                const [reviewsCountSnap, followersSnap, followingSnap, publicListsSnap, privateListsSnap] = await Promise.all([
                    db.collectionGroup('reviews').where('userId', '==', doc.id).count().get(),
                    doc.ref.collection('followers').count().get(),
                    doc.ref.collection('following').count().get(),
                    db.collection('lists').where('userId', '==', doc.id).where('isPublic', '==', true).count().get(),
                    db.collection('lists').where('userId', '==', doc.id).where('isPublic', '==', false).count().get(),
                ]);

                const actualReviewsCount = safeNumber(reviewsCountSnap.data().count);
                const actualFollowersCount = safeNumber(followersSnap.data().count);
                const actualFollowingCount = safeNumber(followingSnap.data().count);
                const actualPublicListsCount = safeNumber(publicListsSnap.data().count);
                const actualPrivateListsCount = safeNumber(privateListsSnap.data().count);

                let commentsCount = 0;
                try {
                    const commentsSnap = await db.collectionGroup('comments').where('userId', '==', doc.id).count().get();
                    commentsCount += safeNumber(commentsSnap.data().count);
                } catch (error) {
                    logger.error(`adminAuditStatistics: Error contando comentarios clásicos para usuario ${doc.id}`, error);
                    summary.errors.push({ type: 'user-comments', id: doc.id, message: error.message });
                }
                try {
                    const forumCommentsSnap = await db.collectionGroup('messages').where('userId', '==', doc.id).count().get();
                    commentsCount += safeNumber(forumCommentsSnap.data().count);
                } catch (error) {
                    logger.error(`adminAuditStatistics: Error contando mensajes de foro para usuario ${doc.id}`, error);
                    summary.errors.push({ type: 'user-forum-comments', id: doc.id, message: error.message });
                }

                const storedReviewsCount = safeNumber(data.reviewsCount);
                if (storedReviewsCount !== actualReviewsCount) {
                    updates.reviewsCount = actualReviewsCount;
                    diffs.push({ field: 'reviewsCount', previous: storedReviewsCount, value: actualReviewsCount });
                }

                const storedFollowersCount = safeNumber(data.followersCount);
                if (storedFollowersCount !== actualFollowersCount) {
                    updates.followersCount = actualFollowersCount;
                    diffs.push({ field: 'followersCount', previous: storedFollowersCount, value: actualFollowersCount });
                }

                const storedFollowingCount = safeNumber(data.followingCount);
                if (storedFollowingCount !== actualFollowingCount) {
                    updates.followingCount = actualFollowingCount;
                    diffs.push({ field: 'followingCount', previous: storedFollowingCount, value: actualFollowingCount });
                }

                const storedPublicListsCount = safeNumber(data.publicListsCount);
                if (storedPublicListsCount !== actualPublicListsCount) {
                    updates.publicListsCount = actualPublicListsCount;
                    diffs.push({ field: 'publicListsCount', previous: storedPublicListsCount, value: actualPublicListsCount });
                }

                const storedPrivateListsCount = safeNumber(data.privateListsCount);
                if (storedPrivateListsCount !== actualPrivateListsCount) {
                    updates.privateListsCount = actualPrivateListsCount;
                    diffs.push({ field: 'privateListsCount', previous: storedPrivateListsCount, value: actualPrivateListsCount });
                }

                if (Number.isFinite(commentsCount)) {
                    const storedCommentsCount = safeNumber(data.commentsCount);
                    if (storedCommentsCount !== commentsCount) {
                        updates.commentsCount = commentsCount;
                        diffs.push({ field: 'commentsCount', previous: storedCommentsCount, value: commentsCount });
                    }
                }

                if (diffs.length > 0) {
                    await doc.ref.update(updates);
                    summary.updated.users += 1;
                    details.users.push({
                        id: doc.id,
                        name: data.displayName || data.username || null,
                        diffs
                    });
                }
            } catch (error) {
                logger.error(`adminAuditStatistics: Error auditando usuario ${doc.id}`, error);
                summary.errors.push({ type: 'user', id: doc.id, message: error.message });
            }
        }
    } catch (error) {
        logger.error('adminAuditStatistics: Error obteniendo usuarios', error);
        summary.errors.push({ type: 'users', id: null, message: error.message });
    }

    const durationMs = Date.now() - startTime;
    logger.info('adminAuditStatistics finalizado', { summary, durationMs });

    return {
        summary: {
            ...summary,
            durationMs,
            completedAt: new Date().toISOString()
        },
        details
    };
});

const adminGetCollection = onCall(async (request) => {
    const contextAuth = request.auth;
    if (!contextAuth) {
        throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
    }

    // Admin check
    try {
        const userProfileDoc = await db.collection('users').doc(contextAuth.uid).get();
        if (!userProfileDoc.exists || !Array.isArray(userProfileDoc.data().userType) || !userProfileDoc.data().userType.includes('jefe')) {
            throw new HttpsError('permission-denied', 'No tienes permiso para ejecutar esta operaciÃ³n.');
        }
    } catch (error) {
        logger.error("adminGetCollection: Error al verificar permisos de admin", error);
        throw new HttpsError('internal', 'Error al verificar permisos.');
    }

    const collectionName = request.data.collectionName;
    const allowedCollections = ['users', 'lists', 'places', 'categories', 'listForums', 'reviews'];

    if (!collectionName || !allowedCollections.includes(collectionName)) {
        throw new HttpsError('invalid-argument', 'Nombre de colecciÃ³n no vÃ¡lido o no permitido.');
    }

    try {
        const snapshot = await db.collection(collectionName).get();
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return { data: data };
    } catch (error) {
        logger.error(`Error masivo en adminGetCollection para la colecciÃ³n ${collectionName}:`, error);
        throw new HttpsError('internal', `Un error ocurriÃ³ al obtener la colecciÃ³n ${collectionName}.`);
    }
});

const adminUpdateSinglePlace = onCall({cors: true}, async (request) => {
    const contextAuth = request.auth;
    if (!contextAuth) {
        throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
    }

    // ComprobaciÃ³n de rol de administrador (Â¡importante!)
    try {
        const userProfileDoc = await db.collection('users').doc(contextAuth.uid).get();
        if (!userProfileDoc.exists || !Array.isArray(userProfileDoc.data().userType) || !userProfileDoc.data().userType.includes('jefe')) {
            throw new HttpsError('permission-denied', 'No tienes permiso para ejecutar esta operaciÃ³n.');
        }
    } catch (error) {
        logger.error("adminUpdateSinglePlace: Error al verificar permisos", error);
        throw new HttpsError('internal', 'Error al verificar permisos.');
    }

    const { documentId, googlePlaceId } = request.data;
    if (!documentId || !googlePlaceId) {
        throw new HttpsError('invalid-argument', 'Se requieren documentId y googlePlaceId.');
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
        logger.error("adminUpdateSinglePlace: GOOGLE_PLACES_API_KEY no estÃ¡ disponible.");
        throw new HttpsError('internal', 'Error de configuraciÃ³n del servidor.');
    }

    const placeRef = db.collection('places').doc(documentId);
    const fields = "name,formatted_address,geometry,url,photos,price_level,website,international_phone_number,vicinity,address_components,rating,user_ratings_total";
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${googlePlaceId}&key=${apiKey}&fields=${fields}&language=es`;

    try {
        const response = await fetch(url);
        const details = await response.json();

        if (details.status === "OK" && details.result) {
            const result = details.result;
            const updateData = {
                name: result.name,
                formatted_address: result.formatted_address,
                address: result.formatted_address,
                address_normalized: result.formatted_address ? result.formatted_address.toLowerCase() : null,
                location: { // Asegurarse de que el objeto location se actualiza correctamente
                    latitude: result.geometry?.location?.lat,
                    longitude: result.geometry?.location?.lng,
                },
                googleMapsUrl: result.url,
                mainImageUrl: result.photos && result.photos.length > 0 ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${result.photos[0].photo_reference}&key=${apiKey}` : null,
                priceLevel: result.price_level,
                website: result.website,
                phone: result.international_phone_number,
                vicinity: result.vicinity,
                googleRating: typeof result.rating === 'number' ? result.rating : null,
                googleUserRatingsTotal: typeof result.user_ratings_total === 'number' ? result.user_ratings_total : null,
                updatedAt: FieldValue.serverTimestamp()
            };
            
            // Limpiar claves con valores undefined
            Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);
            if(updateData.location.latitude === undefined) delete updateData.location;

            await placeRef.update(updateData);
            logger.info(`Lugar ${documentId} actualizado exitosamente por ${contextAuth.uid}.`);
            return { success: true, message: "Lugar actualizado." };
        } else {
            logger.error(`Error de Google API para placeId ${googlePlaceId}: ${details.status}`);
            throw new HttpsError('internal', `Error de Google API: ${details.status}`);
        }
    } catch (error) {
        logger.error(`ExcepciÃ³n actualizando el lugar ${documentId}:`, error);
        throw new HttpsError('internal', 'OcurriÃ³ una excepciÃ³n al actualizar el lugar.');
    }
});


const toggleFollowPlace = onCall({cors: true}, async (request) => {
    const contextAuth = request.auth;
    const { placeId } = request.data;

    if (!contextAuth) {
        logger.warn("toggleFollowPlace: Intento de llamada no autenticado.");
        throw new HttpsError('unauthenticated', 'El usuario debe estar autenticado para seguir un lugar.');
    }
    const userId = contextAuth.uid;

    if (!placeId) {
        logger.warn(`toggleFollowPlace: placeId no proporcionado por el usuario ${userId}.`);
        throw new HttpsError('invalid-argument', 'Se requiere el ID del lugar (placeId).');
    }

    const placeRef = db.collection('places').doc(placeId);
    const placeFollowerRef = placeRef.collection('followers').doc(userId);
    const userFollowingRef = db.collection('users').doc(userId).collection('following');
    const userFollowDoc = userFollowingRef.doc(placeId);

    try {
        const placeDoc = await placeRef.get();
        if (!placeDoc.exists) {
            throw new HttpsError('not-found', 'El lugar no existe.');
        }

        const followDoc = await userFollowDoc.get();
        const batch = db.batch();
        let status = 'unfollowed';
        let message = 'Dejaste de seguir el lugar.';

        if (followDoc.exists) {
            logger.info(`Usuario ${userId} deja de seguir el lugar ${placeId}.`);
            batch.delete(userFollowDoc);
            batch.delete(placeFollowerRef);
            batch.update(placeRef, { followersCount: FieldValue.increment(-1) });
            batch.update(db.collection('users').doc(userId), { followingCount: FieldValue.increment(-1) });
        } else {
            logger.info(`Usuario ${userId} comienza a seguir el lugar ${placeId}.`);
            batch.set(userFollowDoc, {
                placeId: placeId,
                followedAt: FieldValue.serverTimestamp()
            });
            batch.set(placeFollowerRef, { userId, followedAt: FieldValue.serverTimestamp() });
            batch.update(placeRef, { followersCount: FieldValue.increment(1) });
            batch.update(db.collection('users').doc(userId), { followingCount: FieldValue.increment(1) });
            status = 'followed';
            message = 'Ahora sigues este lugar.';
        }

        await batch.commit();
        // AÃ±adimos el estado aquÃ­.
        return { status, message };

    } catch (error) {
        logger.error(`Error en toggleFollowPlace para usuario ${userId} y lugar ${placeId}:`, error);
        if (error.code) {
            throw error;
        }
        throw new HttpsError('internal', 'OcurriÃ³ un error inesperado al seguir/dejar de seguir el lugar.', error.message);
    }
});

// --- FUNCIÃ“N CALLABLE: toggleFollowList ---
const toggleFollowList = onCall({cors: true}, async (request) => {
    const contextAuth = request.auth;
    const { listId } = request.data || {};

    if (!contextAuth) {
        logger.warn("toggleFollowList: llamada no autenticada.");
        throw new HttpsError('unauthenticated', 'Debes estar autenticado para seguir una lista.');
    }
    if (!listId) {
        logger.warn(`toggleFollowList: listId no proporcionado por el usuario ${contextAuth.uid}.`);
        throw new HttpsError('invalid-argument', 'Se requiere el ID de la lista (listId).');
    }

    const userId = contextAuth.uid;
    const listRef = db.collection('lists').doc(listId);
    const userRef = db.collection('users').doc(userId);
    const userFollowingListRef = userRef.collection('followingLists').doc(listId);
    const listFollowerRef = listRef.collection('followers').doc(userId);

    try {
        const listDoc = await listRef.get();
        if (!listDoc.exists) {
            throw new HttpsError('not-found', 'La lista no existe.');
        }
        const listData = listDoc.data();
        // Si la lista es privada y no es del usuario, no permitir seguir
        if (listData.isPublic === false && listData.userId !== userId) {
            throw new HttpsError('permission-denied', 'No puedes seguir una lista privada.');
        }

        const already = await userFollowingListRef.get();
        const batch = db.batch();
        let status = 'unfollowed';
        let message = 'Has dejado de seguir esta lista.';

        if (already.exists) {
            batch.delete(userFollowingListRef);
            batch.delete(listFollowerRef);
            batch.update(listRef, { followersCount: FieldValue.increment(-1) });
            batch.update(userRef, { followingCount: FieldValue.increment(-1) });
        } else {
            batch.set(userFollowingListRef, { listId, followedAt: FieldValue.serverTimestamp() });
            batch.set(listFollowerRef, { userId, followedAt: FieldValue.serverTimestamp() });
            batch.update(listRef, { followersCount: FieldValue.increment(1) });
            batch.update(userRef, { followingCount: FieldValue.increment(1) });
            status = 'followed';
            message = 'Ahora sigues esta lista.';
        }

        await batch.commit();
        return { status, message };
    } catch (error) {
        logger.error(`Error en toggleFollowList para usuario ${userId} y lista ${listId}:`, error);
        if (error.code) throw error;
        throw new HttpsError('internal', 'OcurriÃ³ un error al seguir/dejar de seguir la lista.', error.message);
    }
});

// --- FUNCIÃ“N CALLABLE: adminUpdateSingleListAggregates ---
const adminUpdateSingleListAggregates = onCall(async (request) => {
    const contextAuth = request.auth;
    if (!contextAuth) {
        throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
    }
    // Admin check
    try {
        const userProfileDoc = await db.collection('users').doc(contextAuth.uid).get();
        if (!userProfileDoc.exists || !Array.isArray(userProfileDoc.data().userType) || !userProfileDoc.data().userType.includes('jefe')) {
            throw new HttpsError('permission-denied', 'No tienes permiso para ejecutar esta operaciÃ³n.');
        }
    } catch (error) {
        logger.error("adminUpdateSingleListAggregates: Error al verificar permisos", error);
        throw new HttpsError('internal', 'Error al verificar permisos.');
    }

    const { listId } = request.data || {};
    if (!listId) {
        throw new HttpsError('invalid-argument', 'Se requiere listId.');
    }

    const listRef = db.collection('lists').doc(listId);
    try {
        // Contar reseÃ±as en subcolecciÃ³n de la lista
        const reviewsSnap = await listRef.collection('reviews').get();
        const reviewCount = reviewsSnap.size;
        // Contar comentarios en el foro real: listForums/{listId}/messages
        const forumMsgsSnap = await db.collection('listForums').doc(listId).collection('messages').get();
        const commentsCount = forumMsgsSnap.size;
        // Contar seguidores
        const followersSnap = await listRef.collection('followers').get();
        const followersCount = followersSnap.size;

        await listRef.update({
            reviewCount,
            commentsCount,
            followersCount,
            updatedAt: FieldValue.serverTimestamp(),
        });
        logger.info(`adminUpdateSingleListAggregates: ${listId} => r:${reviewCount} c:${commentsCount} f:${followersCount}`);
        return { success: true, reviewCount, commentsCount, followersCount };
    } catch (e) {
        logger.error(`adminUpdateSingleListAggregates error para ${listId}:`, e);
        throw new HttpsError('internal', 'Error al recalcular agregados de la lista.');
    }
});

// Mantener commentsCount sincronizado con los mensajes del foro
const updateAggregatesOnForumMessageChange = onDocumentWritten("listForums/{listId}/messages/{messageId}", async (event) => {
  // Ignorar actualizaciones que no cambian el nÃºmero de mensajes
  if (event.data.before.exists && event.data.after.exists) return null;
  const listId = event.params.listId;
  try {
    const forumMsgsSnap = await db.collection('listForums').doc(listId).collection('messages').get();
    const commentsCount = forumMsgsSnap.size;
    await db.collection('lists').doc(listId).update({ commentsCount });
    logger.info(`commentsCount actualizado para lista ${listId}: ${commentsCount}`);
  } catch (e) {
    logger.error(`Error actualizando commentsCount para lista ${listId}:`, e);
  }
  return null;
});

// En functions/modules/core.js

// FunciÃ³n auxiliar para calcular la distancia (sin cambios)




// --- AL FINAL DEL ARCHIVO, LAS EXPORTAS TODAS ---
module.exports = {
    groupedReviews,
    placesNearbyRestaurants,
    placesTextSearch,
    getPlaceDetailsFromGoogle,
    deleteOrOrphanList,
    createList,
    createListWithValidation,
    updateListWithValidation,
    reverseGeocode,
    updateAggregatesOnReviewChange,
    updateUserStatsOnListChange,
    updateAggregatesOnCommentChange,
    toggleFollowUser,
    getPlacesForList,
    getPlaceDetails,
    getGroupsForPlace,
    updatePlaceAggregates,
    updatePlaceAggregatesOnReviewChange,
    adminUpdateAllPlaces,
    adminAuditStatistics,
    adminGetCollection,
    adminUpdateSinglePlace,
    adminUpdateSingleListAggregates,
    updateAggregatesOnForumMessageChange,
    toggleFollowPlace,
    toggleFollowList,
    getDistance,
};

