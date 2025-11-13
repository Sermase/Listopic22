window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageListView = (() => {
    // Variables de estado
    let currentSortColumn = 'avgGeneralScore';
    let currentSortDirection = 'desc';
    let activeTagFilters = new Set();
    let currentListIconClass = 'fa-solid fa-list';

    // Variables del DOM
    let listTitleElement, reviewsGridContainer, searchInput, tagFilterContainer,
    addReviewButton, editListLink, deleteListButton, showMapModalBtn,
    followListBtn,
    mapModal, closeMapModalBtn, mapContainer, mapFiltersBtn, mapCenterUserBtn, listMapInstance;

    let markersMap = new Map();
    let basePlacesForMap = [];
    let filteredPlaceIdsForMap = new Set();
    let filteredGroupsForMap = [];
    let shouldShowAllPlacesOnMap = true;
    let userLocationMarker = null;
    let forumModal, closeModalForumBtn, forumListNameSpan, forumMessagesContainer,
        newForumMessageInput, sendForumMessageBtn, messagesCollectionRef;

    // Estado inicial del mapa si viene codificado en la URL
    let initialMapParams = null; // { open, lat, lng, zoom }
    let isFollowingList = false;

    function setMapParamsInUrl(open, center, zoom, push=false) {
        try {
            const params = new URLSearchParams(window.location.search);
            if (open) {
                params.set('map', '1');
                if (center) {
                    params.set('mlat', center.lat.toFixed(6));
                    params.set('mlng', center.lng.toFixed(6));
                }
                if (typeof zoom === 'number') params.set('mzoom', String(zoom));
            } else {
                params.delete('map');
                params.delete('mlat');
                params.delete('mlng');
                params.delete('mzoom');
            }
            const newUrl = `${window.location.pathname}?${params.toString()}`;
            if (push) window.history.pushState(null, '', newUrl); else window.history.replaceState(null, '', newUrl);
        } catch (e) { /* noop */ }
    }

    function readMapParamsFromUrl() {
        const p = new URLSearchParams(window.location.search);
        const open = p.get('map') === '1';
        if (!open) return { open: false };
        const lat = parseFloat(p.get('mlat'));
        const lng = parseFloat(p.get('mlng'));
        const zoom = parseInt(p.get('mzoom') || '0', 10);
        return {
            open: true,
            lat: isFinite(lat) ? lat : null,
            lng: isFinite(lng) ? lng : null,
            zoom: isFinite(zoom) ? zoom : null
        };
    }

    // Filtros extra y mapa de opciones de lugares
    const extraFiltersState = {
        placeOptionsMap: new Map(),
        filters: {
            wheelchairEntrance: false,
            wheelchairSeating: false,
            outdoor: false,
            dinein: false,
            delivery: false,
            takeout: false,
            curbside: false
        }
    };


    const tileLayers = {
        light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    };
    let currentTileLayer = null; // Para guardar la capa de mapa actual    

    // --- ICONOS SVG PERSONALIZADOS PARA EL MAPA (VERSIÓN MEJORADA Y ÚNICA) ---

    const userLocationIconSvg = `
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="7" fill="#118AB2" stroke="white" stroke-width="2"/>
        <circle cx="24" cy="24" r="12" stroke="#118AB2" stroke-width="2" stroke-opacity="0.9">
          <animate attributeName="r" from="12" to="22" dur="1.7s" begin="0s" repeatCount="indefinite" keyTimes="0; 1" values="12; 22"/>
          <animate attributeName="stroke-opacity" from="0.9" to="0" dur="1.7s" begin="0s" repeatCount="indefinite" keyTimes="0; 1" values="0.9; 0"/>
        </circle>
      </svg>
    `;

    // En page-list-view.js, reemplaza la función existente por esta:

    const createPlaceIconSvg = (score, color = '#118AB2') => {
        const textColor = 'white'; 
        const scoreText = (score || 0).toFixed(1);
        
        // Creamos un ID único para el gradiente
        const uniqueGradientId = `pinGradient_${String(score).replace('.', 'p')}_${Math.random().toString(36).substr(2, 5)}`;
    
        // Esta es la versión corregida SIN los comentarios que daban error
        return `
            <svg width="40" height="50" viewBox="0 0 40 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="${uniqueGradientId}" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:${color}; stop-opacity:1" />
                        <stop offset="100%" style="stop-color:black; stop-opacity:0.4" />
                    </linearGradient>
                    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="1" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.4"/>
                    </filter>
                </defs>
                <path d="M20 0C9.5 0 1 8.5 1 19C1 31.5 18.5 48.5 20 50C21.5 48.5 39 31.5 39 19C39 8.5 30.5 0 20 0Z" 
                      fill="url(#${uniqueGradientId})" 
                      stroke="rgba(255,255,255,0.5)" 
                      stroke-width="1.5"
                      filter="url(#shadow)"/>
                <circle cx="20" cy="19" r="14" fill="white" fill-opacity="0.2"/>
                <text x="50%" y="43%" 
                      dominant-baseline="middle" 
                      text-anchor="middle" 
                      font-family="'Poppins', sans-serif" 
                      font-size="14" 
                      font-weight="700" 
                      fill="${textColor}"
                      style="text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">
                      ${scoreText}
                </text>
            </svg>
        `;
    };

    // En /public/js/page-list-view.js, reemplaza la función getIconByScore

    function getIconByScore(score) {
        // CHIVATO 1: ¿Qué puntuación estamos recibiendo?
        console.log(`[DEBUG] getIconByScore recibió la puntuación: ${score}`);
        const scoreNum = parseFloat(score) || 0;
    
        // ¡La magia! Obtenemos el color HEX correcto desde nuestro nuevo centro de mando.
        const color = ListopicApp.uiUtils.getRatingHexColor(scoreNum);
    
        // Llamamos a la función que crea el SVG, pasándole el color que hemos calculado.
        // La función createPlaceIconSvg que ya tienes está bien, no hay que tocarla.
        return L.divIcon({
            html: createPlaceIconSvg(scoreNum, color),
            className: '', 
            iconSize: [40, 50],
            iconAnchor: [20, 50],
            popupAnchor: [0, -50]
        });
    }
    
    // --- FIN DE LA SECCIÓN DE ICONOS ---

    // El resto de funciones (getListIconClass_ListView, renderReviewCards, etc.) se mantienen como las tienes
    // ...
    function getListIconClass_ListView(listName) {
        if (!listName) return 'fa-solid fa-list';
        const listNameLower = listName.toLowerCase();
        if (listNameLower.includes('tarta') || listNameLower.includes('pastel') || listNameLower.includes('torta')) return 'fa-solid fa-birthday-cake';
        if (listNameLower.includes('pizza')) return 'fa-solid fa-pizza-slice';
        if (listNameLower.includes('hamburguesa') || listNameLower.includes('burger')) return 'fa-solid fa-hamburger';
        return 'fa-solid fa-list';
    }

    function handleCardImageError(imgElement) {
        if (!imgElement || imgElement.dataset.fallbackApplied === '1') return;
        imgElement.dataset.fallbackApplied = '1';
        const container = imgElement.closest('.review-list-card__image-container');
        if (!container) return;
        container.innerHTML = '';
        const placeholder = document.createElement('div');
        placeholder.className = 'review-list-card__icon-placeholder';
        const icon = document.createElement('i');
        icon.className = currentListIconClass || 'fas fa-camera';
        placeholder.appendChild(icon);
        container.appendChild(placeholder);
    }

    function renderReviewCards(groupedItemsToRender) {
        if (!reviewsGridContainer) return;
        reviewsGridContainer.innerHTML = '';
        if (groupedItemsToRender.length === 0) {
            reviewsGridContainer.innerHTML = '<p class="no-reviews-message">No hay elementos que coincidan.</p>';
            return;
        }
        groupedItemsToRender.forEach(group => {
            const listData = { criteriaDefinition: ListopicApp.state.currentListCriteriaDefinitions };
            const cardHtml = ListopicApp.uiUtils.createListViewGroupCard(group, listData, currentListIconClass);
            reviewsGridContainer.insertAdjacentHTML('beforeend', cardHtml);
        });
        reviewsGridContainer.querySelectorAll('.review-list-card__image').forEach(img => {
            img.addEventListener('error', () => handleCardImageError(img));
            if (img.complete && img.naturalWidth === 0) {
                handleCardImageError(img);
            }
        });
    }

    function renderTagFilters_ListView() {
        const uiUtils = ListopicApp.uiUtils;
        if (!tagFilterContainer) return;
        tagFilterContainer.innerHTML = '';
        if (ListopicApp.state.currentListAvailableTags && ListopicApp.state.currentListAvailableTags.length > 0) { 
            ListopicApp.state.currentListAvailableTags.forEach(tag => {
                const button = document.createElement('button');
                button.className = 'tag-filter-button';
                button.textContent = uiUtils.escapeHtml(tag);
                button.dataset.tag = tag;
                button.addEventListener('click', toggleTagFilter_ListView_Grouped);
                tagFilterContainer.appendChild(button);
            });
        }
    }
    
    function applyFiltersAndSort_ListView_Grouped() {
        let filteredItems = [...ListopicApp.state.allGroupedItems]; 
        const searchTerm = searchInput.value.toLowerCase();

        if (searchTerm) {
            filteredItems = filteredItems.filter(group =>
                (group.establishmentName && group.establishmentName.toLowerCase().includes(searchTerm)) ||
                (group.itemName && group.itemName.toLowerCase().includes(searchTerm))
            );
        }

        if (activeTagFilters.size > 0) {
            filteredItems = filteredItems.filter(group => {
                if (!group.groupTags || group.groupTags.length === 0) return false;
                return [...activeTagFilters].every(filterTag => group.groupTags.includes(filterTag));
            });
        }

        filteredItems.sort((a, b) => {
            let valA = a[currentSortColumn] ?? 0;
            let valB = b[currentSortColumn] ?? 0;
            if (currentSortDirection === 'asc') {
                return valA > valB ? 1 : -1;
            } else {
                return valA < valB ? 1 : -1;
            }
        });
        updateFilteredPlacesForMap(filteredItems);
        renderReviewCards(filteredItems);
        refreshMapMarkers().catch(error => console.error('LIST-VIEW: Error al refrescar el mapa tras filtros.', error));
    }
    
    function toggleTagFilter_ListView_Grouped(event) {
        const clickedTag = event.target.dataset.tag;
        if (!clickedTag) return;
        activeTagFilters.has(clickedTag) ? activeTagFilters.delete(clickedTag) : activeTagFilters.add(clickedTag);
        event.target.classList.toggle('selected');
        applyFiltersAndSort_ListView_Grouped();
    }

    function openMapModal() {
        if (!mapModal) return;
    
        // --- INICIO DE LA MODIFICACIÓN ---
        const mapTitleElement = document.getElementById('map-modal-title');
        // Obtenemos el nombre de la lista que ya tenemos guardado
        const listName = ListopicApp.state.currentListName || "la Lista"; 
    
        if (mapTitleElement) {
            // Actualizamos el texto del título
            mapTitleElement.textContent = `Mapa de ${listName}`;
        }
        // --- FIN DE LA MODIFICACIÓN ---
    
        mapModal.classList.add('active');
        setTimeout(() => {
            if (!listMapInstance) {
                initializeListMap();
            } else {
                listMapInstance.invalidateSize(); // recalcula el tamaño
            }
        }, 10);
        try {
            if (listMapInstance) setMapParamsInUrl(true, listMapInstance.getCenter(), listMapInstance.getZoom(), true);
            else setMapParamsInUrl(true, {lat:40.4167,lng:-3.703}, 6, true);
        } catch(e){}
    }

    function closeModal() {
        if (mapModal) mapModal.classList.remove('active');
        // Push state when closing
        setMapParamsInUrl(false, null, null, true);
    }

    function initializeListMap() {
        if (!mapContainer || listMapInstance) return;

        // Determinamos el tema INICIAL basándonos en la clase del body
        const initialTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
        
        listMapInstance = L.map(mapContainer).setView([40.4167, -3.703], 6);
        
        // Creamos la capa de mapa con el tema inicial
        currentTileLayer = L.tileLayer(tileLayers[initialTheme], {
            attribution: '&copy; OpenStreetMap &copy; CARTO'
        }).addTo(listMapInstance);

        // El resto de la función se mantiene igual (geolocalización, etc.)
        recenterMapToUser({ silent: true });

        fetchPlacesForCurrentList();

        document.addEventListener('themeChanged', handleThemeChangeOnMap);

        // Sync map movements into URL without polluting history
        try {
            listMapInstance.on('moveend zoomend', () => {
                try {
                    setMapParamsInUrl(true, listMapInstance.getCenter(), listMapInstance.getZoom(), false);
                } catch(e){}
            });
        } catch(e){}

    }
    
    function handleThemeChangeOnMap(event) {
        if (!listMapInstance || !currentTileLayer) return;
        const newTheme = event.detail.theme; // 'light' o 'dark'

        // Cambiamos la URL de la capa del mapa actual. Es más eficiente que quitar y poner.
        currentTileLayer.setUrl(tileLayers[newTheme]);
    }

    function setUserLocationMarker(lat, lng, options = {}) {
        if (!listMapInstance || typeof lat !== 'number' || typeof lng !== 'number') return;
        const { recenter = false } = options;
        const userLatLng = [lat, lng];
        if (!userLocationMarker) {
            const userIcon = L.divIcon({ html: userLocationIconSvg, className: '', iconSize: [48, 48], iconAnchor: [24, 24] });
            userLocationMarker = L.marker(userLatLng, { icon: userIcon }).addTo(listMapInstance).bindPopup('¡Estás aquí!');
        } else {
            userLocationMarker.setLatLng(userLatLng);
        }
        if (recenter) {
            const currentZoom = listMapInstance.getZoom();
            const targetZoom = currentZoom < 13 ? 13 : currentZoom;
            listMapInstance.setView(userLatLng, targetZoom);
        }
    }

    function recenterMapToUser({ silent = false } = {}) {
        if (!navigator.geolocation) {
            if (!silent) ListopicApp.services?.showNotification?.("Tu navegador no permite obtener tu ubicación automáticamente.", "warn");
            return;
        }
        navigator.geolocation.getCurrentPosition(pos => {
            setUserLocationMarker(pos.coords.latitude, pos.coords.longitude, { recenter: true });
        }, () => {
            if (!silent) ListopicApp.services?.showNotification?.("No se pudo obtener tu ubicación.", "warn");
        });
    }
    async function fetchPlacesForCurrentList() {
        const listId = ListopicApp.state.currentListId;
        if (!listId) return;
        try {
            const getPlacesForList = firebase.app().functions('europe-west1').httpsCallable('getPlacesForList');
            const result = await getPlacesForList({ listId });
            addPlacesToMap(result.data.places);
        } catch (error) {
            console.error("Error al obtener lugares para el mapa:", error);
            ListopicApp.services.showNotification(error.message, "error");
        }
    }

    // Devuelve top 3 elementos por lugar desde el estado si no vienen desde backend
    function topItemsFromState(placeId, options = {}) {
        const { limit = 3 } = options;
        try {
            const sources = [];
            if (Array.isArray(filteredGroupsForMap) && filteredGroupsForMap.length) {
                sources.push(filteredGroupsForMap);
            }
            sources.push(ListopicApp.state?._allGroupedItemsBase || []);

            for (const source of sources) {
                if (!Array.isArray(source) || source.length === 0) continue;
                const groups = source.filter(g => g.placeId === placeId);
                if (!groups.length) continue;
                return groups
                    .map(g => ({
                        name: g.itemName || 'General',
                        avg: typeof g.avgGeneralScore === 'number' ? g.avgGeneralScore : 0,
                        count: g.itemCount || 0
                    }))
                    .sort((a, b) => {
                        if ((b.avg || 0) === (a.avg || 0)) {
                            return (b.count || 0) - (a.count || 0);
                        }
                        return (b.avg || 0) - (a.avg || 0);
                    })
                    .slice(0, limit);
            }
        } catch(e) { /* noop */ }
        return [];
    }

    function updateFilteredPlacesForMap(filteredGroups) {
        filteredGroupsForMap = Array.isArray(filteredGroups) ? filteredGroups : [];
        const ids = filteredGroupsForMap
            .map(group => group.placeId)
            .filter(placeId => typeof placeId === 'string' && placeId);
        filteredPlaceIdsForMap = new Set(ids);
        const baseGroups = ListopicApp.state?._allGroupedItemsBase || [];
        shouldShowAllPlacesOnMap = filteredGroupsForMap.length === baseGroups.length;
        ListopicApp.state.currentFilteredGroupsForMap = filteredGroupsForMap;
    }

    function resolveItemsForPlace(place) {
        const fromState = topItemsFromState(place.id, { limit: 3 });
        if (fromState.length) return fromState;
        if (Array.isArray(place.topItems) && place.topItems.length) {
            return place.topItems
                .map(item => ({
                    name: item.name || 'General',
                    avg: typeof item.avgGeneralScore === 'number' ? item.avgGeneralScore : 0,
                    count: item.itemCount || 0
                }))
                .sort((a, b) => {
                    if ((b.avg || 0) === (a.avg || 0)) {
                        return (b.count || 0) - (a.count || 0);
                    }
                    return (b.avg || 0) - (a.avg || 0);
                })
                .slice(0, 3);
        }
        return [];
    }

    async function renderPlacesOnMap(places) {
        if (!listMapInstance || !Array.isArray(places)) return;

        markersMap.forEach(marker => marker.remove());
        markersMap.clear();

        if (places.length === 0) return;

        if (ListopicApp.uiUtils && typeof ListopicApp.uiUtils.refreshPlacePhotoIfNeeded === 'function') {
            const refreshTargets = places
                .filter(place => !place.mainImageUrl || ListopicApp.uiUtils.isLegacyGooglePhotoUrl(place.mainImageUrl))
                .slice(0, 10);
            if (refreshTargets.length) {
                await Promise.all(refreshTargets.map(place => ListopicApp.uiUtils.refreshPlacePhotoIfNeeded(place).catch(() => null)));
            }
        }

        const markers = [];
        places.forEach(place => {
            if (place.location?.latitude && place.location?.longitude) {
                const items = resolveItemsForPlace(place);
                const highestScore = items.length > 0
                    ? (items[0].avg || 0)
                    : (typeof place.bestItemScore === 'number' ? place.bestItemScore : (place.avgGeneralScore || 0));
                const customIcon = getIconByScore(highestScore);
                const marker = L.marker([place.location.latitude, place.location.longitude], { icon: customIcon });

                const itemsHtml = items.length ? `
                    <div class="popup-items">
                        ${items.map(it => `
                            <a class="popup-item__row" href="grouped-detail-view.html?listId=${ListopicApp.state.currentListId}&placeId=${place.id}&item=${encodeURIComponent(it.name)}">
                                <span class="popup-item__name">${ListopicApp.uiUtils.escapeHtml(it.name)}</span>
                                <span class="score-badge">${(it.avg || 0).toFixed(1)}</span>
                            </a>`).join('')}
                    </div>` : '';

                const popupContent = `
                <div class="listopic-map-popup">
                    ${place.mainImageUrl ? `<div class="popup-image" style="background-image: url('${ListopicApp.uiUtils.escapeHtml(place.mainImageUrl)}')"></div>` : ''}
                    <div class="popup-content">
                        <h5 class="popup-title">${ListopicApp.uiUtils.escapeHtml(place.name)}</h5>
                        ${itemsHtml}
                        <a href="place-detail.html?placeId=${place.id}" class="popup-link button submit-button">Ver lugar</a>
                    </div>
                </div>
                `;
                marker.bindPopup(popupContent);
                marker.on('click', () => {
                    try {
                        const center = listMapInstance.getCenter();
                        const zoom = listMapInstance.getZoom();
                        setMapParamsInUrl(true, center, zoom);
                    } catch(e) {}
                });
                marker.on('dblclick', () => { window.location.href = `place-detail.html?placeId=${place.id}`; });
                markers.push(marker);
                markersMap.set(place.id, marker);
            }
        });

        if (markers.length > 0) {
            const featureGroup = L.featureGroup(markers).addTo(listMapInstance);
            if (!navigator.geolocation) {
                 listMapInstance.fitBounds(featureGroup.getBounds()).pad(0.1);
            }
        }
    }

    async function refreshMapMarkers() {
        if (!listMapInstance) return;
        const places = shouldShowAllPlacesOnMap
            ? basePlacesForMap.slice()
            : basePlacesForMap.filter(place => filteredPlaceIdsForMap.has(place.id));
        await renderPlacesOnMap(places);
    }

    function addPlacesToMap(places) {
        basePlacesForMap = Array.isArray(places) ? places : [];
        refreshMapMarkers().catch(error => console.error('LIST-VIEW: Error al actualizar marcadores en el mapa.', error));
    }

    // En public/js/page-list-view.js

// En public/js/page-list-view.js



// Función auxiliar para mantener el código de fetch organizado
async function fetchGroupedReviews(listId) {
    const currentUser = ListopicApp.services.auth.currentUser;
    const idToken = currentUser ? await currentUser.getIdToken(true) : null;
    
    const headers = { 'Accept': 'application/json' };
    if(idToken) headers['Authorization'] = `Bearer ${idToken}`;
    
    const functionUrl = ListopicApp.config.FUNCTION_URLS.groupedReviews;
    if (!functionUrl) throw new Error("URL de la función groupedReviews no configurada.");
    
    const res = await fetch(`${functionUrl}?listId=${listId}`, { headers });
    if (!res.ok) {
        const errorText = await res.text();
        let detail = `Error HTTP ${res.status}`;
        try {
            const errorJson = JSON.parse(errorText);
            detail = errorJson.error?.message || JSON.stringify(errorJson.error) || errorText;
        } catch(e) { detail = errorText; }
        throw new Error(detail.substring(0, 200));
    }
    return res.json();
}

// REEMPLAZA la antigua función renderTable_ListView_Grouped por esta:
function renderTable_ListView_Grouped(groupedItemsToRender) {
    const container = document.getElementById('reviews-container-grid'); // Usaremos un nuevo contenedor
    if (!container) return;

    container.innerHTML = ''; // Limpiamos el contenedor

    if (groupedItemsToRender.length === 0) {
        container.innerHTML = '<p class="no-reviews-message">No hay elementos que coincidan con los filtros seleccionados.</p>';
        return;
    }

    // Renderizamos cada grupo de reseñas usando nuestra nueva tarjeta
    groupedItemsToRender.forEach(group => {
        // Necesitamos los datos de la lista para los nombres de los criterios
        const listData = { criteriaDefinition: ListopicApp.state.currentListCriteriaDefinitions };
        
        const cardHtml = ListopicApp.uiUtils.createListViewGroupCard(group, listData, currentListIconClass);
        container.innerHTML += cardHtml;
    });
}

// ***-------------------------------------- ***
// *** SECCIÓN ÚNICA PARA LA LÓGICA DEL FORO ***
// ***-------------------------------------- ***

function initForumModal() {
    forumModal = document.getElementById('list-forum-modal');
    closeModalForumBtn = forumModal.querySelector('.close-modal');
    forumListNameSpan = document.getElementById('forum-list-name');
    forumMessagesContainer = document.getElementById('forum-messages-container');
    newForumMessageInput = document.getElementById('new-forum-message');
    sendForumMessageBtn = document.getElementById('send-forum-message');
    
    const listName = ListopicApp.state.currentListName || listTitleElement.textContent;
    if(forumListNameSpan) forumListNameSpan.textContent = listName;
    
    document.getElementById('forum-button').addEventListener('click', openForumModal);
    closeModalForumBtn.addEventListener('click', closeForumModal);
    sendForumMessageBtn.addEventListener('click', sendForumMessage);

    initForumFirestoreRef();
}

function initForumFirestoreRef() {
    const db = ListopicApp.services.db;
    const listId = ListopicApp.state.currentListId;

    messagesCollectionRef = db.collection('listForums').doc(listId).collection('messages');
    const messagesQuery = messagesCollectionRef.orderBy('timestamp', 'asc'); 
    
    messagesQuery.onSnapshot(snapshot => {
        const messages = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            time: formatTime(doc.data().timestamp?.toDate())
        }));
        renderForumMessages(messages);
    }, error => {
        console.error("Error cargando mensajes del foro:", error);
        ListopicApp.services.showNotification('Error cargando mensajes del foro', 'error');
    });
}

