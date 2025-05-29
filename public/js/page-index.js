window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageIndex = (() => {
    // Dependencies:
    // ListopicApp.services.db (Firestore instance)
    // Potentially ListopicApp.services.auth if API calls become protected

    async function init() {
        console.log('Initializing Index page logic with actual code...');
        const db = ListopicApp.services.db;

        // --- Start of code moved from app.js's isIndexPage block ---
        const listCirclesUl = document.getElementById('list-circles-ul');
        const mainTitle = document.querySelector('h1.brand-title');

        if (listCirclesUl && mainTitle && db) {
            console.log("INDEX: Essential elements found. Fetching lists...");

            try {
                const querySnapshot = await db.collection('lists')
                                            // .where('isPublic', '==', true) // Example: if you only want public lists
                                            // .orderBy('createdAt', 'desc') // Example: order by creation date
                                            .get();
                const lists = [];
                querySnapshot.forEach(doc => {
                    lists.push({ id: doc.id, ...doc.data() });
                });

                    console.log("INDEX: Listas recibidas:", lists);
                    listCirclesUl.innerHTML = '';
                    if (lists && Array.isArray(lists) && lists.length > 0) {
                        lists.forEach((list) => {
                            const li = document.createElement('li');
                            let iC = 'fa-solid fa-list';
                            const listNameLower = list.name.toLowerCase();
                            if (listNameLower.includes('tarta') || listNameLower.includes('pastel') || listNameLower.includes('torta')) iC = 'fa-solid fa-birthday-cake';
                            else if (listNameLower.includes('pizza')) iC = 'fa-solid fa-pizza-slice';
                            else if (listNameLower.includes('hamburguesa') || listNameLower.includes('burger')) iC = 'fa-solid fa-hamburger';
                            else if (listNameLower.includes('taco') || listNameLower.includes('mexican') || listNameLower.includes('nacho')) iC = 'fa-solid fa-pepper-hot';
                            else if (listNameLower.includes('café') || listNameLower.includes('coffee')) iC = 'fa-solid fa-coffee';
                            else if (listNameLower.includes('sushi') || listNameLower.includes('japo')) iC = 'fa-solid fa-fish';
                            else if (listNameLower.includes('helado') || listNameLower.includes('ice cream')) iC = 'fa-solid fa-ice-cream';
                            li.innerHTML = `<a href="list-view.html?listId=${list.id}" title="${ListopicApp.uiUtils.escapeHtml(list.name)}"><i class="${iC}"></i><span>${ListopicApp.uiUtils.escapeHtml(list.name)}</span></a>`;
                            listCirclesUl.appendChild(li);
                        });
                    } else {
                        listCirclesUl.innerHTML = '<li><p>Aún no has creado ninguna lista. ¡Anímate y <a href="list-form.html" style="color: var(--accent-color-primary);">crea la primera</a>!</p></li>';
                    }
            } catch (error) {
                    console.error("INDEX: Error fetching or processing lists:", error);
                    if (listCirclesUl) listCirclesUl.innerHTML = '<li><p style="color:var(--danger-color)">Error al cargar las listas.</p></li>';
            }
        } else {
             console.warn("INDEX: Could not find essential elements for index page.");
        }
        // --- End of code moved from app.js ---

        // Logic for .add-list-button (previously at the end of app.js)
        const createListBtn = document.querySelector('.add-list-button');
        if (createListBtn) {
            createListBtn.addEventListener('click', (e) => {
                e.preventDefault(); 
                window.location.href = 'list-form.html';
            });
        }
    }

    return {
        init
    };
})();
