// Contenido completo para page-index.js (epic index)

window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageIndex = (() => {
    let globalMapInstance = null;
    let currentTileLayer = null;
    let globalMapUserLocated = false;
    let initialGlobalMapParams = null; // { open, lat, lng, zoom }
    let globalUserLocationMarker = null;
    let lastKnownGlobalUserLatLng = null;

    const tileLayers = {
        light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    };

    // User location icon (same style as list-view)
    const userLocationIconSvg = `
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="7" fill="#118AB2" stroke="white" stroke-width="2"/>
        <circle cx="24" cy="24" r="12" stroke="#118AB2" stroke-width="2" stroke-opacity="0.9">
          <animate attributeName="r" from="12" to="22" dur="1.7s" begin="0s" repeatCount="indefinite" keyTimes="0; 1" values="12; 22"/>
          <animate attributeName="stroke-opacity" from="0.9" to="0" dur="1.7s" begin="0s" repeatCount="indefinite" keyTimes="0; 1" values="0.9; 0"/>
        </circle>
      </svg>
    `;

    function setGlobalUserLocationMarker(lat, lng, { recenter = false } = {}) {
        if (!globalMapInstance || !isFinite(lat) || !isFinite(lng)) {
            return;
        }
        const coords = [lat, lng];
        const userIcon = L.divIcon({
            html: userLocationIconSvg,
            className: '',
            iconSize: [48, 48],
            iconAnchor: [24, 24]
        });

        if (!globalUserLocationMarker) {
            globalUserLocationMarker = L.marker(coords, { icon: userIcon })
                .addTo(globalMapInstance)
                .bindPopup('¡Estás aquí!');
        } else {
            globalUserLocationMarker.setLatLng(coords);
            globalUserLocationMarker.setIcon(userIcon);
        }

        lastKnownGlobalUserLatLng = coords;
        globalMapUserLocated = true;

        if (recenter) {
            const currentZoom = globalMapInstance.getZoom ? globalMapInstance.getZoom() : 13;
            const targetZoom = currentZoom < 13 ? 13 : currentZoom;
            globalMapInstance.setView(coords, targetZoom);
        }
    }

    function recenterGlobalMapToUser({ silent = false } = {}) {
        if (lastKnownGlobalUserLatLng) {
            setGlobalUserLocationMarker(lastKnownGlobalUserLatLng[0], lastKnownGlobalUserLatLng[1], { recenter: true });
            return;
        }

        if (!navigator.geolocation) {
            if (!silent) ListopicApp.services?.showNotification?.('Tu navegador no permite obtener tu ubicación automáticamente.', 'warn');
            return;
        }

        navigator.geolocation.getCurrentPosition(pos => {
            setGlobalUserLocationMarker(pos.coords.latitude, pos.coords.longitude, { recenter: true });
        }, () => {
            if (!silent) ListopicApp.services?.showNotification?.('No se pudo obtener tu ubicación.', 'warn');
        });
    }

    // URL state helpers for the Global Map
    function readGlobalMapParamsFromUrl() {
        const p = new URLSearchParams(window.location.search);
        const open = p.get('gmap') === '1';
        if (!open) return { open: false };
        const lat = parseFloat(p.get('glat'));
        const lng = parseFloat(p.get('glng'));
        const zoom = parseInt(p.get('gzoom') || '0', 10);
        return {
            open: true,
            lat: isFinite(lat) ? lat : null,
            lng: isFinite(lng) ? lng : null,
            zoom: isFinite(zoom) ? zoom : null
        };
    }
    function setGlobalMapParamsInUrl(open, center, zoom, push=false) {
        try {
            const params = new URLSearchParams(window.location.search);
            if (open) {
                params.set('gmap', '1');
                if (center) {
                    params.set('glat', center.lat.toFixed(6));
                    params.set('glng', center.lng.toFixed(6));
                }
                if (typeof zoom === 'number') params.set('gzoom', String(zoom));
            } else {
                params.delete('gmap');
                params.delete('glat');
                params.delete('glng');
                params.delete('gzoom');
            }
            const newUrl = `${window.location.pathname}?${params.toString()}`;
            if (push) window.history.pushState(null, '', newUrl); else window.history.replaceState(null, '', newUrl);
        } catch (e) { /* noop */ }
    }

    // Utilidades del pin (reutilizadas de list-view)
    const createPlaceIconSvg = (score, color = '#118AB2') => {
        const textColor = 'white';
        const s = (score == null ? 0 : score).toFixed(1);
        const gid = `pin_${String(s).replace('.', 'p')}_${Math.random().toString(36).slice(2,7)}`;
        return `
            <svg width="40" height="50" viewBox="0 0 40 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="${gid}" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:${color}; stop-opacity:1" />
                        <stop offset="100%" style="stop-color:black; stop-opacity:0.4" />
                    </linearGradient>
                </defs>
                <path d="M20 0C9.5 0 1 8.5 1 19C1 31.5 18.5 48.5 20 50C21.5 48.5 39 31.5 39 19C39 8.5 30.5 0 20 0Z" fill="url(#${gid})" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" />
                <circle cx="20" cy="19" r="14" fill="white" fill-opacity="0.2"/>
                <text x="50%" y="43%" dominant-baseline="middle" text-anchor="middle" font-family="'Poppins', sans-serif" font-size="14" font-weight="700" fill="${textColor}">${s}</text>
            </svg>`;
    };
    function getIconByScore(score) {
        const scoreNum = parseFloat(score) || 0;
        const color = ListopicApp.uiUtils.getRatingHexColor(scoreNum);
        return L.divIcon({ html: createPlaceIconSvg(scoreNum, color), className: '', iconSize: [40, 50], iconAnchor: [20, 50], popupAnchor: [0, -50] });
    }

    async function init() {
        console.log('Initializing Index page logic (epic)...');

        const db = ListopicApp.services.db;
        const auth = ListopicApp.services.auth;
        const ui = ListopicApp.uiUtils;

        // Actualizar el header de la página. Como es la portada, no pasamos nombre de lista.
        if (ui && ui.updatePageHeaderInfo) {
            ui.updatePageHeaderInfo("Hmm...");
        }

        // Buscar desde el héroe
        const heroSearchForm = document.getElementById('hero-search-form');
        const heroSearchInput = document.getElementById('hero-search-input');
        if (heroSearchForm && heroSearchInput) {
            heroSearchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const q = (heroSearchInput.value || '').trim();
                const url = q ? `search.html?q=${encodeURIComponent(q)}` : 'search.html';
                window.location.href = url;
            });
        }

        // CTA crear lista (si no hay sesión, redirige a auth)
        const createListCta = document.getElementById('hero-create-list-btn') || document.querySelector('.add-list-button');
        if (createListCta) {
            createListCta.addEventListener('click', (e) => {
                // si es <a>, dejamos navegar
                if (createListCta.tagName.toLowerCase() === 'a') return;
                e.preventDefault();
                if (auth?.currentUser) {
                    window.location.href = 'list-form.html';
                } else {
                    ListopicApp.services?.showNotification?.('Debes iniciar sesión para crear una lista.', 'info');
                    window.location.href = 'auth.html';
                }
            });
        }

        // Pestañas
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.tab;
                tabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                tabContents.forEach(c => c.classList.remove('active'));
                const targetContent = document.getElementById(target);
                if (targetContent) targetContent.classList.add('active');
            });
        });

        // --- Datos dinámicos ---
        const featuredGrid = document.getElementById('featured-lists');
        const trendingTagsEl = document.getElementById('trending-tags');
        const listCirclesUl = document.getElementById('list-circles-ul');
        const feed = document.getElementById('feed-container');

        const tagCounter = new Map();

        // 1) Listas populares (por reviewCount)
        try {
            if (featuredGrid) {
                const topSnapshot = await db.collection('lists')
                    .where('isPublic', '==', true)
                    .orderBy('reviewCount', 'desc')
                    .limit(6)
                    .get();
                const topLists = topSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

                const cards = await Promise.all(topLists.map(async (list) => {
                    (list.availableTags || []).forEach(t => tagCounter.set(t, (tagCounter.get(t) || 0) + 1));
                    const iconClass = await ui.getListIcon(list);
                    const name = ui.escapeHtml(list.name || 'Lista sin nombre');
                    const reviews = list.reviewCount || 0;
                    const comments = list.commentsCount || 0;
                    const followers = list.followersCount || 0;
                    return `
                        <article class="featured-card">
                            <a href="list-view.html?listId=${list.id}">
                                <h3><i class="${iconClass}"></i> ${name}</h3>
                                <div class="meta">
                                    <span title="Reseñas"><i class="fas fa-pencil-alt"></i> ${reviews}</span>
                                    <span title="Comentarios"><i class="fas fa-comments"></i> ${comments}</span>
                                    <span title="Seguidores"><i class="fas fa-user-group"></i> ${followers}</span>
                                </div>
                            </a>
                        </article>`;
                }));
                featuredGrid.innerHTML = cards.join('') || '<p class="loading-placeholder">Sin datos aún.</p>';
            }
        } catch (e) {
            console.error('INDEX: Error loading featured lists', e);
            if (featuredGrid) featuredGrid.innerHTML = `<p class="error-placeholder">${e.message}</p>`;
        }

        // 2) Listas recientes (UI existente)
        if (listCirclesUl) {
            listCirclesUl.innerHTML = '<li><p>Cargando listas...</p></li>';
            try {
                const querySnapshot = await db.collection('lists')
                    .where('isPublic', '==', true)
                    .orderBy('createdAt', 'desc')
                    .limit(20)
                    .get();
                const lists = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                if (lists.length > 0) {
                    lists.forEach(l => (l.availableTags || []).forEach(t => tagCounter.set(t, (tagCounter.get(t) || 0) + 1)));
                    const listPromises = lists.map(async (list) => {
                        const iconClass = await ui.getListIcon(list);
                        const escapedListName = ui.escapeHtml(list.name || 'Lista sin nombre');
                        return `<a href="list-view.html?listId=${list.id}" title="${escapedListName}"><i class="${iconClass}"></i><span>${escapedListName}</span></a>`;
                    });
                    const listHtmlItems = await Promise.all(listPromises);
                    listCirclesUl.innerHTML = listHtmlItems.map(html => `<li>${html}</li>`).join('');
                } else {
                    listCirclesUl.innerHTML = '<li><p>Aún no hay listas públicas disponibles. ¡Anímate y <a href="list-form.html" style="color: var(--accent-color-primary);">crea la primera</a>!</p></li>';
                }
            } catch (error) {
                console.error('INDEX: Error fetching or processing public lists:', error);
                listCirclesUl.innerHTML = `<li><p style="color:var(--danger-color)">Error al cargar las listas. ${error.message}</p></li>`;
                ListopicApp.services?.showNotification?.('Error al cargar listas: ' + error.message, 'error');
            }
        }

        // 3) Tendencias (chips)
        if (trendingTagsEl) {
            const sorted = [...tagCounter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
            trendingTagsEl.innerHTML = sorted.map(([tag]) => {
                const safe = ui.escapeHtml(tag);
                return `<a class="tag-chip" href="search.html?tag=${encodeURIComponent(tag)}" title="${safe}"><i class="fas fa-hashtag"></i> ${safe}</a>`;
            }).join('');
        }

        // 4) Actividad reciente (últimas reseñas) SOLO de usuarios que sigues
        if (feed) {
            try {
                const currentUid = auth?.currentUser?.uid;
                if (!currentUid) {
                    feed.innerHTML = '<p class="loading-placeholder">Inicia sesión para ver novedades.</p>';
                } else {
                    const followingSnap = await db.collection('users').doc(currentUid).collection('following').limit(200).get();
                    const followedUserIds = [];
                    followingSnap.forEach(doc => {
                        const data = doc.data();
                        // Docs de lugares tienen placeId; los de usuarios no lo tienen
                        if (!data || !data.placeId) {
                            followedUserIds.push(doc.id);
                        }
                    });

                    if (followedUserIds.length === 0) {
                        feed.innerHTML = '<p class="loading-placeholder">Tu feed está vacío. ¡Sigue a alguien para ver sus reseñas!</p>';
                    } else {
                        // Firestore limita 'in' a 10 elementos -> hacemos chunks
                        const chunks = [];
                        for (let i = 0; i < followedUserIds.length; i += 10) {
                            chunks.push(followedUserIds.slice(i, i + 10));
                        }

                        const queries = chunks.map(chunk => db.collectionGroup('reviews').where('userId', 'in', chunk).limit(20).get());
                        const results = await Promise.all(queries);
                        let allDocs = [];
                        results.forEach(snap => allDocs.push(...snap.docs));

                        if (allDocs.length === 0) {
                            feed.innerHTML = '<p class="loading-placeholder">Aún no hay reseñas de tus seguidos.</p>';
                        } else {
                            allDocs.sort((a, b) => {
                                const ta = a.data().createdAt?.toMillis ? a.data().createdAt.toMillis() : 0;
                                const tb = b.data().createdAt?.toMillis ? b.data().createdAt.toMillis() : 0;
                                return tb - ta;
                            });

                            const docQueue = allDocs.slice(0, 30);
                            ui.setupLazyReviewList({
                                container: feed,
                                batchSize: 5,
                                emptyMessage: '<p class="loading-placeholder">Aún no hay reseñas de tus seguidos.</p>',
                                loadBatch: async ({ batchSize }) => {
                                    const batchDocs = docQueue.splice(0, batchSize);
                                    if (batchDocs.length === 0) {
                                        return { items: [], hasMore: false };
                                    }
                                    const enriched = await ui.enrichReviews(batchDocs);
                                    return {
                                        items: enriched,
                                        hasMore: docQueue.length > 0
                                    };
                                }
                            });
                        }
                    }
                }
            } catch (e) {
                console.error('INDEX: Error loading following feed', e);
                feed.innerHTML = `<p class=\"error-placeholder\">${e.message}</p>`;
            }
        }

        // 5) Mapa global de lugares (modal como en list-view)
        const mapModal = document.getElementById('global-map-modal');
        const mapContainer = document.getElementById('global-map-container');
        const openBtn = document.getElementById('show-global-map-modal-btn');
        const closeBtn = document.getElementById('close-global-map-modal-btn');
        const centerBtn = document.getElementById('global-map-center-user-btn');

        function openGlobalMapModal() {
            if (!mapModal) return;
            mapModal.classList.add('active');
            setTimeout(async () => {
                if (!globalMapInstance && mapContainer && window.L) {
                    const initialTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
                    globalMapInstance = L.map(mapContainer).setView([40.4167, -3.703], 5);
                    currentTileLayer = L.tileLayer(tileLayers[initialTheme], { attribution: '&copy; OpenStreetMap &copy; CARTO' }).addTo(globalMapInstance);
                    document.addEventListener('themeChanged', (ev) => {
                        const newTheme = ev.detail.theme;
                        currentTileLayer && currentTileLayer.setUrl(tileLayers[newTheme]);
                    });
                    // Try to center on user's location with a friendly zoom
                    try {
                        recenterGlobalMapToUser({ silent: true });
                    } catch(e) {}
                    // Sync moves into URL without polluting history
                    globalMapInstance.on('moveend zoomend', () => {
                        try {
                            setGlobalMapParamsInUrl(true, globalMapInstance.getCenter(), globalMapInstance.getZoom(), false);
                        } catch(e){}
                    });
                    try {
                        const snap = await ListopicApp.services.db.collection('places').get();
                        const places = snap.docs.map(doc => {
                            const p = doc.data() || {};
                            return {
                                id: doc.id,
                                name: p.name || 'Lugar',
                                location: p.location,
                                mainImageUrl: p.mainImageUrl || null,
                                avgGeneralScore: typeof p.averageRating === 'number' ? p.averageRating : null,
                                reviewsCount: p.reviewsCount || 0,
                            };
                        }).filter(p => p.location && typeof p.location.latitude === 'number' && typeof p.location.longitude === 'number' && (p.reviewsCount || 0) > 0 && (p.avgGeneralScore || 0) > 0);
                        addGlobalPlacesToMap(places);
                } catch (e) { console.error('INDEX: Error cargando lugares para el mapa global', e); }
                } else if (globalMapInstance) {
                    globalMapInstance.invalidateSize();
                }
            }, 10);
            try {
                // Push state when opening
                if (globalMapInstance) setGlobalMapParamsInUrl(true, globalMapInstance.getCenter(), globalMapInstance.getZoom(), true);
                else setGlobalMapParamsInUrl(true, {lat:40.4167,lng:-3.703}, 5, true);
            } catch(e){}
        }
        function closeGlobalMapModal() {
            if (mapModal) mapModal.classList.remove('active');
            // Push state when closing
            setGlobalMapParamsInUrl(false, null, null, true);
        }
        openBtn && openBtn.addEventListener('click', openGlobalMapModal);
        closeBtn && closeBtn.addEventListener('click', closeGlobalMapModal);
        centerBtn && centerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            recenterGlobalMapToUser();
        });
        mapModal && mapModal.addEventListener('click', (e) => { if (e.target === mapModal) closeGlobalMapModal(); });

        // Restore from URL on load
        try {
            initialGlobalMapParams = readGlobalMapParamsFromUrl();
            if (initialGlobalMapParams && initialGlobalMapParams.open) {
                openGlobalMapModal();
                setTimeout(() => {
                    try {
                        if (globalMapInstance && initialGlobalMapParams.lat != null && initialGlobalMapParams.lng != null) {
                            globalMapInstance.setView([initialGlobalMapParams.lat, initialGlobalMapParams.lng], initialGlobalMapParams.zoom || globalMapInstance.getZoom());
                        }
                    } catch(e){}
                }, 120);
            }
        } catch(e){}

        // Popstate handler
        window.addEventListener('popstate', () => {
            const p = readGlobalMapParamsFromUrl();
            if (p.open) {
                if (!mapModal?.classList.contains('active')) openGlobalMapModal();
                setTimeout(() => {
                    try {
                        if (globalMapInstance && p.lat != null && p.lng != null) {
                            globalMapInstance.setView([p.lat, p.lng], p.zoom || globalMapInstance.getZoom());
                        }
                    } catch(e){}
                }, 60);
            } else {
                closeGlobalMapModal();
            }
        });
    }

    function addGlobalPlacesToMap(places) {
        if (!globalMapInstance || !places) return;
        const markers = [];
        places.forEach(place => {
            if (place.location?.latitude && place.location?.longitude) {
                const m = L.marker([place.location.latitude, place.location.longitude], { icon: getIconByScore(place.avgGeneralScore) });

                // Popup básico con placeholder de items
                const popupId = `popup_items_${place.id}`;
                const popupContent = `
                    <div class="listopic-map-popup">
                        ${place.mainImageUrl ? `<div class="popup-image" style="background-image: url('${ListopicApp.uiUtils.escapeHtml(place.mainImageUrl)}')"></div>` : ''}
                        <div class="popup-content">
                            <h5 class="popup-title">${ListopicApp.uiUtils.escapeHtml(place.name)}</h5>
                            <div id="${popupId}" class="popup-items"><div class="loading-placeholder">Cargando elementos...</div></div>
                            <a href="place-detail.html?placeId=${place.id}" class="popup-link button submit-button">Ver lugar</a>
                        </div>
                    </div>`;

                m.bindPopup(popupContent);
                m.on('dblclick', () => {
                    window.location.href = `place-detail.html?placeId=${place.id}`;
                });
                m.on('popupopen', async () => {
                    try {
                        const getPlaceDetails = firebase.app().functions('europe-west1').httpsCallable('getPlaceDetails');
                        const res = await getPlaceDetails({ placeId: place.id });
                        const groups = res.data?.groups || [];
                        const itemsHtml = groups.length ? groups.map(g => `
                                <div class="popup-item__row">
                                    <span class="popup-item__name">${ListopicApp.uiUtils.escapeHtml(g.itemName || 'General')}</span>
                                    <span class="score-badge">${(g.avgGeneralScore || 0).toFixed(1)}</span>
                                </div>
                            `).join('') : '<div class="popup-item__row"><span class="popup-item__name">Sin elementos aún</span></div>';
                        const el = document.getElementById(popupId);
                        if (el) el.innerHTML = itemsHtml;
                    } catch (e) {
                        const el = document.getElementById(popupId);
                        if (el) el.innerHTML = '<div class="popup-item__row"><span class="popup-item__name">Error al cargar</span></div>';
                    }
                });

                markers.push(m);
                m.addTo(globalMapInstance);
            }
        });
        if (markers.length && !globalMapUserLocated) {
            const fg = L.featureGroup(markers);
            const bounds = fg.getBounds();
            globalMapInstance.fitBounds(bounds.pad(0.1));
        }
    }

    return {
        init
    };
})();