function openForumModal() {
    if(forumModal) forumModal.style.display = 'block';
    if(newForumMessageInput) newForumMessageInput.focus();
}

function closeForumModal() {
    if(forumModal) forumModal.style.display = 'none';
}

function formatTime(date) {
    if (!date) return 'justo ahora';
    const now = new Date();
    const diffMinutes = Math.floor((now - date) / 60000);
    if (diffMinutes < 1) return 'justo ahora';
    if (diffMinutes < 60) return `hace ${diffMinutes} min`;
    if (diffMinutes < 1440) return `hace ${Math.floor(diffMinutes / 60)} h`;
    return date.toLocaleDateString('es-ES');
}

function renderForumMessages(messages) {
    if(!forumMessagesContainer) return;
    forumMessagesContainer.innerHTML = '';

    if (messages.length === 0) {
        forumMessagesContainer.innerHTML = '<p class="no-messages">¡Sé el primero en comentar!</p>';
        return;
    }
    
    const user = ListopicApp.services.auth.currentUser;
    
    messages.forEach(msg => {
        const messageEl = document.createElement('div');
        messageEl.className = 'forum-message';
        
        const canDelete = user && (user.uid === msg.userId || user.uid === "w4cCQoKBGOUtbEU2KXTnN69OmuA2");
        const deleteButtonHtml = canDelete ? `<button class="delete-message-btn" title="Eliminar mensaje" data-message-id="${msg.id}">❌</button>` : '';

        messageEl.innerHTML = `
            <div class="message-header">
                <strong>${msg.userName || 'Anónimo'}</strong>
                <span class="message-time">${msg.time}</span>
                ${deleteButtonHtml}
            </div>
            <p class="message-text">${ListopicApp.uiUtils.escapeHtml(msg.text)}</p>
        `;
        forumMessagesContainer.appendChild(messageEl);
    });

    forumMessagesContainer.querySelectorAll('.delete-message-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteForumMessage(e.target.dataset.messageId);
        });
    });
    
    forumMessagesContainer.scrollTop = forumMessagesContainer.scrollHeight;
}

