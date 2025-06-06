// Contenido completo para page-index.js

window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageIndex = (() => {
    async function init() {
        console.log('Initializing Index page logic...');
        
        const db = ListopicApp.services.db;
        const auth = ListopicApp.services.auth;

        const listCirclesUl = document.getElementById('list-circles-ul');
        
        // Actualizar el header de la página. Como es la portada, no pasamos nombre de lista.
        if (ListopicApp.uiUtils && ListopicApp.uiUtils.updatePageHeaderInfo) {
             ListopicApp.uiUtils.updatePageHeaderInfo("Hmm...");
        }

        if (listCirclesUl) {
            listCirclesUl.innerHTML = '<li><p>Cargando listas...</p></li>';

            try {
                const querySnapshot = await db.collection('lists')
                                            .where('isPublic', '==', true)
                                            .orderBy('createdAt', 'desc')
                                            .limit(20)
                                            .get();
                
                const lists = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                if (lists.length > 0) {
                    // VERSIÓN CORREGIDA CON PROMISE.ALL Y BACKTICKS ``
                    const listPromises = lists.map(async (list) => {
                        const iconClass = await ListopicApp.uiUtils.getListIcon(list);
                        const escapedListName = ListopicApp.uiUtils.escapeHtml(list.name || "Lista sin nombre");
                        // LA CORRECCIÓN CLAVE ESTÁ AQUÍ: USAR ` EN LUGAR DE '
                        return `<a href="list-view.html?listId=${list.id}" title="${escapedListName}"><i class="${iconClass}"></i><span>${escapedListName}</span></a>`;
                    });

                    const listHtmlItems = await Promise.all(listPromises);

                    listCirclesUl.innerHTML = listHtmlItems.map(html => `<li>${html}</li>`).join('');

                } else {
                    listCirclesUl.innerHTML = '<li><p>Aún no hay listas públicas disponibles. ¡Anímate y <a href="list-form.html" style="color: var(--accent-color-primary);">crea la primera</a>!</p></li>';
                }
            } catch (error) {
                console.error("INDEX: Error fetching or processing public lists:", error);
                listCirclesUl.innerHTML = `<li><p style="color:var(--danger-color)">Error al cargar las listas. ${error.message}</p></li>`;
                if(ListopicApp.services?.showNotification) {
                    ListopicApp.services.showNotification("Error al cargar listas: " + error.message, "error");
                }
            }
        }
        
        const createListBtn = document.querySelector('.add-list-button');
        if (createListBtn) {
            createListBtn.addEventListener('click', (e) => {
                e.preventDefault(); 
                if (auth.currentUser) {
                    window.location.href = 'list-form.html';
                } else {
                    ListopicApp.services.showNotification("Debes iniciar sesión para crear una lista.", "info");
                    window.location.href = 'auth.html';
                }
            });
        }
    }

    return {
        init
    };
})();