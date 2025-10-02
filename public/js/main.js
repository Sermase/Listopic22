window.ListopicApp = window.ListopicApp || {};

// Initialize shared state container
ListopicApp.state = {
    currentListId: null,
    selectedFileForUpload: null,
    currentSelectedPlaceInfo: null,
    userLatitude: null,
    userLongitude: null,
    currentListNameForSearch: '',
    currentListCriteriaDefinitions: {}, // Cambiado a objeto/mapa
    currentGroupDetailListId: null,
    // MODIFICADO: Nombres de estado para grouped-detail-view
    currentGroupDetailEstablishment: null,
    currentGroupDetailItem: null,
    currentGroupDetailCriteriaDefinition: {}, // Usar el mapa de criterios
    lightboxImageUrls: [],
    currentLightboxImageIndex: 0,
    // Firebase services no deberían estar en state, se acceden desde ListopicApp.services
    globalRealtimeInitialized: false,
    globalRealtimeCleanup: [],
    notificationsCache: []
};

const setBadgeVisibility = (badgeElement, visible) => {
    if (!badgeElement) return;
    if (visible) {
        badgeElement.hidden = false;
        badgeElement.setAttribute('data-visible', 'true');
    } else {
        badgeElement.hidden = true;
        badgeElement.setAttribute('data-visible', 'false');
    }
};

const formatTimestampForUi = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMinutes = Math.round(diffMs / 60000);
    if (diffMinutes < 1) return 'Justo ahora';
    if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `Hace ${diffHours} h`;
    return date.toLocaleDateString();
};

const renderNotificationsList = (notifications, container, emptyStateElement) => {
    if (!container) return;
    container.innerHTML = '';

    if (!notifications || notifications.length === 0) {
        container.setAttribute('hidden', 'true');
        if (emptyStateElement) {
            emptyStateElement.textContent = 'Sin notificaciones nuevas.';
        }
        return;
    }

    container.removeAttribute('hidden');
    if (emptyStateElement) {
        const unread = notifications.filter(n => !n.read).length;
        emptyStateElement.textContent = unread > 0 ? 'Tienes nuevas notificaciones.' : 'Esto es lo ultimo que ha pasado.';
    }

    notifications.forEach(notification => {
        const isFollowerNotification = notification.type === 'new_follower' && notification.followerId;
        const linkTarget = isFollowerNotification ? `profile.html?viewUserId=${notification.followerId}` : null;
        const item = document.createElement(linkTarget ? 'a' : 'div');
        item.className = 'notification-item';
        if (linkTarget) {
            item.href = linkTarget;
            item.setAttribute('aria-label', 'Ver perfil del nuevo seguidor');
        }
        if (notification.id) {
            item.dataset.notificationId = notification.id;
        }
        if (!notification.read) {
            item.classList.add('unread');
        }

        const avatar = document.createElement('img');
        if (notification.type === 'new_follower') {
            const followerLabel = notification.followerDisplayName || notification.followerUsername || 'Nuevo seguidor';
            avatar.src = notification.followerPhotoUrl || 'img/default-avatar.png';
            avatar.alt = `Avatar de ${followerLabel}`;
        } else {
            avatar.src = 'img/default-avatar.png';
            avatar.alt = 'Avatar de notificacion';
        }

        const content = document.createElement('div');
        content.className = 'notification-content';

        const title = document.createElement('span');
        title.className = 'notification-title';
        if (notification.type === 'new_follower') {
            const displayName = notification.followerDisplayName || notification.followerUsername || 'Un usuario';
            const username = notification.followerUsername && notification.followerUsername.toLowerCase() !== displayName.toLowerCase()
                ? notification.followerUsername
                : null;
            title.textContent = `${displayName} empezo a seguirte${username ? ` (@${username})` : ''}.`;
        } else {
            title.textContent = notification.title || 'Nueva notificacion';
        }

        const meta = document.createElement('span');
        meta.className = 'notification-meta';
        meta.textContent = formatTimestampForUi(notification.createdAt);

        content.appendChild(title);

        if (notification.type === 'new_follower' && notification.followerUsername && (!notification.followerDisplayName || notification.followerDisplayName.toLowerCase() !== notification.followerUsername.toLowerCase())) {
            const usernameBadge = document.createElement('span');
            usernameBadge.className = 'notification-subtitle';
            usernameBadge.textContent = `@${notification.followerUsername}`;
            content.appendChild(usernameBadge);
        }

        content.appendChild(meta);

        item.appendChild(avatar);
        item.appendChild(content);
        container.appendChild(item);

        const markAsRead = () => {
            if (notification.read || !notification.id || !ListopicApp.services || !ListopicApp.services.markNotificationsAsRead) {
                return;
            }
            const auth = ListopicApp.services.auth;
            const authUser = auth && auth.currentUser;
            if (authUser) {
                ListopicApp.services.markNotificationsAsRead(authUser.uid, [notification.id]).catch(error => {
                    console.error('[main] Error marcando notificación como leída:', error);
                });
            }
        };

        item.addEventListener('click', () => {
            markAsRead();
            if (linkTarget) {
                const dropdown = document.getElementById('notifications-dropdown');
                const button = document.getElementById('notifications-button');
                if (dropdown) {
                    dropdown.classList.remove('active');
                    dropdown.setAttribute('aria-hidden', 'true');
                }
                if (button) {
                    button.setAttribute('aria-expanded', 'false');
                }
            }
        }, { once: true });
    });
};

