window.ListopicApp = window.ListopicApp || {};

ListopicApp.authService = (() => {
    let auth;
    let authInitializedPromise = null;
    let resolveAuthInitializedPromise = null;
    let currentUserState = null;

    // This will be set in init() and used by onAuthStateChanged
    let isAuthPage = false;

    function init() {
        if (!ListopicApp.services || !ListopicApp.services.auth) {
            console.error("authService.init: Firebase auth service not available. Ensure firebaseService.js is loaded and initialized before authService.js");
            return;
        }
        auth = ListopicApp.services.auth;

        authInitializedPromise = new Promise((resolve) => {
            resolveAuthInitializedPromise = resolve;
        });

        const pagePath = window.location.pathname;
        const pageName = pagePath.substring(pagePath.lastIndexOf('/') + 1);
        // Update module-scoped variable
        isAuthPage = pageName.toLowerCase() === 'auth.html';
        console.log(`authService.init: isAuthPage se ha establecido a: ${isAuthPage} (Página actual: ${pageName})`);

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
        const logoutButton = document.getElementById('logout-button');

        auth.onAuthStateChanged(user => {
            currentUserState = user;
            if (resolveAuthInitializedPromise) {
                resolveAuthInitializedPromise(user);
                resolveAuthInitializedPromise = null;
            }

            if (user) {
            console.log(`authService.onAuthStateChanged: Usuario detectado (ID: ${user.uid}, Email: ${user.email}).`);
            console.log(`authService.onAuthStateChanged: Valor de isAuthPage en este punto: ${isAuthPage}`);
            console.log(`authService.onAuthStateChanged: Path actual: ${window.location.pathname}`);
                if (userInfoDisplay) {
                    userInfoDisplay.textContent = `Hola, ${user.displayName || user.email}`;
                }
                if (logoutButton) {
                    logoutButton.style.display = 'inline-block';
                }

            console.log("authService.onAuthStateChanged: Usuario LOGUEADO. Redirección automática COMENTADA para depuración.");

            } else {
            console.log("authService.onAuthStateChanged: Usuario NO detectado (deslogueado).");
            console.log(`authService.onAuthStateChanged: Valor de isAuthPage en este punto: ${isAuthPage}`);
            console.log(`authService.onAuthStateChanged: Path actual: ${window.location.pathname}`);
                if (userInfoDisplay) {
                    userInfoDisplay.textContent = '';
                }
                if (logoutButton) {
                    logoutButton.style.display = 'none';
                }

                // ✅ **REDIRECTION LOGIC HERE**
                // Si el usuario no está logueado y NO está en la página de autenticación, redirigirlo a auth.html.
                if (!isAuthPage) {
                console.log("authService.onAuthStateChanged: Usuario NO LOGUEADO y NO en auth.html. ¡INTENTANDO REDIRIGIR a auth.html!");
                    window.location.href = 'auth.html';
                } else {
                console.log("authService.onAuthStateChanged: Usuario NO LOGUEADO y EN auth.html. No se redirige, permanece en auth.html.");
                }
            }
        });

        if (logoutButton) {
            logoutButton.addEventListener('click', () => {
                logoutUser();
            });
        }
        // --- Fin de Manejo de Autenticación Global ---
    }

    function onAuthStateChangedPromise() {
        if (!authInitializedPromise) {
            console.error("onAuthStateChangedPromise: authService.init() not called or completed yet.");
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
            // Redirection is handled by onAuthStateChanged
        }).catch(error => {
            console.error('Error al cerrar sesión (desde authService.logoutUser):', error);
            ListopicApp.services.showNotification && ListopicApp.services.showNotification(`Error al cerrar sesión: ${error.message}`, 'error');
            throw error;
        });
    }

    return {
        init,
        onAuthStateChangedPromise,
        logoutUser
    };
})();
