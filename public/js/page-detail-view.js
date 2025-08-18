window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageDetailView = (() => {
    function init() {
        console.log('Initializing Detail View page logic...');

        const auth = ListopicApp.services.auth;
        const db = ListopicApp.services.db;
        const state = ListopicApp.state;
        const uiUtils = ListopicApp.uiUtils;

        const params = new URLSearchParams(window.location.search);
        const reviewId = params.get('id');
        const listIdFromURL = params.get('listId');

        // Elementos del DOM
        const detailEstablishmentNameEl = document.getElementById('detail-restaurant-name');
        const detailItemNameEl = document.getElementById('detail-dish-name');
        const reviewAuthorNameEl = document.getElementById('review-author-name');
        const reviewAuthorPhotoEl = document.getElementById('review-author-photo'); // NUEVO
        const reviewAuthorLinkEl = document.getElementById('review-author-link'); // NUEVO
        const reviewListNameEl = document.getElementById('review-list-name'); // NUEVO
        const reviewCreationDateEl = document.getElementById('review-creation-date'); // NUEVO
        const detailImageEl = document.getElementById('detail-image');
        const detailScoreValueEl = document.getElementById('detail-score-value');
        const detailRatingsListEl = document.getElementById('detail-ratings');
        // REEMPLAZADO: const detailLocationLinkEl = document.getElementById('detail-location-link');
        // REEMPLAZADO: const detailLocationTextEl = document.getElementById('detail-location-text');
        // REEMPLAZADO: const detailLocationContainerEl = document.getElementById('detail-location-container');
        const detailLocationButtonsEl = document.getElementById('detail-location-buttons'); // NUEVO
        const placeDetailLinkEl = document.getElementById('place-detail-link'); // NUEVO
        const googleMapsLinkEl = document.getElementById('google-maps-link'); // NUEVO
        const detailNoLocationDivEl = document.querySelector('.detail-no-location');
        const detailCommentContainerEl = document.getElementById('detail-comment-container');
        const detailCommentTextEl = document.getElementById('detail-comment-text');
        const detailTagsContainerEl = document.getElementById('detail-tags-container');
        const detailTagsDivEl = document.getElementById('detail-tags');
        const detailListNameHeaderEl = document.getElementById('detail-list-name'); // Ahora es un p distinto del nuevo span

        // Elementos de la nueva sección de reacciones y comentarios
        const likesCountEl = document.getElementById('likes-count');
        const dislikesCountEl = document.getElementById('dislikes-count');
        const commentsCountEl = document.getElementById('comments-count');
        const likeButtonEl = document.querySelector('.like-button');
        const dislikeButtonEl = document.querySelector('.dislike-button');
        const commentButtonEl = document.querySelector('.comments-button');
        const likeTextEl = document.getElementById('like-text');
        const dislikeTextEl = document.getElementById('dislike-text');

        // Configurar botón de Volver
        const backButton = document.querySelector('.container a.back-button');
        const editButton = document.querySelector('.edit-button');
        const deleteButton = document.querySelector('.delete-button.danger');

        if (backButton && listIdFromURL) {
            const fromPlaceIdParam = params.get('fromPlaceId'); // Usar fromPlaceId
            const fromItemParam = params.get('fromItem');
            if (params.get('fromGrouped') === 'true' && fromPlaceIdParam) {
                backButton.href = `grouped-detail-view.html?listId=${listIdFromURL}&placeId=${fromPlaceIdParam}&item=${encodeURIComponent(fromItemParam || '')}`;
            } else {
                backButton.href = `list-view.html?listId=${listIdFromURL}`;
            }
        }

        if (!reviewId || !listIdFromURL) {
            const errorMsg = "Error: Falta ID de reseña o ID de lista en la URL.";
            console.error("DETAIL-VIEW:", errorMsg);
            if (detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = errorMsg;
            if (ListopicApp.services && ListopicApp.services.showNotification) {
                ListopicApp.services.showNotification(errorMsg, "error");
            }
            return; 
        }

        let reviewDataGlobal;
        let listDataGlobal; // Lo hacemos accesible en un scope más amplio

        // 1. Obtener la reseña
        db.collection('lists').doc(listIdFromURL).collection('reviews').doc(reviewId).get()
            .then(reviewDoc => {
                if (!reviewDoc.exists) throw new Error(`Reseña no encontrada.`);
                reviewDataGlobal = { id: reviewDoc.id, ...reviewDoc.data() };

                // Mostrar datos básicos de la reseña
                if (detailItemNameEl) detailItemNameEl.textContent = reviewDataGlobal.itemName || '';
                if (detailScoreValueEl) detailScoreValueEl.textContent = reviewDataGlobal.overallRating !== undefined ? reviewDataGlobal.overallRating.toFixed(1) : 'N/A';
                
                // Mostrar fecha de creación (NUEVO)
                if (reviewCreationDateEl && reviewDataGlobal.createdAt?.toDate) {
                    reviewCreationDateEl.textContent = `Fecha: ${reviewDataGlobal.createdAt.toDate().toLocaleDateString()}`;
                }

                if (detailImageEl && detailImageEl.parentNode) {
                    if (reviewDataGlobal.photoUrl) {
                        detailImageEl.src = reviewDataGlobal.photoUrl;
                        detailImageEl.alt = `Foto de ${uiUtils.escapeHtml(reviewDataGlobal.itemName || 'reseña')}`;
                        detailImageEl.style.display = 'block';
                        const placeholderIcon = detailImageEl.parentNode.querySelector('.detail-image-icon-placeholder');
                        if(placeholderIcon) placeholderIcon.style.display = 'none';
                    } else {
                        detailImageEl.style.display = 'none';
                        let placeholderIconDiv = detailImageEl.parentNode.querySelector('.detail-image-icon-placeholder');
                        if (!placeholderIconDiv) {
                            placeholderIconDiv = document.createElement('div');
                            placeholderIconDiv.className = 'detail-image-icon-placeholder';
                            detailImageEl.parentNode.insertBefore(placeholderIconDiv, detailImageEl.nextSibling);
                        }
                        placeholderIconDiv.innerHTML = `<i class="fa-solid fa-image"></i>`;
                        placeholderIconDiv.style.display = 'flex';
                    }
                }

                if (detailCommentContainerEl && detailCommentTextEl) {
                    if (reviewDataGlobal.comment) {
                        detailCommentTextEl.innerHTML = uiUtils.escapeHtml(reviewDataGlobal.comment).replace(/\n/g, '<br>');
                        detailCommentContainerEl.style.display = 'block';
                    } else {
                        detailCommentContainerEl.style.display = 'none';
                    }
                }

                if (detailTagsContainerEl && detailTagsDivEl) {
                    if (reviewDataGlobal.userTags && reviewDataGlobal.userTags.length > 0) {
                        detailTagsDivEl.innerHTML = reviewDataGlobal.userTags.map(tag => `<span class="tag-detail">${uiUtils.escapeHtml(tag)}</span>`).join('');
                        detailTagsContainerEl.style.display = 'block';
                    } else {
                        detailTagsContainerEl.style.display = 'none';
                    }
                }

                if (editButton) {
                    let editHref = `review-form.html?listId=${listIdFromURL}&editId=${reviewId}`;
                    const fromPlaceIdParam = params.get('fromPlaceId'); // Usar fromPlaceId
                    const fromItemParam = params.get('fromItem');
                    if (params.get('fromGrouped') === 'true' && fromPlaceIdParam) {
                        editHref += `&fromGrouped=true&fromPlaceId=${fromPlaceIdParam}&fromItem=${encodeURIComponent(fromItemParam || '')}`;
                    }
                    editButton.href = editHref;
                }
                
                const fetchPromises = [
                    db.collection('lists').doc(listIdFromURL).get(),
                    db.collection('users').doc(reviewDataGlobal.userId).get()
                ];
                
                // 2. Obtener la definición de la lista y los datos del autor de la reseña
                return Promise.all(fetchPromises);
            })
            .then(async ([listDoc, userDoc]) => {
                if (!listDoc.exists) throw new Error("Lista asociada no encontrada.");
                listDataGlobal = listDoc.data();
                state.currentListCriteriaDefinitions = listDataGlobal.criteriaDefinition || {};

                // Renderizar nombre de la lista
                if (reviewListNameEl) reviewListNameEl.textContent = `en ${uiUtils.escapeHtml(listDataGlobal.name || 'Lista Desconocida')}`;

                // Obtener datos de la categoría para las palabras de reacción
                const categoryId = listDataGlobal.categoryId || 'Hmm...';
                const categoryDoc = await db.collection('categories').doc(categoryId).get();
                const categoryData = categoryDoc.exists ? categoryDoc.data() : {};
                const likeWord = categoryData.rangos?.like || 'Me gusta';
                const dislikeWord = categoryData.rangos?.dislike || 'No me gusta';

                if(likeTextEl) likeTextEl.textContent = likeWord;
                if(dislikeTextEl) dislikeTextEl.textContent = dislikeWord;

                // Cargar contadores (por ahora placeholders)
                if (likesCountEl) likesCountEl.textContent = 0; // Se actualizará con datos reales
                if (dislikesCountEl) dislikesCountEl.textContent = 0; // Se actualizará con datos reales
                if (commentsCountEl) commentsCountEl.textContent = 0; // Se actualizará con datos reales

                if(detailListNameHeaderEl && listDataGlobal.name) {
                    detailListNameHeaderEl.innerHTML = `Estás viendo en Listopic: <a href="list-view.html?listId=${listIdFromURL}">${uiUtils.escapeHtml(listDataGlobal.name)}</a>`;
                    if (uiUtils.updatePageHeaderInfo) {
                        const currentCategory = listDataGlobal.categoryId || "Hmm...";
                        uiUtils.updatePageHeaderInfo(currentCategory, listDataGlobal.name);
                    }
                } else if (detailListNameHeaderEl) {
                     detailListNameHeaderEl.textContent = "Estás viendo en Listopic: Lista Desconocida";
                     if (uiUtils.updatePageHeaderInfo) uiUtils.updatePageHeaderInfo();
                }

                // Renderizar autor y foto (NUEVO)
                if (userDoc && userDoc.exists) {
                    const userData = userDoc.data();
                    const authorName = uiUtils.escapeHtml(userData.username || userData.displayName || 'Usuario Anónimo');
                    
                    if (reviewAuthorNameEl) reviewAuthorNameEl.textContent = authorName;
                    if (reviewAuthorPhotoEl) reviewAuthorPhotoEl.src = userData.photoUrl || 'img/default-avatar.png';
                    if (reviewAuthorLinkEl) reviewAuthorLinkEl.href = `profile.html?viewUserId=${reviewDataGlobal.userId}`;
                } else if (reviewDataGlobal.userId) { 
                    if(reviewAuthorNameEl) reviewAuthorNameEl.textContent = 'Usuario Desconocido';
                    console.warn(`Autor de reseña con ID ${reviewDataGlobal.userId} no encontrado.`);
                }
                
                // Renderizar valoraciones detalladas
                if (detailRatingsListEl && reviewDataGlobal && reviewDataGlobal.scores) {
                    detailRatingsListEl.innerHTML = '';
                    if (typeof state.currentListCriteriaDefinitions === 'object' && Object.keys(state.currentListCriteriaDefinitions).length > 0) {
                        for (const [critKey, critDef] of Object.entries(state.currentListCriteriaDefinitions)) {
                            if (reviewDataGlobal.scores[critKey] !== undefined) {
                                const li = document.createElement('li');
                                const weightedText = critDef.ponderable === false ? ' <small class="non-weighted-detail">(No pondera)</small>' : '';
                                li.innerHTML = `<span class="rating-label">${uiUtils.escapeHtml(critDef.label)}${weightedText}</span> <span class="rating-value">${parseFloat(reviewDataGlobal.scores[critKey]).toFixed(1)}</span>`;
                                detailRatingsListEl.appendChild(li);
                            }
                        }
                    } else {
                        detailRatingsListEl.innerHTML = '<li>No hay criterios definidos para mostrar valoraciones.</li>';
                    }
                } else if (detailRatingsListEl) {
                     detailRatingsListEl.innerHTML = '<li>No hay valoraciones detalladas disponibles.</li>';
                }

                // 3. Si la reseña tiene placeId, obtener datos del lugar
                if (reviewDataGlobal && reviewDataGlobal.placeId) {
                    return db.collection('places').doc(reviewDataGlobal.placeId).get();
                } else {
                    if(detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = reviewDataGlobal.establishmentName || "Establecimiento no especificado";
                    if (detailLocationButtonsEl) detailLocationButtonsEl.style.display = 'none';
                    if (detailNoLocationDivEl) detailNoLocationDivEl.style.display = 'flex';
                    return Promise.resolve(null);
                }
            })
            .then(placeDocOrNull => { // placeDocOrNull es el resultado de la promesa del lugar
                let placeData = null;
                if (placeDocOrNull && placeDocOrNull.exists) {
                    placeData = placeDocOrNull.data();
                    if (detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = placeData.name || "Nombre de lugar desconocido";
                    
                    if (detailImageEl && detailImageEl.alt === `Foto de reseña`) {
                         detailImageEl.alt = `Foto de ${uiUtils.escapeHtml(reviewDataGlobal.itemName || placeData.name)}`;
                    }
                    
                    // Lógica para los nuevos botones (NUEVO)
                    if (detailLocationButtonsEl && placeData && placeData.name) {
                        detailLocationButtonsEl.style.display = 'block';
                        if (detailNoLocationDivEl) detailNoLocationDivEl.style.display = 'none';
                        
                        if (placeDetailLinkEl) {
                           const fromPlaceIdParam = reviewDataGlobal.placeId;
                           const fromItemParam = reviewDataGlobal.itemName;
                           if (fromPlaceIdParam) {
                               const listId = listIdFromURL;
                               const item = encodeURIComponent(fromItemParam || "");
                               placeDetailLinkEl.href = `grouped-detail-view.html?listId=${listId}&placeId=${fromPlaceIdParam}&item=${item}`;
                           } else {
                               placeDetailLinkEl.style.pointerEvents = "none";
                           }
                        }

                        if (googleMapsLinkEl) {
                            let mapsUrl = "#";
                            if (placeData.googleMapsUrl) mapsUrl = placeData.googleMapsUrl;
                            else if (placeData.googlePlaceId) mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeData.name)}&query_place_id=${placeData.googlePlaceId}`;
                            else if (placeData.location?.latitude && placeData.location?.longitude) mapsUrl = `https://www.google.com/maps/search/?api=1&query=${placeData.location.latitude},${placeData.location.longitude}`;

                            if (mapsUrl !== "#") {
                                googleMapsLinkEl.href = mapsUrl;
                                googleMapsLinkEl.style.pointerEvents = "auto";
                            } else {
                                googleMapsLinkEl.removeAttribute('href');
                                googleMapsLinkEl.style.pointerEvents = "none";
                            }
                        }
                    } else { // Ocultar si no hay lugar
                        if (detailLocationButtonsEl) detailLocationButtonsEl.style.display = 'none';
                        if (detailNoLocationDivEl) detailNoLocationDivEl.style.display = 'flex';
                    }

                } else if (reviewDataGlobal && reviewDataGlobal.placeId) { 
                    if (detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = "Lugar no encontrado en BD";
                    console.warn(`Lugar con ID ${reviewDataGlobal.placeId} no encontrado para la reseña ${reviewId}`);
                    if (detailLocationButtonsEl) detailLocationButtonsEl.style.display = 'none';
                    if (detailNoLocationDivEl) detailNoLocationDivEl.style.display = 'flex';
                }
            })
            .catch(error => {
                console.error("Error fetching details for detail view:", error);
                if (detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = "Error al cargar datos";
                if (ListopicApp.services && ListopicApp.services.showNotification) {
                     ListopicApp.services.showNotification(error.message || "Error al cargar los detalles.", "error");
                }
            });

        // Listener para el botón de eliminar
        if (deleteButton) {
            deleteButton.addEventListener('click', async () => {
                if (!reviewId || !listIdFromURL) {
                    ListopicApp.services.showNotification("No se puede eliminar: falta información.", "error");
                    return;
                }
                if (confirm('¿Estás seguro de que quieres eliminar esta reseña?')) {
                    try {
                        await db.collection('lists').doc(listIdFromURL).collection('reviews').doc(reviewId).delete();
                        ListopicApp.services.showNotification('Reseña eliminada.', 'success');
                        
                        // Redirigir
                        const fromPlaceIdParam = params.get('fromPlaceId');
                        const fromItemParam = params.get('fromItem');
                        if (params.get('fromGrouped') === 'true' && fromPlaceIdParam) {
                            window.location.href = `grouped-detail-view.html?listId=${listIdFromURL}&placeId=${fromPlaceIdParam}&item=${encodeURIComponent(fromItemParam || '')}`;
                        } else {
                            window.location.href = `list-view.html?listId=${listIdFromURL}`;
                        }
                    } catch (error) {
                        ListopicApp.services.showNotification(`No se pudo eliminar: ${error.message}`, 'error');
                    }
                }
            });
        }
    } // Fin de init

    return {
        init
    };
})();