const initializeGlobalRealtimeFeatures = (user) => {
    if (!user || ListopicApp.state.globalRealtimeInitialized || !ListopicApp.services) return;

    const chatsBadge = document.getElementById('chats-badge');
    const notificationsBadge = document.getElementById('notifications-badge');
    const notificationsButton = document.getElementById('notifications-button');
    const notificationsDropdown = document.getElementById('notifications-dropdown');
    const notificationsList = document.getElementById('notifications-list');
    const emptyStateElement = notificationsDropdown ? notificationsDropdown.querySelector('.notifications-empty-state') : null;

    const cleanupFunctions = [];

    if (ListopicApp.services.listenToUserChats && chatsBadge) {
        const unsubscribeChats = ListopicApp.services.listenToUserChats(user.uid, chats => {
            const hasUnread = Array.isArray(chats) && chats.some(chat => (chat.unreadCounts && chat.unreadCounts[user.uid] > 0));
            setBadgeVisibility(chatsBadge, hasUnread);
        }, error => {
            console.error('[main] Error monitorizando chats para badge:', error);
        });
        cleanupFunctions.push(unsubscribeChats);
    }

    if (ListopicApp.services.listenToNotifications && notificationsList) {
        const unsubscribeNotifications = ListopicApp.services.listenToNotifications(user.uid, notifications => {
            ListopicApp.state.notificationsCache = notifications;
            const unreadCount = notifications.filter(n => !n.read).length;
            setBadgeVisibility(notificationsBadge, unreadCount > 0);
            renderNotificationsList(notifications, notificationsList, emptyStateElement);
        }, error => {
            console.error('[main] Error monitorizando notificaciones:', error);
        });
        cleanupFunctions.push(unsubscribeNotifications);
    }

    if (notificationsButton && notificationsDropdown) {
        const toggleDropdown = (event) => {
            event.stopPropagation();
            const willOpen = !notificationsDropdown.classList.contains('active');
            notificationsDropdown.classList.toggle('active', willOpen);
            notificationsDropdown.setAttribute('aria-hidden', (!willOpen).toString());
            notificationsButton.setAttribute('aria-expanded', willOpen.toString());
            if (willOpen) {
                const unreadIds = (ListopicApp.state.notificationsCache || []).filter(n => !n.read).map(n => n.id);
                if (unreadIds.length > 0 && ListopicApp.services.markNotificationsAsRead) {
                    ListopicApp.services.markNotificationsAsRead(user.uid, unreadIds);
                }
                setBadgeVisibility(notificationsBadge, false);
            }
        };

        notificationsButton.addEventListener('click', toggleDropdown);

        document.addEventListener('click', (event) => {
            if (!notificationsDropdown.classList.contains('active')) return;
            if (!notificationsDropdown.contains(event.target) && !notificationsButton.contains(event.target)) {
                notificationsDropdown.classList.remove('active');
                notificationsDropdown.setAttribute('aria-hidden', 'true');
                notificationsButton.setAttribute('aria-expanded', 'false');
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && notificationsDropdown.classList.contains('active')) {
                notificationsDropdown.classList.remove('active');
                notificationsDropdown.setAttribute('aria-hidden', 'true');
                notificationsButton.setAttribute('aria-expanded', 'false');
            }
        });
    }

    ListopicApp.state.globalRealtimeCleanup = cleanupFunctions;
    ListopicApp.state.globalRealtimeInitialized = true;
};

const notificationsRelativeTimeFormatter = (typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat !== 'undefined')
    ? new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
    : null;

