// Contenido completo y corregido para public/js/authService.js

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

        auth.onAuthStateChanged(async user => {
            currentUserState = user;
            if (resolveAuthInitializedPromise) {
                resolveAuthInitializedPromise(user);
                resolveAuthInitializedPromise = null;
            }

            if (user) {
                console.log(`authService.onAuthStateChanged: Usuario detectado (ID: ${user.uid}, Email: ${user.email}).`);
                if (userInfoDisplay) {
                    userInfoDisplay.textContent = `Hola, ${user.displayName || user.email}`;
                }
                if (logoutButton) {
                    logoutButton.style.display = 'inline-block';
                }

                try {
                    await ListopicApp.services.ensureUserProfileExists(user);
                    console.log("authService.onAuthStateChanged: Perfil de Firestore asegurado/creado.");

                    if (isAuthPage) {
                        console.log("authService.onAuthStateChanged: Usuario autenticado y en auth.html. Redirigiendo a Index.html.");
                        setTimeout(() => {
                            window.location.href = 'Index.html';
                        }, 500);
                    } else {
                        console.log("authService.onAuthStateChanged: Usuario autenticado y NO en auth.html. Permaneciendo en la página actual.");
                    }
                } catch (profileError) {
                    console.error("authService.onAuthStateChanged: Error asegurando perfil de Firestore:", profileError);
                    ListopicApp.services.showNotification(`Error crítico al cargar tu perfil: ${profileError.message}`, 'error');
                    await auth.signOut();
                }

            } else {
                console.log("authService.onAuthStateChanged: Usuario NO detectado (deslogueado).");
                if (userInfoDisplay) {
                    userInfoDisplay.textContent = '';
                }
                if (logoutButton) {
                    logoutButton.style.display = 'none';
                }

                if (!isAuthPage) {
                    console.log("authService.onAuthStateChanged: Usuario NO LOGUEADO y NO en auth.html. ¡Redirigiendo a auth.html!");
                    window.location.href = 'auth.html';
                } else {
                    console.log("authService.onAuthStateChanged: Usuario NO LOGUEADO y EN auth.html. No se redirige, permanece en auth.html.");
                }
            }
        });

        // <-- CORRECCIÓN: Este bloque DEBE estar dentro de la función init()
        if (logoutButton) {
            logoutButton.addEventListener('click', () => {
                logoutUser();
            });
        }
    // --- Fin de Manejo de Autenticación Global ---
    
    // <-- CORRECCIÓN: La llave que estaba aquí ha sido ELIMINADA. La función init() termina en la siguiente llave.
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
            // La redirección es manejada por onAuthStateChanged
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