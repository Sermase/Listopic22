window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageAdmin = (() => {

    // Función para dibujar la tabla de datos
    function renderTable(data, tableHeadId, tableBodyId) {
        const tableHead = document.getElementById(tableHeadId);
        const tableBody = document.getElementById(tableBodyId);
        if (!tableHead || !tableBody) return;

        tableHead.innerHTML = '';
        tableBody.innerHTML = '';

        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="100%">No se encontraron documentos.</td></tr>`;
            return;
        }

        const headers = Object.keys(data[0]);
        const tr = tableHead.insertRow();
        headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            tr.appendChild(th);
        });

        data.forEach(doc => {
            const row = tableBody.insertRow();
            headers.forEach(header => {
                const cell = row.insertCell();
                let value = doc[header];
                if (value && typeof value.toDate === 'function') {
                    value = value.toDate().toLocaleString('es-ES');
                } else if (typeof value === 'object' && value !== null) {
                    value = JSON.stringify(value, null, 2);
                    cell.innerHTML = `<pre><code>${value}</code></pre>`;
                } else {
                    cell.textContent = value;
                }
            });
        });
    }

    // Función para obtener los datos de la colección
    async function fetchAndDisplayCollection(collectionName, tableHeadId, tableBodyId) {
        try {
            const snapshot = await ListopicApp.services.db.collection(collectionName).limit(50).get();
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderTable(data, tableHeadId, tableBodyId);
        } catch (error) {
            console.error(`Error cargando la colección ${collectionName}:`, error);
        }
    }

    // Función que se ejecuta al hacer clic en el botón de nombrar admin
    async function onSetAdminClick() {
        const emailInput = document.getElementById('admin-email-input');
        const setAdminBtn = document.getElementById('set-admin-btn');
        const email = emailInput.value;
        if (!email) {
            alert('Por favor, introduce un email.');
            return;
        }
        setAdminBtn.disabled = true;
        try {
            const setAdminFunction = ListopicApp.services.functions.httpsCallable('setAdminUser');
            const result = await setAdminFunction({ email: email });
            alert(result.data.message);
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            setAdminBtn.disabled = false;
        }
    }

    // Función principal que se ejecuta al cargar la página
    function init() {
        console.log("Inicializando página de Administrador...");
        ListopicApp.authService.onAuthStateChangedPromise().then(async (user) => {
            if (!user) {
                // Si no hay usuario, no debería estar aquí, authService lo redirigiría
                return;
            }
            
            const idTokenResult = await user.getIdTokenResult(true); // Forzar refresco para obtener el claim de admin
            
            if (idTokenResult.claims.admin === true) {
                console.log("¡Acceso concedido, Su Majestad! Mostrando panel de control.");
                document.getElementById('admin-content').style.display = 'block';
                document.getElementById('admin-access-denied').style.display = 'none';

                const setAdminBtn = document.getElementById('set-admin-btn');
                if (setAdminBtn) {
                    setAdminBtn.addEventListener('click', onSetAdminClick);
                }
                
                // Cargar los datos de la tabla de lugares
                fetchAndDisplayCollection('places', 'places-table-head', 'places-table-body');
            } else {
                console.log("Acceso denegado. Mostrando mensaje para plebeyos.");
                document.getElementById('admin-content').style.display = 'none';
                document.getElementById('admin-access-denied').style.display = 'block';
            }
        });
    }

    return { init };
})();