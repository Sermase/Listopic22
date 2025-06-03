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

        const listCirclesUl = document.getElementById('list-circles-ul');
        const mainTitle = document.querySelector('h1.brand-title'); // Aunque no se usa directamente en la lógica de fetch, es parte de la página.

        if (listCirclesUl) {
            listCirclesUl.innerHTML = '<li><p>Cargando listas...</p></li>'; // Mensaje de carga inicial

            try {
                // MODIFICADO: Consulta para obtener listas públicas.
                // Asegúrate de tener un índice compuesto en Firestore para esta consulta si es necesario:
                // Colección 'lists', campo 'isPublic' (ascendente), campo 'createdAt' (descendente).
                const querySnapshot = await db.collection('lists')
                                            .where('isPublic', '==', true)
                                            .orderBy('createdAt', 'desc')
                                            .get();
                
                const lists = [];
                querySnapshot.forEach(doc => {
                    lists.push({ id: doc.id, ...doc.data() });
                });

                console.log("INDEX: Listas públicas recibidas:", lists);
                listCirclesUl.innerHTML = ''; // Limpiar mensaje de carga
                if (lists.length > 0) {
                    lists.forEach((list) => {
                        const li = document.createElement('li');
                        let iC = 'fa-solid fa-list'; // Icono por defecto
                        const listNameLower = list.name ? list.name.toLowerCase() : "";

                        if (listNameLower.includes('tarta') || listNameLower.includes('pastel') || listNameLower.includes('torta')) iC = 'fa-solid fa-birthday-cake';
                        else if (listNameLower.includes('pizza')) iC = 'fa-solid fa-pizza-slice';
                        else if (listNameLower.includes('hamburguesa') || listNameLower.includes('burger')) iC = 'fa-solid fa-hamburger';
                        else if (listNameLower.includes('taco') || listNameLower.includes('mexican') || listNameLower.includes('nacho')) iC = 'fa-solid fa-pepper-hot';
                        else if (listNameLower.includes('café') || listNameLower.includes('coffee')) iC = 'fa-solid fa-coffee';
                        else if (listNameLower.includes('sushi') || listNameLower.includes('japo')) iC = 'fa-solid fa-fish';
                        else if (listNameLower.includes('helado') || listNameLower.includes('ice cream')) iC = 'fa-solid fa-ice-cream';
                        
                        let escapedListName = "";
                        if (ListopicApp.uiUtils && ListopicApp.uiUtils.escapeHtml) {
                            escapedListName = ListopicApp.uiUtils.escapeHtml(list.name || "Lista sin nombre");
                        } else {
                            escapedListName = list.name || "Lista sin nombre";
                        }

                        li.innerHTML = `<a href="list-view.html?listId=${list.id}" title="${escapedListName}"><i class="${iC}"></i><span>${escapedListName}</span></a>`;
                        listCirclesUl.appendChild(li);
                    });
                } else {
                    listCirclesUl.innerHTML = '<li><p>Aún no hay listas públicas disponibles. ¡Anímate y <a href="list-form.html" style="color: var(--accent-color-primary);">crea la primera</a> y márcala como pública!</p></li>';
                }
            } catch (error) {
                console.error("INDEX: Error fetching or processing public lists:", error);
                listCirclesUl.innerHTML = `<li><p style="color:var(--danger-color)">Error al cargar las listas. ${error.message}</p></li>`;
                // Podrías mostrar un error más amigable usando ListopicApp.services.showNotification
                if(ListopicApp.services && ListopicApp.services.showNotification) {
                    ListopicApp.services.showNotification("Error al cargar listas: " + error.message, "error");
                }
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