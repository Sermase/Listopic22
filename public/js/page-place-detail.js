// public/js/page-place-detail.js (VERSIÓN CORREGIDA)

window.ListopicApp = window.ListopicApp || {};

ListopicApp.pagePlaceDetail = {
    elements: {},
    placeId: null,
    // Almacenaremos los datos originales para poder filtrar
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
        this.loadPageData();
        this.setupTabs();
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
            tabButtons: document.querySelectorAll('.profile-tab-button'),
            tabContents: document.querySelectorAll('.profile-tab-content')
        };
        console.log("[page-place-detail.js] Elementos del DOM cacheados.");
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
        console.log("[page-place-detail.js] Renderizando cabecera...", placeData);
        const { name, formatted_address, photos, googleMapsUrl, reviewsCount, listsCount, averageRating } = placeData;
        
        document.title = `${name || 'Lugar'} - Listopic`;
        this.elements.placeName.textContent = name || 'Nombre no disponible';
        
        if (this.elements.placeAddress?.querySelector('span')) {
           this.elements.placeAddress.querySelector('span').textContent = formatted_address || 'Dirección no disponible';
        }
        
        // CORRECCIÓN de ruta de imagen: Usamos una imagen que sí existe.
        this.elements.placePhoto.src = photos?.[0] || 'img/logo-listopic400.png';
        
        if (googleMapsUrl) {
            this.elements.googleMapsLink.href = googleMapsUrl;
        } else {
            this.elements.googleMapsLink.style.display = 'none';
        }
        
        this.elements.reviewCount.textContent = reviewsCount !== undefined ? reviewsCount : '0';
        this.elements.listsCount.textContent = listsCount !== undefined ? listsCount : '0';
        this.elements.avgRating.textContent = averageRating ? averageRating.toFixed(1) : 'N/A';
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
    
    escapeHtml: function(str) {
        if (typeof str !== 'string') return '';
        const p = document.createElement("p");
        p.textContent = str;
        return p.innerHTML;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.place-detail-page-container')) {
        ListopicApp.pagePlaceDetail.init();
    }
});