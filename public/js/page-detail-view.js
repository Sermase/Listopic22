window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageDetailView = (() => {
    // Dependencies:
    // ListopicApp.config.API_BASE_URL
    // ListopicApp.services.auth
    // ListopicApp.state (for currentListCriteriaDefinitions)
    // ListopicApp.uiUtils (potentially)

    function init() {
        console.log('Initializing Detail View page logic with actual code...');

        const API_BASE_URL = ListopicApp.config.API_BASE_URL;
        const auth = ListopicApp.services.auth;
        const state = ListopicApp.state; 
        // const uiUtils = ListopicApp.uiUtils; // Not directly used in original block, but good to keep in mind

        // --- Start of code moved from app.js's detail-view.html block ---
        const params = new URLSearchParams(window.location.search);
        const reviewId = params.get('id');
        const listIdForPage = params.get('listId'); // Used for back button and edit link

        const backButton = document.querySelector('.container a.back-button'); // Ensure this selector is specific enough
        const editButton = document.querySelector('.edit-button'); 

        if (backButton && listIdForPage) {
            const restaurantParam = params.get('fromRestaurant');
            const dishParam = params.get('fromDish');
            if (restaurantParam) { // Means it came from grouped-detail-view
                backButton.href = `grouped-detail-view.html?listId=${listIdForPage}&restaurant=${encodeURIComponent(restaurantParam)}&dish=${encodeURIComponent(dishParam || '')}`;
            } else { // Came from list-view
                backButton.href = `list-view.html?listId=${listIdForPage}`;
            }
        }

        if (reviewId) {
            fetch(`${API_BASE_URL}/reviews/${reviewId}`)
                .then(res => {
                    if (!res.ok) throw new Error(`Error al cargar reseña: ${res.statusText}`);
                    return res.json();
                })
                .then(async reviewData => {
                    document.getElementById('detail-restaurant-name').textContent = reviewData.restaurant;
                    document.getElementById('detail-dish-name').textContent = reviewData.dish || '';
                    
                    const detailListNamelink = document.getElementById('detail-list-name-link');
                    if(detailListNamelink && reviewData.listId && reviewData.listName) {
                        detailListNamelink.textContent = reviewData.listName;
                        detailListNamelink.href = `list-view.html?listId=${reviewData.listId}`;
                    } else if (detailListNamelink) {
                         detailListNamelink.textContent = "Lista Desconocida";
                         detailListNamelink.href="#";
                    }


                    const detailImage = document.getElementById('detail-image');
                    if (reviewData.imageUrl) {
                        detailImage.src = reviewData.imageUrl;
                        detailImage.alt = `Foto de ${reviewData.dish || reviewData.restaurant}`;
                        detailImage.style.display = 'block';
                        const placeholderIcon = detailImage.parentNode.querySelector('.detail-image-icon-placeholder');
                        if(placeholderIcon) placeholderIcon.style.display = 'none'; // Hide placeholder
                    } else {
                        detailImage.style.display = 'none'; // Hide image tag
                        let placeholderIconDiv = detailImage.parentNode.querySelector('.detail-image-icon-placeholder');
                        if (!placeholderIconDiv) { // Create if not exists
                            placeholderIconDiv = document.createElement('div');
                            placeholderIconDiv.className = 'detail-image-icon-placeholder';
                            detailImage.parentNode.insertBefore(placeholderIconDiv, detailImage.nextSibling);
                        }
                        placeholderIconDiv.innerHTML = `<i class="fa-solid fa-image"></i>`; // Default icon
                        placeholderIconDiv.style.display = 'flex'; // Show placeholder
                    }

                    state.currentListCriteriaDefinitions = []; // Reset from shared state
                    if (reviewData.listId) {
                        try {
                            const listRes = await fetch(`${API_BASE_URL}/lists/${reviewData.listId}`);
                            if (listRes.ok) {
                                const listDefinitionForScore = await listRes.json();
                                state.currentListCriteriaDefinitions = listDefinitionForScore.criteria || [];
                            }
                        } catch (err) {
                            console.warn("Error cargando definiciones de criterios para el score:", err);
                        }
                    }

                    const scoreValueEl = document.getElementById('detail-score-value');
                    let totalScore = 0;
                    let numWeightedRatings = 0;
                    if (reviewData.ratings && typeof reviewData.ratings === 'object' && state.currentListCriteriaDefinitions.length > 0) {
                        for (const ratingKey in reviewData.ratings) {
                            const criterionDef = state.currentListCriteriaDefinitions.find(c => c.title.toLowerCase().replace(/[^a-z0-9]/g, '') === ratingKey);
                            if (criterionDef && criterionDef.isWeighted !== false) {
                                totalScore += parseFloat(reviewData.ratings[ratingKey]);
                                numWeightedRatings++;
                            }
                        }
                    }
                    scoreValueEl.textContent = numWeightedRatings > 0 ? (totalScore / numWeightedRatings).toFixed(1) : 'N/A';

                    const ratingsListEl = document.getElementById('detail-ratings');
                    ratingsListEl.innerHTML = '';
                    if (reviewData.ratings && Object.keys(reviewData.ratings).length > 0 && state.currentListCriteriaDefinitions.length > 0) {
                        state.currentListCriteriaDefinitions.forEach(crit => {
                            const safeKey = crit.title.toLowerCase().replace(/[^a-z0-9]/g, '');
                            if (reviewData.ratings[safeKey] !== undefined) {
                                const li = document.createElement('li');
                                const weightedText = crit.isWeighted === false ? ' <small class="non-weighted-detail">(No pondera)</small>' : '';
                                li.innerHTML = `<span class="rating-label">${ListopicApp.uiUtils.escapeHtml(crit.title)}${weightedText}</span> <span class="rating-value">${parseFloat(reviewData.ratings[safeKey]).toFixed(1)}</span>`;
                                ratingsListEl.appendChild(li);
                            }
                        });
                    } else {
                        ratingsListEl.innerHTML = '<li>No hay valoraciones detalladas.</li>';
                    }

                    const locLink = document.getElementById('detail-location-link');
                    const locText = document.getElementById('detail-location-text');
                    const noLocDiv = document.querySelector('.detail-no-location');
                    const locContainer = document.getElementById('detail-location-container');

                    if (reviewData.location && reviewData.location.url) {
                        locLink.href = reviewData.location.url;
                        locText.textContent = reviewData.location.text || reviewData.restaurant;
                        if (noLocDiv) noLocDiv.style.display = 'none';
                        if (locContainer) locContainer.style.display = 'block';
                    } else if (reviewData.googlePlaceInfo && reviewData.googlePlaceInfo.placeId) {
                        locLink.href = `https://maps.google.com/?q=place_id:${reviewData.googlePlaceInfo.placeId}`;
                        locText.textContent = reviewData.googlePlaceInfo.name || reviewData.googlePlaceInfo.address || reviewData.restaurant;
                        if (noLocDiv) noLocDiv.style.display = 'none';
                        if (locContainer) locContainer.style.display = 'block';
                    } else {
                        if (locContainer) locContainer.style.display = 'none';
                        if (noLocDiv) noLocDiv.style.display = 'flex';
                    }

                    const commentContainer = document.getElementById('detail-comment-container');
                    const commentText = document.getElementById('detail-comment-text');
                    if (reviewData.comment) {
                        commentText.textContent = ListopicApp.uiUtils.escapeHtml(reviewData.comment);
                        if (commentContainer) commentContainer.style.display = 'block';
                    } else {
                        if (commentContainer) commentContainer.style.display = 'none';
                    }

                    const tagsContainer = document.getElementById('detail-tags-container');
                    const tagsDiv = document.getElementById('detail-tags');
                    if (reviewData.tags && reviewData.tags.length > 0) {
                        tagsDiv.innerHTML = reviewData.tags.map(tag => `<span class="tag-detail">${ListopicApp.uiUtils.escapeHtml(tag)}</span>`).join('');
                        if (tagsContainer) tagsContainer.style.display = 'block';
                    } else {
                        if (tagsContainer) tagsContainer.style.display = 'none';
                    }

                    if (editButton) {
                        let editHref = `review-form.html?listId=${reviewData.listId || listIdForPage}&editId=${reviewId}`;
                        const restaurantParam = params.get('fromRestaurant');
                        const dishParam = params.get('fromDish');
                        if(restaurantParam) {
                            editHref += `&fromGrouped=true&fromRestaurant=${encodeURIComponent(restaurantParam)}&fromDish=${encodeURIComponent(dishParam || '')}`;
                        }
                        editButton.href = editHref;
                    }
                })
                .catch(error => {
                    console.error("Error fetching review details for detail view:", error);
                    document.getElementById('detail-restaurant-name').textContent = "Error al cargar la reseña";
                });
        } else {
            console.error("DETAIL-VIEW: reviewId no encontrado en la URL.");
            document.getElementById('detail-restaurant-name').textContent = "Error: Falta ID de reseña";
        }

        const deleteButton = document.querySelector('.delete-button.danger');
        if (deleteButton) {
            deleteButton.addEventListener('click', async () => {
                const reviewIdToDelete = new URLSearchParams(window.location.search).get('id');
                if (confirm('¿Estás seguro de que quieres eliminar esta reseña?')) {
                    try {
                        const idToken = await auth.currentUser?.getIdToken(true);
                        const headers = {};
                        if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
            
                        const response = await fetch(`${API_BASE_URL}/reviews/${reviewIdToDelete}`, { 
                            method: 'DELETE',
                            headers: headers 
                        });
                        
                        if (!response.ok && response.status !== 204) { // 204 No Content is success
                            throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
                        }
                        
                        alert('Reseña eliminada.');
                        // Navigate back based on where the user came from
                        const restaurantParam = params.get('fromRestaurant');
                        const dishParam = params.get('fromDish');
                        if (restaurantParam) { // Came from grouped-detail-view
                            window.location.href = `grouped-detail-view.html?listId=${listIdForPage}&restaurant=${encodeURIComponent(restaurantParam)}&dish=${encodeURIComponent(dishParam || '')}`;
                        } else { // Came from list-view
                            window.location.href = `list-view.html?listId=${listIdForPage}`;
                        }
                    } catch (error) {
                        console.error('Error al eliminar la reseña:', error);
                        alert('No se pudo eliminar la reseña. Por favor, inténtalo de nuevo.');
                    }
                }
            });
        }
        // --- End of code moved from app.js ---
    }

    return {
        init
    };
})();
