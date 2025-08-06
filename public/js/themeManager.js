// Contenido COMPLETO y CORREGIDO para /public/js/themeManager.js

window.ListopicApp = window.ListopicApp || {};

ListopicApp.themeManager = {
    init: function() {
        const themeToggleButton = document.getElementById('theme-toggle-button');
        const bodyElement = document.body;

        // Función corregida y más limpia
        function applyTheme(theme) {
            if (!bodyElement) return;
        
            const isDark = theme !== 'light';
        
            // Aplicamos la clase al body
            bodyElement.classList.toggle('light-theme', !isDark);
        
            // Actualizamos el icono del botón
            if (themeToggleButton) {
                themeToggleButton.innerHTML = isDark ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
            }
        
            // Guardamos la preferencia
            localStorage.setItem('listopicTheme', isDark ? 'dark' : 'light');
        
            // --- CORRECCIÓN CLAVE 3: Enviamos el aviso ---
            // Este evento le dirá al mapa (y a cualquier otro componente) que el tema ha cambiado.
            document.dispatchEvent(new CustomEvent('themeChanged', { 
                detail: { theme: isDark ? 'dark' : 'light' } 
            }));
        }

        function toggleTheme() {
            const currentTheme = localStorage.getItem('listopicTheme') || 'dark';
            applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
        }

        // Carga inicial del tema
        const savedTheme = localStorage.getItem('listopicTheme');
        applyTheme(savedTheme || 'dark');

        if (themeToggleButton) {
            themeToggleButton.addEventListener('click', toggleTheme);
        }
    }
};