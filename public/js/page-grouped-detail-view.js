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
    
    // ATENCIÓN: La función renderIndividualReviewCard() ha sido ELIMINADA.

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
            const errorMsg = "Error: Faltan parámetros para cargar el detalle.";
            if (groupTitleEl) groupTitleEl.textContent = errorMsg;
            if (individualReviewsListEl) individualReviewsListEl.innerHTML = `<p>${errorMsg}</p>`;
            ListopicApp.services.showNotification(errorMsg, "error");
            return;
        }

        try {
            const listDoc = await db.collection('lists').doc(state.currentGroupDetailListId).get();
            if (!listDoc.exists) throw new Error("Lista de origen no encontrada.");
            const listData = listDoc.data();
            state.currentGroupDetailListName = listData.name || 'Lista Desconocida';
            
            if(listNameSubheaderEl) listNameSubheaderEl.textContent = `Lista: ${uiUtils.escapeHtml(state.currentGroupDetailListName)}`;
            
            const placeDoc = await db.collection('places').doc(placeIdFromUrl).get();
            if (!placeDoc.exists) throw new Error(`Lugar no encontrado.`);
            const placeData = {id: placeDoc.id, ...placeDoc.data()}; 

            let titleText = placeData.name || "Lugar Desconocido";
            if (state.currentGroupDetailItem && state.currentGroupDetailItem !== "") {
                titleText += ` - ${uiUtils.escapeHtml(state.currentGroupDetailItem)}`;
            }
            if(groupTitleEl) groupTitleEl.textContent = titleText;

            let reviewsQuery = db.collection('lists').doc(state.currentGroupDetailListId).collection('reviews')
                                 .where('placeId', '==', placeIdFromUrl);
            
            if (state.currentGroupDetailItem && state.currentGroupDetailItem !== "") {
                reviewsQuery = reviewsQuery.where('itemName', '==', state.currentGroupDetailItem);
            } else {
                reviewsQuery = reviewsQuery.where('itemName', 'in', ["", null]); 
            }
            const reviewsSnapshot = await reviewsQuery.orderBy('createdAt', 'desc').get();
            
            // ***** ¡EL CAMBIO IMPORTANTE ESTÁ AQUÍ! *****
            individualReviewsListEl.innerHTML = '<p>Cargando y enriqueciendo reseñas...</p>'; // Mensaje de carga
            const enrichedReviews = await uiUtils.enrichReviews(reviewsSnapshot.docs);

            if (individualReviewsListEl) {
                if (enrichedReviews.length > 0) {
                    individualReviewsListEl.innerHTML = enrichedReviews.map(review =>
                        uiUtils.renderReviewSuperCard(review) // <-- Usamos la función de uiUtils
                    ).join('');
                } else {
                    individualReviewsListEl.innerHTML = '<p>No hay reseñas individuales para este ítem.</p>';
                }
            }
            // *************************************************

            let totalOverallScoreSum = 0;
            state.lightboxImageUrls = [];
            enrichedReviews.forEach(r => {
                totalOverallScoreSum += r.overallRating || 0;
                if (r.photoUrl) state.lightboxImageUrls.push(r.photoUrl);
            });
            state.lightboxImageUrls = [...new Set(state.lightboxImageUrls)];

            const groupAvgScore = enrichedReviews.length > 0 ? (totalOverallScoreSum / enrichedReviews.length) : 0;
            
            if (groupAverageScoreEl) groupAverageScoreEl.textContent = groupAvgScore.toFixed(1);
            if (groupReviewCountEl) groupReviewCountEl.textContent = enrichedReviews.length;

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
                     groupImageGalleryEl.innerHTML = '<p>No hay imágenes para este grupo.</p>';
                }
            }

        } catch (error) {
            console.error("Error en initializeGroupedDetailView:", error);
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