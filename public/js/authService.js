window.ListopicApp = window.ListopicApp || {};

ListopicApp.authService = (() => {
    // Dependencies:
    // ListopicApp.services.auth (Firebase auth instance)
    // DOM elements: 'userProfileBtn', 'userMenuDropdown', 'logoutBtnUserMenu', 'userInfoDisplay', 'logout-button'
/*
    function init() {
        if (!ListopicApp.services || !ListopicApp.services.auth) {
            console.error("authService.init: Firebase auth service not available. Ensure firebaseService.js is loaded and initialized before authService.js");
            return;
        }
        const auth = ListopicApp.services.auth;

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
                    auth.signOut().then(() => {
                        console.log('Usuario cerró sesión desde el menú de perfil.');
                        // Redirection will be handled by onAuthStateChanged
                    }).catch((error) => {
                        console.error('Error al cerrar sesión desde el menú:', error);
                    });
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
                auth.signOut().then(() => {
                    console.log('Usuario cerró sesión (main logout button)');
                    // onAuthStateChanged se encargará de la redirección a auth.html
                }).catch(error => {
                    console.error('Error al cerrar sesión (main logout button):', error);
                });
            });
        }
        // --- Fin de Manejo de Autenticación Global ---
    }

    return {
        init
    };
})();

*/
