// Listopic - Home Discover (carruseles + mapa inline)

window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageIndex = (() => {
    let globalMapInstance = null;
    let currentTileLayer = null;
    let globalUserLocationMarker = null;
    let lastKnownGlobalUserLatLng = null;
    let initialGlobalMapParams = null;

    let exploreMaxDistanceKm = null;
    let globalPlacesData = [];
    let globalPlacesLayerGroup = null;
    let globalPlacesMarkersById = new Map();
    let globalDistanceCircle = null;
    let hasWarnedMissingGeoForDistance = false;

    const heroSubtitles = [
        "Carruseles al estilo Netflix, decisiones al estilo TripAdvisor.",
        "Explora Wow/Hmm con contenido gigante y scroll sin friccion.",
        "Listas, lugares y usuarios en zapping continuo.",
        "Ranking social con imagen protagonista.",
        "Crea tu lista y entra en el carrusel." 
    ];

    const tileLayers = {
        light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    };

    const userLocationIconSvg = `
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="7" fill="#118AB2" stroke="white" stroke-width="2"/>
        <circle cx="24" cy="24" r="12" stroke="#118AB2" stroke-width="2" stroke-opacity="0.9">
          <animate attributeName="r" from="12" to="22" dur="1.7s" begin="0s" repeatCount="indefinite" keyTimes="0; 1" values="12; 22"/>
          <animate attributeName="stroke-opacity" from="0.9" to="0" dur="1.7s" begin="0s" repeatCount="indefinite" keyTimes="0; 1" values="0.9; 0"/>
        </circle>
      </svg>
    `;

    const getScore = (obj) => obj?.averageRating || obj?.avgGeneralScore || obj?.overallRating || obj?.avgRating || obj?.score || 0;
    const passMood = (score, mood) => {
        if (mood === "wow") return score >= 4;
        if (mood === "hmm") return score > 0 && score <= 3.2;
        return true;
    };

    function setRandomHeroSubtitle() {
        const el = document.getElementById("hero-subtitle");
        if (!el) return;
        el.textContent = heroSubtitles[Math.floor(Math.random() * heroSubtitles.length)];
    }

    function setGlobalUserLocationMarker(lat, lng, { recenter = false } = {}) {
        if (!isFinite(lat) || !isFinite(lng)) return;
        const coords = [lat, lng];
        lastKnownGlobalUserLatLng = coords;
        if (!globalMapInstance || !window.L) return;

        const userIcon = L.divIcon({ html: userLocationIconSvg, className: "", iconSize: [48, 48], iconAnchor: [24, 24] });
        if (!globalUserLocationMarker) {
            globalUserLocationMarker = L.marker(coords, { icon: userIcon }).addTo(globalMapInstance).bindPopup("Estas aqui");
        } else {
            globalUserLocationMarker.setLatLng(coords);
            globalUserLocationMarker.setIcon(userIcon);
        }
        try { syncGlobalMapDistanceFilter(); } catch (e) {}
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
            if (!silent) ListopicApp.services?.showNotification?.("Tu navegador no permite obtener tu ubicacion automaticamente.", "warn");
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => setGlobalUserLocationMarker(pos.coords.latitude, pos.coords.longitude, { recenter: true }),
            () => { if (!silent) ListopicApp.services?.showNotification?.("No se pudo obtener tu ubicacion.", "warn"); }
        );
    }

    function readGlobalMapParamsFromUrl() {
        const p = new URLSearchParams(window.location.search);
        const open = p.get("gmap") === "1";
        if (!open) return { open: false };
        const lat = parseFloat(p.get("glat"));
        const lng = parseFloat(p.get("glng"));
        const zoom = parseInt(p.get("gzoom") || "0", 10);
        return { open: true, lat: isFinite(lat) ? lat : null, lng: isFinite(lng) ? lng : null, zoom: isFinite(zoom) ? zoom : null };
    }

    function setGlobalMapParamsInUrl(open, center, zoom, push = false) {
        try {
            const params = new URLSearchParams(window.location.search);
            if (open) {
                params.set("gmap", "1");
                if (center) {
                    params.set("glat", center.lat.toFixed(6));
                    params.set("glng", center.lng.toFixed(6));
                }
                if (typeof zoom === "number") params.set("gzoom", String(zoom));
            } else {
                params.delete("gmap");
                params.delete("glat");
                params.delete("glng");
                params.delete("gzoom");
            }
            const newUrl = `${window.location.pathname}?${params.toString()}`;
            if (push) window.history.pushState(null, "", newUrl); else window.history.replaceState(null, "", newUrl);
        } catch (e) { /* noop */ }
    }

    function addGlobalPlacesToMap(places) {
        if (!globalMapInstance || !places) return;
        const ui = ListopicApp?.uiUtils;
        globalPlacesData = Array.isArray(places) ? places : [];
        if (!globalPlacesLayerGroup) globalPlacesLayerGroup = L.layerGroup().addTo(globalMapInstance);
        places.forEach((place) => {
            if (place.location?.latitude && place.location?.longitude) {
                const m = L.marker([place.location.latitude, place.location.longitude], { icon: getIconByScore(place.avgGeneralScore || place.averageRating) });
                const name = ui?.escapeHtml(place.name || place.itemName || "Lugar") || (place.name || "Lugar");
                const img = place.mainImageUrl || place.imageUrl || "";
                const score = typeof place.avgGeneralScore === "number" ? place.avgGeneralScore.toFixed(1) : "-";
                const reviews = place.reviewsCount || 0;
                const popupContent = `
                    <div class="listopic-map-popup">
                        ${img ? `<div class="popup-image" style="background-image: url('${ui ? ui.escapeHtml(img) : img}');"></div>` : ""}
                        <div class="popup-content">
                            <h5 class="popup-title">${name}</h5>
                            <div class="popup-meta">
                                <span class="pill-label">${score}</span>
                                <span class="pill-label">${reviews} reseñas</span>
                            </div>
                            <a href="place-detail.html?placeId=${place.id}" class="popup-link button submit-button">Ver lugar</a>
                        </div>
                    </div>
                `;
                m.bindPopup(popupContent);
                m.on("dblclick", () => { window.location.href = `place-detail.html?placeId=${place.id}`; });
                if (place.id) globalPlacesMarkersById.set(place.id, m);
                m.addTo(globalPlacesLayerGroup);
            }
        });
        try { syncGlobalMapDistanceFilter({ autoFit: !lastKnownGlobalUserLatLng }); } catch (e) {}
    }

    function syncGlobalMapDistanceFilter({ autoFit = false } = {}) {
        if (!globalMapInstance || !globalPlacesLayerGroup) return;

        const hasRange = typeof exploreMaxDistanceKm === "number" && isFinite(exploreMaxDistanceKm) && exploreMaxDistanceKm > 0;
        const hasUser = Array.isArray(lastKnownGlobalUserLatLng) && lastKnownGlobalUserLatLng.length === 2;
        const userLatLng = hasUser ? L.latLng(lastKnownGlobalUserLatLng[0], lastKnownGlobalUserLatLng[1]) : null;
        const maxMeters = hasRange ? exploreMaxDistanceKm * 1000 : null;

        globalPlacesLayerGroup.clearLayers();

        const markers = [];
        globalPlacesData.forEach((place) => {
            if (!place?.id) return;
            const marker = globalPlacesMarkersById.get(place.id);
            if (!marker) return;
            if (!place.location || typeof place.location.latitude !== "number" || typeof place.location.longitude !== "number") return;
            if (hasRange && userLatLng) {
                const dist = userLatLng.distanceTo(L.latLng(place.location.latitude, place.location.longitude));
                if (dist > maxMeters) return;
            }
            marker.addTo(globalPlacesLayerGroup);
            markers.push(marker);
        });

        if (hasRange && userLatLng) {
            if (!globalDistanceCircle) {
                globalDistanceCircle = L.circle(userLatLng, {
                    radius: maxMeters,
                    color: "rgba(92, 124, 250, 0.75)",
                    weight: 2,
                    fillColor: "rgba(92, 124, 250, 0.22)",
                    fillOpacity: 0.22
                }).addTo(globalMapInstance);
            } else {
                globalDistanceCircle.setLatLng(userLatLng);
                globalDistanceCircle.setRadius(maxMeters);
                if (!globalMapInstance.hasLayer(globalDistanceCircle)) globalDistanceCircle.addTo(globalMapInstance);
            }
        } else if (globalDistanceCircle) {
            try { globalMapInstance.removeLayer(globalDistanceCircle); } catch (e) {}
        }

        if (autoFit && markers.length && !lastKnownGlobalUserLatLng) {
            try {
                const fg = L.featureGroup(markers);
                globalMapInstance.fitBounds(fg.getBounds().pad(0.1));
            } catch (e) {}
        }
    }

    const createPlaceIconSvg = (score, color = "#118AB2") => {
        const textColor = "white";
        const s = (score == null ? 0 : score).toFixed(1);
        const gid = `pin_${String(s).replace(".", "p")}_${Math.random().toString(36).slice(2, 7)}`;
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
        return L.divIcon({ html: createPlaceIconSvg(scoreNum, color), className: "", iconSize: [40, 50], iconAnchor: [20, 50], popupAnchor: [0, -50] });
    }

    async function init() {
        const db = ListopicApp.services.db;
        const auth = ListopicApp.services.auth;
        const ui = ListopicApp.uiUtils;
        const listHeroCache = new Map();

        if (ui && ui.updatePageHeaderInfo) ui.updatePageHeaderInfo("Descubrir");
        setRandomHeroSubtitle();

        // tabs
        const tabButtons = document.querySelectorAll(".tab-button");
        const tabContents = document.querySelectorAll(".tab-content");
        tabButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                const target = btn.dataset.tab;
                tabButtons.forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
                tabContents.forEach((c) => c.classList.remove("active"));
                const targetContent = document.getElementById(target);
                if (targetContent) targetContent.classList.add("active");
                setTimeout(() => {
                    try { updateRailNavVisibility(); } catch (e) {}
                }, 60);
            });
        });

        const topListsEl = document.getElementById("rail-lists");
        const topGroupsEl = document.getElementById("rail-top-groups");
        const topGroupsTitleEl = document.getElementById("rail-top-groups-title");
        const newListsEl = document.getElementById("rail-new");
        const topUsersEl = document.getElementById("rail-users");
        const hotReviewsEl = document.getElementById("rail-reviews");
        const topPlacesEl = document.getElementById("rail-places");
        const trendingTagsEl = document.getElementById("trending-tags") || document.getElementById("explore-tags");
        const moodFiltersEl = document.getElementById("mood-filters");
        const categoryFiltersEl = document.getElementById("explore-category-filters");
        const distanceSelectEl = document.getElementById("explore-distance-select");
        const feed = document.getElementById("feed-container");
        const tagCounter = new Map();
        let currentMood = "all";
        const selectedCategoryIds = new Set();
        let followingFeedController = null;

        if (moodFiltersEl) {
            moodFiltersEl.querySelectorAll(".mood-chip").forEach((chip) => {
                chip.addEventListener("click", async () => {
                    moodFiltersEl.querySelectorAll(".mood-chip").forEach((c) => c.classList.remove("active"));
                    chip.classList.add("active");
                    currentMood = chip.dataset.mood || "all";
                    await refreshRails();
                    await refreshFollowingFeed();
                });
            });
        }

        async function ensureUserLocation({ recenter = false } = {}) {
            if (Array.isArray(lastKnownGlobalUserLatLng) && lastKnownGlobalUserLatLng.length === 2) {
                try { return window.L ? L.latLng(lastKnownGlobalUserLatLng[0], lastKnownGlobalUserLatLng[1]) : lastKnownGlobalUserLatLng; } catch (e) { return lastKnownGlobalUserLatLng; }
            }
            if (!navigator.geolocation) return null;
            return new Promise((resolve) => {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        setGlobalUserLocationMarker(pos.coords.latitude, pos.coords.longitude, { recenter });
                        try { resolve(window.L ? L.latLng(pos.coords.latitude, pos.coords.longitude) : [pos.coords.latitude, pos.coords.longitude]); } catch (e) { resolve([pos.coords.latitude, pos.coords.longitude]); }
                    },
                    () => resolve(null),
                    { enableHighAccuracy: true, timeout: 8000 }
                );
            });
        }

        function renderCategoryChips(categoryIds) {
            if (!categoryFiltersEl) return;
            const cache = ui?.getCategoryCache ? ui.getCategoryCache() : {};
            const ids = Array.isArray(categoryIds) ? categoryIds : [];
            const entries = ids
                .filter((id) => typeof id === "string" && id.trim())
                .map((id) => ({
                    id,
                    label: ui?.getCategoryLabel ? ui.getCategoryLabel(id, (cache[id] && (cache[id].name || cache[id].title)) || id) : id
                }))
                .sort((a, b) => (a.label || "").localeCompare(b.label || "", "es", { sensitivity: "base" }));

            categoryFiltersEl.innerHTML = "";

            const addChip = (id, label) => {
                const btn = document.createElement("button");
                btn.type = "button";
                const isActive = id ? selectedCategoryIds.has(id) : selectedCategoryIds.size === 0;
                btn.className = `pill-chip explore-filter-chip${isActive ? " active" : ""}`;
                btn.dataset.categoryId = id;
                btn.textContent = label;
                btn.addEventListener("click", async () => {
                    if (!id) {
                        selectedCategoryIds.clear();
                    } else if (selectedCategoryIds.has(id)) {
                        selectedCategoryIds.delete(id);
                    } else {
                        selectedCategoryIds.add(id);
                    }
                    categoryFiltersEl.querySelectorAll(".explore-filter-chip").forEach((el) => {
                        const elId = el.dataset.categoryId || "";
                        const active = elId ? selectedCategoryIds.has(elId) : selectedCategoryIds.size === 0;
                        el.classList.toggle("active", active);
                    });
                    updateTopGroupsHeading();
                    await refreshRails();
                    await refreshFollowingFeed();
                });
                categoryFiltersEl.appendChild(btn);
            };

            addChip("", "Todo");
            entries.forEach((e) => addChip(e.id, e.label || e.id));
        }

        function updateTopGroupsHeading() {
            if (!topGroupsTitleEl) return;
            const selected = [...selectedCategoryIds].filter(Boolean);
            if (selected.length === 0) {
                topGroupsTitleEl.textContent = "Mejor en Lispotic";
                return;
            }
            if (selected.length > 1) {
                topGroupsTitleEl.textContent = "Mejor Selección";
                return;
            }

            const onlyId = selected[0];
            const cache = ui?.getCategoryCache ? ui.getCategoryCache() : {};
            const labelRaw = ui?.getCategoryLabel
                ? ui.getCategoryLabel(onlyId, (cache[onlyId] && (cache[onlyId].name || cache[onlyId].title)) || onlyId)
                : onlyId;
            const label = (labelRaw || "").trim();
            const lower = label.toLowerCase();
            if (lower.includes("hmm")) {
                topGroupsTitleEl.textContent = "Mejor en Hmm...";
                return;
            }
            if (lower.includes("woow") || lower.includes("wow")) {
                topGroupsTitleEl.textContent = "Mejor en Woow!";
                return;
            }
            topGroupsTitleEl.textContent = `Mejor en ${label}`;
        }

        async function loadExploreCategories() {
            if (!categoryFiltersEl || !db) return;
            renderCategoryChips([]);
            try {
                const snap = await db.collection("categories").get();
                const cache = ui?.getCategoryCache ? ui.getCategoryCache() : null;
                const categoryIds = snap.docs.map((doc) => {
                    const data = doc.data() || null;
                    if (cache) cache[doc.id] = data;
                    return doc.id;
                });
                renderCategoryChips(categoryIds);
                updateTopGroupsHeading();
            } catch (e) {
                renderCategoryChips([]);
                updateTopGroupsHeading();
            }
        }

        distanceSelectEl &&
            distanceSelectEl.addEventListener("change", async (ev) => {
                const raw = (distanceSelectEl.value || "").trim();
                const km = raw ? parseFloat(raw) : NaN;
                exploreMaxDistanceKm = isFinite(km) && km > 0 ? km : null;
                hasWarnedMissingGeoForDistance = false;

                if (exploreMaxDistanceKm) {
                    const loc = await ensureUserLocation({ recenter: true });
                    if (!loc) {
                        exploreMaxDistanceKm = null;
                        distanceSelectEl.value = "";
                        if (!hasWarnedMissingGeoForDistance) {
                            hasWarnedMissingGeoForDistance = true;
                            ListopicApp.services?.showNotification?.("Activa tu ubicacion para filtrar por distancia.", "warn");
                        }
                    }
                }

                try { window.localStorage.setItem("listopic.defaultDistanceKm", String(exploreMaxDistanceKm || 0)); } catch (e) {}
                if (ev && ev.isTrusted) {
                    try {
                        const uid = auth?.currentUser?.uid;
                        if (uid) {
                            await db.collection("users").doc(uid).update({
                                defaultDistanceKm: exploreMaxDistanceKm || 0,
                                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                            });
                        }
                    } catch (e) {}
                }
                try { syncGlobalMapDistanceFilter(); } catch (e) {}
                refreshRails();
            });

        loadExploreCategories();

        async function initExploreDistanceFromPreference() {
            if (!distanceSelectEl) return;
            let preferred = null;
            try {
                const raw = window.localStorage.getItem("listopic.defaultDistanceKm");
                const parsed = raw != null ? parseFloat(raw) : NaN;
                if (isFinite(parsed)) preferred = parsed;
            } catch (e) {}

            if (preferred == null) {
                try {
                    const uid = auth?.currentUser?.uid;
                    if (uid) {
                        const snap = await db.collection("users").doc(uid).get();
                        const data = snap.exists ? (snap.data() || {}) : {};
                        if (typeof data.defaultDistanceKm === "number") preferred = data.defaultDistanceKm;
                    }
                } catch (e) {}
            }

            if (preferred == null) preferred = 10;
            distanceSelectEl.value = preferred > 0 ? String(preferred) : "";
            distanceSelectEl.dispatchEvent(new Event("change"));
        }

        initExploreDistanceFromPreference();

        async function getListHeroFromPlaces(listId) {
            if (!listId) return null;
            if (listHeroCache.has(listId)) return listHeroCache.get(listId);
            const promise = (async () => {
                try {
                    const getPlacesForList = firebase.app().functions('europe-west1').httpsCallable('getPlacesForList');
                    const result = await getPlacesForList({ listId });
                    const places = Array.isArray(result?.data?.places) ? result.data.places : [];
                    if (!places.length) return null;
                    const sorted = [...places].sort((a, b) => {
                        const scoreA = typeof a?.bestItemScore === "number" ? a.bestItemScore : 0;
                        const scoreB = typeof b?.bestItemScore === "number" ? b.bestItemScore : 0;
                        if (scoreB === scoreA) return (b.avgGeneralScore || 0) - (a.avgGeneralScore || 0);
                        return scoreB - scoreA;
                    });
                    const bestPlace = sorted[0];
                    const thumbUrl = bestPlace?.mainImageUrl || null;
                    const placeId = bestPlace?.id || bestPlace?.placeId || bestPlace?.googlePlaceId || bestPlace?.place_id || null;
                    const placeName = typeof bestPlace?.name === "string" ? bestPlace.name : "";
                    const placeCity = typeof bestPlace?.city === "string" ? bestPlace.city : (typeof bestPlace?.locationCity === "string" ? bestPlace.locationCity : "");
                    const topItem = Array.isArray(bestPlace?.topItems) ? bestPlace.topItems[0] : null;
                    const topItemName = typeof topItem?.name === "string" ? topItem.name : "";
                    const topItemScore = typeof topItem?.avgGeneralScore === "number" ? topItem.avgGeneralScore : (typeof bestPlace?.bestItemScore === "number" ? bestPlace.bestItemScore : 0);
                    return { thumbUrl, topItemName, topItemScore, placeId, placeName, placeCity };
                } catch (e) {
                    return null;
                }
            })();
            listHeroCache.set(listId, promise);
            return promise;
        }

        async function renderListCards(targetEl, lists, { showRank = false } = {}) {
            if (!targetEl) return;
            if (!lists || !lists.length) {
                targetEl.innerHTML = '<p class="loading-placeholder">Nada por aqui (aun).</p>';
                return;
            }

            const categoryIds = Array.from(
                new Set(
                    lists
                        .map((l) => (typeof l?.categoryId === "string" ? l.categoryId.trim() : ""))
                        .filter(Boolean)
                )
            );
            if (ui?.ensureCategoryCached && categoryIds.length) {
                await Promise.all(categoryIds.map((id) => ui.ensureCategoryCached(id).catch(() => null)));
            }

            const cards = await Promise.all(
                lists.map(async (list, idx) => {
                    (list.availableTags || []).forEach((t) => tagCounter.set(t, (tagCounter.get(t) || 0) + 1));
                    const iconClass = await ui.getListIcon(list);
                    const name = ui.escapeHtml(list.name || "Lista sin nombre");
                    const reviews = list.reviewCount || 0;
                    const followers = list.followersCount || 0;
                    const bestGroup = Array.isArray(list.places)
                        ? [...list.places].sort((a, b) => {
                              const scoreA = typeof a?.bestItemScore === "number" ? a.bestItemScore : getScore(a);
                              const scoreB = typeof b?.bestItemScore === "number" ? b.bestItemScore : getScore(b);
                              return scoreB - scoreA;
                          })[0]
                        : null;
                    let bestGroupName = bestGroup ? ui.escapeHtml(bestGroup.name || bestGroup.itemName || "") : "";
                    let bestGroupScore = bestGroup ? (typeof bestGroup.bestItemScore === "number" ? bestGroup.bestItemScore : getScore(bestGroup)) : 0;
                    const bestGroupThumb = bestGroup?.mainImageUrl || bestGroup?.imageUrl || bestGroup?.photoUrl || bestGroup?.placePhotoUrl || "";
                    let thumb = bestGroupThumb || list.mainImageUrl || list.coverImageUrl || list.previewImage || list.imageUrl || "";
                    if (!thumb && list.id) {
                        const hero = await getListHeroFromPlaces(list.id);
                        if (hero?.thumbUrl) thumb = hero.thumbUrl;
                        if (!bestGroupName && hero?.topItemName) bestGroupName = ui.escapeHtml(hero.topItemName);
                        if (!bestGroupScore && typeof hero?.topItemScore === "number") bestGroupScore = hero.topItemScore;
                    }
                    const rawCategoryId = typeof list.categoryId === "string" ? list.categoryId.trim() : "";
                    const categoryLabel = rawCategoryId && ui?.getCategoryLabel ? ui.getCategoryLabel(rawCategoryId, "") : "";
                    const category = categoryLabel ? ui.escapeHtml(categoryLabel) : "";
                    const overlayThumbStyle = thumb
                        ? `style="background-image:url('${ui.escapeHtml(thumb)}');"`
                        : `style="background: linear-gradient(135deg, rgba(var(--accent-color-primary-rgb), 0.22), rgba(var(--accent-color-secondary-rgb), 0.18));"`;
                    const bestGroupCityRaw = bestGroup ? (bestGroup.city || bestGroup.locationCity || bestGroup.addressCity || bestGroup.town || bestGroup.locality || "") : "";
                    const bestGroupCity = bestGroupCityRaw ? ui.escapeHtml(String(bestGroupCityRaw)) : "";
                    const bestGroupLocationPills = (bestGroupName || bestGroupCity)
                        ? `
                            <div class="overlay-tags" aria-label="Ubicacion">
                                ${bestGroupCity ? `<span class="overlay-pill overlay-pill--city" title="${bestGroupCity}">${bestGroupCity}</span>` : ""}
                                ${bestGroupName ? `<span class="overlay-pill overlay-pill--place" title="${bestGroupName}">${bestGroupName}</span>` : ""}
                            </div>
                        `.trim()
                        : "";
                    const topScoreBadge = bestGroupScore ? `<span class="pill-chip pill-chip--badge" title="Puntuación">${Number(bestGroupScore).toFixed(1)}</span>` : "";
                    const categoryTop = category ? `<span class="pill-label pill-label--category-top" title="Categoría">${category}</span>` : "";
                    const thumbHtml = `
                        <div class="featured-thumb overlay-thumb" ${overlayThumbStyle}>
                            <div class="overlay-top overlay-top--tr overlay-top--list">
                                ${categoryTop}
                                ${topScoreBadge}
                            </div>
                            <div class="overlay-info overlay-info--list overlay-info--flush">
                                <h3 class="overlay-title">${name}</h3>
                                ${bestGroupLocationPills}
                                <div class="overlay-pills">
                                    <span class="pill-label pill-label--stat" title="Seguidores"><i class="fas fa-heart"></i> ${followers}</span>
                                    <span class="pill-label pill-label--stat" title="Reseñas"><i class="fas fa-pencil-alt"></i> ${reviews}</span>

                                </div>
                            </div>
                        </div>`;
                    return `
                        <article class="featured-card carousel-card carousel-card--list">
                            ${showRank ? `<span class="rank-badge">#${idx + 1}</span>` : ""}
                            <a href="list-view.html?listId=${list.id}">
                                ${thumbHtml}
                            </a>
                        </article>`;
                })
            );
            targetEl.innerHTML = cards.join("");
        }

        async function loadTopLists() {
            if (!topListsEl) return;
            try {
                const snap = await db.collection("lists").where("isPublic", "==", true).orderBy("reviewCount", "desc").limit(80).get();
                const lists = snap.docs
                    .map((d) => ({ id: d.id, ...d.data() }))
                    .filter((l) => passMood(getScore(l), currentMood))
                    .filter((l) => {
                        if (selectedCategoryIds.size === 0) return true;
                        const cat = typeof l?.categoryId === "string" ? l.categoryId.trim() : "";
                        return cat && selectedCategoryIds.has(cat);
                    })
                    .slice(0, 12);
                await renderListCards(topListsEl, lists, { showRank: true });
            } catch (e) {
                console.error("INDEX: Error loading top lists", e);
                topListsEl.innerHTML = `<p class="error-placeholder">${e.message}</p>`;
            }
        }

        async function loadTopGroups() {
            if (!topGroupsEl) return;
            try {
                topGroupsEl.innerHTML = '<p class="loading-placeholder">Cargando mejores grupos...</p>';

                let snap = null;
                try {
                    snap = await db.collectionGroup("reviews").orderBy("overallRating", "desc").limit(420).get();
                } catch (e) {
                    snap = await db.collectionGroup("reviews").orderBy("createdAt", "desc").limit(420).get();
                }

                const docs = snap?.docs || [];
                if (!docs.length) {
                    topGroupsEl.innerHTML = '<p class="loading-placeholder">Aun no hay reseñas publicas.</p>';
                    return;
                }

                const listIds = [...new Set(docs.map((doc) => (doc.data() || {}).listId).filter(Boolean))];
                let publicLists = new Set();
                if (listIds.length) {
                    const listSnaps = await Promise.all(listIds.map((id) => db.collection("lists").doc(id).get().catch(() => null)));
                    publicLists = new Set(listSnaps.filter((s) => s?.exists && s.data()?.isPublic === true).map((s) => s.id));
                }

                const filteredDocs = docs.filter((doc) => {
                    const data = doc.data() || {};
                    if (data.listId && !publicLists.has(data.listId)) return false;
                    return true;
                });

                const enriched = await ui.enrichReviews(filteredDocs.slice(0, 360));
                const groupsByListPlaceItem = new Map();

                enriched.forEach((r) => {
                    const listId = r.listId || "";
                    const placeId = r.placeId || r.place?.id || "";
                    const itemNameRaw = r.itemName || r.item || r.itemTitle || r.item_label || "";
                    const itemName = typeof itemNameRaw === "string" ? itemNameRaw.trim() : "";
                    if (!listId || !placeId || !itemName) return;

                    const ratingNum = typeof r.overallRating === "number"
                        ? r.overallRating
                        : (typeof r.avgGeneralScore === "number" ? r.avgGeneralScore : getScore(r));
                    if (!isFinite(ratingNum) || ratingNum <= 0) return;

                    const itemKey = itemName.toLowerCase();
                    const key = `${listId}||${placeId}||${itemKey}`;
                    const prev = groupsByListPlaceItem.get(key);
                    const thumbCandidate = r.photoUrl || r.imageUrl || r.placePhotoUrl || r.mainImageUrl || r.place?.mainImageUrl || "";
                    const placeLocation = r.place?.location || null;

                    if (!prev) {
                        groupsByListPlaceItem.set(key, {
                            listId,
                            listName: r.listName || "",
                            categoryId: r.categoryId || "",
                            placeId,
                            placeName: r.establishmentName || r.place?.name || "",
                            itemName,
                            itemKey,
                            thumbUrl: thumbCandidate || "",
                            placeLocation,
                            sum: ratingNum,
                            count: 1
                        });
                        return;
                    }

                    prev.sum += ratingNum;
                    prev.count += 1;
                    if (!prev.thumbUrl && thumbCandidate) prev.thumbUrl = thumbCandidate;
                    if (!prev.placeLocation && placeLocation) prev.placeLocation = placeLocation;
                });

                const groups = [...groupsByListPlaceItem.values()]
                    .map((g) => ({ ...g, avgScore: g.count ? g.sum / g.count : 0 }))
                    .filter((g) => isFinite(g.avgScore) && g.avgScore > 0);

                const scoped = groups
                    .filter((g) => passMood(g.avgScore || 0, currentMood))
                    .filter((g) => {
                        if (selectedCategoryIds.size === 0) return true;
                        const cat = typeof g?.categoryId === "string" ? g.categoryId.trim() : "";
                        return cat && selectedCategoryIds.has(cat);
                    });

                const userLatLng =
                    typeof exploreMaxDistanceKm === "number" &&
                    isFinite(exploreMaxDistanceKm) &&
                    exploreMaxDistanceKm > 0 &&
                    Array.isArray(lastKnownGlobalUserLatLng) &&
                    lastKnownGlobalUserLatLng.length === 2 &&
                    window.L
                        ? L.latLng(lastKnownGlobalUserLatLng[0], lastKnownGlobalUserLatLng[1])
                        : null;
                const maxMeters =
                    userLatLng && typeof exploreMaxDistanceKm === "number" && isFinite(exploreMaxDistanceKm) ? exploreMaxDistanceKm * 1000 : null;

                const distanceScoped = maxMeters
                    ? scoped.filter((g) => {
                          const loc = g.placeLocation;
                          if (!loc || typeof loc.latitude !== "number" || typeof loc.longitude !== "number") return false;
                          const dist = userLatLng.distanceTo(L.latLng(loc.latitude, loc.longitude));
                          return dist <= maxMeters;
                      })
                    : scoped;

                if (!distanceScoped.length) {
                    topGroupsEl.innerHTML = '<p class="loading-placeholder">No hay grupos para estas categorías.</p>';
                    return;
                }

                const byPlaceAndItem = new Map();
                distanceScoped.forEach((g) => {
                    const key = `${g.placeId}||${g.itemKey}`;
                    const prev = byPlaceAndItem.get(key);
                    if (!prev) return void byPlaceAndItem.set(key, g);
                    if ((g.avgScore || 0) > (prev.avgScore || 0)) return void byPlaceAndItem.set(key, g);
                    if ((g.avgScore || 0) === (prev.avgScore || 0) && (g.count || 0) > (prev.count || 0)) return void byPlaceAndItem.set(key, g);
                });

                const finalItems = [...byPlaceAndItem.values()]
                    .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0) || (b.count || 0) - (a.count || 0))
                    .slice(0, 12);

                topGroupsEl.innerHTML = finalItems
                    .map((g) => {
                        const title = ui.escapeHtml(g.itemName || "Plato");
                        const placeName = ui.escapeHtml(g.placeName || "Lugar");
                        const listName = ui.escapeHtml(g.listName || "");

                        const ratingNum = typeof g.avgScore === "number" ? g.avgScore : 0;
                        const rating = ratingNum ? ratingNum.toFixed(1) : "-";
                        const scoreBg = ratingNum ? ui.getRatingHexColor(ratingNum) : "";
                        const scoreFg = ratingNum >= 6 && ratingNum < 8 ? "#1b2130" : "#ffffff";
                        const ratingBadge = `<span class="pill-chip pill-chip--badge" ${scoreBg ? `style="--score-bg:${ui.escapeHtml(scoreBg)};--score-fg:${scoreFg};"` : ""} title="Valoracion">${rating}</span>`;

                        const groupedLink = ui?.buildGroupedDetailUrl
                            ? ui.buildGroupedDetailUrl({
                                  listId: g.listId || "",
                                  placeId: g.placeId || "",
                                  itemName: g.itemName || ""
                              })
                            : (g.listId ? `list-view.html?listId=${g.listId}` : "search.html");

                        const img = g.thumbUrl || "";
                        const thumbStyle = img
                            ? `style="background-image:url('${ui.escapeHtml(img)}');"`
                            : `style="background: rgba(var(--accent-color-primary-rgb, 92, 124, 250), 0.12);"`;

                        return `
                            <article class="review-card carousel-card carousel-card--review carousel-card--top-group">
                                <a href="${ui.escapeHtml(groupedLink)}">
                                    <div class="review-thumb overlay-thumb" ${thumbStyle}>
                                        <div class="overlay-top overlay-top--tr overlay-top--review">
                                            ${ratingBadge}
                                        </div>
                                        <div class="overlay-info overlay-info--review overlay-info--flush">
                                            <h3 class="overlay-title" title="${title}">${title}</h3>
                                            ${placeName ? `<p class="overlay-sub overlay-sub--place" title="${placeName}"><i class="fas fa-map-marker-alt" aria-hidden="true"></i> <span>${placeName}</span></p>` : ""}
                                            ${listName ? `<p class="overlay-sub overlay-sub--place" title="${listName}"><i class="fas fa-list-ul" aria-hidden="true"></i> <span>${listName}</span></p>` : ""}
                                        </div>
                                    </div>
                                </a>
                            </article>
                        `;
                    })
                    .join("");
            } catch (e) {
                console.error("INDEX: Error loading top groups", e);
                topGroupsEl.innerHTML = `<p class="error-placeholder">${e.message}</p>`;
            }
        }

        async function loadNewLists() {
            if (!newListsEl) return;
            try {
                const snap = await db.collection("lists").where("isPublic", "==", true).orderBy("createdAt", "desc").limit(80).get();
                const lists = snap.docs
                    .map((d) => ({ id: d.id, ...d.data() }))
                    .filter((l) => passMood(getScore(l), currentMood))
                    .filter((l) => {
                        if (selectedCategoryIds.size === 0) return true;
                        const cat = typeof l?.categoryId === "string" ? l.categoryId.trim() : "";
                        return cat && selectedCategoryIds.has(cat);
                    })
                    .slice(0, 12);
                await renderListCards(newListsEl, lists, { showRank: true });
            } catch (e) {
                console.error("INDEX: Error loading new lists", e);
                newListsEl.innerHTML = `<p class="error-placeholder">${e.message}</p>`;
            }
        }

        async function loadTopUsers() {
            if (!topUsersEl) return;
            try {
                const snap = await db.collection("users").orderBy("reviewsCount", "desc").limit(10).get();
                const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                topUsersEl.innerHTML = users
                    .map((u, idx) => {
                        const displayNameRaw = u.displayName || u.name || u.username || "Usuario";
                        const usernameRaw = u.username || "";
                        const name = ui.escapeHtml(displayNameRaw);
                        const username = usernameRaw ? ui.escapeHtml(usernameRaw) : "";
                        const bio = ui.escapeHtml((u.bio || "").trim());
                        const avatarUrl = u.photoUrl || u.photoURL || u.avatarUrl || "";
                        const avatarStyle = avatarUrl ? `style="background-image:url('${ui.escapeHtml(avatarUrl)}');"` : "";
                        const followers = typeof u.followersCount === "number" ? u.followersCount : 0;
                        const reviews = typeof u.reviewsCount === "number" ? u.reviewsCount : 0;
                        const lists = (typeof u.publicListsCount === "number" ? u.publicListsCount : 0) + (typeof u.privateListsCount === "number" ? u.privateListsCount : 0);
                        return `
                            <article class="user-chip-card carousel-card carousel-card--user">
                                <span class="rank-badge small">#${idx + 1}</span>
                                <a class="user-card__link" href="profile.html?viewUserId=${u.id}">
                                    <div class="user-card__media">
                                        <div class="user-chip-avatar" ${avatarStyle}>${avatarUrl ? "" : '<img src="img/default-avatar.png" alt="" loading="lazy">'}
                                        </div>
                                    </div>
                                    <div class="user-card__body">
                                        <div class="user-card__title-row">
                                            <strong class="user-card__name">${name}</strong>
                                            ${username ? `<span class="user-card__handle">@${username}</span>` : ""}
                                        </div>
                                        ${bio ? `<p class="user-card__bio">${bio}</p>` : ""}
                                        <div class="user-card__stats">
                                            <span class="pill-label" title="Seguidores"><i class="fas fa-heart"></i> ${followers}</span>
                                            <span class="pill-label" title="Reseñas"><i class="fas fa-pen"></i> ${reviews}</span>
                                            <span class="pill-label" title="Listas"><i class="fas fa-list"></i> ${lists}</span>
                                        </div>
                                    </div>
                                </a>
                            </article>
                        `;
                    })
                    .join("");
            } catch (e) {
                console.error("INDEX: Error loading top users", e);
                topUsersEl.innerHTML = `<p class="error-placeholder">${e.message}</p>`;
            }
        }

        async function loadTopPlaces() {
            if (!topPlacesEl) return;
            try {
                const snap = await db.collection("places").orderBy("averageRating", "desc").limit(200).get();
                const userLatLng = Array.isArray(lastKnownGlobalUserLatLng) ? L.latLng(lastKnownGlobalUserLatLng[0], lastKnownGlobalUserLatLng[1]) : null;
                const maxMeters = typeof exploreMaxDistanceKm === "number" && isFinite(exploreMaxDistanceKm) ? exploreMaxDistanceKm * 1000 : null;
                const places = snap.docs
                    .map((d) => {
                        const p = d.data() || {};
                        return {
                            id: d.id,
                            name: p.name || "Lugar",
                            city: p.city || p.locationCity || p.addressCity || p.town || p.locality || "",
                            province: p.province || "",
                            mainImageUrl: p.mainImageUrl || null,
                            averageRating: typeof p.averageRating === "number" ? p.averageRating : 0,
                            reviewsCount: p.reviewsCount || 0,
                            location: p.location
                        };
                    })
                    .filter((p) => passMood(p.averageRating || 0, currentMood))
                    .filter((p) => {
                        if (!maxMeters || !userLatLng) return true;
                        if (!p.location || typeof p.location.latitude !== "number" || typeof p.location.longitude !== "number") return false;
                        const dist = userLatLng.distanceTo(L.latLng(p.location.latitude, p.location.longitude));
                        return dist <= maxMeters;
                    })
                    .slice(0, 12);
                topPlacesEl.innerHTML = places
                    .map((p, idx) => {
                        const ratingNum = typeof p.averageRating === "number" ? p.averageRating : 0;
                        const rating = ratingNum ? ratingNum.toFixed(1) : "-";
                        const scoreBg = ratingNum ? ui.getRatingHexColor(ratingNum) : "";
                        const scoreFg = ratingNum >= 6 && ratingNum < 8 ? "#1b2130" : "#ffffff";
                        const ratingBadge = `<span class="pill-chip pill-chip--badge" ${scoreBg ? `style="--score-bg:${ui.escapeHtml(scoreBg)};--score-fg:${scoreFg};"` : ""} title="Valoración">${rating}</span>`;
                        const reviewsBadge = `<span class="overlay-top-count" title="Resenas"><i class="fas fa-comment-dots" aria-hidden="true"></i> ${p.reviewsCount}</span>`;
                        const city = ui.escapeHtml((p.city || "").trim());
                        const thumb = p.mainImageUrl ? `style="background-image:url('${ui.escapeHtml(p.mainImageUrl)}');"` : "";
                        return `
                            <article class="featured-card place-card carousel-card carousel-card--place">
                                <span class="rank-badge">#${idx + 1}</span>
                                <a href="place-detail.html?placeId=${p.id}">
                                    <div class="featured-thumb overlay-thumb" ${thumb}>
                                        <div class="overlay-top overlay-top--tr overlay-top--stack">
                                            ${ratingBadge}
                                            ${reviewsBadge}
                                        </div>
                                        <div class="overlay-info">
                                            <h3 class="overlay-title" title="${ui.escapeHtml(p.name)}">${ui.escapeHtml(p.name)}</h3>
                                            ${city ? `<p class="overlay-sub overlay-sub--city" title="${city}"><i class="fas fa-city" aria-hidden="true"></i> <span>${city}</span></p>` : ""}
                                        </div>
                                    </div>
                             </a>
                            </article>
                        `;
                    })
                    .join("");
            } catch (e) {
                console.error("INDEX: Error loading top places", e);
                topPlacesEl.innerHTML = `<p class="error-placeholder">${e.message}</p>`;
            }
        }

        async function loadHotReviews() {
            if (!hotReviewsEl) return;
            try {
                const snap = await db.collectionGroup("reviews").orderBy("createdAt", "desc").limit(60).get();
                const docs = snap.docs;
                if (!docs.length) {
                    hotReviewsEl.innerHTML = '<p class="loading-placeholder">Aun no hay resenas publicas.</p>';
                    return;
                }
            const listIds = [...new Set(docs.map((doc) => (doc.data() || {}).listId).filter(Boolean))];
            let publicLists = new Set();
            if (listIds.length) {
                const listSnaps = await Promise.all(listIds.map((id) => db.collection("lists").doc(id).get().catch(() => null)));
                publicLists = new Set(listSnaps.filter((s) => s?.exists && s.data()?.isPublic === true).map((s) => s.id));
            }
            const filteredDocs = docs.filter((doc) => {
                const data = doc.data() || {};
                if (data.listId && !publicLists.has(data.listId)) return false;
                return passMood(getScore(data), currentMood);
            });
            const enriched = await ui.enrichReviews(filteredDocs.slice(0, 36));
            const categoryFiltered = selectedCategoryIds.size
                ? enriched.filter((r) => r?.categoryId && selectedCategoryIds.has(r.categoryId))
                : enriched;
            const finalItems = categoryFiltered.slice(0, 12);
            if (!finalItems.length) {
                hotReviewsEl.innerHTML = '<p class="loading-placeholder">No hay reseñas para estas categorías.</p>';
                return;
            }
             hotReviewsEl.innerHTML = finalItems
                 .map((r) => {
                     const title = ui.escapeHtml(r.itemName || r.establishmentName || "Resena");
                     const placeName = ui.escapeHtml(r.place?.name || r.establishmentName || "");
                     const placeCity = ui.escapeHtml(r.place?.city || "");
                     const authorName = ui.escapeHtml(r.author?.name || "Usuario");
                     const authorPhotoUrl = ui.escapeHtml(r.author?.photoUrl || "img/placeholder-avatar.png");
                     const ratingNum = typeof r.overallRating === "number" ? r.overallRating : 0;
                     const rating = ratingNum ? ratingNum.toFixed(1) : "-";
                     const scoreBg = ratingNum ? ui.getRatingHexColor(ratingNum) : "";
                     const scoreFg = ratingNum >= 6 && ratingNum < 8 ? "#1b2130" : "#ffffff";
                     const ratingBadge = `<span class="pill-chip pill-chip--badge" ${scoreBg ? `style="--score-bg:${ui.escapeHtml(scoreBg)};--score-fg:${scoreFg};"` : ""} title="Valoración">${rating}</span>`;
                     const listLink = r.listId ? `list-view.html?listId=${r.listId}` : "search.html";
                     const groupedLink = ui?.buildGroupedDetailUrl
                         ? ui.buildGroupedDetailUrl({
                               listId: r.listId || "",
                               placeId: r.placeId || r.place?.id || "",
                               itemName: r.itemName || r.item || "",
                               reviewId: r.id || ""
                           })
                         : listLink;
                     const img = r.photoUrl || r.imageUrl || r.placePhotoUrl || r.mainImageUrl || "";
                     const thumbStyle = img
                         ? `style="background-image:url('${ui.escapeHtml(img)}');"`
                         : `style="background: rgba(var(--accent-color-primary-rgb, 92, 124, 250), 0.12);"`;
                     return `
                         <article class="review-card carousel-card carousel-card--review">
                             <a href="${ui.escapeHtml(groupedLink)}">
                                   <div class="review-thumb overlay-thumb" ${thumbStyle}>
                                       <div class="overlay-top overlay-top--review overlay-top--author" title="${authorName}">
                                           <span class="overlay-author-chip">
                                               <img class="overlay-avatar" src="${authorPhotoUrl}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='img/placeholder-avatar.png';">
                                               <span class="overlay-author-chip__name">${authorName}</span>
                                           </span>
                                       </div>
                                       <div class="overlay-top overlay-top--tr overlay-top--review">
                                           ${ratingBadge}
                                       </div>
                                        <div class="overlay-info overlay-info--review overlay-info--flush">
                                            <h3 class="overlay-title">${title}</h3>
                                            ${placeName ? `<p class="overlay-sub overlay-sub--place" title="${placeName}"><i class="fas fa-map-marker-alt"></i> <span>${placeName}</span></p>` : ""}
                                            ${placeCity ? `<p class="overlay-sub overlay-sub--city" title="${placeCity}"><i class="fas fa-city"></i> <span>${placeCity}</span></p>` : ""}
                                       </div>
                                  </div>
                              </a>
                          </article>
                     `;
                     })
                     .join("");
            } catch (e) {
                console.error("INDEX: Error loading hot reviews", e);
                hotReviewsEl.innerHTML = `<p class="error-placeholder">${e.message}</p>`;
            }
        }

        async function refreshRails() {
            tagCounter.clear();
            await Promise.all([loadTopLists(), loadTopGroups(), loadTopUsers(), loadTopPlaces(), loadHotReviews(), loadNewLists()]);
            if (trendingTagsEl) {
                const sorted = [...tagCounter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
                trendingTagsEl.innerHTML = sorted
                    .map(([tag]) => {
                        const safe = ui.escapeHtml(tag);
                        return `<a class="pill-chip" href="search.html?tag=${encodeURIComponent(tag)}" title="${safe}"><i class="fas fa-hashtag"></i> ${safe}</a>`;
                    })
                    .join("");
            }
            updateRailNavVisibility();
        }

        async function refreshFollowingFeed() {
            if (!feed) return;
            if (followingFeedController && typeof followingFeedController.destroy === "function") {
                try { followingFeedController.destroy(); } catch (e) {}
                followingFeedController = null;
            }

            try {
                const currentUid = auth?.currentUser?.uid;
                if (!currentUid) {
                    feed.innerHTML = '<p class="loading-placeholder">Inicia sesion para ver novedades.</p>';
                    return;
                }

                feed.innerHTML = '<p class="loading-placeholder">Cargando novedades...</p>';

                const followingSnap = await db.collection("users").doc(currentUid).collection("following").limit(200).get();
                const followedUserIds = [];
                followingSnap.forEach((doc) => {
                    const data = doc.data();
                    if (!data || !data.placeId) followedUserIds.push(doc.id);
                });

                if (followedUserIds.length === 0) {
                    feed.innerHTML = '<p class="loading-placeholder">Tu feed esta vacio. Sigue a alguien para ver sus resenas.</p>';
                    return;
                }

                const chunks = [];
                for (let i = 0; i < followedUserIds.length; i += 10) chunks.push(followedUserIds.slice(i, i + 10));
                const queries = chunks.map((chunk) => db.collectionGroup("reviews").where("userId", "in", chunk).limit(40).get());
                const results = await Promise.all(queries);
                let allDocs = [];
                results.forEach((snap) => allDocs.push(...snap.docs));
                if (allDocs.length === 0) {
                    feed.innerHTML = '<p class="loading-placeholder">Aun no hay resenas de tus seguidos.</p>';
                    return;
                }

                const ts = (doc) => {
                    const data = typeof doc.data === "function" ? doc.data() || {} : {};
                    const created = data.createdAt?.toMillis ? data.createdAt.toMillis() : null;
                    const updated = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : null;
                    return created ?? updated ?? 0;
                };
                allDocs.sort((a, b) => ts(b) - ts(a));
                let docQueue = allDocs.slice(0, 80);

                try {
                    const listIds = [...new Set(docQueue.map((doc) => (doc.data()?.listId ? doc.data().listId : null)).filter(Boolean))];
                    if (listIds.length > 0) {
                        const listSnaps = await Promise.all(listIds.map((id) => db.collection("lists").doc(id).get().catch(() => null)));
                        const allowedListIds = new Set(listSnaps.filter((snap) => snap?.exists && snap.data()?.isPublic === true).map((snap) => snap.id));
                        docQueue = docQueue.filter((doc) => {
                            const data = doc.data() || {};
                            return data.listId && allowedListIds.has(data.listId);
                        });
                    }
                } catch (filterError) {
                    console.warn("INDEX: No se pudieron filtrar listas privadas del feed:", filterError);
                }

                if (docQueue.length === 0) {
                    feed.innerHTML = '<p class="loading-placeholder">Tus seguidos todavia no tienen resenas publicas para mostrar.</p>';
                    return;
                }

                const buffer = [];
                followingFeedController = ui.setupLazyReviewList({
                    container: feed,
                    batchSize: 5,
                    emptyMessage: '<p class="loading-placeholder">Aun no hay resenas de tus seguidos.</p>',
                    loadBatch: async ({ batchSize }) => {
                        const items = [];
                        const wantCategoryFilter = selectedCategoryIds.size > 0;

                        while (items.length < batchSize) {
                            while (items.length < batchSize && buffer.length) {
                                items.push(buffer.shift());
                            }
                            if (items.length >= batchSize) break;
                            if (docQueue.length === 0) break;

                            const take = Math.min(Math.max(batchSize * 3, 12), docQueue.length);
                            const batchDocs = docQueue.splice(0, take);
                            const enriched = await ui.enrichReviews(batchDocs);
                            const filtered = enriched
                                .filter((r) => passMood(getScore(r), currentMood))
                                .filter((r) => !wantCategoryFilter || (r?.categoryId && selectedCategoryIds.has(r.categoryId)));
                            buffer.push(...filtered);
                        }

                        while (items.length < batchSize && buffer.length) {
                            items.push(buffer.shift());
                        }

                        return { items, hasMore: docQueue.length > 0 || buffer.length > 0 };
                    }
                });
            } catch (e) {
                console.error("INDEX: Error loading following feed", e);
                feed.innerHTML = `<p class="error-placeholder">${e.message}</p>`;
            }
        }

        function setupRailNav() {
            document.querySelectorAll(".rail-nav[data-target]").forEach((nav) => {
                const targetId = nav.getAttribute("data-target");
                const track = targetId ? document.getElementById(targetId) : null;
                if (!track) return;
                nav.querySelectorAll(".rail-nav-btn").forEach((btn) => {
                    btn.addEventListener("click", (ev) => {
                        ev.preventDefault();
                        const dir = parseInt(btn.getAttribute("data-dir") || "1", 10) || 1;
                        const amount = Math.max(Math.floor(track.clientWidth * 0.85), 320);
                        track.scrollBy({ left: dir * amount, behavior: "smooth" });
                    });
                });
            });
        }

        function updateRailNavVisibility() {
            document.querySelectorAll(".rail-nav[data-target]").forEach((nav) => {
                const targetId = nav.getAttribute("data-target");
                const track = targetId ? document.getElementById(targetId) : null;
                if (!track) return;
                const hasOverflow = track.scrollWidth > track.clientWidth + 8;
                nav.toggleAttribute("hidden", !hasOverflow);
            });
        }

        setupRailNav();
        window.addEventListener("resize", () => updateRailNavVisibility());

        await refreshRails();
        await refreshFollowingFeed();

        // Mapa inline
        const mapContainer = document.getElementById("global-map-container");
        const mapPanel = document.getElementById("global-map-panel");
        const mapToggleBtn = document.getElementById("toggle-global-map-btn");
        const centerBtn = document.getElementById("global-map-center-user-btn");
        const mapModal = document.getElementById("global-map-modal");
        const mapModalOpenBtn = document.getElementById("show-global-map-modal-btn");
        const mapModalCloseBtn = document.getElementById("close-global-map-modal-btn");

        async function ensureGlobalMap(initialParams = null) {
            if (!mapContainer || !window.L) return;
            if (!globalMapInstance) {
                const initialTheme = document.body.classList.contains("light-theme") ? "light" : "dark";
                const startLatLng = initialParams?.lat != null && initialParams?.lng != null ? [initialParams.lat, initialParams.lng] : [40.4167, -3.703];
                const startZoom = initialParams?.zoom || 5;
                globalMapInstance = L.map(mapContainer).setView(startLatLng, startZoom);
                currentTileLayer = L.tileLayer(tileLayers[initialTheme], { attribution: "&copy; OpenStreetMap &copy; CARTO" }).addTo(globalMapInstance);
                document.addEventListener("themeChanged", (ev) => {
                    const newTheme = ev.detail.theme;
                    currentTileLayer && currentTileLayer.setUrl(tileLayers[newTheme]);
                });
                try { recenterGlobalMapToUser({ silent: true }); } catch (e) {}
                globalMapInstance.on("moveend zoomend", () => {
                    try { setGlobalMapParamsInUrl(true, globalMapInstance.getCenter(), globalMapInstance.getZoom(), false); } catch (e) {}
                });
                try {
                    const snap = await db.collection("places").get();
                    const places = snap.docs
                        .map((doc) => {
                            const p = doc.data() || {};
                            return { id: doc.id, name: p.name || "Lugar", location: p.location, mainImageUrl: p.mainImageUrl || null, avgGeneralScore: typeof p.averageRating === "number" ? p.averageRating : null, reviewsCount: p.reviewsCount || 0 };
                        })
                        .filter((p) => p.location && typeof p.location.latitude === "number" && typeof p.location.longitude === "number" && (p.reviewsCount || 0) > 0 && (p.avgGeneralScore || 0) > 0);
                    addGlobalPlacesToMap(places);
                } catch (e) { console.error("INDEX: Error cargando lugares para el mapa global", e); }
            } else {
                globalMapInstance.invalidateSize();
                try { syncGlobalMapDistanceFilter(); } catch (e) {}
            }
        }

        const openMapModal = () => {
            if (!mapModal) return;
            mapModal.classList.add("active");
            document.body.classList.add("modal-open");
            ensureGlobalMap(initialGlobalMapParams);
            setTimeout(() => { try { globalMapInstance && globalMapInstance.invalidateSize(); } catch (e) {} }, 120);
        };

        const closeMapModal = () => {
            if (!mapModal) return;
            mapModal.classList.remove("active");
            document.body.classList.remove("modal-open");
        };

        mapModalOpenBtn && mapModalOpenBtn.addEventListener("click", (e) => { e.preventDefault(); openMapModal(); });
        mapModalCloseBtn && mapModalCloseBtn.addEventListener("click", (e) => { e.preventDefault(); closeMapModal(); });
        mapModal && mapModal.addEventListener("click", (e) => { if (e.target === mapModal) closeMapModal(); });

        centerBtn && centerBtn.addEventListener("click", (e) => { e.preventDefault(); recenterGlobalMapToUser(); });
        function setMapPanelOpen(open, { fromUrl = false } = {}) {
            if (!mapPanel || !mapToggleBtn) return;
            const hintEl = mapToggleBtn.querySelector(".map-strip__toggle-hint");
            mapPanel.toggleAttribute("hidden", !open);
            mapToggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
            mapToggleBtn.classList.toggle("is-open", open);
            if (hintEl) hintEl.textContent = open ? "Plegar" : "Desplegar";
            if (!open) {
                try { setGlobalMapParamsInUrl(false, null, null, false); } catch (e) {}
                return;
            }
            ensureGlobalMap(fromUrl ? initialGlobalMapParams : null);
            setTimeout(() => { try { globalMapInstance && globalMapInstance.invalidateSize(); } catch (e) {} }, 120);
        }

        mapToggleBtn &&
            mapToggleBtn.addEventListener("click", (e) => {
                e.preventDefault();
                const isOpen = mapToggleBtn.getAttribute("aria-expanded") === "true";
                setMapPanelOpen(!isOpen, { fromUrl: false });
            });

        try { initialGlobalMapParams = readGlobalMapParamsFromUrl(); } catch (e) {}
        if (initialGlobalMapParams?.open) {
            setMapPanelOpen(true, { fromUrl: true });
        } else {
            setMapPanelOpen(false);
        }
    }

    return { init };
})();
