window.ListopicApp = window.ListopicApp || {};

// Initialize shared state container
ListopicApp.state = {
    currentListId: null,
    selectedFileForUpload: null,
    currentSelectedPlaceInfo: null,
    userLatitude: null,
    userLongitude: null,
    currentListNameForSearch: '',
    currentListCriteriaDefinitions: [],
    currentGroupDetailListId: null,
    currentGroupDetailRestaurant: null,
    currentGroupDetailDish: null,
    currentGroupDetailCriteria: [],
    lightboxImageUrls: [],
    currentLightboxImageIndex: 0,
    // Add other state variables that were previously global within app.js DOMContentLoaded
    auth: null, // Will be set by firebaseService
    storage: null // Will be set by firebaseService
};

document.addEventListener('DOMContentLoaded', () => {
    // Ensure Firebase services are available (config.js and firebaseService.js should have run)
    if (ListopicApp.services && ListopicApp.services.auth && ListopicApp.services.storage) {
        ListopicApp.state.auth = ListopicApp.services.auth;
        ListopicApp.state.storage = ListopicApp.services.storage;
    } else {
        console.error("main.js: Firebase services not available. Check load order of config.js and firebaseService.js.");
        // Potentially stop further execution if Firebase is critical
        return;
    }

    // Initialize Theme Manager
    if (ListopicApp.themeManager && ListopicApp.themeManager.init) {
        ListopicApp.themeManager.init();
    } else {
        console.error("main.js: ThemeManager not available.");
    }

    // Initialize Auth Service (handles global auth state changes, user menu, etc.)
    if (ListopicApp.authService && ListopicApp.authService.init) {
        ListopicApp.authService.init();
    } else {
        console.error("main.js: AuthService not available.");
    }

    // Page detection logic
    const pagePath = window.location.pathname;
    const pageName = pagePath.substring(pagePath.lastIndexOf('/') + 1);
    const isIndexPage = pageName === '' || pageName.toLowerCase() === 'index.html';
    // Note: isAuthPage is primarily used within authService.js and auth.html's own script now.

    // --- Lógica Específica de cada Página (Calling page-specific module initializers) ---
    // The actual onAuthStateChanged in authService will handle redirection if not on auth page.
    // Page specific logic should only run if user is authenticated or if page is public (like Index).
    
    // For pages that require auth, their init functions should ideally check ListopicApp.state.auth.currentUser
    // or this router should check before calling init. For now, let authService handle redirection.

    if (isIndexPage) {
        if (ListopicApp.pageIndex && ListopicApp.pageIndex.init) {
            ListopicApp.pageIndex.init();
        }
    } else if (pagePath.includes('review-form.html')) {
        if (ListopicApp.pageReviewForm && ListopicApp.pageReviewForm.init) {
            ListopicApp.pageReviewForm.init();
        }
    } else if (pagePath.includes('list-form.html')) {
        if (ListopicApp.pageListForm && ListopicApp.pageListForm.init) {
            ListopicApp.pageListForm.init();
        }
    } else if (pagePath.includes('list-view.html')) {
        if (ListopicApp.pageListView && ListopicApp.pageListView.init) {
            ListopicApp.pageListView.init();
        }
    } else if (pagePath.includes('detail-view.html')) {
        if (ListopicApp.pageDetailView && ListopicApp.pageDetailView.init) {
            ListopicApp.pageDetailView.init();
        }
    } else if (pagePath.includes('grouped-detail-view.html')) {
        if (ListopicApp.pageGroupedDetailView && ListopicApp.pageGroupedDetailView.init) {
            ListopicApp.pageGroupedDetailView.init();
        }
    } else if (pagePath.includes('auth.html')) {
        // auth.html has its own inline script for form handling.
        // ListopicApp.authService.init() handles the global auth state changes
        // and redirection logic related to auth.html.
        // Call pageAuth.init() if it has any specific tasks beyond what's inline in auth.html
        // and what authService covers.
        if (ListopicApp.pageAuth && ListopicApp.pageAuth.init) {
            ListopicApp.pageAuth.init();
        }
    } else if (pagePath.includes('profile.html')) {
        // Inicializar la lógica específica de la página de perfil
        if (ListopicApp.pageProfile && ListopicApp.pageProfile.init) {
            ListopicApp.pageProfile.init();
        }
    } else {
        console.warn("MAIN.JS: No se detectó una página conocida para inicializar lógica específica. Path:", pagePath);
    }

    // --- General Purpose Buttons (if any remain global and not part of a specific service like authService) ---
    // Example: Logic for buttons like 'add-list-button' or 'add-review-button' if they were global
    // and not tied to a specific page's context (most seem to be page-contextual).
    // The 'add-list-button' on Index.html and 'add-review-button' on list-view.html are page-specific.
    // Their logic should be within their respective page modules if not already handled by simple href.

    // The original app.js had this at the end:
    // const createListBtn = document.querySelector('.add-list-button');
    // if (createListBtn) { /* ... */ }
    // const addReviewBtn = document.querySelector('.add-review-button');
    // if (addReviewBtn) { /* ... */ }
    // This logic will be moved into the respective page modules (page-index.js for add-list-button, page-list-view.js for add-review-button).

    console.log("--- Listopic main.js: Fin del script de inicialización ---");
});
