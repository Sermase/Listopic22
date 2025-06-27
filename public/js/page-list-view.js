window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageListView = (() => {
    // Variables de estado
    let currentSortColumn = 'avgGeneralScore';
    let currentSortDirection = 'desc';
    let activeTagFilters = new Set();
    let currentListIconClass = 'fa-solid fa-list';

    // Variables del DOM
    let listTitleElement, rankingTbody, searchInput, tagFilterContainer, rankingTable,
    addReviewButton, editListLink, deleteListButton, showMapModalBtn,
    mapModal, closeMapModalBtn, mapContainer, listMapInstance;

    let markersMap = new Map();
    
    // *** INICIO DE SECCIÓN DEL FORO ***
    let forumModal, closeModalForumBtn, forumListNameSpan, forumMessagesContainer,
        newForumMessageInput, sendForumMessageBtn, messagesCollectionRef; // Referencia a la colección
    // *** FIN DE SECCIÓN DEL FORO ***

    // ... (El resto de tus funciones como getListIconClass_ListView, renderTableHeaders_ListView_Grouped, etc. se mantienen igual) ...
    function getListIconClass_ListView(listName) {
        if (!listName) return 'fa-solid fa-list';
        const listNameLower = listName.toLowerCase();
        if (listNameLower.includes('tarta') || listNameLower.includes('pastel') || listNameLower.includes('torta')) return 'fa-solid fa-birthday-cake';
        if (listNameLower.includes('pizza')) return 'fa-solid fa-pizza-slice';
        if (listNameLower.includes('hamburguesa') || listNameLower.includes('burger')) return 'fa-solid fa-hamburger';
        if (listNameLower.includes('taco') || listNameLower.includes('mexican') || listNameLower.includes('nacho')) return 'fa-solid fa-pepper-hot';
        if (listNameLower.includes('café') || listNameLower.includes('coffee')) return 'fa-solid fa-coffee';
        if (listNameLower.includes('sushi') || listNameLower.includes('japo')) return 'fa-solid fa-fish';
        if (listNameLower.includes('helado') || listNameLower.includes('ice cream')) return 'fa-solid fa-ice-cream';
        return 'fa-solid fa-list';
    }

    function renderTableHeaders_ListView_Grouped() {
        const tableHeadRow = rankingTable.querySelector('thead tr');
        if (!tableHeadRow) return;
        tableHeadRow.innerHTML = '';

        const baseHeaders = [
            { text: 'Foto', class: 'col-image', sortable: false },
            { text: 'Elemento', class: 'sortable col-element', 'data-column': 'establishmentName', sortable: true },
            { text: 'Nº Reseñas', class: 'sortable score-col', 'data-column': 'itemCount', sortable: true },
            { text: 'Media General', class: 'sortable score-col col-general', 'data-column': 'avgGeneralScore', sortable: true }
        ];
        
        baseHeaders.forEach(headerConfig => {
            const th = document.createElement('th');
            th.textContent = headerConfig.text || '';
            th.className = headerConfig.class || '';
            th.scope = 'col';
            if (headerConfig.sortable) {
                th.dataset.column = headerConfig['data-column'];
                th.addEventListener('click', () => handleSort_ListView_Grouped(headerConfig['data-column']));
            }
            tableHeadRow.appendChild(th);
        });
        updateSortIndicators_ListView_Grouped();
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
        } else {
            tagFilterContainer.innerHTML = '<p>No hay etiquetas para filtrar en esta lista.</p>';
        }
    }
    
    function renderTable_ListView_Grouped(groupedItemsToRender) {
        const uiUtils = ListopicApp.uiUtils;
        rankingTbody.innerHTML = '';
        const numCols = rankingTable.querySelector('thead tr')?.children.length || 4;
        if (groupedItemsToRender.length === 0) {
            rankingTbody.innerHTML = `<tr><td colspan="${numCols}">No hay elementos que coincidan.</td></tr>`;
            return;
        }
        groupedItemsToRender.forEach(group => {
            const row = rankingTbody.insertRow();
            row.className = 'ranking-row';
            row.dataset.listId = group.listId || ListopicApp.state.currentListId; 
            row.dataset.placeId = group.placeId;
            row.dataset.establishment = group.establishmentName;
            row.dataset.item = group.itemName || "";

            const imageCell = row.insertCell();
            imageCell.classList.add('col-image');
            if (group.thumbnailUrl) {
                imageCell.innerHTML = `<img src="${uiUtils.escapeHtml(group.thumbnailUrl)}" alt="${uiUtils.escapeHtml(group.itemName || group.establishmentName)}" class="ranking-item-image">`;
            } else {
                imageCell.innerHTML = `<div class="ranking-item-icon-placeholder"><i class="${currentListIconClass}"></i></div>`;
            }

            const elementCell = row.insertCell();
            elementCell.classList.add('col-element');
            const itemText = group.itemName ? ` - ${uiUtils.escapeHtml(group.itemName)}` : '';
            elementCell.innerHTML = `<span class="restaurant-name">${uiUtils.escapeHtml(group.establishmentName) || 'N/A'}</span><span class="dish-name-sub">${itemText}</span>`;

            const itemCountCell = row.insertCell();
            itemCountCell.classList.add('score-col');
            itemCountCell.textContent = group.itemCount;

            const avgGeneralScoreCell = row.insertCell();
            avgGeneralScoreCell.classList.add('score-col', 'col-general');
            avgGeneralScoreCell.innerHTML = `<span class="overall-score">${(group.avgGeneralScore !== undefined ? group.avgGeneralScore : 0).toFixed(1)}</span>`;
        });
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
            let valA, valB;
            if (currentSortColumn === 'establishmentName') { valA = a.establishmentName?.toLowerCase() || ''; valB = b.establishmentName?.toLowerCase() || ''; }
            else if (currentSortColumn === 'avgGeneralScore') { valA = a.avgGeneralScore; valB = b.avgGeneralScore; }
            else if (currentSortColumn === 'itemCount') { valA = a.itemCount; valB = b.itemCount; }
            else { valA = a[currentSortColumn]; valB = b[currentSortColumn]; }

            if (typeof valA === 'string' && typeof valB === 'string') {
                return currentSortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            return currentSortDirection === 'asc' ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
        });
        renderTable_ListView_Grouped(filteredItems);
        updateSortIndicators_ListView_Grouped();
    }

    function updateSortIndicators_ListView_Grouped() {
        if (!rankingTable) return;
        rankingTable.querySelectorAll('thead th.sortable').forEach(th => {
            th.classList.remove('sorted-asc', 'sorted-desc');
            if (th.dataset.column === currentSortColumn) {
                th.classList.add(currentSortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
            }
        });
    }

    function handleSort_ListView_Grouped(columnKey) {
        if (currentSortColumn === columnKey) {
            currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            currentSortColumn = columnKey;
            currentSortDirection = (columnKey === 'establishmentName') ? 'asc' : 'desc';
        }
        applyFiltersAndSort_ListView_Grouped();
    }

    function toggleTagFilter_ListView_Grouped(event) {
        const clickedTag = event.target.dataset.tag;
        if (!clickedTag) return;
        if (activeTagFilters.has(clickedTag)) activeTagFilters.delete(clickedTag);
        else activeTagFilters.add(clickedTag);
        event.target.classList.toggle('selected');
        applyFiltersAndSort_ListView_Grouped();
    }
    
    // *** SECCIÓN ÚNICA PARA LA LÓGICA DEL FORO ***
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

    // *** FIN DE SECCIÓN DEL FORO ***

    function init() {
        console.log('Initializing List View page logic...');
        const auth = ListopicApp.services.auth;
        const db = ListopicApp.services.db;
        const state = ListopicApp.state;

        // Cacheo de elementos del DOM
        listTitleElement = document.getElementById('list-title');
        rankingTbody = document.getElementById('ranking-tbody');
        searchInput = document.querySelector('.search-input');
        tagFilterContainer = document.querySelector('.tag-filter-container');
        rankingTable = document.querySelector('.ranking-table');
        addReviewButton = document.querySelector('.add-review-button');
        editListLink = document.getElementById('edit-list-link');
        deleteListButton = document.getElementById('delete-list-button');
        showMapModalBtn = document.getElementById('show-map-modal-btn');
        mapModal = document.getElementById('list-map-modal');
        closeMapModalBtn = document.getElementById('close-map-modal-btn');
        mapContainer = document.getElementById('list-map-container');
        
        // Reinicio de estado de la página
        state.allGroupedItems = []; 
        state.currentListAvailableTags = [];
        activeTagFilters = new Set();
        currentSortColumn = 'avgGeneralScore';
        currentSortDirection = 'desc';

        const urlParamsList = new URLSearchParams(window.location.search);
        state.currentListId = urlParamsList.get('listId'); 

        if (listTitleElement && rankingTbody && searchInput && tagFilterContainer && rankingTable) {
            if (state.currentListId) {
                if (addReviewButton) addReviewButton.href = `review-form.html?listId=${state.currentListId}`;
                if (editListLink) editListLink.href = `list-form.html?editListId=${state.currentListId}`;

                auth.currentUser?.getIdToken(true).then(idToken => {
                    const headers = { 'Accept': 'application/json' };
                    if(idToken) headers['Authorization'] = `Bearer ${idToken}`;
                    
                    const functionUrl = ListopicApp.config.FUNCTION_URLS.groupedReviews;
                    if (!functionUrl) throw new Error("URL de la función groupedReviews no configurada.");
                    
                    return fetch(`${functionUrl}?listId=${state.currentListId}`, { headers });
                })
                .then(async res => {
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
                })
                .then(responsePayload => {
                    if (!responsePayload || typeof responsePayload !== 'object') {
                        throw new Error("Respuesta inesperada de la Cloud Function.");
                    }
                    state.currentListName = responsePayload.listName || "Ranking Agrupado";
                    const category = responsePayload.categoryId || "Hmm..."; 
                    ListopicApp.uiUtils.updatePageHeaderInfo(category, state.currentListName);
                    
                    listTitleElement.textContent = state.currentListName;
                    state.currentListAvailableTags = responsePayload.tags || [];
                    state.currentListCriteriaDefinitions = responsePayload.criteria || {}; 
                    currentListIconClass = getListIconClass_ListView(state.currentListName);
                    
                    renderTableHeaders_ListView_Grouped(); 
                    renderTagFilters_ListView();
                    initForumModal(); // <-- Inicializamos el foro aquí cuando tenemos los datos de la lista

                    state.allGroupedItems = responsePayload.groupedReviews || [];
                    applyFiltersAndSort_ListView_Grouped();
                })
                .catch(error => {
                    console.error("LIST-VIEW: Error en fetch o procesamiento:", error);
                    listTitleElement.textContent = "Error al cargar lista";
                    rankingTbody.innerHTML = `<tr><td colspan="4" style="color:var(--danger-color);">${error.message}</td></tr>`;
                    ListopicApp.services.showNotification(`Error al cargar la lista: ${error.message}`, "error");
                });
            } else {
                listTitleElement.textContent = "Error: Lista no especificada";
                rankingTbody.innerHTML = `<tr><td colspan="4">ID de lista no especificado en la URL.</td></tr>`;
                ListopicApp.services.showNotification("ID de lista no especificado en la URL.", "error");
            }

            // Listeners de UI
            if (rankingTbody) {
                rankingTbody.addEventListener('click', (event) => {
                    const row = event.target.closest('.ranking-row');
                    if (row && row.dataset.listId && row.dataset.placeId !== undefined) {
                        window.location.href = `grouped-detail-view.html?listId=${row.dataset.listId}&placeId=${row.dataset.placeId}&item=${encodeURIComponent(row.dataset.item)}`;
                    }
                });
            }
            if(searchInput) searchInput.addEventListener('input', applyFiltersAndSort_ListView_Grouped);

            if (deleteListButton) {
                deleteListButton.addEventListener('click', async () => {
                    if (!state.currentListId) return;
                    if (confirm(`¿Eliminar "${listTitleElement.textContent || 'esta lista'}"? Esta acción no se puede deshacer.`)) {
                        try {
                            const deleteOrOrphanList = firebase.app().functions('europe-west1').httpsCallable('deleteOrOrphanList');
                            const result = await deleteOrOrphanList({ listId: state.currentListId });
                            ListopicApp.services.showNotification(result.data.message, 'success');
                            window.location.href = 'Index.html';
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

        } else {
            console.warn("LIST-VIEW: Faltan elementos esenciales del DOM.");
        }
    } // Fin de init

    // ... (El resto de funciones del mapa y del foro van aquí como las tenías) ...
    function openMapModal() {
        if (!mapModal) return;
        mapModal.classList.add('active');
        setTimeout(() => {
            if (!listMapInstance) {
                initializeListMap();
            } else {
                listMapInstance.invalidateSize();
            }
        }, 10); 
    }
    
    function closeModal() {
        if (mapModal) mapModal.classList.remove('active');
    }
    
    function initializeListMap() {
        if (!mapContainer) return;
        
        listMapInstance = L.map(mapContainer).setView([40.4167, -3.703], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(listMapInstance);
    
        navigator.geolocation.getCurrentPosition(pos => {
            const userLatLng = [pos.coords.latitude, pos.coords.longitude];
            L.marker(userLatLng, {
                icon: L.divIcon({
                    className: 'user-location-marker',
                    html: '<i class="fas fa-street-view"></i>',
                    iconSize: [24, 24]
                })
            }).addTo(listMapInstance).bindPopup('¡Estás aquí!');
            listMapInstance.setView(userLatLng, 13);
        }, () => {
            ListopicApp.services.showNotification("No se pudo obtener tu ubicación.", "warn");
        });
        
        fetchPlacesForCurrentList();
    }
    
    async function fetchPlacesForCurrentList() {
        const listId = ListopicApp.state.currentListId;
        if (!listId) return;
    
        try {
            const getPlacesForList = firebase.app().functions('europe-west1').httpsCallable('getPlacesForList');
            const result = await getPlacesForList({ listId: listId });
            addPlacesToMap(result.data.places);
        } catch (error) {
            console.error("Error al obtener lugares para el mapa:", error);
            ListopicApp.services.showNotification(error.message, "error");
        }
    }
    
    // REEMPLAZA TU FUNCIÓN addPlacesToMap CON ESTA VERSIÓN MEJORADA
    function addPlacesToMap(places) {
        if (!listMapInstance || !places) { return; }

    markersMap.forEach(marker => marker.remove());
    markersMap.clear();

    if (places.length === 0) {
        console.log("No hay lugares con coordenadas para mostrar en el mapa.");
        return;
    }

    const markers = [];
    places.forEach(place => {
        if (place.location && place.location.latitude && place.location.longitude) {
            
            const customIcon = getIconByScore(place.avgGeneralScore);
            const marker = L.marker([place.location.latitude, place.location.longitude], { icon: customIcon });
            
            // --- POPUP ACTUALIZADO CON MÁS INFO Y MEJOR DISEÑO ---
            const popupContent = `
                <div class="map-popup">
                    <img src="${ListopicApp.uiUtils.escapeHtml(place.mainImageUrl || 'img/default-avatar.png')}" alt="Foto" class="map-popup-img">
                    <div class="map-popup-content">
                        <h5 class="map-popup-title">${ListopicApp.uiUtils.escapeHtml(place.name)}</h5>
                        <p class="map-popup-score">Valoración media: <strong>${place.avgGeneralScore.toFixed(1)}</strong></p>
                        <a href="grouped-detail-view.html?listId=${ListopicApp.state.currentListId}&placeId=${place.id}" class="map-popup-link">Ver todas las reseñas</a>
                    </div>
                </div>
            `;
            marker.bindPopup(popupContent);
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

    // En public/js/page-list-view.js

// En public/js/page-list-view.js

function getIconByScore(score) {
    let colorClass = 'marker-default';
    if (score >= 9) colorClass = 'marker-gold';
    else if (score >= 7) colorClass = 'marker-silver';
    else if (score >= 5) colorClass = 'marker-bronze';
    
    // El número que mostraremos: con un decimal o 'N/A'
    const scoreDisplay = score !== undefined ? score.toFixed(1) : 'N/A';

    return L.divIcon({
        // La clase del contenedor ahora incluye el color
        className: `custom-marker ${colorClass}`, 
        
        // El HTML interno es nuestro número
        html: `<div class="custom-marker-content">${scoreDisplay}</div>`, 
        
        iconSize: [36, 36],     // Tamaño de la chincheta
        iconAnchor: [18, 36],   // La punta del pin
        popupAnchor: [0, -38]   // De dónde sale el popup
    });
}

    return {
        init
    };
})();