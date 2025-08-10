window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageDeveloper = (() => {
    const db = ListopicApp.services.db;
    const auth = ListopicApp.services.auth;
    const collectionsToFetch = ['users', 'lists', 'places', 'categories', 'listForums']; // <-- Añadida 'listForums'

    let currentData = [];
    let sortState = {};

    async function init() {
        console.log('Initializing Developer Dashboard page logic...');
        const contentContainer = document.getElementById('dev-content-container');
        contentContainer.innerHTML = '<p>Verificando permisos de administrador...</p>';

        const user = auth.currentUser;
        if (!user) {
            showAccessDenied();
            return;
        }

        try {
            const userProfileRef = db.collection('users').doc(user.uid);
            const userProfileDoc = await userProfileRef.get();

            // --- LA CORRECCIÓN ESTÁ AQUÍ ---
            // Comprobamos si userType es un array y si INCLUYE 'jefe'
            if (userProfileDoc.exists && Array.isArray(userProfileDoc.data().userType) && userProfileDoc.data().userType.includes('jefe')) {
                console.log('Permiso de administrador concedido. Cargando dashboard.');
                setupTabs();
                if (collectionsToFetch.length > 0) {
                    switchTab(collectionsToFetch[0]);
                }
            } else {
                console.warn('Acceso denegado. El usuario no es "jefe".');
                showAccessDenied();
            }
        } catch (error) {
            console.error("Error al verificar el rol del usuario:", error);
            showAccessDenied("Error al verificar tus permisos.");
        }
    }
    
    function showAccessDenied(message = 'No tienes permiso para ver esta página.') {
        const devContainer = document.querySelector('.dev-container');
        if(devContainer) {
            devContainer.innerHTML = `
                <div style="text-align: center; padding-top: 50px;">
                    <i class="fas fa-user-lock" style="font-size: 4rem; color: var(--danger-color);"></i>
                    <h1 style="margin-top: 20px;">Acceso Denegado</h1>
                    <p style="font-size: 1.2rem; color: var(--secondary-text-color);">${message}</p>
                    <a href="Index.html" class="button-primary" style="margin-top: 20px;">Volver al inicio</a>
                </div>
            `;
        }
    }

    function setupTabs() {
        const tabsContainer = document.getElementById('dev-tabs-container');
        if (!tabsContainer) return;

        tabsContainer.innerHTML = '';
        collectionsToFetch.forEach(collectionName => {
            const button = document.createElement('button');
            button.className = 'dev-tab-button';
            button.dataset.collection = collectionName;
            button.textContent = collectionName.charAt(0).toUpperCase() + collectionName.slice(1);
            button.addEventListener('click', () => switchTab(collectionName));
            tabsContainer.appendChild(button);
        });
    }

    async function switchTab(collectionName) {
        document.querySelectorAll('.dev-tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.collection === collectionName);
        });

        const contentContainer = document.getElementById('dev-content-container');
        contentContainer.innerHTML = `<p>Cargando datos de "${collectionName}"...</p>`;
        sortState = {};

        try {
            const snapshot = await db.collection(collectionName).limit(100).get();
            currentData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            if (currentData.length === 0) {
                contentContainer.innerHTML = `<p>No se encontraron documentos en la colección "${collectionName}".</p>`;
                return;
            }
            renderTable(collectionName, currentData, contentContainer);
        } catch (error) {
            console.error(`Error fetching collection ${collectionName}:`, error);
            contentContainer.innerHTML = `<p style="color:var(--danger-color);">Error al cargar datos de "${collectionName}": ${error.message}</p>`;
        }
    }

    function renderTable(collectionName, data, container) {
        if (!data || data.length === 0) {
             container.innerHTML = `<p>No hay datos para mostrar en "${collectionName}".</p>`;
             return;
        }
    
        const allKeys = new Set(['id']);
        data.forEach(item => {
            Object.keys(item).forEach(key => allKeys.add(key));
        });
        const headers = Array.from(allKeys);
    
        let tableHTML = `
            <div class="data-table-wrapper">
                <table class="data-table" id="table-${collectionName}">
                    <thead>
                        <tr>
                            ${headers.map(key => {
                                const sortClass = sortState[key] ? `sort-${sortState[key]}` : '';
                                const icon = sortState[key] === 'asc' ? '▲' : sortState[key] === 'desc' ? '▼' : '';
                                return `<th class="sortable ${sortClass}" data-key="${escapeHtml(key)}">${escapeHtml(key)} <span class="sort-icon">${icon}</span></th>`;
                            }).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(row => `
                            <tr>
                                ${headers.map(header => `<td>${formatCell(row[header])}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        container.innerHTML = tableHTML;
        addSortListeners(collectionName, container);
    }
    
    function addSortListeners(collectionName, container) {
        container.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const key = th.dataset.key;
                const currentSort = sortState[key];
                const newSort = currentSort === 'asc' ? 'desc' : 'asc';
                sortState = { [key]: newSort };
                sortData(key, newSort);
                renderTable(collectionName, currentData, container);
            });
        });
    }

    function sortData(key, direction) {
        currentData.sort((a, b) => {
            const valA = a[key];
            const valB = b[key];
            if (valA === null || typeof valA === 'undefined') return 1;
            if (valB === null || typeof valB === 'undefined') return -1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            if (valA < valB) return direction === 'asc' ? -1 : 1;
            return 0;
        });
    }

    function formatCell(value) {
        if (value === null || typeof value === 'undefined') return '<em>null</em>';
        // Si el valor es un array, lo mostramos como una lista de strings
        if(Array.isArray(value)) {
            return escapeHtml(value.join(', '));
        }
        const valueStr = String(value);
        if (valueStr.startsWith('http://') || valueStr.startsWith('https://')) {
            return `<a href="${escapeHtml(valueStr)}" target="_blank" rel="noopener noreferrer">${escapeHtml(valueStr)}</a>`;
        }
        if (typeof value === 'object') {
            if (value.toDate) return escapeHtml(value.toDate().toLocaleString());
            if (value.latitude && value.longitude) return `Lat: ${value.latitude.toFixed(4)}, Lon: ${value.longitude.toFixed(4)}`;
            return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
        }
        return escapeHtml(valueStr);
    }

    function escapeHtml(unsafe) {
        if(typeof unsafe !== 'string') unsafe = String(unsafe);
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }


    return {
        init
    };
})();