window.ListopicApp = window.ListopicApp || {};

ListopicApp.pagePlaceDetail = {
    elements: {},
    placeId: null,
    currentUser: null,
    isFollowing: false,
    originalReviews: [], 
    originalGroups: [],

    init: function() {
        console.log("[page-place-detail.js] INICIANDO...");
        const urlParams = new URLSearchParams(window.location.search);
        this.placeId = urlParams.get('placeId');

        if (!this.placeId) {
            document.body.innerHTML = "<h1>Error: No se ha especificado un lugar en la URL.</h1>";
            return;
        }
        
        this.cacheDOMElements();
        this.attachEventListeners(); // Unificamos la gestión de eventos
        this.loadPageData();

        // **INTEGRACIÓN**: Comprobamos si hay un usuario para mostrar el botón de seguir
        ListopicApp.authService.onAuthStateChangedPromise().then(user => {
            this.currentUser = user;
            if (this.currentUser) {
                this.elements.followUnfollowBtn.style.display = 'inline-block';
                this.checkFollowStatus();
            }
        });
    },

    cacheDOMElements: function() {
        this.elements = {
            placePhoto: document.getElementById('place-photo'),
            placeName: document.getElementById('place-name'),
            placeAddress: document.getElementById('place-address'),
            googleMapsLink: document.getElementById('place-google-maps-link'),
            avgRating: document.getElementById('place-avg-rating'),
            reviewCount: document.getElementById('place-review-count'),
            listsCount: document.getElementById('place-lists-count'),
            reviewsContainer: document.getElementById('place-reviews-container'),
            groupsContainer: document.getElementById('place-groups-container'),
            addReviewGlobalBtn: document.getElementById('add-review-global-btn'),
            googleRating: document.getElementById('place-google-rating'), // Añadido
            tabButtons: document.querySelectorAll('.profile-tab-button'),
            tabContents: document.querySelectorAll('.profile-tab-content'),
            followersCount: document.getElementById('place-followers-count'),
            followUnfollowBtn: document.getElementById('follow-unfollow-place-btn'),
            websiteContainer: document.getElementById('place-website-container'),
            website: document.getElementById('place-website'),
            phoneContainer: document.getElementById('place-phone-container'),
            phone: document.getElementById('place-phone'),
            hoursContainer: document.getElementById('place-hours-container'),
            hours: document.getElementById('place-hours'),
            priceContainer: document.getElementById('place-price-container'),
            price: document.getElementById('place-price'),
        };
        console.log("[page-place-detail.js] Elementos del DOM cacheados.");
    },
    
    // **INTEGRACIÓN**: Nueva función para manejar todos los listeners
    attachEventListeners: function() {
        // Listener para el nuevo botón de seguir
        this.elements.followUnfollowBtn?.addEventListener('click', () => this.handleFollowToggle());

        // Listeners para las pestañas
        this.elements.tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tab = button.dataset.tab;
                this.elements.tabButtons.forEach(btn => btn.classList.remove('active'));
                this.elements.tabContents.forEach(content => content.classList.remove('active'));
                button.classList.add('active');
                document.getElementById(`${tab}-content`).classList.add('active');
            });
        });
    },

    loadPageData: async function() {
        console.log(`[page-place-detail.js] Solicitando datos para el lugar: ${this.placeId}`);
        try {
            const getPlaceDetails = firebase.app().functions('europe-west1').httpsCallable('getPlaceDetails');
            
            const result = await getPlaceDetails({ placeId: this.placeId });
            console.log("[page-place-detail.js] Datos recibidos del backend:", result.data);

            const { placeInfo, groups, latestReviews } = result.data;

            if (!placeInfo) {
                throw new Error("La respuesta del servidor no contiene 'placeInfo'.");
            }

            this.originalReviews = latestReviews || [];
            this.originalGroups = groups || [];

            this.renderPlaceDetails(placeInfo);
            this.renderReviews(this.originalReviews);
            this.renderGroups(this.originalGroups);
            this.setupGlobalAddReviewButton(this.originalGroups, this.originalReviews);

        } catch (error) {
            console.error("Error CRÍTICO al cargar los datos de la página del lugar:", error);
            this.elements.placeName.textContent = "Error al cargar el lugar";
            this.elements.reviewsContainer.innerHTML = `<p class="error-placeholder">No se pudieron cargar los datos. Revisa la consola.</p>`;
            this.elements.groupsContainer.innerHTML = `<p class="error-placeholder">No se pudieron cargar los datos. Revisa la consola.</p>`;
        }
    },

    renderPlaceDetails: function(placeData) {
        // --- ¡AQUÍ ESTÁ EL CAMBIO! ---
        // Obtenemos 'googleRating' de los datos que recibimos
        const {
            name,
            formatted_address,
            photos,
            googleMapsUrl,
            reviewsCount,
            averageRating,
            followersCount,
            website,
            phone,
            current_opening_hours,
            priceLevel,
            googleRating // Añadido
        } = placeData;

        // Renderizado de datos existentes
        document.title = `${name || 'Lugar'} - Listopic`;
        this.elements.placeName.textContent = name || 'Nombre no disponible';
        if (this.elements.placeAddress?.querySelector('span')) {
            this.elements.placeAddress.querySelector('span').textContent = formatted_address || 'Dirección no disponible';
        }
        // Foto: usar foto de Google (si llega), si no, usar mainImageUrl del doc, y por último el logo
        const fallbackPhoto = placeData.mainImageUrl || 'img/logo-listopic400.png';
        this.elements.placePhoto.src = (photos && photos[0]) || fallbackPhoto;
        this.elements.googleMapsLink.href = googleMapsUrl || '#';
        if (!googleMapsUrl) this.elements.googleMapsLink.style.display = 'none';
        
        // --- Renderizado de estadísticas (con los cambios) ---
        this.elements.reviewCount.textContent = reviewsCount !== undefined ? reviewsCount : '0';
        this.elements.avgRating.textContent = averageRating ? averageRating.toFixed(1) : 'N/A';
        this.elements.followersCount.textContent = followersCount !== undefined ? followersCount : '0';
        // Mostramos la nueva nota de Google, formateada a un decimal
        this.elements.googleRating.textContent = googleRating ? googleRating.toFixed(1) : 'N/A';
        
        // --- Renderizado de información extra (sin cambios) ---
        if (website) {
            this.elements.website.href = website;
            this.elements.website.textContent = new URL(website).hostname.replace('www.','');
            this.elements.websiteContainer.style.display = 'block';
        }
        if (phone) {
            this.elements.phone.textContent = phone;
            this.elements.phoneContainer.style.display = 'block';
        }
        if (current_opening_hours) {
            const isOpen = current_opening_hours.open_now;
            this.elements.hours.textContent = isOpen ? 'Abierto ahora' : 'Cerrado ahora';
            this.elements.hours.className = isOpen ? 'hours-status open' : 'hours-status closed';
            this.elements.hoursContainer.style.display = 'block';
        }
        if (priceLevel !== undefined && priceLevel > 0) {
            this.elements.price.textContent = '€'.repeat(priceLevel);
            this.elements.priceContainer.style.display = 'block';
        }

        // Renderizar atributos de accesibilidad y servicios
        try {
            const accEl = document.getElementById('place-accessibility');
            const srvEl = document.getElementById('place-services');
            if (accEl) {
                accEl.innerHTML = '';
                const acc = placeData.accessibility || {};
                const items = [];
                if (acc.wheelchairAccessibleEntrance === true) items.push('<span class="badge-attr"><i class="fas fa-wheelchair"></i> Acceso silla</span>');
                if (acc.wheelchairAccessibleSeating === true) items.push('<span class="badge-attr"><i class="fas fa-chair"></i> Asientos adaptados</span>');
                if (acc.wheelchairAccessibleParking === true) items.push('<span class="badge-attr"><i class="fas fa-square-parking"></i> Parking adaptado</span>');
                if (acc.wheelchairAccessibleRestroom === true) items.push('<span class="badge-attr"><i class="fas fa-restroom"></i> Aseo adaptado</span>');
                if (acc.hearingLoop === true) items.push('<span class="badge-attr"><i class="fas fa-assistive-listening-systems"></i> Bucle magnético</span>');
                accEl.innerHTML = items.join('');
            }
            if (srvEl) {
                srvEl.innerHTML = '';
                const sv = placeData.serviceOptions || {};
                const items = [];
                if (sv.outdoorSeating === true) items.push('<span class="badge-attr"><i class="fas fa-umbrella-beach"></i> Terraza</span>');
                if (sv.dineIn === true) items.push('<span class="badge-attr"><i class="fas fa-utensils"></i> Comer allí</span>');
                if (sv.delivery === true) items.push('<span class="badge-attr"><i class="fas fa-truck"></i> A domicilio</span>');
                if (sv.takeout === true) items.push('<span class="badge-attr"><i class="fas fa-bag-shopping"></i> Para llevar</span>');
                if (sv.curbsidePickup === true) items.push('<span class="badge-attr"><i class="fas fa-car-side"></i> Recogida en coche</span>');
                srvEl.innerHTML = items.join('');
            }
        } catch (e) { console.warn('[place-detail] No se pudieron renderizar atributos', e); }
    },

    renderReviews: async function(reviews) {
        console.log("[page-place-detail.js] Renderizando reseñas...", reviews);
        if (reviews.length === 0) {
            this.elements.reviewsContainer.innerHTML = '<p>Este lugar todavía no tiene reseñas. ¡Sé el primero!</p>';
            return;
        }
        try {
            const reviewDocs = reviews.map(r => ({ id: r.id, data: () => r, exists: true }));
            const enrichedReviews = await ListopicApp.uiUtils.enrichReviews(reviewDocs);
            this.elements.reviewsContainer.innerHTML = enrichedReviews.map(review => 
                ListopicApp.uiUtils.renderReviewSuperCard(review)
            ).join('');
        } catch (error) {
            console.error("Error al enriquecer las reseñas:", error);
            this.elements.reviewsContainer.innerHTML = '<p class="error-placeholder">Error al mostrar las reseñas.</p>';
        }
    },

    renderGroups: function(groups) {
        console.log("[page-place-detail.js] Renderizando grupos...", groups);
        if (groups.length === 0) {
            this.elements.groupsContainer.innerHTML = '<p>Este lugar no se ha valorado en ningún grupo todavía.</p>';
            return;
        }
        this.elements.groupsContainer.innerHTML = groups.map(group => 
            this.renderGroupCard(group)
        ).join('');
    },
    
    setupTabs: function() {
        this.elements.tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tab = button.dataset.tab;
                this.elements.tabButtons.forEach(btn => btn.classList.remove('active'));
                this.elements.tabContents.forEach(content => content.classList.remove('active'));
                button.classList.add('active');
                document.getElementById(`${tab}-content`).classList.add('active');
            });
        });
    },

    // =================================================================
    // AQUÍ ESTÁ LA MAGIA - LA FUNCIÓN CORREGIDA
    // =================================================================
    renderGroupCard: function(group) {
        const groupIcon = group.icon || 'fa-users';
    
        let tagsHtml = '';
        console.log("[page-place-detail.js] Procesando etiquetas para el grupo:", group.itemName, group.groupTags);

        if (group.groupTags && group.groupTags.length > 0) {
            const tagsList = group.groupTags.map(tag => {
                // Comprobamos si 'tag' es un objeto o un string
                let tagName = '';
                if (typeof tag === 'object' && tag !== null) {
                    // Si es un objeto, intentamos obtener la propiedad 'name', 'tag', o 'tagName'
                    tagName = tag.name || tag.tag || tag.tagName || '';
                    if (!tagName) {
                         // Si sigue sin nombre, mostramos el objeto para depurar
                         console.warn("Se encontró un objeto de etiqueta sin una propiedad de nombre reconocible:", tag);
                         tagName = '[Etiqueta mal formada]';
                    }
                } else {
                    // Si ya es un string, lo usamos directamente
                    tagName = tag;
                }
                return `<span class="tag">${this.escapeHtml(tagName)}</span>`;
            }).join('');
            
            tagsHtml = `<div class="group-card-tags-container">${tagsList}</div>`;
        }
    
        const groupId = encodeURIComponent(`${group.establishmentName}-${group.itemName}`);
        const avg = (group.avgGeneralScore || 0).toFixed(1);
        const addReviewHref = group.listId ? `review-form.html?listId=${group.listId}&placeId=${encodeURIComponent(group.placeId || this.placeId)}&itemName=${encodeURIComponent(group.itemName || '')}` : '';
        const detailHref = `grouped-detail-view.html?listId=${group.listId}&placeId=${encodeURIComponent(group.placeId || this.placeId)}&item=${encodeURIComponent(group.itemName || '')}`;
        const thumbHtml = group.thumbnailUrl
            ? `<img class=\"group-card-thumb\" src=\"${this.escapeHtml(group.thumbnailUrl)}\" alt=\"${this.escapeHtml(group.itemName)}\">`
            : `<div class=\"group-card-icon\"><i class=\"fas ${groupIcon}\"></i></div>`;

        const listSourceHtml = group.listName ? `<span class="group-card-list-source">de la lista: ${this.escapeHtml(group.listName)}</span>` : '';

        return `
            <div class="group-card-item">
                <a class="group-card-link" href="${detailHref}">
                    ${thumbHtml}
                    <div class="group-card-info">
                        <strong class="group-card-name">${this.escapeHtml(group.itemName)}</strong>
                        ${listSourceHtml}
                        ${tagsHtml}
                    </div>
                </a>
                <div class="group-card-actions">
                    <div class="group-card-score" title="Valoración media">
                        <span class="score-badge">${avg}</span>
                    </div>
                    ${addReviewHref ? `<a class=\"button secondary-button\" href=\"${addReviewHref}\"><i class=\"fas fa-plus\"></i> Valorar</a>` : ''}
                </div>
            </div>
        `;
    },

    // Configura el botón global "Valorar este lugar" eligiendo una lista por defecto
    setupGlobalAddReviewButton: function(groups, latestReviews) {
        try {
            const btn = this.elements.addReviewGlobalBtn;
            if (!btn) return;

            const freq = new Map();
            (groups || []).forEach(g => {
                if (g.listId) freq.set(g.listId, (freq.get(g.listId) || 0) + 1);
            });
            if (freq.size === 0 && Array.isArray(latestReviews) && latestReviews.length > 0) {
                const firstWithList = latestReviews.find(r => !!r.listId);
                if (firstWithList) freq.set(firstWithList.listId, 1);
            }
            if (freq.size === 0) {
                btn.style.display = 'none';
                return;
            }
            let bestListId = null; let bestCount = -1;
            for (const [listId, count] of freq.entries()) {
                if (count > bestCount) { bestCount = count; bestListId = listId; }
            }
            if (bestListId) {
                btn.href = `review-form.html?listId=${bestListId}&placeId=${encodeURIComponent(this.placeId)}`;
                btn.style.display = 'inline-flex';
            } else {
                btn.style.display = 'none';
            }
        } catch (e) {
            console.warn('[place-detail] No se pudo configurar botón global de reseña', e);
        }
    },
    // --- NUEVAS FUNCIONES PARA SEGUIMIENTO ---

checkFollowStatus: async function() {
    if (!this.currentUser) return;
    const db = ListopicApp.services.db;
    const followDocRef = db.collection('places').doc(this.placeId).collection('followers').doc(this.currentUser.uid);
    
    try {
        const doc = await followDocRef.get();
        this.isFollowing = doc.exists;
        this.updateFollowButtonUI();
    } catch (error) {
        console.error("Error al comprobar el estado de seguimiento del lugar:", error);
    }
},

updateFollowButtonUI: function() {
    const btn = this.elements.followUnfollowBtn;
    if (!btn) return;

    if (this.isFollowing) {
        btn.innerHTML = `<i class="fas fa-check"></i> Siguiendo`;
        btn.classList.remove('primary-button');
        btn.classList.add('secondary-button');
    } else {
        btn.innerHTML = `<i class="fas fa-bookmark"></i> Seguir Lugar`;
        btn.classList.remove('secondary-button');
        btn.classList.add('primary-button');
    }
},

handleFollowToggle: async function() {
    if (!this.currentUser) {
        ListopicApp.services.showNotification("Debes iniciar sesión para seguir un lugar.", "error");
        return;
    }

    const btn = this.elements.followUnfollowBtn;
    btn.disabled = true;

    try {
        const functions = firebase.app().functions('europe-west1');
        const toggleFollow = functions.httpsCallable('toggleFollowPlace'); // Asumimos que esta función existe
        const result = await toggleFollow({ placeId: this.placeId });

        this.isFollowing = result.data.status === 'followed';
        this.updateFollowButtonUI();

        const followersCountEl = this.elements.followersCount;
        let currentFollowers = parseInt(followersCountEl.textContent, 10);
        followersCountEl.textContent = this.isFollowing ? currentFollowers + 1 : Math.max(0, currentFollowers - 1);
        
        ListopicApp.services.showNotification(result.data.message, 'success');

    } catch (error) {
        console.error("Error al seguir/dejar de seguir el lugar:", error);
        ListopicApp.services.showNotification(`Error: ${error.message}`, 'error');
        // Revertir el estado visual si la operación falla
        this.checkFollowStatus(); 
    } finally {
        btn.disabled = false;
    }


},


// --- NUEVAS FUNCIONES PARA SEGUIMIENTO ---

checkFollowStatus: async function() {
    if (!this.currentUser) return;
    const db = ListopicApp.services.db;
    // CORRECCIÓN CLAVE: La colección de seguidores está en /places/{placeId}/followers, no en /users/{userId}/following
    const followDocRef = db.collection('places').doc(this.placeId).collection('followers').doc(this.currentUser.uid);

    try {
        const doc = await followDocRef.get();
        this.isFollowing = doc.exists;
        this.updateFollowButtonUI();
    } catch (error) {
        console.error("Error al comprobar el estado de seguimiento del lugar:", error);
    }
},

updateFollowButtonUI: function() {
    const btn = this.elements.followUnfollowBtn;
    if (!btn) return;

    if (this.isFollowing) {
        btn.innerHTML = `<i class="fas fa-check"></i> Siguiendo`;
        btn.classList.remove('primary-button');
        btn.classList.add('secondary-button');
    } else {
        btn.innerHTML = `<i class="fas fa-bookmark"></i> Seguir Lugar`;
        btn.classList.remove('secondary-button');
        btn.classList.add('primary-button');
    }
},

handleFollowToggle: async function() {
    if (!this.currentUser) {
        ListopicApp.services.showNotification("Debes iniciar sesión para seguir un lugar.", "error");
        return;
    }

    const btn = this.elements.followUnfollowBtn;
    const originalContent = btn.innerHTML; // Guardar el estado original del botón
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Procesando...`;

    try {
        const functions = firebase.app().functions('europe-west1');
        const toggleFollow = functions.httpsCallable('toggleFollowPlace');
        const result = await toggleFollow({ placeId: this.placeId });

        // AHORA USAMOS EL ESTADO DEVUELTO POR LA FUNCIÓN
        this.isFollowing = result.data.status === 'followed';
        this.updateFollowButtonUI();

        const followersCountEl = this.elements.followersCount;
        let currentFollowers = parseInt(followersCountEl.textContent, 10);
        followersCountEl.textContent = this.isFollowing ? currentFollowers + 1 : Math.max(0, currentFollowers - 1);

        ListopicApp.services.showNotification(result.data.message, 'success');

    } catch (error) {
        console.error("Error al seguir/dejar de seguir el lugar:", error);
        ListopicApp.services.showNotification(`Error: ${error.message}`, 'error');
        // En caso de error, volvemos a poner el botón como estaba
        btn.innerHTML = originalContent;
        // Revertir el estado visual si la operación falla
        this.checkFollowStatus();
    } finally {
        btn.disabled = false;
    }
},


// --- FUNCIONES EXISTENTES (SIN CAMBIOS) ---
    escapeHtml: function(str) {
        if (typeof str !== 'string') return '';
        const p = document.createElement("p");
        p.textContent = str;
        return p.innerHTML;
    }
};
    

// **CORRECCIÓN**: Volvemos a añadir el inicializador, pero con un retardo para evitar el problema de tiempo.
document.addEventListener('DOMContentLoaded', () => {
    // Este retardo se asegura de que los servicios principales (como authService) se hayan cargado primero.
    setTimeout(() => {
        if (document.querySelector('.place-detail-page-container')) {
            ListopicApp.pagePlaceDetail.init();
        }
    }, 250); // Un cuarto de segundo es un margen seguro.
});