function formatRelativeTimeForNotifications(date) {
    if (!(date instanceof Date)) {
        return '';
    }

    if (!notificationsRelativeTimeFormatter) {
        const diffMinutes = Math.round((Date.now() - date.getTime()) / 60000);
        if (Math.abs(diffMinutes) <= 1) {
            return 'justo ahora';
        }
        const suffix = diffMinutes >= 0 ? 'hace' : 'en';
        return `${suffix} ${Math.abs(diffMinutes)} min`;
    }

    const timeUnits = [
        { unit: 'year', ms: 1000 * 60 * 60 * 24 * 365 },
        { unit: 'month', ms: 1000 * 60 * 60 * 24 * 30 },
        { unit: 'week', ms: 1000 * 60 * 60 * 24 * 7 },
        { unit: 'day', ms: 1000 * 60 * 60 * 24 },
        { unit: 'hour', ms: 1000 * 60 * 60 },
        { unit: 'minute', ms: 1000 * 60 },
        { unit: 'second', ms: 1000 }
    ];

    const diff = date.getTime() - Date.now();
    for (const { unit, ms } of timeUnits) {
        if (Math.abs(diff) >= ms || unit === 'second') {
            const value = Math.round(diff / ms);
            return notificationsRelativeTimeFormatter.format(value, unit);
        }
    }

    return '';
}

