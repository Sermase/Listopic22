                        'location.longitude': result.geometry?.location?.lng,
                        googleMapsUrl: result.url,
                        mainImageUrl: result.photos && result.photos.length > 0 ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${result.photos[0].photo_reference}&key=${apiKey}` : (placeData.mainImageUrl || null),
                        priceLevel: result.price_level,
                        website: result.website,
                        phone: result.international_phone_number,
                        vicinity: result.vicinity,
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
        throw new HttpsError('internal', 'Un error ocurrió durante la actualización masiva.');
    }
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

const adminUpdateSinglePlace = onCall({cors: true}, async (request) => {
    const contextAuth = request.auth;
    if (!contextAuth) {
        throw new HttpsError('unauthenticated', 'Debes estar autenticado.');
    }

    // Comprobación de rol de administrador (¡importante!)
    try {
        const userProfileDoc = await db.collection('users').doc(contextAuth.uid).get();
        if (!userProfileDoc.exists || !Array.isArray(userProfileDoc.data().userType) || !userProfileDoc.data().userType.includes('jefe')) {
            throw new HttpsError('permission-denied', 'No tienes permiso para ejecutar esta operación.');
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
        logger.error("adminUpdateSinglePlace: GOOGLE_PLACES_API_KEY no está disponible.");
        throw new HttpsError('internal', 'Error de configuración del servidor.');
    }

    const placeRef = db.collection('places').doc(documentId);
    const fields = "name,formatted_address,geometry,url,photos,price_level,website,international_phone_number,vicinity,address_components";
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${googlePlaceId}&key=${apiKey}&fields=${fields}&language=es`;

    try {
        const response = await fetch(url);
        const details = await response.json();

        if (details.status === "OK" && details.result) {
            const result = details.result;
            const updateData = {
                name: result.name,
                formatted_address: result.formatted_address,
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
        logger.error(`Excepción actualizando el lugar ${documentId}:`, error);
        throw new HttpsError('internal', 'Ocurrió una excepción al actualizar el lugar.');
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
            batch.update(placeRef, { followersCount: FieldValue.increment(-1) });
            batch.update(db.collection('users').doc(userId), { followingCount: FieldValue.increment(-1) });
        } else {
            logger.info(`Usuario ${userId} comienza a seguir el lugar ${placeId}.`);
            batch.set(userFollowDoc, {
                placeId: placeId,
                followedAt: FieldValue.serverTimestamp()
            });
            batch.update(placeRef, { followersCount: FieldValue.increment(1) });
            batch.update(db.collection('users').doc(userId), { followingCount: FieldValue.increment(1) });
            status = 'followed';
            message = 'Ahora sigues este lugar.';
        }

        await batch.commit();
        // Añadimos el estado aquí.
        return { status, message };

    } catch (error) {
        logger.error(`Error en toggleFollowPlace para usuario ${userId} y lugar ${placeId}:`, error);
        if (error.code) {
            throw error;
        }
        throw new HttpsError('internal', 'Ocurrió un error inesperado al seguir/dejar de seguir el lugar.', error.message);
    }
});

// En functions/modules/core.js

// Función auxiliar para calcular la distancia (sin cambios)




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
    adminGetCollection,
    adminUpdateSinglePlace,
    toggleFollowPlace,
    getDistance,
    
    // Asegúrate de que todas tus funciones estén listadas aquí
};
