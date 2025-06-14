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
        const reviewAuthorNameEl = document.getElementById('review-author-name'); // <<--- ASEGÚRATE QUE ESTE ID ESTÉ EN TU HTML
        const detailImageEl = document.getElementById('detail-image');
        const detailScoreValueEl = document.getElementById('detail-score-value');
        const detailRatingsListEl = document.getElementById('detail-ratings');
        const detailLocationLinkEl = document.getElementById('detail-location-link');
        const detailLocationTextEl = document.getElementById('detail-location-text');
        const detailNoLocationDivEl = document.querySelector('.detail-no-location');
        const detailLocationContainerEl = document.getElementById('detail-location-container');
        const detailCommentContainerEl = document.getElementById('detail-comment-container');
        const detailCommentTextEl = document.getElementById('detail-comment-text');
        const detailTagsContainerEl = document.getElementById('detail-tags-container');
        const detailTagsDivEl = document.getElementById('detail-tags');
        const detailListNameEl = document.getElementById('detail-list-name');

        const backButton = document.querySelector('.container a.back-button');
        const editButton = document.querySelector('.edit-button');
        const deleteButton = document.querySelector('.delete-button.danger');

        // Configurar botón de Volver
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

                // 2. Obtener la definición de la lista
                return db.collection('lists').doc(listIdFromURL).get();
            })
            .then(listDoc => {
                if (!listDoc.exists) throw new Error("Lista asociada no encontrada.");
                listDataGlobal = listDoc.data(); // Guardar en el scope más amplio
                state.currentListCriteriaDefinitions = listDataGlobal.criteriaDefinition || {};

                if(detailListNameEl && listDataGlobal.name) {
                    detailListNameEl.innerHTML = `Estás viendo en Listopic: <a href="list-view.html?listId=${listIdFromURL}">${uiUtils.escapeHtml(listDataGlobal.name)}</a>`;
                    if (uiUtils.updatePageHeaderInfo) { // Actualizar header común
                        const currentCategory = listDataGlobal.categoryId || "Hmm...";
                        uiUtils.updatePageHeaderInfo(currentCategory, listDataGlobal.name);
                    }
                } else if (detailListNameEl) {
                     detailListNameEl.textContent = "Estás viendo en Listopic: Lista Desconocida";
                     if (uiUtils.updatePageHeaderInfo) uiUtils.updatePageHeaderInfo();
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

                // 3. Obtener datos del autor de la reseña
                if (reviewDataGlobal.userId && reviewAuthorNameEl) {
                    return db.collection('users').doc(reviewDataGlobal.userId).get(); // Esto devuelve una promesa
                } else {
                    if(reviewAuthorNameEl) reviewAuthorNameEl.textContent = 'Autor no especificado';
                    return Promise.resolve(null); // Devolver promesa resuelta para el siguiente .then()
                }
            })
            .then(userDocOrNull => { // userDocOrNull es el resultado de la promesa del autor
                if (userDocOrNull && userDocOrNull.exists) {
                    const userData = userDocOrNull.data();
                    const authorName = uiUtils.escapeHtml(userData.username || userData.displayName || 'Usuario Anónimo');
                    
                    const authorLink = document.createElement('a');
                    authorLink.href = `profile.html?viewUserId=${reviewDataGlobal.userId}`;
                    authorLink.textContent = authorName;
                    
                    if (reviewAuthorNameEl) {
                        reviewAuthorNameEl.innerHTML = ''; 
                        reviewAuthorNameEl.appendChild(authorLink);
                    }
                } else if (reviewDataGlobal.userId && reviewAuthorNameEl) { 
                    reviewAuthorNameEl.textContent = 'Usuario Desconocido';
                    console.warn(`Autor de reseña con ID ${reviewDataGlobal.userId} no encontrado.`);
                }
                
                // 4. Si la reseña tiene placeId, obtener datos del lugar
                if (reviewDataGlobal && reviewDataGlobal.placeId) {
                    return db.collection('places').doc(reviewDataGlobal.placeId).get(); // Esto devuelve una promesa
                } else {
                    // No hay placeId, mostrar N/A y resolver para finalizar cadena si es necesario
                    if(detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = reviewDataGlobal.establishmentName || "Establecimiento no especificado";
                    if (detailLocationContainerEl) detailLocationContainerEl.style.display = 'none';
                    if (detailNoLocationDivEl) detailNoLocationDivEl.style.display = 'flex';
                    return Promise.resolve(null); // Devolver promesa resuelta
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

                    if (detailLocationContainerEl && detailLocationTextEl && detailNoLocationDivEl && (placeData.address || placeData.name || placeData.googleMapsUrl || placeData.googlePlaceId)) {
                        let mapsUrl = "#";
                        if (placeData.googleMapsUrl) mapsUrl = placeData.googleMapsUrl;
                        else if (placeData.googlePlaceId) mapsUrl = `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${placeData.googlePlaceId}`;
                        else if (placeData.location?.latitude && placeData.location?.longitude) mapsUrl = `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${placeData.location.latitude},${placeData.location.longitude}`;

                        if (detailLocationLinkEl) {
                            if (mapsUrl !== "#") {
                                detailLocationLinkEl.href = mapsUrl;
                                detailLocationLinkEl.style.pointerEvents = "auto";
                            } else {
                                detailLocationLinkEl.removeAttribute('href');
                                detailLocationLinkEl.style.pointerEvents = "none";
                            }
                        }
                        detailLocationTextEl.textContent = placeData.address || placeData.name;
                        detailNoLocationDivEl.style.display = 'none';
                        detailLocationContainerEl.style.display = 'block';
                    } else {
                        if (detailLocationContainerEl) detailLocationContainerEl.style.display = 'none';
                        if (detailNoLocationDivEl) detailNoLocationDivEl.style.display = 'flex';
                    }
                } else if (reviewDataGlobal && reviewDataGlobal.placeId) { 
                    if (detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = "Lugar no encontrado en BD";
                    console.warn(`Lugar con ID ${reviewDataGlobal.placeId} no encontrado para la reseña ${reviewId}`);
                    if (detailLocationContainerEl) detailLocationContainerEl.style.display = 'none';
                    if (detailNoLocationDivEl) detailNoLocationDivEl.style.display = 'flex';
                }
                // Si placeDocOrNull es null, ya se manejó el caso sin placeId antes
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