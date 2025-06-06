window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageIndex = (() => {
    async function init() {
        console.log('Initializing Index page logic...');
        
        // Asegurarse de que los servicios estén listos
        if (!ListopicApp.services || !ListopicApp.services.db) {
            console.error("INDEX: Firestore service (db) no está disponible.");
            const listCirclesUl = document.getElementById('list-circles-ul');
            if (listCirclesUl) listCirclesUl.innerHTML = '<li><p style="color:var(--danger-color)">Error crítico: No se pudo conectar a la base de datos.</p></li>';
            return;
        }
        const db = ListopicApp.services.db;
        const auth = ListopicApp.services.auth; // Para obtener el usuario actual si es necesario para personalización futura

        // En page-index.js, dentro de la función init()

const listCirclesUl = document.getElementById('list-circles-ul');

if (listCirclesUl) {
    listCirclesUl.innerHTML = '<li><p>Cargando listas...</p></li>'; 

    try {
        const querySnapshot = await db.collection('lists')
            .where('isPublic', '==', true)
            .orderBy('createdAt', 'desc')
            .limit(20) // He añadido un límite para no cargar demasiadas en la portada
            .get();

        const lists = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (lists.length > 0) {
            const listPromises = lists.map(async (list) => {
                const iconClass = await ListopicApp.uiUtils.getListIcon(list);
                const escapedListName = ListopicApp.uiUtils.escapeHtml(list.name || "Lista sin nombre");
                return `<a href="list-view.html?listId=<span class="math-inline">\{list\.id\}" title\="</span>{escapedListName}"><i class="<span class="math-inline">\{iconClass\}"\></i\><span\></span>{escapedListName}</span></a>`;
            });

            const listHtmlItems = await Promise.all(listPromises);
            listCirclesUl.innerHTML = listHtmlItems.map(html => `<li>${html}</li>`).join('');

        } else {
            listCirclesUl.innerHTML = '<li><p>Aún no hay listas públicas disponibles. ¡Anímate y <a href="list-form.html" style="color: var(--accent-color-primary);">crea la primera</a>!</p></li>';
        }
    } catch (error) {
        console.error("Error al cargar las listas públicas:", error);
        listCirclesUl.innerHTML = `<li><p style="color:var(--danger-color)">Error al cargar las listas. ${error.message}</p></li>`;
    }
} else {
             console.warn("INDEX: Contenedor #list-circles-ul no encontrado.");
        }
        
        // Lógica para el botón .add-list-button (ya estaba y debería funcionar bien)
        const createListBtn = document.querySelector('.add-list-button');
        if (createListBtn) {
            createListBtn.addEventListener('click', (e) => {
                e.preventDefault(); 
                // Verificar si el usuario está autenticado antes de redirigir
                if (auth.currentUser) {
                    window.location.href = 'list-form.html';
                } else {
                    ListopicApp.services.showNotification("Debes iniciar sesión para crear una lista.", "info");
                    window.location.href = 'auth.html'; // Opcional: redirigir a login
                }
            });
        }
        ListopicApp.uiUtils.updatePageHeaderInfo("Hmm..."); // Solo muestra "Hmm..."

    }

    return {
        init
    };
})();