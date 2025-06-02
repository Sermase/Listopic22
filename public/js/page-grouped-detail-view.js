window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageGroupedDetailView = (() => {
    let currentLightboxImageIndex = 0; 

    function openLightbox(index) {
        // ... (código de openLightbox sin cambios, pero asegurar que ListopicApp.state.lightboxImageUrls se llene correctamente)
        const lightboxModal = document.getElementById('image-lightbox'); // Asumiendo que este ID existe en grouped-detail-view.html
        const lightboxImage = document.getElementById('lightbox-image'); // Asumiendo que este ID existe
        if (!lightboxModal || !lightboxImage || !ListopicApp.state.lightboxImageUrls || ListopicApp.state.lightboxImageUrls.length === 0) return;

        currentLightboxImageIndex = index;
        lightboxImage.src = ListopicApp.state.lightboxImageUrls[currentLightboxImageIndex];
        lightboxModal.style.display = 'flex';

        if (ListopicApp.state.lightboxImageUrls.length <= 1) {
            lightboxModal.classList.add('single-image');
        } else {
            lightboxModal.classList.remove('single-image');
        }
    }

    function closeLightbox() {
        // ... (código de closeLightbox sin cambios)
        const lightboxModal = document.getElementById('image-lightbox');
        if (lightboxModal) lightboxModal.style.display = 'none';
    }

    function changeLightboxImage(direction) {
        // ... (código de changeLightboxImage sin cambios)
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
    
    function renderIndividualReviewCard(review) {
        // MODIFICADO: Se asume que ListopicApp.state.currentGroupDetailCriteriaDefinition es el mapa de criterios
        // y review.scores tiene las puntuaciones.
        let ratingsHtml = '<ul>';
        if (review.scores && 
            typeof ListopicApp.state.currentGroupDetailCriteriaDefinition === 'object' && 
            Object.keys(ListopicApp.state.currentGroupDetailCriteriaDefinition).length > 0) {
            
            for (const [critKey, critDef] of Object.entries(ListopicApp.state.currentGroupDetailCriteriaDefinition)) {
                const ratingValue = review.scores[critKey];
                const displayValue = ratingValue !== undefined ? parseFloat(ratingValue).toFixed(1) : 'N/A';
                const weightedText = critDef.ponderable === false ? ' <small class="non-weighted-detail">(No pondera)</small>' : '';
                ratingsHtml += `<li><strong>${ListopicApp.uiUtils.escapeHtml(critDef.label)}${weightedText}:</strong> ${displayValue}</li>`;
            }
        } else {
            ratingsHtml += '<li>No hay valoraciones detalladas.</li>';
        }
        ratingsHtml += '</ul>';

        let reviewImageIndex = -1;
        if (review.photoUrl && ListopicApp.state.lightboxImageUrls) { // MODIFICADO: photoUrl
            reviewImageIndex = ListopicApp.state.lightboxImageUrls.indexOf(review.photoUrl);
        }

        const imageHtml = review.photoUrl // MODIFICADO: photoUrl
            ? `<img src="${ListopicApp.uiUtils.escapeHtml(review.photoUrl)}" alt="Foto de la reseña" class="review-card-image" ${reviewImageIndex !== -1 ? `data-lightbox-index="${reviewImageIndex}"` : ''}>`
            : '<div class="review-card-no-image"><img src="listopic-logo.png" alt="Sin foto" class="grayscale-placeholder"></div>';

        const commentHtml = review.comment
            ? `<p class="review-card-comment">${ListopicApp.uiUtils.escapeHtml(review.comment)}</p>`
            : '<p class="review-card-comment-empty"><em>Sin comentario.</em></p>';

        const reviewDate = review.createdAt?.toDate ? review.createdAt.toDate().toLocaleDateString() : (review.createdAt ? new Date(review.createdAt).toLocaleDateString() : 'Fecha desconocida');


        // MODIFICADO: Parámetros en el enlace a detail-view.html
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
                    <a href="detail-view.html?id=${review.id}&listId=${ListopicApp.state.currentGroupDetailListId || review.listId}&fromEstablishment=${encodeURIComponent(ListopicApp.state.currentGroupDetailEstablishment)}&fromItem=${encodeURIComponent(ListopicApp.state.currentGroupDetailItem || '')}" class="button-link">Ver/Editar Detalle Completo</a>
                </div>
            </div>
        `;
    }

    async function initializeGroupedDetailView() {
        const API_BASE_URL = ListopicApp.config.API_BASE_URL_FUNCTIONS || ListopicApp.config.API_BASE_URL;
        const state = ListopicApp.state;
        const db = ListopicApp.services.db;
        const auth = ListopicApp.services.auth;

        const urlParams = new URLSearchParams(window.location.search);
        // MODIFICADO: Obtener establishment e item de los parámetros de la URL
        state.currentGroupDetailListId = urlParams.get('listId');
        state.currentGroupDetailEstablishment = decodeURIComponent(urlParams.get('establishment') || '');
        state.currentGroupDetailItem = decodeURIComponent(urlParams.get('item') || '');

        const groupTitleEl = document.getElementById('group-title');
        const listNameSubheaderEl = document.getElementById('list-name-subheader');
        const groupAverageScoreEl = document.getElementById('group-average-score')?.querySelector('.score-value');
        const groupReviewCountEl = document.getElementById('group-review-count')?.querySelector('.count-value');
        const groupImageGalleryEl = document.getElementById('group-image-gallery');
        const individualReviewsListEl = document.getElementById('individual-reviews-list');
        const backToListButton = document.getElementById('back-to-list-view');

        if (backToListButton && state.currentGroupDetailListId) {
            backToListButton.title = `Volver a la lista`; 
            backToListButton.href = `list-view.html?listId=${state.currentGroupDetailListId}`;
        } else if (backToListButton) {
            backToListButton.href = 'index.html';
        }

        if (!state.currentGroupDetailListId || state.currentGroupDetailEstablishment === undefined) {
            const errorMsg = "Error: Faltan parámetros para cargar el detalle (ID de lista o establecimiento).";
            if (groupTitleEl) groupTitleEl.textContent = errorMsg;
            if (individualReviewsListEl) individualReviewsListEl.innerHTML = `<p>${errorMsg}</p>`;
            ListopicApp.services.showNotification(errorMsg, "error");
            return;
        }
        
        // 1. Obtener datos de la lista (nombre, criterios)
        try {
            const listDoc = await db.collection('lists').doc(state.currentGroupDetailListId).get();
            if (!listDoc.exists) throw new Error("Lista no encontrada para detalles agrupados.");
            const listData = listDoc.data();
            state.currentGroupDetailListName = listData.name || 'Lista Desconocida';
            state.currentGroupDetailCriteriaDefinition = listData.criteriaDefinition || {}; // Guardar mapa de criterios

            if(listNameSubheaderEl) listNameSubheaderEl.textContent = `Lista: ${state.currentGroupDetailListName}`;
            if(backToListButton) backToListButton.title = `Volver a ${state.currentGroupDetailListName}`;
            
            // 2. Construir título del grupo
            let titleText = state.currentGroupDetailEstablishment;
            if (state.currentGroupDetailItem && state.currentGroupDetailItem !== "") {
                titleText += ` - ${state.currentGroupDetailItem}`;
            }
            if(groupTitleEl) groupTitleEl.textContent = titleText;

            // 3. Obtener reseñas para este grupo directamente de Firestore
            let query = db.collection('lists').doc(state.currentGroupDetailListId).collection('reviews')
                          .where('establishmentName', '==', state.currentGroupDetailEstablishment);
            // Solo añadir filtro por itemName si está presente y no es una cadena vacía
            if (state.currentGroupDetailItem && state.currentGroupDetailItem !== "") {
                query = query.where('itemName', '==', state.currentGroupDetailItem);
            } else {
                 // Si itemName está vacío, queremos las reseñas donde itemName también esté vacío o no exista.
                 // Firestore no permite directamente where 'itemName' == '' OR !exists('itemName') en una sola query simple.
                 // Por simplicidad, si item es vacío, podríamos filtrar por itemName == "" (o null si así se guarda).
                 // O, si guardas explícitamente "" cuando no hay item, este filtro es correcto:
                query = query.where('itemName', 'in', ["", null]); // Para capturar donde itemName es vacío o nulo
            }

            const reviewsSnapshot = await query.orderBy('createdAt', 'desc').get();
            const individualReviews = [];
            reviewsSnapshot.forEach(doc => {
                individualReviews.push({ id: doc.id, ...doc.data() });
            });

            if (individualReviews.length === 0) {
                if (individualReviewsListEl) individualReviewsListEl.innerHTML = '<p>No hay reseñas individuales para este grupo.</p>';
                if (groupAverageScoreEl) groupAverageScoreEl.textContent = 'N/A';
                if (groupReviewCountEl) groupReviewCountEl.textContent = '0';
                if (groupImageGalleryEl) groupImageGalleryEl.innerHTML = '<p>No hay imágenes para este grupo.</p>';
                return;
            }

            // Calcular resumen del grupo
            let totalOverallScoreSum = 0;
            state.lightboxImageUrls = []; // Reiniciar
            individualReviews.forEach(r => {
                totalOverallScoreSum += r.overallRating || 0;
                if (r.photoUrl) state.lightboxImageUrls.push(r.photoUrl);
            });
            state.lightboxImageUrls = [...new Set(state.lightboxImageUrls)]; // Únicas

            const groupAvgScore = individualReviews.length > 0 ? (totalOverallScoreSum / individualReviews.length) : 0;
            
            if (groupAverageScoreEl) groupAverageScoreEl.textContent = groupAvgScore.toFixed(1);
            if (groupReviewCountEl) groupReviewCountEl.textContent = individualReviews.length;

            if (groupImageGalleryEl) {
                if (state.lightboxImageUrls.length > 0) {
                    groupImageGalleryEl.innerHTML = state.lightboxImageUrls.map((url, index) =>
                        `<img src="${ListopicApp.uiUtils.escapeHtml(url)}" alt="Imagen de ${ListopicApp.uiUtils.escapeHtml(state.currentGroupDetailEstablishment)}" class="gallery-thumbnail" data-lightbox-index="${index}">`
                    ).join('');
                    groupImageGalleryEl.querySelectorAll('.gallery-thumbnail').forEach(thumb => {
                        thumb.addEventListener('click', (e) => openLightbox(parseInt(e.target.dataset.lightboxIndex)));
                    });
                } else {
                    groupImageGalleryEl.innerHTML = '<p>No hay imágenes para este grupo.</p>';
                }
                const lightboxModal = document.getElementById('image-lightbox');
                if (lightboxModal) {
                    lightboxModal.classList.toggle('single-image', state.lightboxImageUrls.length <= 1);
                }
            }

            if (individualReviewsListEl) {
                individualReviewsListEl.innerHTML = individualReviews.map(review => renderIndividualReviewCard(review)).join('');
                 individualReviewsListEl.querySelectorAll('.review-card-image[data-lightbox-index]').forEach(img => {
                    img.addEventListener('click', (e) => openLightbox(parseInt(e.target.dataset.lightboxIndex)));
                });
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
        initializeGroupedDetailView(); // Llamar a la función principal

        const lightboxModal = document.getElementById('image-lightbox');
        if (lightboxModal) {
            lightboxModal.querySelector('.lightbox-close-button')?.addEventListener('click', closeLightbox);
            lightboxModal.querySelector('.lightbox-prev')?.addEventListener('click', () => changeLightboxImage(-1));
            lightboxModal.querySelector('.lightbox-next')?.addEventListener('click', () => changeLightboxImage(1));
            lightboxModal.addEventListener('click', (e) => {
                if (e.target === lightboxModal) closeLightbox();
            });
        }
        // El listener para abrir el lightbox desde las review-card-image ya se añadió en initializeGroupedDetailView
        // después de renderizar las tarjetas.
    }

    return {
        init
    };
})();