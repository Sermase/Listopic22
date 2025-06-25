ListopicApp.pagePlace = (() => {
    // Estado del módulo
    const state = {
        placeId: null,
        placeData: null,
        reviewsByList: [],
        isLoading: false,
        isFollowing: false,
        currentSort: 'date',
        currentFilter: '',
        searchQuery: ''
    };

    // Referencias a elementos DOM
    let elements = {};

    function cacheDOMElements() {
        elements = {
            // Estados
            loadingState: document.getElementById('loading-state'),
            errorState: document.getElementById('error-state'),
            errorMessageText: document.getElementById('error-message-text'),

            // Información del lugar
            placeInfoCard: document.getElementById('place-info-card'),
            placeName: document.getElementById('place-name'),
            placeAddress: document.getElementById('place-address'),
            placePhone: document.getElementById('place-phone'),
            placePhoneLink: document.getElementById('place-phone-link'),
            placeWebsite: document.getElementById('place-website'),
            placeWebsiteLink: document.getElementById('place-website-link'),
            placeHours: document.getElementById('place-hours'),
            placeHoursText: document.getElementById('place-hours-text'),
            placeHoursStatus: document.getElementById('place-hours-status'),
            placePriceLevel: document.getElementById('place-price-level'),
            placePriceText: document.getElementById('place-price-text'),
            placeTypes: document.getElementById('place-types'),
            placeImage: document.getElementById('place-image'),
            placeImagePlaceholder: document.getElementById('place-image-placeholder'),
            addReviewBtn: document.getElementById('add-review-btn'),
            directionsBtn: document.getElementById('directions-btn'),
            followPlaceBtn: document.getElementById('follow-place-btn'),
            followPlaceBtnText: document.querySelector('#follow-place-btn .follow-text'),
            followPlaceBtnIcon: document.querySelector('#follow-place-btn i'),

            // Estadísticas
            totalReviews: document.getElementById('total-reviews'),
            totalLists: document.getElementById('total-lists'),
            avgRating: document.getElementById('avg-rating'),

            // Reseñas
            reviewsSection: document.getElementById('reviews-section'),
            searchReviews: document.getElementById('search-reviews'),
            filterList: document.getElementById('filter-list'),
            sortReviews: document.getElementById('sort-reviews'),
            reviewsContainer: document.getElementById('reviews-container'),
            emptyReviews: document.getElementById('empty-reviews')
        };
    }

    function attachEventListeners() {
        if (elements.sharePlaceBtn) {
            elements.sharePlaceBtn.addEventListener('click', sharePlace);
        }
        
        if (elements.addReviewBtn) {
            elements.addReviewBtn.addEventListener('click', addReview);
        }
        
        if (elements.firstReviewBtn) {
            elements.firstReviewBtn.addEventListener('click', addReview);
        }
        
        if (elements.sortReviews) {
            elements.sortReviews.addEventListener('change', (e) => {
                state.currentSort = e.target.value;
                renderReviews();
            });
        }
        
        if (elements.filterReviews) {
            elements.filterReviews.addEventListener('input', (e) => {
                state.currentFilter = e.target.value;
                renderReviews();
            });
        }

        if (elements.followPlaceBtn) {
            elements.followPlaceBtn.addEventListener('click', toggleFollowPlace);
        }

        if (elements.directionsBtn) {
            elements.directionsBtn.addEventListener('click', openDirections);
        }
    }

    function getPlaceIdFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('placeId');
    }

    function showLoading() {
        if (elements.loadingState) elements.loadingState.style.display = 'block';
        if (elements.errorState) elements.errorState.style.display = 'none';
        if (elements.placeInfoCard) elements.placeInfoCard.style.display = 'none';
        if (elements.reviewsSection) elements.reviewsSection.style.display = 'none';
    }

    function showError(message) {
        if (elements.loadingState) elements.loadingState.style.display = 'none';
        if (elements.errorState) elements.errorState.style.display = 'block';
        if (elements.errorMessageText) elements.errorMessageText.textContent = message;
        if (elements.placeInfoCard) elements.placeInfoCard.style.display = 'none';
        if (elements.reviewsSection) elements.reviewsSection.style.display = 'none';
    }

    function showContent() {
        if (elements.loadingState) elements.loadingState.style.display = 'none';
        if (elements.errorState) elements.errorState.style.display = 'none';
        if (elements.placeInfoCard) elements.placeInfoCard.style.display = 'block';
        if (elements.reviewsSection) elements.reviewsSection.style.display = 'block';
    }

    async function loadPlaceData() {
        if (!state.placeId) return;

        try {
            showLoading();
            
            // Verificar que los servicios estén disponibles
            if (!ListopicApp.services || !ListopicApp.services.db) {
                throw new Error('Servicios de Firebase no disponibles');
            }
            
            console.log('Cargando datos del lugar:', state.placeId);
            
            // Obtener datos del lugar desde Firestore
            const placeDoc = await ListopicApp.services.db.collection('places').doc(state.placeId).get();
            
            if (!placeDoc.exists) {
                throw new Error('Lugar no encontrado');
            }

            state.placeData = { id: placeDoc.id, ...placeDoc.data() };
            console.log('Datos del lugar cargados:', state.placeData);
            
            renderPlaceInfo();
            
            // Cargar reseñas del lugar
            await loadPlaceReviews();

            // Comprobar estado de seguimiento
            await checkFollowStatus();
            
            showContent();
            
        } catch (error) {
            console.error('Error cargando datos del lugar:', error);
            showError('Error cargando los datos del lugar: ' + error.message);
        }
    }

    function renderPlaceInfo() {
        const place = state.placeData;
        if (!place) return;

        // Actualizar encabezado
        if (elements.placeNameHeader) {
            elements.placeNameHeader.textContent = place.name || 'Lugar';
        }
        if (elements.placeAddressHeader) {
            elements.placeAddressHeader.textContent = place.address || 'Información del establecimiento';
        }

        // Actualizar nombre
        if (elements.placeNameDetail) {
            elements.placeNameDetail.textContent = place.name || 'Nombre no disponible';
        }

        // Actualizar dirección
        if (elements.placeAddress && place.address) {
            elements.placeAddress.innerHTML = `
                <i class="fas fa-map-marker-alt"></i>
                <span>${escapeHtml(place.address)}</span>
            `;
        }

        // Actualizar teléfono
        if (elements.placePhone && place.phone) {
            elements.placePhone.innerHTML = `
                <i class="fas fa-phone"></i>
                <a href="tel:${place.phone}">${escapeHtml(place.phone)}</a>
            `;
            elements.placePhone.style.display = 'block';
        }

        // Actualizar sitio web
        if (elements.placeWebsite && place.website) {
            elements.placeWebsite.innerHTML = `
                <i class="fas fa-globe"></i>
                <a href="${place.website}" target="_blank" rel="noopener noreferrer">Sitio web</a>
            `;
            elements.placeWebsite.style.display = 'block';
        }

        // Actualizar horarios
        if (elements.placeHours && place.openingHours && place.openingHours.weekday_text) {
            const isOpen = place.openingHours.open_now ? 'Abierto ahora' : 'Cerrado';
            const statusClass = place.openingHours.open_now ? 'open' : 'closed';
            elements.placeHours.innerHTML = `
                <i class="fas fa-clock"></i>
                <span class="hours-status ${statusClass}">${isOpen}</span>
            `;
            elements.placeHours.style.display = 'block';
        }

        // Actualizar nivel de precios
        if (elements.placePriceLevel && place.priceLevel !== null && place.priceLevel !== undefined) {
            const priceText = getPriceRange(place.priceLevel);
            elements.placePriceLevel.innerHTML = `
                <i class="fas fa-dollar-sign"></i>
                <span>${priceText}</span>
            `;
            elements.placePriceLevel.style.display = 'block';
        }

        // Actualizar tipos de lugar
        if (elements.placeTypes && place.types && place.types.length > 0) {
            elements.placeTypes.innerHTML = place.types.slice(0, 3).map(type => 
                `<span class="place-type-tag">${getPlaceTypeName(type)}</span>`
            ).join('');
        }

        // Actualizar imagen
        if (place.mainImageUrl) {
            if (elements.placeImage) {
                elements.placeImage.src = place.mainImageUrl;
                elements.placeImage.style.display = 'block';
            }
            if (elements.placeImagePlaceholder) {
                elements.placeImagePlaceholder.style.display = 'none';
            }
        } else {
            if (elements.placeImage) elements.placeImage.style.display = 'none';
            if (elements.placeImagePlaceholder) elements.placeImagePlaceholder.style.display = 'flex';
        }

        // Actualizar enlace de ubicación
        if (elements.locationLink && place.geometry && place.geometry.location) {
            let lat, lng;
            
            // Manejar diferentes formatos de coordenadas
            if (place.location && typeof place.location.latitude === 'number') {
                // Firebase GeoPoint
                lat = place.location.latitude;
                lng = place.location.longitude;
            } else if (place.geometry.location.lat !== undefined) {
                if (typeof place.geometry.location.lat === 'function') {
                    // Firebase GeoPoint con funciones
                    lat = place.geometry.location.lat();
                    lng = place.geometry.location.lng();
                } else {
                    // Objeto simple
                    lat = place.geometry.location.lat;
                    lng = place.geometry.location.lng;
                }
            }
            
            if (lat && lng) {
                elements.locationLink.href = `https://www.google.com/maps?q=${lat},${lng}`;
            }
        }

        // Actualizar título de la página
        document.title = `${place.name || 'Lugar'} - Listopic`;
    }

    async function loadPlaceReviews() {
        try {
            // Verificar que los servicios estén disponibles
            if (!ListopicApp.services || !ListopicApp.services.db) {
                throw new Error('Servicios de Firebase no disponibles');
            }

            console.log('Buscando reseñas para lugar:', state.placeId);

            // Buscar todas las listas que contengan reseñas de este lugar
            const reviewsQuery = await ListopicApp.services.db.collectionGroup('reviews')
                .where('placeId', '==', state.placeId)
                .get();

            console.log('Reseñas encontradas:', reviewsQuery.size);
            console.log('Documentos de reseñas:', reviewsQuery.docs.map(doc => ({
                id: doc.id,
                listId: doc.data().listId,
                userId: doc.data().userId,
                placeId: doc.data().placeId
            })));

            const reviewsByListMap = new Map();
            let totalReviews = 0;
            let totalRating = 0;

            // Agrupar reseñas por lista
            for (const reviewDoc of reviewsQuery.docs) {
                const reviewData = { id: reviewDoc.id, ...reviewDoc.data() };
                const listId = reviewDoc.ref.parent.parent.id;

                console.log('Procesando reseña:', reviewData.itemName, 'de lista:', listId);

                if (!reviewsByListMap.has(listId)) {
                    // Obtener datos de la lista
                    const listDoc = await ListopicApp.services.db.collection('lists').doc(listId).get();
                    const listData = listDoc.exists ? listDoc.data() : {};

                    reviewsByListMap.set(listId, {
                        listId: listId,
                        listName: listData.name || 'Lista sin nombre',
                        listCategory: listData.categoryId || 'general',
                        isPublic: listData.isPublic !== false, // Por defecto público
                        reviews: []
                    });
                }

                reviewsByListMap.get(listId).reviews.push(reviewData);
                totalReviews++;
                totalRating += reviewData.overallRating || 0;
            }

            // Filtrar solo listas públicas
            state.reviewsByList = Array.from(reviewsByListMap.values())
                .filter(listGroup => listGroup.isPublic);

            console.log('Grupos de reseñas públicas:', state.reviewsByList.length);

            // Actualizar estadísticas
            updatePlaceStats(
                totalReviews,
                state.reviewsByList.length,
                totalReviews > 0 ? totalRating / totalReviews : 0
            );

            // Renderizar reseñas
            renderReviews();

        } catch (error) {
            console.error('Error cargando reseñas del lugar:', error);
            showError('Error cargando las reseñas: ' + error.message);
        }
    }

    // Función auxiliar para escapar HTML
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function updatePlaceStats(totalReviews, totalLists, avgRating) {
        if (elements.totalReviews) {
            elements.totalReviews.textContent = totalReviews;
        }
        
        if (elements.totalLists) {
            elements.totalLists.textContent = totalLists;
        }
        
        if (elements.avgRating) {
            elements.avgRating.textContent = avgRating.toFixed(1);
        }
        
        if (elements.googleRating && state.placeData && state.placeData.googleRating) {
            elements.googleRating.textContent = state.placeData.googleRating.toFixed(1);
        }
    }

    function renderReviews() {
        if (!elements.reviewsContainer) return;

        if (state.reviewsByList.length === 0) {
            elements.reviewsContainer.style.display = 'none';
            if (elements.noReviewsMessage) {
                elements.noReviewsMessage.style.display = 'block';
            }
            return;
        }

        elements.reviewsContainer.style.display = 'block';
        if (elements.noReviewsMessage) {
            elements.noReviewsMessage.style.display = 'none';
        }

        // Filtrar y ordenar reseñas
        let filteredLists = [...state.reviewsByList];
        
        if (state.currentFilter) {
            filteredLists = filteredLists.filter(listGroup => 
                listGroup.listName.toLowerCase().includes(state.currentFilter.toLowerCase()) ||
                listGroup.reviews.some(review => 
                    (review.itemName || '').toLowerCase().includes(state.currentFilter.toLowerCase()) ||
                    (review.notes || '').toLowerCase().includes(state.currentFilter.toLowerCase())
                )
            );
        }

        // Ordenar listas
        filteredLists.sort((a, b) => {
            switch (state.currentSort) {
                case 'rating':
                    const avgA = a.reviews.reduce((sum, r) => sum + (r.overallRating || 0), 0) / a.reviews.length;
                    const avgB = b.reviews.reduce((sum, r) => sum + (r.overallRating || 0), 0) / b.reviews.length;
                    return avgB - avgA;
                case 'date':
                    const latestA = Math.max(...a.reviews.map(r => r.createdAt?.toDate?.()?.getTime() || 0));
                    const latestB = Math.max(...b.reviews.map(r => r.createdAt?.toDate?.()?.getTime() || 0));
                    return latestB - latestA;
                case 'list':
                default:
                    return a.listName.localeCompare(b.listName);
            }
        });

        const html = filteredLists.map(listGroup => {
            return `
                <div class="review-list-group">
                    <div class="list-group-header">
                        <h4 class="list-name">
                            <i class="fas fa-list"></i>
                            <a href="list-view.html?listId=${listGroup.listId}">${escapeHtml(listGroup.listName)}</a>
                        </h4>
                        <span class="review-count">${listGroup.reviews.length} reseña${listGroup.reviews.length !== 1 ? 's' : ''}</span>
                    </div>
                    
                    <div class="reviews-grid">
                        ${listGroup.reviews.map(review => createReviewCard(review, listGroup)).join('')}
                    </div>
                </div>
            `;
        }).join('');

        elements.reviewsContainer.innerHTML = html;
    }

    function createReviewCard(review, listGroup) {
        const rating = review.overallRating || 0;
        const ratingColor = getRatingColor(rating);
        
        return `
            <div class="review-card" onclick="showReviewDetail('${listGroup.listId}', '${review.id}')">
                <div class="review-header">
                    <div class="review-rating" style="color: ${ratingColor};">
                        ${generateStars(rating)}
                        <span class="rating-number">${rating.toFixed(1)}</span>
                    </div>
                    <div class="review-date">
                        ${review.createdAt ? formatDate(review.createdAt) : 'Sin fecha'}
                    </div>
                </div>
                
                <div class="review-content">
                    <h5 class="item-name">${escapeHtml(review.itemName || 'Elemento')}</h5>
                    
                    ${review.criteriaRatings && Object.keys(review.criteriaRatings).length > 0 ? `
                        <div class="criteria-ratings">
                            ${Object.entries(review.criteriaRatings).slice(0, 3).map(([criteria, score]) => `
                                <div class="criteria-item">
                                    <span class="criteria-label">${escapeHtml(criteria)}</span>
                                    <span class="criteria-value" style="color: ${getRatingColor(score)};">
                                        ${score.toFixed(1)}
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    
                    ${review.notes ? `
                        <div class="review-notes">
                            <p>${escapeHtml(review.notes.substring(0, 100))}${review.notes.length > 100 ? '...' : ''}</p>
                        </div>
                    ` : ''}

                    ${review.userTags && review.userTags.length > 0 ? `
                        <div class="review-tags">
                            ${review.userTags.slice(0, 3).map(tag =>
                                `<span class="tag-pill">${escapeHtml(tag)}</span>`
                            ).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    function getRatingColor(rating) {
        if (rating >= 4.5) return 'var(--success-color)';
        if (rating >= 3.5) return 'var(--warning-color)';
        if (rating >= 2.5) return 'var(--accent-color-secondary)';
        return 'var(--error-color)';
    }

    function generateStars(rating) {
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
        
        let stars = '';
        for (let i = 0; i < fullStars; i++) {
            stars += '<i class="fas fa-star"></i>';
        }
        if (hasHalfStar) {
            stars += '<i class="fas fa-star-half-alt"></i>';
        }
        for (let i = 0; i < emptyStars; i++) {
            stars += '<i class="far fa-star"></i>';
        }
        
        return stars;
    }

    function formatDate(timestamp) {
        if (!timestamp) return 'Sin fecha';
        
        let date;
        if (timestamp.toDate) {
            date = timestamp.toDate();
        } else if (timestamp instanceof Date) {
            date = timestamp;
        } else {
            return 'Fecha inválida';
        }
        
        return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    function getPlaceTypeName(type) {
        const typeNames = {
            'restaurant': 'Restaurante',
            'food': 'Comida',
            'establishment': 'Establecimiento',
            'point_of_interest': 'Punto de interés',
            'meal_takeaway': 'Para llevar',
            'meal_delivery': 'Delivery',
            'cafe': 'Café',
            'bar': 'Bar',
            'night_club': 'Club nocturno',
            'shopping_mall': 'Centro comercial',
            'store': 'Tienda',
            'tourist_attraction': 'Atracción turística',
            'lodging': 'Alojamiento',
            'gas_station': 'Gasolinera',
            'hospital': 'Hospital',
            'pharmacy': 'Farmacia',
            'bank': 'Banco',
            'atm': 'Cajero automático',
            'gym': 'Gimnasio',
            'beauty_salon': 'Salón de belleza',
            'hair_care': 'Peluquería',
            'spa': 'Spa'
        };
        
        return typeNames[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    function getPriceRange(priceLevel) {
        const ranges = {
            0: 'Gratis',
            1: '$',
            2: '$$',
            3: '$$$',
            4: '$$$$'
        };
        return ranges[priceLevel] || 'No especificado';
    }

    // Funciones de acción
    function sharePlace() {
        if (navigator.share && state.placeData) {
            navigator.share({
                title: state.placeData.name,
                text: `Mira este lugar en Listopic: ${state.placeData.name}`,
                url: window.location.href
            }).catch(console.error);
        } else {
            // Fallback: copiar al portapapeles
            navigator.clipboard.writeText(window.location.href).then(() => {
                alert('Enlace copiado al portapapeles');
            }).catch(() => {
                alert('No se pudo compartir el enlace');
            });
        }
    }

    function addReview() {
        if (state.placeData) {
            // Redirigir al formulario de reseña con el lugar preseleccionado
            window.location.href = `review-form.html?placeId=${state.placeId}`;
        }
    }

    // Funciones globales para navegación
    window.showReviewDetail = function(listId, reviewId) {
        window.location.href = `detail-view.html?listId=${listId}&reviewId=${reviewId}`;
    };

    function updateFollowButton() {
        if (!elements.followPlaceBtn || !elements.followPlaceBtnText || !elements.followPlaceBtnIcon) return;

        if (state.isFollowing) {
            elements.followPlaceBtnText.textContent = 'Siguiendo';
            elements.followPlaceBtnIcon.classList.remove('fa-user-plus');
            elements.followPlaceBtnIcon.classList.add('fa-user-check');
            elements.followPlaceBtn.classList.add('following');
        } else {
            elements.followPlaceBtnText.textContent = 'Seguir';
            elements.followPlaceBtnIcon.classList.remove('fa-user-check');
            elements.followPlaceBtnIcon.classList.add('fa-user-plus');
            elements.followPlaceBtn.classList.remove('following');
        }
    }

    async function checkFollowStatus() {
        const currentUser = ListopicApp.services.auth.currentUser;
        if (!currentUser || !state.placeData) {
            state.isFollowing = false;
            updateFollowButton();
            if (elements.followPlaceBtn) elements.followPlaceBtn.style.display = currentUser ? 'inline-flex' : 'none';
            return;
        }

        // Asegurarse de que placeData.followers sea un array
        const followers = Array.isArray(state.placeData.followers) ? state.placeData.followers : [];
        state.isFollowing = followers.includes(currentUser.uid);
        if (elements.followPlaceBtn) elements.followPlaceBtn.style.display = 'inline-flex';
        updateFollowButton();
    }

    async function toggleFollowPlace() {
        const currentUser = ListopicApp.services.auth.currentUser;
        if (!currentUser) {
            // Idealmente, redirigir a login o mostrar un mensaje
            alert('Debes iniciar sesión para seguir lugares.');
            return;
        }

        if (!state.placeId || !ListopicApp.services.db) return;

        const placeRef = ListopicApp.services.db.collection('places').doc(state.placeId);
        const userId = currentUser.uid;

        elements.followPlaceBtn.disabled = true;

        try {
            await ListopicApp.services.db.runTransaction(async (transaction) => {
                const placeDoc = await transaction.get(placeRef);
                if (!placeDoc.exists) {
                    throw "El lugar no existe.";
                }

                const placeData = placeDoc.data();
                // Asegurarse de que followers sea un array
                const followers = Array.isArray(placeData.followers) ? placeData.followers : [];

                if (followers.includes(userId)) {
                    // Dejar de seguir: remover userId del array
                    transaction.update(placeRef, {
                        followers: firebase.firestore.FieldValue.arrayRemove(userId)
                    });
                    state.isFollowing = false;
                } else {
                    // Seguir: agregar userId al array
                    transaction.update(placeRef, {
                        followers: firebase.firestore.FieldValue.arrayUnion(userId)
                    });
                    state.isFollowing = true;
                }
            });

            // Actualizar placeData localmente si es necesario para reflejar el cambio en followers
            if (state.placeData) {
                 if(state.isFollowing) {
                    state.placeData.followers = [...(state.placeData.followers || []), userId];
                 } else {
                    state.placeData.followers = (state.placeData.followers || []).filter(uid => uid !== userId);
                 }
            }
            console.log('Estado de seguimiento actualizado.');

        } catch (error) {
            console.error("Error al actualizar seguimiento: ", error);
            alert('Error al actualizar el seguimiento del lugar.');
            // Revertir el estado visual si falla la transacción
            state.isFollowing = !state.isFollowing;
        } finally {
            updateFollowButton();
            elements.followPlaceBtn.disabled = false;
        }
    }

    function openDirections() {
        if (state.placeData && state.placeData.geometry && state.placeData.geometry.location) {
            let lat, lng;
            const location = state.placeData.geometry.location;

            if (location.lat !== undefined && location.lng !== undefined) {
                 // Para objetos como { lat: number, lng: number } o funciones lat(), lng() de GeoPoint
                lat = typeof location.lat === 'function' ? location.lat() : location.lat;
                lng = typeof location.lng === 'function' ? location.lng() : location.lng;
            } else if (typeof location.latitude === 'number' && typeof location.longitude === 'number') {
                // Para objetos Firebase GeoPoint { latitude: number, longitude: number }
                lat = location.latitude;
                lng = location.longitude;
            }

            if (lat && lng) {
                const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
                window.open(googleMapsUrl, '_blank');
            } else {
                alert('Coordenadas no disponibles para este lugar.');
            }
        } else if (state.placeData && state.placeData.address) {
            // Fallback a búsqueda por dirección si no hay coordenadas
             const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(state.placeData.address)}`;
             window.open(googleMapsUrl, '_blank');
        } else {
            alert('No hay información de ubicación disponible para este lugar.');
        }
    }


    async function init() {
        console.log('Initializing Place Detail page logic...');
        
        cacheDOMElements();
        attachEventListeners();
        
        state.placeId = getPlaceIdFromURL();
        
        if (!state.placeId) {
            showError('ID de lugar no especificado en la URL');
            return;
        }

        // Esperar a que los servicios estén disponibles
        let attempts = 0;
        const maxAttempts = 50; // 5 segundos máximo
        
        while ((!ListopicApp.services || !ListopicApp.services.db) && attempts < maxAttempts) {
            console.log('Esperando servicios de Firebase...', attempts);
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (!ListopicApp.services || !ListopicApp.services.db) {
            showError('No se pudieron cargar los servicios de Firebase. Por favor, recarga la página.');
            return;
        }

        console.log('Servicios de Firebase listos, cargando lugar...');
        await loadPlaceData();
    }

    return {
        init
    };
})();