function ensureNotificationsModalElements() {
    let modal = document.getElementById('notificationsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'notificationsModal';
        modal.className = 'modal notifications-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'notificationsModalTitle');
        modal.innerHTML = `
            <div class="modal-content notifications-modal-content">
                <button type="button" class="close-button close-notifications-modal" aria-label="Cerrar notificaciones">
                    <span aria-hidden="true">&times;</span>
                </button>
                <h2 id="notificationsModalTitle">Notificaciones</h2>
                <div class="notifications-modal-body">
                    <p class="notifications-loading-state">Cargando notificaciones...</p>
                    <ul class="notifications-list" role="list"></ul>
                    <p class="notifications-empty-state" hidden>No tienes notificaciones nuevas.</p>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const listElement = modal.querySelector('.notifications-list');
    const loadingElement = modal.querySelector('.notifications-loading-state');
    const emptyElement = modal.querySelector('.notifications-empty-state');
    const closeButton = modal.querySelector('.close-notifications-modal');

    return {
        modal,
        listElement,
        loadingElement,
        emptyElement,
        closeButton
    };
}

function setupNotificationsUI(currentUser) {
    const notificationsButton = document.getElementById('notificationsButton');
    if (!notificationsButton || notificationsButton.dataset.notificationsSetup === 'true') {
        return;
    }

    const {
        modal,
        listElement,
        loadingElement,
        emptyElement,
        closeButton
    } = ensureNotificationsModalElements();

    const closeModal = () => {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
        notificationsButton.setAttribute('aria-expanded', 'false');
        notificationsButton.disabled = false;
        delete notificationsButton.dataset.loading;
        notificationsButton.focus();
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    };

    if (!modal.dataset.listenersAttached) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeModal();
            }
        });

        if (closeButton) {
            closeButton.addEventListener('click', closeModal);
        }

        document.addEventListener('keydown', handleKeyDown);
        modal.dataset.listenersAttached = 'true';
    }

    const renderNotifications = (notifications) => {
        listElement.innerHTML = '';

        notifications.forEach(notification => {
            const item = document.createElement('li');
            item.className = 'notifications-item';

            const iconWrapper = document.createElement('div');
            iconWrapper.className = 'notification-icon';
            const iconElement = document.createElement('i');
            iconElement.className = notification.icon || 'fas fa-bell';
            iconWrapper.appendChild(iconElement);

            const mainWrapper = document.createElement('div');
            mainWrapper.className = 'notification-main';

            if (notification.title) {
                const titleElement = document.createElement('h3');
                titleElement.className = 'notification-title';
                titleElement.textContent = notification.title;
                mainWrapper.appendChild(titleElement);
            }

            const messageElement = document.createElement('p');
            messageElement.className = 'notification-message';
            messageElement.textContent = notification.message || notification.text || 'Tienes una nueva notificación.';
            mainWrapper.appendChild(messageElement);

            if (notification.url) {
                const linkElement = document.createElement('a');
                linkElement.className = 'notification-link';
                linkElement.href = notification.url;
                linkElement.target = '_blank';
                linkElement.rel = 'noopener noreferrer';
                linkElement.textContent = 'Ver detalles';
                mainWrapper.appendChild(linkElement);
            }

            const timestamp = notification.createdAt;
            let notificationDate = null;
            if (timestamp && typeof timestamp.toDate === 'function') {
                notificationDate = timestamp.toDate();
            } else if (timestamp instanceof Date) {
                notificationDate = timestamp;
            } else if (typeof timestamp === 'number' || typeof timestamp === 'string') {
                const parsedDate = new Date(timestamp);
                if (!isNaN(parsedDate)) {
                    notificationDate = parsedDate;
                }
            }

            if (notificationDate instanceof Date && !isNaN(notificationDate)) {
                const timeElement = document.createElement('time');
                timeElement.className = 'notification-time';
                timeElement.dateTime = notificationDate.toISOString();
                timeElement.textContent = formatRelativeTimeForNotifications(notificationDate) || notificationDate.toLocaleString();
                mainWrapper.appendChild(timeElement);
            }

            item.appendChild(iconWrapper);
            item.appendChild(mainWrapper);
            listElement.appendChild(item);
        });
    };

    const openModal = async () => {
        notificationsButton.disabled = true;
        notificationsButton.setAttribute('aria-expanded', 'true');
        notificationsButton.dataset.loading = 'true';
        modal.classList.add('active');
        document.body.classList.add('modal-open');

        listElement.innerHTML = '';
        emptyElement.hidden = true;
        emptyElement.textContent = 'No tienes notificaciones nuevas.';
        loadingElement.hidden = false;

        if (!currentUser) {
            loadingElement.hidden = true;
            emptyElement.hidden = false;
            emptyElement.textContent = 'Inicia sesión para ver tus notificaciones.';
            notificationsButton.disabled = false;
            return;
        }

        if (!ListopicApp.services || typeof ListopicApp.services.getUserNotifications !== 'function') {
            loadingElement.hidden = true;
            emptyElement.hidden = false;
            emptyElement.textContent = 'El servicio de notificaciones no está disponible en este momento.';
            notificationsButton.disabled = false;
            return;
        }

        try {
            const notifications = await ListopicApp.services.getUserNotifications(currentUser.uid, { limit: 30 });
            loadingElement.hidden = true;

            if (!notifications || notifications.length === 0) {
                emptyElement.hidden = false;
                return;
            }

            renderNotifications(notifications);
        } catch (error) {
            console.error('main.js: No se pudieron cargar las notificaciones:', error);
            loadingElement.hidden = true;
            emptyElement.hidden = false;
            emptyElement.textContent = 'No pudimos cargar tus notificaciones. Intenta nuevamente más tarde.';
        } finally {
            notificationsButton.disabled = false;
            delete notificationsButton.dataset.loading;
        }
    };

    notificationsButton.addEventListener('click', openModal);
    notificationsButton.dataset.notificationsSetup = 'true';
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("MAIN.JS: DOMContentLoaded disparado."); // <--- LOG 1

// 1. Cargar elementos comunes PRIMERO
// if (ListopicApp.commonUI && ListopicApp.commonUI.loadCommonElements) {
//     console.log("MAIN.JS: Cargando elementos comunes (header/footer)...");
//     ListopicApp.commonUI.loadCommonElements();
// } else {
//     console.error("MAIN.JS: commonUI no disponible para cargar header/footer.");
// }

    if (!ListopicApp.services || !ListopicApp.services.auth || !ListopicApp.services.storage || !ListopicApp.services.db) {
        console.error("MAIN.JS: Firebase services (auth, storage, db) no disponibles."); // <--- LOG 2 (si entra aquí)
        // Podrías mostrar un error al usuario aquí si la app no puede funcionar.
        const body = document.querySelector('body');
        if (body) {
            body.innerHTML = '<p style="color:red; text-align:center; margin-top: 50px;">Error critico: La aplicacion no pudo inicializar los servicios base. Por favor, recarga o contacta soporte.</p>';
        }
        return;
    }
    console.log("MAIN.JS: Servicios de Firebase comprobados, parecen estar disponibles."); // <--- LOG 3

    if (ListopicApp.themeManager && ListopicApp.themeManager.init) {
        console.log("MAIN.JS: Inicializando ThemeManager..."); // <--- LOG 4
        ListopicApp.themeManager.init();
    } else {
        console.error("MAIN.JS: ThemeManager no disponible."); // <--- LOG 5 (si entra aquí)
    }

    if (ListopicApp.authService && ListopicApp.authService.init) {
        console.log("MAIN.JS: Inicializando AuthService..."); // <--- LOG 6
        ListopicApp.authService.init();
    } else {
        console.error("MAIN.JS: AuthService no disponible."); // <--- LOG 7 (si entra aquí)
    }

    const pagePath = window.location.pathname;
    const pageName = pagePath.substring(pagePath.lastIndexOf('/') + 1).toLowerCase(); // Convertido a minúsculas para consistencia
    console.log("MAIN.JS: pagePath detectado:", pagePath); // <--- LOG 8
    console.log("MAIN.JS: pageName calculado:", pageName); // <--- LOG 9
    const isIndexPage = pageName === '' || pageName === 'index.html';

    // Esperar a que el estado de autenticacion se resuelva antes de inicializar paginas protegidas
    console.log("MAIN.JS: Esperando resolucion de onAuthStateChangedPromise..."); // <--- LOG 10
    ListopicApp.authService.onAuthStateChangedPromise().then(user => {
        console.log("MAIN.JS: onAuthStateChangedPromise resuelta. Usuario:", user ? user.uid : 'No hay usuario'); // <--- LOG 11

        try {
            setupNotificationsUI(user);
        } catch (notificationsError) {
            console.error('MAIN.JS: Error inicializando el modal de notificaciones:', notificationsError);
        }

        if (pageName === 'auth.html') {
            console.log("MAIN.JS: Es auth.html, intentando inicializar pageAuth..."); // <--- LOG 12
            if (ListopicApp.pageAuth && ListopicApp.pageAuth.init) {
                ListopicApp.pageAuth.init(); // pageAuth puede tener lógica incluso si el usuario ya está logueado (para redirigir)
            }
        } else if (!user) {
            // Si no es la pagina de autenticacion y no hay usuario, authService ya debería haber redirigido.
            // No se inicializa ninguna otra lógica de pagina.
            console.log("MAIN.JS: Usuario no autenticado y no en auth.html. authService debería redirigir."); // <--- LOG 13
            return;
        } else {
            // Usuario autenticado, o pagina pública que no requiere autenticacion (como index, si se decide)
            console.log("MAIN.JS: Usuario autenticado o pagina pública. Procediendo a inicializar lógica de pagina específica."); // <--- LOG 14
            initializeGlobalRealtimeFeatures(user);
            if (isIndexPage) {
                console.log("MAIN.JS: Es Index page, intentando inicializar pageIndex..."); // <--- LOG 15
                 if(ListopicApp.pageIndex && ListopicApp.pageIndex.init) {
                    ListopicApp.pageIndex.init();
                }
            } else if (pageName === 'review-form.html') {
                console.log("MAIN.JS: Es review-form.html, intentando inicializar pageReviewForm..."); // <--- LOG 16
                if (ListopicApp.pageReviewForm && ListopicApp.pageReviewForm.init) {
                    ListopicApp.pageReviewForm.init(); // Aquí es donde se llamaría a tu init
                } else {
                    console.error("MAIN.JS: ListopicApp.pageReviewForm.init no encontrado!"); // <--- LOG 17 (si falta)
                }
            } else if (pageName === 'list-form.html') {
                if (ListopicApp.pageListForm && ListopicApp.pageListForm.init) {
                    ListopicApp.pageListForm.init();
                }
            } else if (pageName === 'list-view.html') {
                if (ListopicApp.pageListView && ListopicApp.pageListView.init) {
                    ListopicApp.pageListView.init();
                }
            } else if (pageName === 'detail-view.html') {
                if (ListopicApp.pageDetailView && ListopicApp.pageDetailView.init) {
                    ListopicApp.pageDetailView.init();
                }
            } else if (pageName === 'grouped-detail-view.html') {
                if (ListopicApp.pageGroupedDetailView && ListopicApp.pageGroupedDetailView.init) {
                    ListopicApp.pageGroupedDetailView.init();
                }
            } else if (pageName === 'profile.html') {
                console.log("MAIN.JS: Coincide 'profile.html', comprobando si pageProfile existe...");
                if (ListopicApp.pageProfile && ListopicApp.pageProfile.init) {
                    console.log("MAIN.JS: Coincide 'profile.html', ejecutando pageProfile.init()..."); // Log de confirmación
                    ListopicApp.pageProfile.init();
                } else {
                    console.error("MAIN.JS: ListopicApp.pageProfile.init no encontrado!"); // Log de error
                }
            } else if (pageName === 'chats.html') {
                if (ListopicApp.pageChats && ListopicApp.pageChats.init) {
                    ListopicApp.pageChats.init();
                }
            } else if (pageName === 'search.html') { // NUEVA CONDICIÓN
                if (ListopicApp.pageSearch && ListopicApp.pageSearch.init) {
                    ListopicApp.pageSearch.init();
                }
            } else if (pageName === 'place-detail.html') { // PÁGINA DE LUGAR
                if (ListopicApp.pagePlace && ListopicApp.pagePlace.init) {
                    ListopicApp.pagePlace.init();
                }
            } else if (pageName === 'developer.html') { // PÁGINA DE LUGAR
            if (ListopicApp.pagePlace && ListopicApp.pageDeveloper.init) {
                ListopicApp.pagePlace.init();
                }
            } else if (pageName === 'chats.html') {
                if (ListopicApp.pageChats && ListopicApp.pageChats.init) {
                    ListopicApp.pageChats.init();
                }
            } else {
                // Esta es la línea 95 en la estructura original del if/else if
                console.warn("MAIN.JS: No se detectó una pagina conocida. pageName:", pageName); // <--- LOG si ninguna coincide
            }
        }
    }).catch(error => {
        console.error("MAIN.JS: Error en onAuthStateChangedPromise:", error); // <--- LOG 18 (si la promesa falla)
        // Manejar error crítico si la autenticacion no se puede verificar
    });

    console.log("MAIN.JS: Fin del script de inicialización de main.js."); // <--- LOG 19



    // --- Lógica para la Instalación de la PWA (desde el Menú de Usuario) ---
let deferredPrompt;
const installMenuItem = document.getElementById('installPwaBtn');

// Criterio 1: El navegador dispara el evento para instalar
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevenir que se muestre el mini-infobar por defecto
    e.preventDefault();
    // Guardar el evento para usarlo después
    deferredPrompt = e;
    
    // Mostrar la opción en el menú solo si no está ya instalada
    // y el navegador lo permite.
    if (installMenuItem && !isAppInstalled()) {
        console.log("Evento 'beforeinstallprompt' capturado. Mostrando opción de instalar en el menú.");
        installMenuItem.style.display = 'block';
    }
});

// Criterio 2: El usuario hace clic en nuestro botón del menú
if (installMenuItem) {
    installMenuItem.addEventListener('click', async () => {
        // Asegurarnos de que aún tenemos el evento
        if (deferredPrompt) {
            // Mostrar el diálogo de instalación del navegador
            deferredPrompt.prompt();
            
            // Esperar la respuesta del usuario
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`Respuesta del usuario al prompt de instalación: ${outcome}`);

            // Si el usuario acepta, ya no necesitamos mostrar el botón
            if (outcome === 'accepted') {
                installMenuItem.style.display = 'none';
            }

            // Descartamos el evento, ya que solo se puede usar una vez
            deferredPrompt = null;
        }
    });
}

// Criterio 3: La app se ha instalado correctamente
window.addEventListener('appinstalled', () => {
    // Ocultar la opción del menú y limpiar todo
    if (installMenuItem) {
        installMenuItem.style.display = 'none';
    }
    deferredPrompt = null;
    console.log('PWA fue instalada con éxito.');
    if(ListopicApp.services && ListopicApp.services.showNotification) {
        ListopicApp.services.showNotification('¡Listopic instalado! Búscalo en tu pantalla de inicio.', 'success');
    }
});

// Función de ayuda para saber si la app ya se está ejecutando como PWA
function isAppInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// Al cargar la pagina, si ya está en modo standalone, nos aseguramos
// de que el botón no aparezca por si acaso.
if (isAppInstalled() && installMenuItem) {
    console.log("La app ya se está ejecutando en modo standalone. La opción de instalar no se mostrará.");
    installMenuItem.style.display = 'none';
}
// --- Fin de la Lógica de Instalación de la PWA ---


    
});


// Función global para limpiar cache de etiquetas (útil para desarrollo)
window.clearCategoryTagsCache = function() {
    if (ListopicApp.pageSearch && ListopicApp.pageSearch.clearTagsCache) {
        ListopicApp.pageSearch.clearTagsCache();
        console.log('Cache de etiquetas limpiado');
    } else {
        console.warn('Función de limpiar cache no disponible');
    }
};

// Registro del Service Worker para gestionar el caché
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((registration) => {
      console.log('Service Worker registrado con éxito:', registration);
    }).catch((err) => {
      console.log('Fallo en el registro del Service Worker:', err);
    });
  });
}