async function deleteForumMessage(messageId) {
    if (!confirm("¿Eliminar este mensaje? Esta acción no se puede deshacer.")) return;
    try {
        await messagesCollectionRef.doc(messageId).delete();
        ListopicApp.services.showNotification('Mensaje eliminado.', 'success');
    } catch (error) {
        console.error('Error eliminando mensaje:', error);
        ListopicApp.services.showNotification('Error al eliminar el mensaje.', 'error');
    }
}

async function sendForumMessage() {
    const messageText = newForumMessageInput.value.trim();
    if (!messageText) return;

    const user = ListopicApp.services.auth.currentUser;
    if (!user) {
        ListopicApp.services.showNotification('Debes iniciar sesión para comentar.', 'error');
        return;
    }

    sendForumMessageBtn.disabled = true;
    try {
        await messagesCollectionRef.add({
            text: messageText,
            userId: user.uid,
            userName: user.displayName || user.email.split('@')[0],
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        newForumMessageInput.value = '';
    } catch (error) {
        console.error('Error enviando mensaje:', error);
        ListopicApp.services.showNotification('No se pudo enviar el mensaje.', 'error');
    } finally {
        sendForumMessageBtn.disabled = false;
    }
}
// ***-------------------------------------- ***
// *** FIN DE SECCIÓN DEL FORO ***
// ***-------------------------------------- ***


function init() {
console.log('Initializing List View page logic...');
const state = ListopicApp.state;

// Cacheo de elementos del DOM (ya corregido)
listTitleElement = document.getElementById('list-title');
reviewsGridContainer = document.getElementById('reviews-grid-container'); // Apuntamos al nuevo div
searchInput = document.querySelector('.search-input');
tagFilterContainer = document.querySelector('.tag-filter-container');
addReviewButton = document.querySelector('.add-review-button');
editListLink = document.getElementById('edit-list-link');
deleteListButton = document.getElementById('delete-list-button');
showMapModalBtn = document.getElementById('show-map-modal-btn');
mapModal = document.getElementById('list-map-modal');
closeMapModalBtn = document.getElementById('close-map-modal-btn');
mapContainer = document.getElementById('list-map-container');
mapFiltersBtn = document.getElementById('map-filters-btn');
mapCenterUserBtn = document.getElementById('map-center-user-btn');

// Reinicio de estado de la página (se mantiene igual)
state.allGroupedItems = []; 
state.currentListAvailableTags = [];
activeTagFilters = new Set();
currentSortColumn = 'avgGeneralScore';
currentSortDirection = 'desc';

const urlParamsList = new URLSearchParams(window.location.search);
state.currentListId = urlParamsList.get('listId'); 

// --- LÓGICA DE INICIALIZACIÓN CORREGIDA ---
if (state.currentListId) {
    if (addReviewButton) addReviewButton.href = `review-form.html?listId=${state.currentListId}`;
    if (editListLink) editListLink.href = `list-form.html?editListId=${state.currentListId}`;

    const listDocRef = ListopicApp.services.db.collection('lists').doc(state.currentListId);
    listDocRef.get().then(listDoc => {
        if (!listDoc.exists) throw new Error("La lista no fue encontrada.");
        
        const listData = listDoc.data();
        const currentUser = ListopicApp.services.auth.currentUser;
        const isOwner = currentUser && currentUser.uid === listData.userId;

        if (editListLink) editListLink.style.display = isOwner ? 'inline-flex' : 'none';
        if (deleteListButton) deleteListButton.style.display = isOwner ? 'inline-flex' : 'none';

        state.currentListName = listData.name || "Ranking";
        const category = listData.categoryId || "Hmm..."; 
        ListopicApp.uiUtils.updatePageHeaderInfo(category, state.currentListName);
        if (listTitleElement) listTitleElement.textContent = state.currentListName;

        // Pintar estadísticas junto al título
        try {
            const statsEl = document.getElementById('list-stats');
            if (statsEl) {
                const rc = listData.reviewCount || 0;
                const fc = listData.followersCount || 0;
                const cc = listData.commentsCount || 0;
                statsEl.innerHTML = `
                    <span><i class="fas fa-star-half-alt"></i> ${rc} reseñas</span>
                    <span><i class="fas fa-user-group"></i> <span id="list-followers-count">${fc}</span> seguidores</span>
                    <span><i class="fas fa-comments"></i> ${cc} comentarios</span>
                `;
            }
        } catch(e) { /* noop */ }

        return fetchGroupedReviews(state.currentListId);

    })
    .then(async responsePayload => {
        if (!responsePayload || typeof responsePayload !== 'object') {
            throw new Error("Respuesta inesperada de la Cloud Function.");
        }
        state.currentListName = responsePayload.listName || "Ranking Agrupado";
        const category = responsePayload.categoryId || "Hmm..."; 
        ListopicApp.uiUtils.updatePageHeaderInfo(category, state.currentListName);
        
        if (listTitleElement) listTitleElement.textContent = state.currentListName;
        state.currentListAvailableTags = responsePayload.tags || [];
        state.currentListCriteriaDefinitions = responsePayload.criteria || {}; 
        currentListIconClass = getListIconClass_ListView(state.currentListName);
        
        // Ya no renderizamos cabeceras de tabla
        // renderTableHeaders_ListView_Grouped(); 
        renderTagFilters_ListView();
        initForumModal();

        state._allGroupedItemsBase = responsePayload.groupedReviews || [];
        state.allGroupedItems = state._allGroupedItemsBase;
        // Pre-cargar opciones de lugares para filtros extra
        try { await preloadPlaceOptionsForGroups(state._allGroupedItemsBase); } catch(e) { console.warn('No se pudieron precargar opciones de lugares', e); }
        applyFiltersAndSort_ListView_Grouped();

        // Restaurar el estado del mapa si venimos de atrás con parámetros en la URL
        initialMapParams = readMapParamsFromUrl();
        if (initialMapParams && initialMapParams.open) {
            // Abrimos el modal del mapa y restauramos vista tras inicializar
            openMapModal();
            setTimeout(() => {
                try {
                    if (listMapInstance && initialMapParams.lat != null && initialMapParams.lng != null) {
                        listMapInstance.setView([initialMapParams.lat, initialMapParams.lng], initialMapParams.zoom || listMapInstance.getZoom());
                    }
                } catch(e) {}
            }, 120);
        }
    })
    .catch(error => {
        console.error("LIST-VIEW: Error en fetch o procesamiento:", error);
        if (listTitleElement) listTitleElement.textContent = "Error al cargar lista";
        // Mostramos el error en nuestro nuevo contenedor
        if (reviewsGridContainer) reviewsGridContainer.innerHTML = `<p class="error-placeholder">${error.message}</p>`;
        ListopicApp.services.showNotification(`Error al cargar la lista: ${error.message}`, "error");
    });
} else {
    if (listTitleElement) listTitleElement.textContent = "Error: Lista no especificada";
    if (reviewsGridContainer) reviewsGridContainer.innerHTML = `<p class="error-placeholder">ID de lista no especificado en la URL.</p>`;
    ListopicApp.services.showNotification("ID de lista no especificado en la URL.", "error");
}

// Listeners de UI (eliminamos el de la tabla)
if(searchInput) searchInput.addEventListener('input', applyFiltersAndSort_ListView_Grouped);

// --- Modal de filtros extra ---
const showFiltersBtn = document.getElementById('show-filters-modal-btn');
const extraFiltersModal = document.getElementById('extra-filters-modal');
const btnFiltersApply = document.getElementById('extra-filters-apply');
const btnFiltersClear = document.getElementById('extra-filters-clear');
const btnFiltersCancel = document.getElementById('extra-filters-cancel');

function openFiltersModal(){ if(extraFiltersModal) extraFiltersModal.style.display='flex'; }
function closeFiltersModal(){ if(extraFiltersModal) extraFiltersModal.style.display='none'; }

showFiltersBtn && showFiltersBtn.addEventListener('click', openFiltersModal);
mapFiltersBtn && mapFiltersBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openFiltersModal();
});
mapCenterUserBtn && mapCenterUserBtn.addEventListener('click', (e) => {
    e.preventDefault();
    recenterMapToUser();
});
btnFiltersCancel && btnFiltersCancel.addEventListener('click', (e)=>{ e.preventDefault(); closeFiltersModal(); });
btnFiltersClear && btnFiltersClear.addEventListener('click', (e)=>{
    e.preventDefault();
    Object.assign(extraFiltersState.filters, { wheelchairEntrance:false, wheelchairSeating:false, outdoor:false, dinein:false, delivery:false, takeout:false, curbside:false });
    ['filt-wheelchair-entrance','filt-wheelchair-seating','filt-outdoor','filt-dinein','filt-delivery','filt-takeout','filt-curbside'].forEach(id=>{ const el=document.getElementById(id); if(el) el.checked=false; });
});
btnFiltersApply && btnFiltersApply.addEventListener('click', (e)=>{
    e.preventDefault();
    extraFiltersState.filters.wheelchairEntrance = !!document.getElementById('filt-wheelchair-entrance')?.checked;
    extraFiltersState.filters.wheelchairSeating = !!document.getElementById('filt-wheelchair-seating')?.checked;
    extraFiltersState.filters.outdoor = !!document.getElementById('filt-outdoor')?.checked;
    extraFiltersState.filters.dinein = !!document.getElementById('filt-dinein')?.checked;
    extraFiltersState.filters.delivery = !!document.getElementById('filt-delivery')?.checked;
    extraFiltersState.filters.takeout = !!document.getElementById('filt-takeout')?.checked;
    extraFiltersState.filters.curbside = !!document.getElementById('filt-curbside')?.checked;
    // Aplicar sobre el conjunto base y relanzar el render habitual
    state.allGroupedItems = applyExtraPlaceFilters(state._allGroupedItemsBase || []);
    applyFiltersAndSort_ListView_Grouped();
    closeFiltersModal();
});

async function preloadPlaceOptionsForGroups(groups){
    const ids = [...new Set(groups.map(g=>g.placeId).filter(Boolean))];
    if(ids.length===0) return;
    const db = ListopicApp.services.db;
    // Cargas por lotes de 10
    for(let i=0;i<ids.length;i+=10){
        const slice = ids.slice(i,i+10);
        const snaps = await Promise.all(slice.map(id=> db.collection('places').doc(id).get()));
        snaps.forEach(doc=>{ if(doc.exists) extraFiltersState.placeOptionsMap.set(doc.id, doc.data()); });
    }
}

function applyExtraPlaceFilters(groups){
    const f = extraFiltersState.filters;
    const needAny = f.wheelchairEntrance||f.wheelchairSeating||f.outdoor||f.dinein||f.delivery||f.takeout||f.curbside;
    if(!needAny) return groups;
    return groups.filter(g=>{
        const p = extraFiltersState.placeOptionsMap.get(g.placeId) || {};
        const acc = p.accessibility || {};
        const sv = p.serviceOptions || {};
        if(f.wheelchairEntrance && acc.wheelchairAccessibleEntrance !== true) return false;
        if(f.wheelchairSeating && acc.wheelchairAccessibleSeating !== true) return false;
        if(f.outdoor && sv.outdoorSeating !== true) return false;
        if(f.dinein && sv.dineIn !== true) return false;
        if(f.delivery && sv.delivery !== true) return false;
        if(f.takeout && sv.takeout !== true) return false;
        if(f.curbside && sv.curbsidePickup !== true) return false;
        return true;
    });
}

if (deleteListButton) {
    deleteListButton.addEventListener('click', async () => {
        // ... (la lógica de borrado se mantiene igual)
        if (!state.currentListId) return;
        if (confirm(`¿Eliminar "${listTitleElement.textContent || 'esta lista'}"? Esta acción no se puede deshacer.`)) {
            try {
                const deleteOrOrphanList = firebase.app().functions('europe-west1').httpsCallable('deleteOrOrphanList');
                const result = await deleteOrOrphanList({ listId: state.currentListId });
                ListopicApp.services.showNotification(result.data.message, 'success');
                window.location.href = 'index.html';
            } catch (error) {
                ListopicApp.services.showNotification(`Error: ${error.message}`, 'error');
            }
        }
    });
}

// Listeners para el modal del mapa
if (showMapModalBtn) showMapModalBtn.addEventListener('click', openMapModal);
if (closeMapModalBtn) closeMapModalBtn.addEventListener('click', closeModal);
if (mapModal) mapModal.addEventListener('click', (e) => { if (e.target === mapModal) closeModal(); });

// --- Seguimiento de listas ---
(function initFollowListUI(){
    try {
        followListBtn = document.getElementById('follow-list-btn');
        if (!followListBtn) return;
        const auth = ListopicApp.services.auth;
        const db = ListopicApp.services.db;
        const listId = (ListopicApp.state && ListopicApp.state.currentListId) || (new URLSearchParams(window.location.search)).get('listId');
        if (!listId) return;
        const updateBtnUI = () => {
    if (!followListBtn) return;
    if (isFollowingList) {
        followListBtn.innerHTML = '<i class="fas fa-check"></i> Siguiendo';
        followListBtn.title = 'Siguiendo lista';
        followListBtn.classList.remove('follow-cta-button');
        followListBtn.classList.add('secondary-button');
    } else {
        followListBtn.innerHTML = '<i class="fas fa-bookmark"></i> Seguir lista';
        followListBtn.title = 'Seguir lista';
        followListBtn.classList.remove('secondary-button');
        followListBtn.classList.add('follow-cta-button');
    }
    followListBtn.style.display = 'inline-flex';
};
        const checkStatus = async () => {
            const user = auth.currentUser;
            if (!user) { // Mostrar el botón aunque no haya sesión
                isFollowingList = false;
                updateBtnUI();
                return;
            }
            try {
                const doc = await db.collection('users').doc(user.uid).collection('followingLists').doc(listId).get();
                isFollowingList = doc.exists;
                updateBtnUI();
            } catch(e) { updateBtnUI(); }
        };
        followListBtn.addEventListener('click', async () => {
            const user = auth.currentUser;
            if (!user) { window.location.href = 'auth.html'; return; }
            followListBtn.disabled = true;
            followListBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            try {
                const toggleFollowList = firebase.app().functions('europe-west1').httpsCallable('toggleFollowList');
                const res = await toggleFollowList({ listId });
                isFollowingList = res.data?.status === 'followed';
                updateBtnUI();
                ListopicApp.services?.showNotification?.(res.data?.message || 'Hecho', 'success');
                const cntEl = document.getElementById('list-followers-count');
                if (cntEl) {
                    const current = parseInt(cntEl.textContent || '0', 10) || 0;
                    cntEl.textContent = isFollowingList ? (current + 1) : Math.max(0, current - 1);
                }
            } catch (e) {
                ListopicApp.services?.showNotification?.(e.message, 'error');
            } finally {
                followListBtn.disabled = false;
            }
        });
        // inicial y reintentos (garantiza estado correcto tras auth init)
        checkStatus();
        setTimeout(checkStatus, 500);
        setTimeout(checkStatus, 1500);
        // También en cambios de auth
        ListopicApp.authService?.onAuthStateChangedPromise?.().then(checkStatus).catch(()=>{});
    } catch(e) { /* noop */ }
})();

// Handle browser back/forward to restore map state
window.addEventListener('popstate', () => {
    const p = readMapParamsFromUrl();
    if (p.open) {
        if (!mapModal?.classList.contains('active')) openMapModal();
        setTimeout(() => {
            try {
                if (listMapInstance && p.lat != null && p.lng != null) {
                    listMapInstance.setView([p.lat, p.lng], p.zoom || listMapInstance.getZoom());
                }
            } catch(e){}
        }, 60);
    } else {
        closeModal();
    }
});

}// Fin de init


    return {
        init
    };
})();


