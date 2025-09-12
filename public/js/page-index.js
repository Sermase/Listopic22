// Contenido completo para page-index.js (epic index)

window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageIndex = (() => {
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
                    return `
                        <article class="featured-card">
                            <a href="list-view.html?listId=${list.id}">
                                <h3><i class="${iconClass}"></i> ${name}</h3>
                                <div class="meta"><i class="fas fa-pencil-alt"></i> ${reviews} reseñas</div>
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
                            // Ordenar por createdAt desc y limitar
                            allDocs.sort((a, b) => {
                                const ta = a.data().createdAt?.toMillis ? a.data().createdAt.toMillis() : 0;
                                const tb = b.data().createdAt?.toMillis ? b.data().createdAt.toMillis() : 0;
                                return tb - ta;
                            });
                            allDocs = allDocs.slice(0, 10);
                            const enriched = await ui.enrichReviews(allDocs);
                            feed.innerHTML = enriched.map(r => ui.renderReviewSuperCard(r)).join('');
                        }
                    }
                }
            } catch (e) {
                console.error('INDEX: Error loading following feed', e);
                feed.innerHTML = `<p class=\"error-placeholder\">${e.message}</p>`;
            }
        }
    }

    return {
        init
    };
})();
