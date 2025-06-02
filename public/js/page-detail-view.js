window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageDetailView = (() => {
    function init() {
        console.log('Initializing Detail View page logic...');

        // No usaremos API_BASE_URL si obtenemos todo de Firestore directamente
        const auth = ListopicApp.services.auth;
        const db = ListopicApp.services.db;
        const state = ListopicApp.state;
        const uiUtils = ListopicApp.uiUtils;

        const params = new URLSearchParams(window.location.search);
        const reviewId = params.get('id');
        const listIdFromURL = params.get('listId'); // Renombrado para claridad

        // Elementos del DOM para los detalles
        const detailEstablishmentNameEl = document.getElementById('detail-restaurant-name');
        const detailItemNameEl = document.getElementById('detail-dish-name');
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

        if (backButton && listIdFromURL) {
            const fromEstablishmentParam = params.get('fromEstablishment');
            const fromItemParam = params.get('fromItem');
            if (fromEstablishmentParam) {
                backButton.href = `grouped-detail-view.html?listId=${listIdFromURL}&establishment=${encodeURIComponent(fromEstablishmentParam)}&item=${encodeURIComponent(fromItemParam || '')}`;
            } else {
                backButton.href = `list-view.html?listId=${listIdFromURL}`;
            }
        }

        if (reviewId && listIdFromURL) {
            let reviewDataGlobal; // Para pasar reviewData entre promesas

            // 1. Obtener la reseña
            db.collection('lists').doc(listIdFromURL).collection('reviews').doc(reviewId).get()
                .then(reviewDoc => {
                    if (!reviewDoc.exists) {
                        throw new Error(`Reseña no encontrada.`);
                    }
                    reviewDataGlobal = {id: reviewDoc.id, ...reviewDoc.data()}; // Guardar datos de la reseña

                    // Mostrar datos básicos de la reseña (los que no dependen del lugar o la lista)
                    if (detailItemNameEl) detailItemNameEl.textContent = reviewDataGlobal.itemName || '';
                    if (detailScoreValueEl) detailScoreValueEl.textContent = reviewDataGlobal.overallRating !== undefined ? reviewDataGlobal.overallRating.toFixed(1) : 'N/A';
                    
                    if (detailImageEl) {
                        if (reviewDataGlobal.photoUrl) {
                            detailImageEl.src = reviewDataGlobal.photoUrl;
                            detailImageEl.alt = `Foto de ${reviewDataGlobal.itemName || 'reseña'}`;
                            detailImageEl.style.display = 'block';
                            const placeholderIcon = detailImageEl.parentNode.querySelector('.detail-image-icon-placeholder');
                            if(placeholderIcon) placeholderIcon.style.display = 'none';
                        } else { // Lógica para placeholder si no hay imagen
                            detailImageEl.style.display = 'none';
                            let placeholderIconDiv = detailImageEl.parentNode.querySelector('.detail-image-icon-placeholder');
                            if (!placeholderIconDiv && detailImageEl.parentNode) {
                                placeholderIconDiv = document.createElement('div');
                                placeholderIconDiv.className = 'detail-image-icon-placeholder';
                                detailImageEl.parentNode.insertBefore(placeholderIconDiv, detailImageEl.nextSibling);
                            }
                            if (placeholderIconDiv) {
                                placeholderIconDiv.innerHTML = `<i class="fa-solid fa-image"></i>`;
                                placeholderIconDiv.style.display = 'flex';
                            }
                        }
                    }

                    if (detailCommentContainerEl && detailCommentTextEl) {
                        if (reviewDataGlobal.comment) {
                            detailCommentTextEl.textContent = uiUtils.escapeHtml(reviewDataGlobal.comment);
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
                        const fromEstablishmentParam = params.get('fromEstablishment');
                        const fromItemParam = params.get('fromItem');
                        if(fromEstablishmentParam) {
                            editHref += `&fromGrouped=true&fromEstablishment=${encodeURIComponent(fromEstablishmentParam)}&fromItem=${encodeURIComponent(fromItemParam || '')}`;
                        }
                        editButton.href = editHref;
                    }


                    // 2. Obtener la definición de la lista para los criterios y el nombre de la lista
                    return db.collection('lists').doc(listIdFromURL).get();
                })
                .then(listDoc => {
                    if (!listDoc.exists) {
                        throw new Error("Lista asociada no encontrada.");
                    }
                    const listData = listDoc.data();
                    state.currentListCriteriaDefinitions = listData.criteriaDefinition || {};

                    if(detailListNameEl && listData.name) {
                        detailListNameEl.innerHTML = `Estás viendo en Listopic: <a href="list-view.html?listId=${listIdFromURL}">${uiUtils.escapeHtml(listData.name)}</a>`;
                    } else if (detailListNameEl) {
                         detailListNameEl.textContent = "Estás viendo en Listopic: Lista Desconocida";
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
                            detailRatingsListEl.innerHTML = '<li>No hay criterios definidos en la lista para mostrar valoraciones detalladas.</li>';
                        }
                    } else if (detailRatingsListEl) {
                         detailRatingsListEl.innerHTML = '<li>No hay valoraciones detalladas disponibles.</li>';
                    }

                    // 3. Si la reseña tiene placeId, obtener datos del lugar para la ubicación y el nombre del establecimiento
                    if (reviewDataGlobal && reviewDataGlobal.placeId) {
                        return db.collection('places').doc(reviewDataGlobal.placeId).get();
                    } else {
                        // No hay placeId en la reseña, mostrar N/A para el nombre del establecimiento y sin ubicación
                        if(detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = reviewDataGlobal.establishmentName || "Establecimiento no especificado"; // Fallback si aún tuvieras establishmentName en reseñas antiguas
                        if (detailLocationContainerEl) detailLocationContainerEl.style.display = 'none';
                        if (detailNoLocationDivEl) detailNoLocationDivEl.style.display = 'flex';
                        return null; // No hay lugar que buscar
                    }
                })
                .then(placeDoc => {
                    let placeData = null;
                    if (placeDoc && placeDoc.exists) {
                        placeData = placeDoc.data();
                        if (detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = placeData.name || "Nombre de lugar desconocido";
                        if (detailImageEl && detailImageEl.alt === `Foto de reseña`) { // Actualizar alt si es genérico
                             detailImageEl.alt = `Foto de ${reviewDataGlobal.itemName || placeData.name}`;
                        }


                        // Mostrar información de ubicación del lugar
                        if (detailLocationContainerEl && (placeData.address || placeData.name || placeData.googleMapsUrl || placeData.googlePlaceId)) {
                            if (detailLocationLinkEl && placeData.googleMapsUrl) {
                                detailLocationLinkEl.href = placeData.googleMapsUrl;
                                detailLocationLinkEl.style.pointerEvents = "auto";
                            } else if (detailLocationLinkEl && placeData.googlePlaceId) {
                                detailLocationLinkEl.href = `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${placeData.googlePlaceId}`;
                                detailLocationLinkEl.style.pointerEvents = "auto";
                            } else if (detailLocationLinkEl && placeData.location?.latitude && placeData.location?.longitude) {
                                detailLocationLinkEl.href = `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${placeData.location.latitude},${placeData.location.longitude}`;
                                detailLocationLinkEl.style.pointerEvents = "auto";
                            }
                             else if (detailLocationLinkEl) {
                                 detailLocationLinkEl.removeAttribute('href');
                                 detailLocationLinkEl.style.pointerEvents = "none";
                            }

                            if (detailLocationTextEl) {
                                detailLocationTextEl.textContent = placeData.address || placeData.name;
                            }
                            
                            if (detailNoLocationDivEl) detailNoLocationDivEl.style.display = 'none';
                            detailLocationContainerEl.style.display = 'block';
                        } else {
                            if (detailLocationContainerEl) detailLocationContainerEl.style.display = 'none';
                            if (detailNoLocationDivEl) detailNoLocationDivEl.style.display = 'flex';
                        }
                    } else if (reviewDataGlobal && reviewDataGlobal.placeId) { // placeId existía pero no se encontró el documento del lugar
                        if (detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = "Lugar no encontrado";
                         logger.warn(`Lugar con ID ${reviewDataGlobal.placeId} no encontrado para la reseña ${reviewId}`);
                        if (detailLocationContainerEl) detailLocationContainerEl.style.display = 'none';
                        if (detailNoLocationDivEl) detailNoLocationDivEl.style.display = 'flex';
                    }
                    // Si placeDoc es null (porque la reseña no tenía placeId), ya se manejó arriba.
                })
                .catch(error => {
                    console.error("Error fetching details for detail view:", error);
                    if (detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = "Error al cargar la reseña";
                    ListopicApp.services.showNotification(error.message, "error");
                });
        } else {
            const errorMsg = "Error: Falta ID de reseña o ID de lista en la URL.";
            console.error("DETAIL-VIEW:", errorMsg);
            if (detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = errorMsg;
            ListopicApp.services.showNotification(errorMsg, "error");
        }

        // Listener para el botón de eliminar (ya debería estar correcto)
        if (deleteButton) {
            deleteButton.addEventListener('click', async () => {
                // ... (lógica de eliminación como antes, usando listIdFromURL y reviewId) ...
                // Asegúrate que la redirección después de eliminar también considera los parámetros
                // fromEstablishment y fromItem si vienen de grouped-detail-view
                if (!reviewId || !listIdFromURL) { /* ... */ return; }
                if (confirm('¿Estás seguro de que quieres eliminar esta reseña? Esta acción no se puede deshacer.')) {
                    try {
                        await db.collection('lists').doc(listIdFromURL).collection('reviews').doc(reviewId).delete();
                        ListopicApp.services.showNotification('Reseña eliminada.', 'success');
                        
                        // Idealmente, aquí llamarías a una Cloud Function para actualizar los agregados del lugar
                        // y el reviewCount de la lista.

                        const fromEstablishmentParam = params.get('fromEstablishment');
                        const fromItemParam = params.get('fromItem');
                        if (fromEstablishmentParam) { 
                            window.location.href = `grouped-detail-view.html?listId=${listIdFromURL}&establishment=${encodeURIComponent(fromEstablishmentParam)}&item=${encodeURIComponent(fromItemParam || '')}`;
                        } else { 
                            window.location.href = `list-view.html?listId=${listIdFromURL}`;
                        }
                    } catch (error) {
                        ListopicApp.services.showNotification(`No se pudo eliminar la reseña: ${error.message}`, 'error');
                    }
                }
            });
        }
    } // Fin de init

    return {
        init
    };
})();