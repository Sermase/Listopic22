window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageDetailView = (() => {
    function init() {
        console.log('Initializing Detail View page logic...');

        const API_BASE_URL = ListopicApp.config.API_BASE_URL_FUNCTIONS || ListopicApp.config.API_BASE_URL; // Asumimos que esto llamará a una Cloud Function
        const auth = ListopicApp.services.auth;
        const db = ListopicApp.services.db; // Para obtener la definición de la lista directamente
        const state = ListopicApp.state; 
        const uiUtils = ListopicApp.uiUtils;

        const params = new URLSearchParams(window.location.search);
        const reviewId = params.get('id');
        const listIdForPage = params.get('listId'); 

        const detailEstablishmentNameEl = document.getElementById('detail-restaurant-name'); // Asumimos que el ID HTML no cambia, solo el contenido
        const detailItemNameEl = document.getElementById('detail-dish-name'); // Asumimos que el ID HTML no cambia
        const detailImageEl = document.getElementById('detail-image');
        const detailScoreValueEl = document.getElementById('detail-score-value');
        const detailRatingsListEl = document.getElementById('detail-ratings');
        const detailLocationLinkEl = document.getElementById('detail-location-link');
        const detailLocationTextEl = document.getElementById('detail-location-text'); // ID añadido en HTML
        const detailNoLocationDivEl = document.querySelector('.detail-no-location');
        const detailLocationContainerEl = document.getElementById('detail-location-container');
        const detailCommentContainerEl = document.getElementById('detail-comment-container');
        const detailCommentTextEl = document.getElementById('detail-comment-text');
        const detailTagsContainerEl = document.getElementById('detail-tags-container');
        const detailTagsDivEl = document.getElementById('detail-tags');
        const detailListNameEl = document.getElementById('detail-list-name'); // El <p> que muestra el nombre de la lista

        const backButton = document.querySelector('.container a.back-button');
        const editButton = document.querySelector('.edit-button'); 
        const deleteButton = document.querySelector('.delete-button.danger');

        if (backButton && listIdForPage) {
            // MODIFICADO: Usar los nuevos nombres de parámetros si vienen de grouped-detail-view
            const fromEstablishmentParam = params.get('fromEstablishment');
            const fromItemParam = params.get('fromItem');
            if (fromEstablishmentParam) { 
                backButton.href = `grouped-detail-view.html?listId=${listIdForPage}&establishment=${encodeURIComponent(fromEstablishmentParam)}&item=${encodeURIComponent(fromItemParam || '')}`;
            } else { 
                backButton.href = `list-view.html?listId=${listIdForPage}`;
            }
        }

        if (reviewId && listIdForPage) { // Necesitamos ambos para obtener la reseña y la definición de criterios de la lista
            // 1. Obtener la reseña
            db.collection('lists').doc(listIdForPage).collection('reviews').doc(reviewId).get()
                .then(reviewDoc => {
                    if (!reviewDoc.exists) {
                        throw new Error(`Reseña no encontrada.`);
                    }
                    const reviewData = reviewDoc.data();

                    // MODIFICADO: Usar establishmentName e itemName
                    if (detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = reviewData.establishmentName;
                    if (detailItemNameEl) detailItemNameEl.textContent = reviewData.itemName || '';
                    
                    if (detailImageEl) {
                        if (reviewData.photoUrl) {
                            detailImageEl.src = reviewData.photoUrl;
                            detailImageEl.alt = `Foto de ${reviewData.itemName || reviewData.establishmentName}`;
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

                    // 2. Obtener la definición de la lista para los criterios y el nombre de la lista
                    return db.collection('lists').doc(listIdForPage).get().then(listDoc => {
                        if (!listDoc.exists) {
                            throw new Error("Lista asociada no encontrada.");
                        }
                        const listData = listDoc.data();
                        state.currentListCriteriaDefinitions = listData.criteriaDefinition || {}; // Guardar el mapa de criterios

                        if(detailListNameEl && listData.name) {
                            detailListNameEl.innerHTML = `Estás viendo en Listopic: <a href="list-view.html?listId=${listIdForPage}">${uiUtils.escapeHtml(listData.name)}</a>`;
                        } else if (detailListNameEl) {
                             detailListNameEl.textContent = "Estás viendo en Listopic: Lista Desconocida";
                        }

                        // Calcular y mostrar la puntuación general (overallRating ya debería estar en reviewData)
                        if (detailScoreValueEl) {
                             detailScoreValueEl.textContent = reviewData.overallRating !== undefined ? reviewData.overallRating.toFixed(1) : 'N/A';
                        }

                        // Renderizar valoraciones detalladas usando el mapa de criterios de la lista
                        if (detailRatingsListEl) {
                            detailRatingsListEl.innerHTML = '';
                            if (reviewData.scores && typeof reviewData.scores === 'object' && 
                                typeof state.currentListCriteriaDefinitions === 'object' && Object.keys(state.currentListCriteriaDefinitions).length > 0) {
                                for (const [critKey, critDef] of Object.entries(state.currentListCriteriaDefinitions)) {
                                    if (reviewData.scores[critKey] !== undefined) {
                                        const li = document.createElement('li');
                                        const weightedText = critDef.ponderable === false ? ' <small class="non-weighted-detail">(No pondera)</small>' : '';
                                        li.innerHTML = `<span class="rating-label">${uiUtils.escapeHtml(critDef.label)}${weightedText}</span> <span class="rating-value">${parseFloat(reviewData.scores[critKey]).toFixed(1)}</span>`;
                                        detailRatingsListEl.appendChild(li);
                                    }
                                }
                            } else {
                                detailRatingsListEl.innerHTML = '<li>No hay valoraciones detalladas.</li>';
                            }
                        }
                        return reviewData; // Pasar reviewData para la siguiente cadena de promesas si es necesario
                    });
                })
                .then(reviewData => { // reviewData ya está disponible y la lista también se cargó
                    // --- INICIO DE LA NUEVA LÓGICA DE UBICACIÓN ---
                    if (reviewData.placeId) {
                        db.collection('places').doc(reviewData.placeId).get()
                            .then(placeDoc => {
                                if (placeDoc.exists) {
                                    const placeData = placeDoc.data();
                                    if (detailLocationContainerEl && (placeData.address || placeData.name || placeData.googleMapsUrl)) {
                                        if (detailLocationLinkEl && placeData.googleMapsUrl) {
                                            detailLocationLinkEl.href = placeData.googleMapsUrl;
                                            detailLocationLinkEl.style.pointerEvents = "auto";
                                        } else if (detailLocationLinkEl && placeData.googlePlaceId) {
                                            detailLocationLinkEl.href = `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${placeData.googlePlaceId}`;
                                            detailLocationLinkEl.style.pointerEvents = "auto";
                                        } else if (detailLocationLinkEl) {
                                             detailLocationLinkEl.removeAttribute('href');
                                             detailLocationLinkEl.style.pointerEvents = "none";
                                        }

                                        if (detailLocationTextEl) {
                                            detailLocationTextEl.textContent = placeData.address || placeData.name; // Mostrar dirección o nombre del lugar
                                        }
                                        
                                        if (detailNoLocationDivEl) detailNoLocationDivEl.style.display = 'none';
                                        detailLocationContainerEl.style.display = 'block';
                                    } else {
                                        if (detailLocationContainerEl) detailLocationContainerEl.style.display = 'none';
                                        if (detailNoLocationDivEl) detailNoLocationDivEl.style.display = 'flex';
                                    }
                                } else {
                                    console.warn(`Lugar con ID ${reviewData.placeId} no encontrado para la reseña ${reviewId}`);
                                    if (detailLocationContainerEl) detailLocationContainerEl.style.display = 'none';
                                    if (detailNoLocationDivEl) detailNoLocationDivEl.style.display = 'flex';
                                }
                            })
                            .catch(error => {
                                console.error("Error obteniendo datos del lugar para la vista de detalle:", error);
                                if (detailLocationContainerEl) detailLocationContainerEl.style.display = 'none';
                                if (detailNoLocationDivEl) detailNoLocationDivEl.style.display = 'flex';
                            });
                    } else {
                        // No hay placeId en la reseña
                        if (detailLocationContainerEl) detailLocationContainerEl.style.display = 'none';
                        if (detailNoLocationDivEl) detailNoLocationDivEl.style.display = 'flex';
                    }
                    // --- FIN DE LA NUEVA LÓGICA DE UBICACIÓN ---
                    
                    // Comentario
                    if (detailCommentContainerEl && detailCommentTextEl) {
                        if (reviewData.comment) {
                            detailCommentTextEl.textContent = uiUtils.escapeHtml(reviewData.comment);
                            detailCommentContainerEl.style.display = 'block';
                        } else {
                            detailCommentContainerEl.style.display = 'none';
                        }
                    }

                    // Etiquetas
                    if (detailTagsContainerEl && detailTagsDivEl) {
                        if (reviewData.userTags && reviewData.userTags.length > 0) {
                            detailTagsDivEl.innerHTML = reviewData.userTags.map(tag => `<span class="tag-detail">${uiUtils.escapeHtml(tag)}</span>`).join('');
                            detailTagsContainerEl.style.display = 'block';
                        } else {
                            detailTagsContainerEl.style.display = 'none';
                        }
                    }
                    
                    // Botón de Editar
                    if (editButton) {
                        // MODIFICADO: Usar los nuevos nombres de parámetros para el enlace de edición
                        let editHref = `review-form.html?listId=${listIdForPage}&editId=${reviewId}`;
                        const fromEstablishmentParam = params.get('fromEstablishment');
                        const fromItemParam = params.get('fromItem');
                        if(fromEstablishmentParam) {
                            editHref += `&fromGrouped=true&fromEstablishment=${encodeURIComponent(fromEstablishmentParam)}&fromItem=${encodeURIComponent(fromItemParam || '')}`;
                        }
                        editButton.href = editHref;
                    }
                })
                .catch(error => {
                    console.error("Error fetching review details for detail view:", error);
                    if (detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = "Error al cargar la reseña";
                    ListopicApp.services.showNotification(error.message, "error");
                });
        } else {
            const errorMsg = "Error: Falta ID de reseña o ID de lista en la URL.";
            console.error("DETAIL-VIEW:", errorMsg);
            if (detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = errorMsg;
            ListopicApp.services.showNotification(errorMsg, "error");
        }

        if (deleteButton) {
            deleteButton.addEventListener('click', async () => {
                if (!reviewId || !listIdForPage) {
                     ListopicApp.services.showNotification("No se puede eliminar: falta ID de reseña o lista.", "error");
                     return;
                }
                if (confirm('¿Estás seguro de que quieres eliminar esta reseña? Esta acción no se puede deshacer.')) {
                    try {
                        // No se necesita token para eliminar desde el cliente si las reglas de Firestore lo permiten
                        await db.collection('lists').doc(listIdForPage).collection('reviews').doc(reviewId).delete();
                        
                        ListopicApp.services.showNotification('Reseña eliminada.', 'success');
                        
                        // Considerar actualizar reviewCount en la lista (idealmente con Cloud Function)
                        // await db.collection('lists').doc(listIdForPage).update({
                        //     reviewCount: firebase.firestore.FieldValue.increment(-1)
                        // });

                        const fromEstablishmentParam = params.get('fromEstablishment');
                        const fromItemParam = params.get('fromItem');
                        if (fromEstablishmentParam) { 
                            window.location.href = `grouped-detail-view.html?listId=${listIdForPage}&establishment=${encodeURIComponent(fromEstablishmentParam)}&item=${encodeURIComponent(fromItemParam || '')}`;
                        } else { 
                            window.location.href = `list-view.html?listId=${listIdForPage}`;
                        }
                    } catch (error) {
                        console.error('Error al eliminar la reseña:', error);
                        ListopicApp.services.showNotification(`No se pudo eliminar la reseña: ${error.message}`, 'error');
                    }
                }
            });
        }
    }

    return {
        init
    };
})();