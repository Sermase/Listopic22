window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageGroupedDetailView = (() => {
    let currentLightboxImageIndex = 0; 

    function openLightbox(index) {
        const lightboxModal = document.getElementById('image-lightbox');
        const lightboxImage = document.getElementById('lightbox-image');
        if (!lightboxModal || !lightboxImage || !ListopicApp.state.lightboxImageUrls || ListopicApp.state.lightboxImageUrls.length === 0) return;

        currentLightboxImageIndex = index;
        lightboxImage.src = ListopicApp.state.lightboxImageUrls[currentLightboxImageIndex];
        lightboxModal.style.display = 'flex';
        lightboxModal.classList.toggle('single-image', ListopicApp.state.lightboxImageUrls.length <= 1);
    }

    function closeLightbox() {
        const lightboxModal = document.getElementById('image-lightbox');
        if (lightboxModal) lightboxModal.style.display = 'none';
    }

    function changeLightboxImage(direction) {
        if (!ListopicApp.state.lightboxImageUrls || ListopicApp.state.lightboxImageUrls.length === 0) return;
        currentLightboxImageIndex += direction;
        if (currentLightboxImageIndex >= ListopicApp.state.lightboxImageUrls.length) {
            currentLightboxImageIndex = 0;
        } else if (currentLightboxImageIndex < 0) {
            currentLightboxImageIndex = ListopicApp.state.lightboxImageUrls.length - 1;
        }
        const lightboxImage = document.getElementById('lightbox-image');
        if (lightboxImage) lightboxImage.src = ListopicApp.state.lightboxImageUrls[currentLightboxImageIndex];
    }
    
    function renderIndividualReviewCard(review, listId, placeData) {
        const state = ListopicApp.state;
        const uiUtils = ListopicApp.uiUtils;
        let ratingsHtml = '<ul>';

        if (review.scores &&
            typeof state.currentGroupDetailCriteriaDefinition === 'object' &&
            Object.keys(state.currentGroupDetailCriteriaDefinition).length > 0) {
            for (const [critKey, critDef] of Object.entries(state.currentGroupDetailCriteriaDefinition)) {
                const ratingValue = review.scores[critKey];
                const displayValue = ratingValue !== undefined ? parseFloat(ratingValue).toFixed(1) : 'N/A';
                const weightedText = critDef.ponderable === false ? ' <small class="non-weighted-detail">(No pondera)</small>' : '';
                ratingsHtml += `<li><strong>${uiUtils.escapeHtml(critDef.label)}${weightedText}:</strong> ${displayValue}</li>`;
            }
        } else {
            ratingsHtml += '<li>No hay valoraciones detalladas.</li>';
        }
        ratingsHtml += '</ul>';

        let reviewImageIndex = -1;
        if (review.photoUrl && state.lightboxImageUrls) {
            reviewImageIndex = state.lightboxImageUrls.indexOf(review.photoUrl);
        }

        const imageHtml = review.photoUrl ?
            `<img src="${uiUtils.escapeHtml(review.photoUrl)}" alt="Foto de la reseña" class="review-card-image" ${reviewImageIndex !== -1 ? `data-lightbox-index="${reviewImageIndex}"` : ''}>` :
            '<div class="review-card-no-image"><img src="img/favicon-32x32.png" alt="Sin foto" class="grayscale-placeholder"></div>';

        const commentHtml = review.comment ?
            `<p class="review-card-comment">${uiUtils.escapeHtml(review.comment)}</p>` :
            '<p class="review-card-comment-empty"><em>Sin comentario.</em></p>';

        const reviewDateObj = review.createdAt?.toDate ? review.createdAt.toDate() : (review.createdAt ? new Date(review.createdAt) : null);
        const reviewDate = reviewDateObj ? reviewDateObj.toLocaleDateString() : 'Fecha desconocida';
        
        // Construir el 'from' para el enlace de edición, usando placeId en lugar de establishmentName
        const fromParams = `&fromGrouped=true&fromPlaceId=${placeData.id}&fromItem=${encodeURIComponent(review.itemName || '')}`;

        return `
            <div class="review-card card">
                <div class="review-card-header">
                    <h4>Reseña del ${reviewDate}</h4>
                    <div class="review-card-score">P.General: <strong>${(review.overallRating || 0).toFixed(1)}</strong></div>
                </div>
                <div class="review-card-body">
                    <div class="review-card-image-container">
                        ${imageHtml}
                    </div>
                    <div class="review-card-details">
                        ${ratingsHtml}
                    </div>
                </div>
                <div class="review-card-comment-section">
                    ${commentHtml}
                </div>
                <div class="review-card-actions">
                    <a href="detail-view.html?id=${review.id}&listId=${listId}${fromParams}" class="button-link">Ver/Editar Detalle Completo</a>
                </div>
            </div>
        `;
    }

    async function initializeGroupedDetailView() {
        const state = ListopicApp.state;
        const db = ListopicApp.services.db;
        const uiUtils = ListopicApp.uiUtils;

        const urlParams = new URLSearchParams(window.location.search);
        state.currentGroupDetailListId = urlParams.get('listId');
        const placeIdFromUrl = urlParams.get('placeId'); 
        state.currentGroupDetailItem = decodeURIComponent(urlParams.get('item') || '');

        const groupTitleEl = document.getElementById('group-title');
        const listNameSubheaderEl = document.getElementById('list-name-subheader');
        const groupAverageScoreEl = document.getElementById('group-average-score')?.querySelector('.score-value');
        const groupReviewCountEl = document.getElementById('group-review-count')?.querySelector('.count-value');
        const groupImageGalleryEl = document.getElementById('group-image-gallery');
        const individualReviewsListEl = document.getElementById('individual-reviews-list');
        const backToListButton = document.getElementById('back-to-list-view');

        if (backToListButton && state.currentGroupDetailListId) {
            backToListButton.href = `list-view.html?listId=${state.currentGroupDetailListId}`;
        } else if (backToListButton) {
            backToListButton.href = 'index.html';
        }

        if (!state.currentGroupDetailListId || !placeIdFromUrl) {
            const errorMsg = "Error: Faltan parámetros para cargar el detalle (ID de lista o ID de lugar).";
            if (groupTitleEl) groupTitleEl.textContent = errorMsg;
            if (individualReviewsListEl) individualReviewsListEl.innerHTML = `<p>${errorMsg}</p>`;
            ListopicApp.services.showNotification(errorMsg, "error");
            return;
        }

        console.log(`Initializing Grouped Detail View for List ID: ${state.currentGroupDetailListId}, Place ID: "${placeIdFromUrl}", Item: "${state.currentGroupDetailItem}"`);

        try {
            // 1. Obtener datos de la lista (nombre, criterios)
            const listDoc = await db.collection('lists').doc(state.currentGroupDetailListId).get();
            if (!listDoc.exists) throw new Error("Lista de origen no encontrada.");
            const listData = listDoc.data();
            state.currentGroupDetailListName = listData.name || 'Lista Desconocida';
            state.currentGroupDetailCriteriaDefinition = listData.criteriaDefinition || {};

            if(listNameSubheaderEl) listNameSubheaderEl.textContent = `Lista: ${uiUtils.escapeHtml(state.currentGroupDetailListName)}`;
            if(backToListButton) backToListButton.title = `Volver a ${uiUtils.escapeHtml(state.currentGroupDetailListName)}`;

            // 2. Obtener datos del lugar
            const placeDoc = await db.collection('places').doc(placeIdFromUrl).get();
            if (!placeDoc.exists) throw new Error(`Lugar con ID ${placeIdFromUrl} no encontrado.`);
            const placeData = {id: placeDoc.id, ...placeDoc.data()}; 

            // 3. Construir título del grupo
            let titleText = placeData.name || "Lugar Desconocido";
            if (state.currentGroupDetailItem && state.currentGroupDetailItem !== "") {
                titleText += ` - ${uiUtils.escapeHtml(state.currentGroupDetailItem)}`;
            }
            if(groupTitleEl) groupTitleEl.textContent = titleText;

            // 4. Obtener reseñas para este grupo (lugar e ítem específicos) DENTRO de esta lista
            let reviewsQuery = db.collection('lists').doc(state.currentGroupDetailListId).collection('reviews')
                                 .where('placeId', '==', placeIdFromUrl);
            
            if (state.currentGroupDetailItem && state.currentGroupDetailItem !== "") {
                reviewsQuery = reviewsQuery.where('itemName', '==', state.currentGroupDetailItem);
            } else {
                reviewsQuery = reviewsQuery.where('itemName', 'in', ["", null]); 
            }
            const reviewsSnapshot = await reviewsQuery.orderBy('createdAt', 'desc').get(); 
            
            const individualReviews = [];
            reviewsSnapshot.forEach(doc => {
                individualReviews.push({ id: doc.id, ...doc.data() });
            });

            if (individualReviewsListEl) {
                if (individualReviews.length > 0) {
                    individualReviewsListEl.innerHTML = individualReviews.map(review =>
                        renderIndividualReviewCard(review, state.currentGroupDetailListId, placeData)
                    ).join('');
                     individualReviewsListEl.querySelectorAll('.review-card-image[data-lightbox-index]').forEach(img => {
                        img.addEventListener('click', (e) => {
                            const index = parseInt(e.target.dataset.lightboxIndex);
                            if (!isNaN(index)) openLightbox(index);
                        });
                    });
                } else {
                    individualReviewsListEl.innerHTML = '<p>No hay reseñas individuales para este ítem específico en este lugar y lista.</p>';
                }
            }

            // Calcular y mostrar resumen del grupo (estadísticas)
            let totalOverallScoreSum = 0;
            state.lightboxImageUrls = []; 
            individualReviews.forEach(r => {
                totalOverallScoreSum += r.overallRating || 0;
                if (r.photoUrl) state.lightboxImageUrls.push(r.photoUrl);
            });
            state.lightboxImageUrls = [...new Set(state.lightboxImageUrls)]; // Únicas

            const groupAvgScore = individualReviews.length > 0 ? (totalOverallScoreSum / individualReviews.length) : 0;
            
            if (groupAverageScoreEl) groupAverageScoreEl.textContent = groupAvgScore.toFixed(1);
            if (groupReviewCountEl) groupReviewCountEl.textContent = individualReviews.length;

            // Mostrar galería de imágenes
            if (groupImageGalleryEl) {
                if (state.lightboxImageUrls.length > 0) {
                    groupImageGalleryEl.innerHTML = state.lightboxImageUrls.map((url, index) =>
                        `<img src="${uiUtils.escapeHtml(url)}" alt="Imagen de ${uiUtils.escapeHtml(placeData.name)}" class="gallery-thumbnail" data-lightbox-index="${index}">`
                    ).join('');
                    groupImageGalleryEl.querySelectorAll('.gallery-thumbnail').forEach(thumb => {
                        thumb.addEventListener('click', (e) => {
                             const index = parseInt(e.target.dataset.lightboxIndex);
                            if (!isNaN(index)) openLightbox(index);
                        });
                    });
                } else {
                    if (placeData.mainImageUrl) {
                        state.lightboxImageUrls = [placeData.mainImageUrl];
                         groupImageGalleryEl.innerHTML = 
                            `<img src="${uiUtils.escapeHtml(placeData.mainImageUrl)}" alt="Imagen de ${uiUtils.escapeHtml(placeData.name)}" class="gallery-thumbnail" data-lightbox-index="0">`;
                        const thumb = groupImageGalleryEl.querySelector('.gallery-thumbnail');
                        thumb?.addEventListener('click', () => openLightbox(0));
                    } else {
                        groupImageGalleryEl.innerHTML = '<p>No hay imágenes para este grupo.</p>';
                    }
                }
                const lightboxModal = document.getElementById('image-lightbox');
                if (lightboxModal) {
                    lightboxModal.classList.toggle('single-image', state.lightboxImageUrls.length <= 1);
                }
            }

        } catch (error) {
            console.error("Error en initializeGroupedDetailView:", error);
            if (groupTitleEl) groupTitleEl.textContent = "Error al cargar detalles";
            if (individualReviewsListEl) individualReviewsListEl.innerHTML = `<p>Error: ${error.message}</p>`;
            ListopicApp.services.showNotification(`Error al cargar detalles: ${error.message}`, "error");
        }
    }

    function init() {
        console.log('Initializing Grouped Detail View page logic...');
        initializeGroupedDetailView();

        const lightboxModal = document.getElementById('image-lightbox');
        if (lightboxModal) {
            lightboxModal.querySelector('.lightbox-close-button')?.addEventListener('click', closeLightbox);
            lightboxModal.querySelector('.lightbox-prev')?.addEventListener('click', () => changeLightboxImage(-1));
            lightboxModal.querySelector('.lightbox-next')?.addEventListener('click', () => changeLightboxImage(1));
            lightboxModal.addEventListener('click', (e) => {
                if (e.target === lightboxModal) closeLightbox();
            });
        }
        // El listener para las imágenes en .review-card-image se añade dinámicamente en initializeGroupedDetailView
        // después de renderizar las tarjetas, por lo que no es necesario añadirlo aquí de nuevo globalmente.
    }

    return {
        init
    };
})();