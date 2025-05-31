window.ListopicApp = window.ListopicApp || {};

ListopicApp.authService = (() => {
    // Dependencies:
    // ListopicApp.services.auth (Firebase auth instance)
    // DOM elements

    let auth; // Firebase auth instance, shared within the module
    let authInitializedPromise = null;
    let resolveAuthInitializedPromise = null;
    let currentUserState = null; // To store the current user state

    function init() {
        if (!ListopicApp.services || !ListopicApp.services.auth) {
            console.error("authService.init: Firebase auth service not available. Ensure firebaseService.js is loaded and initialized before authService.js");
            return;
        }
        auth = ListopicApp.services.auth; // Assign to module-scoped variable

        authInitializedPromise = new Promise((resolve) => {
            resolveAuthInitializedPromise = resolve;
        });

        // Determine page context for redirection logic
        const pagePath = window.location.pathname;
        const pageName = pagePath.substring(pagePath.lastIndexOf('/') + 1);
        const isAuthPage = pageName.toLowerCase() === 'auth.html';
        // const isIndexPage = pageName === '' || pageName.toLowerCase() === 'index.html'; // Not directly used in the auth logic being moved here, but was in original app.js

        // --- Lógica del Menú de Usuario ---
        const userProfileButton = document.getElementById('userProfileBtn');
        const userMenuDropdown = document.getElementById('userMenuDropdown');
        if (userProfileButton && userMenuDropdown) {
            userProfileButton.addEventListener('click', (event) => {
                event.stopPropagation();
                const isActive = userMenuDropdown.classList.toggle('is-active');
                userProfileButton.setAttribute('aria-expanded', isActive.toString());
            });

            document.addEventListener('click', (event) => {
                if (userMenuDropdown.classList.contains('is-active') &&
                    !userMenuDropdown.contains(event.target) &&
                    !userProfileButton.contains(event.target)) {
                    userMenuDropdown.classList.remove('is-active');
                    userProfileButton.setAttribute('aria-expanded', 'false');
                }
            });

            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && userMenuDropdown.classList.contains('is-active')) {
                    userMenuDropdown.classList.remove('is-active');
                    userProfileButton.setAttribute('aria-expanded', 'false');
                    userProfileButton.focus();
                }
            });

            const userMenuLogoutButton = document.getElementById('logoutBtnUserMenu');
            if (userMenuLogoutButton) {
                userMenuLogoutButton.addEventListener('click', () => {
                    logoutUser(); // Use centralized logout function
                    userMenuDropdown.classList.remove('is-active');
                    userProfileButton.setAttribute('aria-expanded', 'false');
                });
            }
        }
        // --- Fin de Lógica del Menú de Usuario ---

        // --- Manejo de Autenticación Global ---
        const userInfoDisplay = document.getElementById('user-info-display');
        const logoutButton = document.getElementById('logout-button'); // Main logout button outside user menu

        auth.onAuthStateChanged(user => {
            currentUserState = user; // Update current user state
            if (resolveAuthInitializedPromise) {
                resolveAuthInitializedPromise(user);
                resolveAuthInitializedPromise = null; // Ensure it only resolves once
            }

            if (user) {

                console.log("Global onAuthStateChanged: Usuario logueado:", user.displayName || user.email);
                if (userInfoDisplay) {
                    userInfoDisplay.textContent = `Hola, ${user.displayName || user.email}`;
                }
                if (logoutButton) {
                    logoutButton.style.display = 'inline-block';
                }
                // Si el usuario está logueado y está intentando acceder a auth.html, redirigirlo a Index.
                if (isAuthPage) {
                    window.location.href = 'Index.html';
                }
            } else {
                console.log("Global onAuthStateChanged: Usuario no logueado.");
                if (userInfoDisplay) {
                    userInfoDisplay.textContent = '';
                }
                if (logoutButton) {
                    logoutButton.style.display = 'none';
                }
                // Si el usuario no está logueado y no está en la página de autenticación, redirigirlo.
                if (!isAuthPage) {
                    // Avoid redirect loop if auth.html itself has an issue and clears user prematurely
                    // or if multiple onAuthStateChanged listeners conflict.
                    // This global one should primarily ensure non-auth pages are protected.
                    console.log("Redirecting to auth.html as user is not logged in and not on auth page.");
                    window.location.href = 'auth.html';
                }
            }
        });

        if (logoutButton) {
            logoutButton.addEventListener('click', () => {
                logoutUser(); // Use centralized logout function
            });
        }
        // --- Fin de Manejo de Autenticación Global ---
    }

    function onAuthStateChangedPromise() {
        if (!authInitializedPromise) {
            console.error("onAuthStateChangedPromise: authService.init() not called or completed yet.");
            // Return a promise that resolves to the current user state,
            // which might be null if onAuthStateChanged hasn't fired yet.
            return Promise.resolve(currentUserState);
        }
        return authInitializedPromise;
    }

    function logoutUser() {
        if (!auth) {
            console.error("logoutUser: Firebase auth service not available.");
            return Promise.reject(new Error("Auth service not available."));
        }
        return auth.signOut().then(() => {
            console.log('Usuario cerró sesión (llamada a authService.logoutUser).');
            // Redirection will be handled by onAuthStateChanged
        }).catch(error => {
            console.error('Error al cerrar sesión (desde authService.logoutUser):', error);
            ListopicApp.services.showNotification && ListopicApp.services.showNotification(`Error al cerrar sesión: ${error.message}`, 'error');
            throw error; // Re-throw for the caller to handle if needed
        });
    }

    return {
        init,
        onAuthStateChangedPromise,
        logoutUser
    };
})();
