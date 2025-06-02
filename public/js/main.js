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

document.addEventListener('DOMContentLoaded', () => {
    if (!ListopicApp.services || !ListopicApp.services.auth || !ListopicApp.services.storage || !ListopicApp.services.db) {
        console.error("main.js: Firebase services (auth, storage, db) not available. Check load order of config.js and firebaseService.js.");
        // Podrías mostrar un error al usuario aquí si la app no puede funcionar.
        const body = document.querySelector('body');
        if (body) {
            body.innerHTML = '<p style="color:red; text-align:center; margin-top: 50px;">Error crítico: La aplicación no pudo inicializar los servicios base. Por favor, recarga o contacta soporte.</p>';
        }
        return;
    }

    if (ListopicApp.themeManager && ListopicApp.themeManager.init) {
        ListopicApp.themeManager.init();
    } else {
        console.error("main.js: ThemeManager not available.");
    }

    if (ListopicApp.authService && ListopicApp.authService.init) {
        ListopicApp.authService.init();
    } else {
        console.error("main.js: AuthService not available.");
    }

    const pagePath = window.location.pathname;
    const pageName = pagePath.substring(pagePath.lastIndexOf('/') + 1).toLowerCase(); // Convertido a minúsculas para consistencia
    const isIndexPage = pageName === '' || pageName === 'index.html';

    // Esperar a que el estado de autenticación se resuelva antes de inicializar páginas protegidas
    ListopicApp.authService.onAuthStateChangedPromise().then(user => {
        if (pageName === 'auth.html') {
            if (ListopicApp.pageAuth && ListopicApp.pageAuth.init) {
                ListopicApp.pageAuth.init(); // pageAuth puede tener lógica incluso si el usuario ya está logueado (para redirigir)
            }
        } else if (!user) {
            // Si no es la página de autenticación y no hay usuario, authService ya debería haber redirigido.
            // No se inicializa ninguna otra lógica de página.
            console.log("main.js: Usuario no autenticado y no en auth.html. Esperando redirección de authService.");
            return;
        } else {
            // Usuario autenticado, o página pública que no requiere autenticación (como index, si se decide)
            if (isIndexPage) {
                 if(ListopicApp.pageIndex && ListopicApp.pageIndex.init) {
                    ListopicApp.pageIndex.init();
                }
            } else if (pageName === 'review-form.html') {
                if (ListopicApp.pageReviewForm && ListopicApp.pageReviewForm.init) {
                    ListopicApp.pageReviewForm.init();
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
                if (ListopicApp.pageProfile && ListopicApp.pageProfile.init) {
                    ListopicApp.pageProfile.init();
                }
            } else {
                // Esta es la línea 95 en la estructura original del if/else if
                console.warn("MAIN.JS: No se detectó una página conocida para inicializar lógica específica. Path:", pagePath, "Resolved pageName:", pageName);
            }
        }
    }).catch(error => {
        console.error("main.js: Error durante la comprobación del estado de autenticación:", error);
        // Manejar error crítico si la autenticación no se puede verificar
    });

    console.log("--- Listopic main.js: Fin del script de inicialización ---");
});