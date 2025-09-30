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
            body.innerHTML = '<p style="color:red; text-align:center; margin-top: 50px;">Error crítico: La aplicación no pudo inicializar los servicios base. Por favor, recarga o contacta soporte.</p>';
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

    // Esperar a que el estado de autenticación se resuelva antes de inicializar páginas protegidas
    console.log("MAIN.JS: Esperando resolución de onAuthStateChangedPromise..."); // <--- LOG 10
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
            // Si no es la página de autenticación y no hay usuario, authService ya debería haber redirigido.
            // No se inicializa ninguna otra lógica de página.
            console.log("MAIN.JS: Usuario no autenticado y no en auth.html. authService debería redirigir."); // <--- LOG 13
            return;
        } else {
            // Usuario autenticado, o página pública que no requiere autenticación (como index, si se decide)
            console.log("MAIN.JS: Usuario autenticado o página pública. Procediendo a inicializar lógica de página específica."); // <--- LOG 14
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
            } else {
                // Esta es la línea 95 en la estructura original del if/else if
                console.warn("MAIN.JS: No se detectó una página conocida. pageName:", pageName); // <--- LOG si ninguna coincide
            }
        }
    }).catch(error => {
        console.error("MAIN.JS: Error en onAuthStateChangedPromise:", error); // <--- LOG 18 (si la promesa falla)
        // Manejar error crítico si la autenticación no se puede verificar
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

// Al cargar la página, si ya está en modo standalone, nos aseguramos
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
