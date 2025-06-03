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
                if (ListopicApp.pageProfile && ListopicApp.pageProfile.init) {
                    ListopicApp.pageProfile.init();
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
});