window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageGroupedDetailView = (() => {
    // Dependencies:
    // ListopicApp.config.API_BASE_URL
    // ListopicApp.services.auth (implicitly, if any protected actions were needed, though not directly in this block)
    // ListopicApp.state (for currentGroupDetailListId, etc.)
    // ListopicApp.uiUtils.escapeHtml

    // Helper functions specific to this page (like lightbox functions) can be defined here
    // or moved to uiUtils if they become more general.
    let currentLightboxImageIndex = 0; // Local to this module's scope if only used by its lightbox

    function openLightbox(index) {
        const lightboxModal = document.getElementById('image-lightbox');
        const lightboxImage = document.getElementById('lightbox-image');
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
    
    function renderIndividualReviewCard(review) {
        // Uses ListopicApp.state.currentGroupDetailCriteria, ListopicApp.state.lightboxImageUrls,
        // ListopicApp.uiUtils.escapeHtml, ListopicApp.state.currentGroupDetailListId,
        // ListopicApp.state.currentGroupDetailRestaurant, ListopicApp.state.currentGroupDetailDish
        
        let ratingsHtml = '<ul>';
        if (review.ratings && ListopicApp.state.currentGroupDetailCriteria && ListopicApp.state.currentGroupDetailCriteria.length > 0) {
            ListopicApp.state.currentGroupDetailCriteria.forEach(critDef => {
                const critKey = critDef.title.toLowerCase().replace(/[^a-z0-9]/g, '');
                const ratingValue = review.ratings[critKey];
                const displayValue = ratingValue !== undefined ? parseFloat(ratingValue).toFixed(1) : 'N/A';
                ratingsHtml += `<li><strong>${ListopicApp.uiUtils.escapeHtml(critDef.title)}:</strong> ${displayValue}</li>`;
            });
        } else if (review.ratings && Object.keys(review.ratings).length > 0) {
             for (const key in review.ratings) {
                ratingsHtml += `<li><strong>${ListopicApp.uiUtils.escapeHtml(key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))}:</strong> ${parseFloat(review.ratings[key]).toFixed(1)}</li>`;
            }
        } else {
            ratingsHtml += '<li>No hay valoraciones detalladas.</li>';
        }
        ratingsHtml += '</ul>';

        let reviewImageIndex = -1;
        if (review.imageUrl && ListopicApp.state.lightboxImageUrls) {
            reviewImageIndex = ListopicApp.state.lightboxImageUrls.indexOf(review.imageUrl);
        }

        const imageHtml = review.imageUrl
            ? `<img src="${ListopicApp.uiUtils.escapeHtml(review.imageUrl)}" alt="Foto de la reseña" class="review-card-image" ${reviewImageIndex !== -1 ? `data-lightbox-index="${reviewImageIndex}"` : ''}>`
            : '<div class="review-card-no-image"><img src="listopic-logo.png" alt="Sin foto" class="grayscale-placeholder"></div>';

        const commentHtml = review.comment
            ? `<p class="review-card-comment">${ListopicApp.uiUtils.escapeHtml(review.comment)}</p>`
            : '<p class="review-card-comment-empty"><em>Sin comentario.</em></p>';

        const reviewDate = review.createdAt ? new Date(review.createdAt).toLocaleDateString() : 'Fecha desconocida';

        return `
            <div class="review-card card">
                <div class="review-card-header">
                    <h4>Reseña del ${reviewDate}</h4>
                    <div class="review-card-score">P.General: <strong>${(review.generalScore || 0).toFixed(1)}</strong></div>
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
                    <a href="detail-view.html?id=${review.id}&listId=${ListopicApp.state.currentGroupDetailListId || review.listId}&fromRestaurant=${encodeURIComponent(ListopicApp.state.currentGroupDetailRestaurant)}&fromDish=${encodeURIComponent(ListopicApp.state.currentGroupDetailDish || '')}" class="button-link">Ver/Editar Detalle Completo</a>
                </div>
            </div>
        `;
    }


    async function initializeGroupedDetailView() {
        const API_BASE_URL = ListopicApp.config.API_BASE_URL;
        const state = ListopicApp.state;

        const urlParams = new URLSearchParams(window.location.search);
        state.currentGroupDetailListId = urlParams.get('listId');
        state.currentGroupDetailRestaurant = decodeURIComponent(urlParams.get('restaurant') || '');
        state.currentGroupDetailDish = decodeURIComponent(urlParams.get('dish') || '');

        const groupTitleEl = document.getElementById('group-title');
        const listNameSubheaderEl = document.getElementById('list-name-subheader');
        const groupAverageScoreEl = document.getElementById('group-average-score')?.querySelector('.score-value');
        const groupReviewCountEl = document.getElementById('group-review-count')?.querySelector('.count-value');
        const groupImageGalleryEl = document.getElementById('group-image-gallery');
        const individualReviewsListEl = document.getElementById('individual-reviews-list');
        const backToListButton = document.getElementById('back-to-list-view');

        if (backToListButton && state.currentGroupDetailListId) {
            // const listNameFromSubheader = listNameSubheaderEl ? listNameSubheaderEl.textContent.replace('Lista: ', '') : 'la lista'; // listNameSubheaderEl content is set later
            backToListButton.title = `Volver a la lista`; // Generic title initially
            backToListButton.href = `list-view.html?listId=${state.currentGroupDetailListId}`;
        } else if (backToListButton) {
            backToListButton.href = 'index.html';
        }

        if (!state.currentGroupDetailListId || state.currentGroupDetailRestaurant === undefined) {
            if (groupTitleEl) groupTitleEl.textContent = "Error: Faltan parámetros para cargar el detalle.";
            if (individualReviewsListEl) individualReviewsListEl.innerHTML = '<p>No se pudo cargar la información.</p>';
            return;
        }

        console.log(`Initializing Grouped Detail View for List ID: ${state.currentGroupDetailListId}, Restaurant: "${state.currentGroupDetailRestaurant}", Dish: "${state.currentGroupDetailDish}"`);

        try {
            const fetchURL = `${API_BASE_URL}/lists/${state.currentGroupDetailListId}/grouped-reviews/details?restaurant=${encodeURIComponent(state.currentGroupDetailRestaurant)}&dish=${encodeURIComponent(state.currentGroupDetailDish || '')}`;
            console.log("Fetching grouped details from:", fetchURL);
            
            const response = await fetch(fetchURL);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `Error HTTP ${response.status}` }));
                throw new Error(errorData.message || `Error al cargar detalles del grupo: ${response.statusText}`);
            }
            const data = await response.json();
            console.log("Data received from backend:", data);

            const { groupSummary, individualReviews } = data;
            console.log("Group Summary:", groupSummary);
            console.log("Individual Reviews:", individualReviews);

            state.currentGroupDetailCriteria = groupSummary.criteria || []; // Update shared state
            state.lightboxImageUrls = []; // Reset shared state for current group

            let titleText = groupSummary.restaurant;
            if (groupSummary.dish && groupSummary.dish !== "") {
                titleText += ` - ${groupSummary.dish}`;
            }
            if(groupTitleEl) groupTitleEl.textContent = titleText; else console.warn("groupTitleEl not found");
            if(listNameSubheaderEl) {
                listNameSubheaderEl.textContent = `Lista: ${groupSummary.listName || 'Desconocida'}`;
                if (backToListButton) backToListButton.title = `Volver a ${groupSummary.listName || 'la lista'}`;
            } else {
                console.warn("listNameSubheaderEl not found");
            }


            if (groupAverageScoreEl) {
                groupAverageScoreEl.textContent = (typeof groupSummary.avgGeneralScore === 'number' ? groupSummary.avgGeneralScore.toFixed(1) : 'N/A');
            } else console.warn("groupAverageScoreEl not found");

            if (groupReviewCountEl) {
                groupReviewCountEl.textContent = (typeof groupSummary.itemCount === 'number' ? groupSummary.itemCount : 'N/A');
            } else console.warn("groupReviewCountEl not found");

            if (groupImageGalleryEl) {
                if (groupSummary.allImageUrls && groupSummary.allImageUrls.length > 0) {
                    state.lightboxImageUrls = groupSummary.allImageUrls.filter(url => url); // Update shared state

                    groupImageGalleryEl.innerHTML = state.lightboxImageUrls.map((url, index) =>
                        `<img src="${ListopicApp.uiUtils.escapeHtml(url)}" alt="Imagen de ${ListopicApp.uiUtils.escapeHtml(groupSummary.restaurant)}" class="gallery-thumbnail" data-lightbox-index="${index}">`
                    ).join('');

                    groupImageGalleryEl.querySelectorAll('.gallery-thumbnail').forEach(thumb => {
                        thumb.addEventListener('click', (e) => {
                            const index = parseInt(e.target.dataset.lightboxIndex);
                            openLightbox(index);
                        });
                    });
                } else {
                    groupImageGalleryEl.innerHTML = '<p>No hay imágenes para este grupo.</p>';
                }
                const lightboxModal = document.getElementById('image-lightbox');
                if (lightboxModal) {
                    if (state.lightboxImageUrls.length <= 1) {
                        lightboxModal.classList.add('single-image');
                    } else {
                        lightboxModal.classList.remove('single-image');
                    }
                }
            } else {
                console.warn("groupImageGalleryEl not found");
            }

            if (individualReviewsListEl) {
                if (individualReviews && individualReviews.length > 0) {
                    individualReviewsListEl.innerHTML = individualReviews.map(review =>
                        renderIndividualReviewCard(review) // This function now uses ListopicApp.state
                    ).join('');
                } else {
                    individualReviewsListEl.innerHTML = '<p>No hay reseñas individuales para este grupo.</p>';
                }
            } else {
                console.warn("individualReviewsListEl not found");
            }
        } catch (error) {
            console.error("Error en initializeGroupedDetailView:", error);
            if (groupTitleEl) groupTitleEl.textContent = "Error al cargar detalles";
            if (individualReviewsListEl) individualReviewsListEl.innerHTML = `<p>Error: ${error.message}</p>`;
        }
    }

    function init() {
        console.log('Initializing Grouped Detail View page logic with actual code...');
        // --- Start of code moved from app.js's grouped-detail-view.html block ---
        (async () => { // Original self-invoking async function
            try {
                await initializeGroupedDetailView(); // initializeGroupedDetailView is now part of this module
            } catch (error) {
                console.error("Error initializing grouped detail view:", error);
                const errorEl = document.getElementById('error-message') || document.body; // Assuming error-message div exists or fallback to body
                errorEl.textContent = "Error al cargar la vista de detalles. Por favor, recarga la página.";
            }
        })();

        // Lightbox event listeners (were originally outside initializeGroupedDetailView in app.js)
        const lightboxModal = document.getElementById('image-lightbox');
        if (lightboxModal) {
            lightboxModal.querySelector('.lightbox-close-button')?.addEventListener('click', closeLightbox);
            lightboxModal.querySelector('.lightbox-prev')?.addEventListener('click', () => changeLightboxImage(-1));
            lightboxModal.querySelector('.lightbox-next')?.addEventListener('click', () => changeLightboxImage(1));
            lightboxModal.addEventListener('click', (e) => {
                if (e.target === lightboxModal) {
                    closeLightbox();
                }
            });
        }
        document.getElementById('individual-reviews-list')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('review-card-image') && e.target.dataset.lightboxIndex) {
                openLightbox(parseInt(e.target.dataset.lightboxIndex));
            }
        });
        // --- End of code moved from app.js ---
    }

    return {
        init
    };
})();
