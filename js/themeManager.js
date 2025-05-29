window.ListopicApp = window.ListopicApp || {};

ListopicApp.themeManager = {
    init: function() {
        const themeToggleButton = document.getElementById('theme-toggle-button');
        const bodyElement = document.body;

        function applyTheme(theme) {
            if (!bodyElement) return; // Guard clause

            if (theme === 'light') {
                bodyElement.classList.add('light-theme');
                if (themeToggleButton) themeToggleButton.innerHTML = '<i class="fas fa-sun"></i>';
                localStorage.setItem('listopicTheme', 'light');
            } else { // Default to dark
                bodyElement.classList.remove('light-theme');
                if (themeToggleButton) themeToggleButton.innerHTML = '<i class="fas fa-moon"></i>';
                localStorage.setItem('listopicTheme', 'dark');
            }
        }

        function toggleTheme() {
            if (!bodyElement) return; // Guard clause
            if (bodyElement.classList.contains('light-theme')) {
                applyTheme('dark');
            } else {
                applyTheme('light');
            }
        }

        // Initialize theme on load
        const savedTheme = localStorage.getItem('listopicTheme');
        applyTheme(savedTheme || 'dark'); // Apply saved theme or default to dark

        if (themeToggleButton) {
            themeToggleButton.addEventListener('click', toggleTheme);
        } else {
            console.warn("Theme toggle button not found during themeManager.init().");
        }
    }
};
