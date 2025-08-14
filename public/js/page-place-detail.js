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
        this.elements.placePhoto.src = photos?.[0] || 'img/logo-listopic400.png';
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
    
        return `
            <div class="group-card-item">
                <a href="grouped-detail-view.html?groupId=${groupId}&placeId=${group.placeId}">
                    <div class="group-card-icon">
                        <i class="fas ${groupIcon}"></i>
                    </div>
                    <div class="group-card-info">
                        <strong class="group-card-name">${this.escapeHtml(group.itemName)}</strong>
                        <span class="group-card-list-source">
                            de la lista: ${this.escapeHtml(group.listName || 'N/A')}
                        </span>
                        ${tagsHtml}
                    </div>
                </a>
            </div>
        `;
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