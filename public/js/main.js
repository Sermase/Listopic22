window.ListopicApp = window.ListopicApp || {};
ListopicApp.state = { /* Tu objeto state */ };

document.addEventListener('DOMContentLoaded', () => {
    const pageInitializers = {
        '': ListopicApp.pageIndex,
        'index.html': ListopicApp.pageIndex,
        'review-form.html': ListopicApp.pageReviewForm,
        'list-form.html': ListopicApp.pageListForm,
        'list-view.html': ListopicApp.pageListView,
        'detail-view.html': ListopicApp.pageDetailView,
        'grouped-detail-view.html': ListopicApp.pageGroupedDetailView,
        'profile.html': ListopicApp.pageProfile,
        'search.html': ListopicApp.pageSearch,
        'place-detail.html': ListopicApp.pagePlace,
        'auth.html': ListopicApp.pageAuth,
        'admin.html': ListopicApp.pageAdmin
    };

    if (ListopicApp.themeManager) ListopicApp.themeManager.init();
    if (ListopicApp.authService) ListopicApp.authService.init();

    const pagePath = window.location.pathname;
    const pageName = pagePath.substring(pagePath.lastIndexOf('/') + 1) || 'index.html';
    
    const initializer = pageInitializers[pageName.toLowerCase()];
    
    if (initializer && typeof initializer.init === 'function') {
        initializer.init();
    }
});