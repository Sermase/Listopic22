window.ListopicApp = window.ListopicApp || {};

ListopicApp.pageProfile = {
    // Objeto para guardar referencias a los elementos del DOM
    elements: {
        profilePhotoDisplay: null,
        profileIconPlaceholder: null,
        displayNameElement: null,
        usernameDisplayElement: null,
        bioDisplayElement: null,
        emailDisplayElement: null,
        listsCountElement: null,
        reviewsCountElement: null,
        followersCountElement: null,
        followingCountElement: null,
        myListsUl: null,
        myReviewsUl: null,
        editProfileButton: null,
        pageTitleHeader: null,
    },

    // Variables de estado de la página
    currentUser: null,
    profileOwnerUserId: null,

    // --- FUNCIÓN DE INICIALIZACIÓN ---
    init: function() {
        console.log("page-profile.js: init -> INICIADO");
        this.cacheDOMElements();

        const urlParams = new URLSearchParams(window.location.search);
        const userIdFromUrl = urlParams.get('viewUserId');

        ListopicApp.authService.onAuthStateChangedPromise().then(user => {
            this.currentUser = user;
            this.profileOwnerUserId = userIdFromUrl || (this.currentUser ? this.currentUser.uid : null);

            if (!this.profileOwnerUserId) {
                console.error("page-profile: No se pudo determinar el ID del perfil. Redirigiendo...");
                window.location.href = 'auth.html';
                return;
            }
            
            this.loadUserProfileData(this.profileOwnerUserId);
            // this.attachEventListeners(); // Descomentar cuando implementes los modales de edición
            this.updateEditButtonVisibility();
            
            if (this.elements.pageTitleHeader) {
                this.elements.pageTitleHeader.style.display = 'none';
            }
        });
    },

    // --- CACHEAR ELEMENTOS DEL DOM ---
    cacheDOMElements: function() {
        console.log("page-profile.js: cacheDOMElements -> Buscando elementos...");
        const profilePictureContainer = document.getElementById('profile-picture-placeholder');
        if (profilePictureContainer) {
            this.elements.profilePhotoDisplay = profilePictureContainer.querySelector('img'); 
            this.elements.profileIconPlaceholder = profilePictureContainer.querySelector('i');
        }
        this.elements.displayNameElement = document.getElementById('profile-display-name');
        this.elements.usernameDisplayElement = document.getElementById('profile-username-display');
        this.elements.bioDisplayElement = document.getElementById('profile-bio-display');
        this.elements.emailDisplayElement = document.getElementById('profile-email-display');
        this.elements.myListsUl = document.getElementById('my-lists-ul');
        this.elements.myReviewsUl = document.getElementById('my-reviews-ul');
        this.elements.editProfileButton = document.getElementById('open-edit-profile-modal-button');
        this.elements.pageTitleHeader = document.querySelector('.profile-page-container > h1.section-title');
        
        // Cachear contadores de estadísticas
        this.elements.listsCountElement = document.getElementById('lists-count');
        this.elements.reviewsCountElement = document.getElementById('reviews-count');
        this.elements.followersCountElement = document.getElementById('followers-count');
        this.elements.followingCountElement = document.getElementById('following-count');
        console.log("page-profile.js: cacheDOMElements -> Finalizado.");
    },
    
    // --- MOSTRAR/OCULTAR BOTÓN DE EDITAR ---
    updateEditButtonVisibility: function() {
        if (this.elements.editProfileButton) {
            const isOwnProfile = this.currentUser && this.currentUser.uid === this.profileOwnerUserId;
            this.elements.editProfileButton.style.display = isOwnProfile ? 'inline-block' : 'none';
        }
    },

    // --- CARGAR DATOS PRINCIPALES DEL PERFIL ---
    loadUserProfileData: async function(userIdToLoad) {
        const db = ListopicApp.services.db;
        const userDocRef = db.collection('users').doc(userIdToLoad);

        try {
            const docSnap = await userDocRef.get();
            if (docSnap.exists) {
                const profileData = docSnap.data();
                
                if (this.elements.displayNameElement) this.elements.displayNameElement.textContent = profileData.username || 'Usuario';
                if (this.elements.usernameDisplayElement) this.elements.usernameDisplayElement.textContent = `@${profileData.username || 'usuario'}`;
                if (this.elements.bioDisplayElement) this.elements.bioDisplayElement.textContent = profileData.bio || 'Este usuario aún no ha añadido una biografía.';
                
                const isOwnProfile = this.currentUser && this.currentUser.uid === userIdToLoad;
                if (this.elements.emailDisplayElement) {
                    this.elements.emailDisplayElement.textContent = isOwnProfile ? this.currentUser.email : '';
                    this.elements.emailDisplayElement.style.display = isOwnProfile ? 'block' : 'none';
                }

                // Actualizar contadores
                if (this.elements.listsCountElement) this.elements.listsCountElement.textContent = (profileData.publicListsCount || 0) + (profileData.privateListsCount || 0);
                if (this.elements.reviewsCountElement) this.elements.reviewsCountElement.textContent = profileData.reviewsCount || 0;
                if (this.elements.followersCountElement) this.elements.followersCountElement.textContent = profileData.followersCount || 0;
                if (this.elements.followingCountElement) this.elements.followingCountElement.textContent = profileData.followingCount || 0;

            } else {
                if (this.elements.displayNameElement) this.elements.displayNameElement.textContent = "Perfil no encontrado";
            }
        } catch (error) {
            console.error(`page-profile: Error cargando perfil desde Firestore:`, error);
        }

        // Cargar listas y reseñas después de los datos del perfil
        this.fetchUserLists(userIdToLoad);
        this.fetchUserReviews(userIdToLoad);
    },

    // --- OBTENER Y RENDERIZAR LISTAS ---
    // Reemplaza esta función completa en page-profile.js
    fetchUserLists: async function(userIdToLoad) {
        if (!this.elements.myListsUl) return;
        this.elements.myListsUl.innerHTML = `<li class="loading-placeholder">Cargando listas...</li>`;
        console.log(`LISTAS: Buscando listas para userId: '${userIdToLoad}'`);

        const isOwnProfile = this.currentUser && this.currentUser.uid === userIdToLoad;
        let listsQuery = ListopicApp.services.db.collection('lists')
            .where('userId', '==', userIdToLoad);

        // Si NO es nuestro propio perfil, solo mostramos las listas públicas.
        if (!isOwnProfile) {
            listsQuery = listsQuery.where('isPublic', '==', true);
        }
        
        listsQuery = listsQuery.orderBy('createdAt', 'desc');

        try {
            const querySnapshot = await listsQuery.get();
            
            console.log(`LISTAS: Consulta finalizada. Se encontraron ${querySnapshot.size} listas.`);
            this.renderUserLists(querySnapshot.docs);
        } catch (error) {
            console.error(`page-profile: Error fetching lists:`, error);
            this.elements.myListsUl.innerHTML = '<li class="error-placeholder">No se pudieron cargar las listas.</li>';
        }
    },

    renderUserLists: function(listDocs) {
        if (!this.elements.myListsUl) return;
        this.elements.myListsUl.innerHTML = '';
        if (listDocs.length === 0) {
            this.elements.myListsUl.innerHTML = '<li>Este usuario aún no ha creado ninguna lista.</li>';
            return;
        }
        listDocs.forEach(doc => {
            const list = doc.data();
            const li = document.createElement('li');
            li.className = 'profile-list-item'; // Usamos las clases que ya tienes en style.css

            const privacyIcon = list.isPublic ? 'fa-globe-americas' : 'fa-lock';
            const privacyText = list.isPublic ? 'Pública' : 'Privada';

            li.innerHTML = `
                <a href="list-view.html?listId=${doc.id}">
                    <strong class="profile-list-item-name">${ListopicApp.uiUtils.escapeHtml(list.name)}</strong>
                    <div class="profile-list-item-meta">
                        <span><i class="fas fa-pencil-alt"></i> ${list.reviewCount || 0} reseñas</span>
                        <span><i class="fas ${privacyIcon}"></i> ${privacyText}</span>
                    </div>
                </a>
            `;
            this.elements.myListsUl.appendChild(li);
        });
    },

    // --- OBTENER Y RENDERIZAR RESEÑAS ---
    fetchUserReviews: async function(userIdToLoad) {
        if (!this.elements.myReviewsUl) return;
        this.elements.myReviewsUl.innerHTML = `<li class="loading-placeholder">Cargando reseñas...</li>`;
        console.log(`RESEÑAS: Buscando reseñas para userId: '${userIdToLoad}'`);

        try {
            const reviewsSnapshot = await ListopicApp.services.db.collectionGroup('reviews')
                .where('userId', '==', userIdToLoad)
                .orderBy('updatedAt', 'desc')
                .limit(20)
                .get();
            
            console.log(`RESEÑAS: Consulta finalizada. Se encontraron ${reviewsSnapshot.size} reseñas.`);
            if (reviewsSnapshot.empty) {
                this.renderUserReviews([]);
                return;
            }

            const reviewsData = [];
            reviewsSnapshot.forEach(doc => reviewsData.push({ id: doc.id, ...doc.data() }));

            // Enriquecer reseñas con datos de listas y lugares
            const listIds = [...new Set(reviewsData.map(r => r.listId).filter(Boolean))];
            const placeIds = [...new Set(reviewsData.map(r => r.placeId).filter(Boolean))];
            
            const listPromises = listIds.map(id => ListopicApp.services.db.collection('lists').doc(id).get());
            const placePromises = placeIds.map(id => ListopicApp.services.db.collection('places').doc(id).get());
            
            const [listDocs, placeDocs] = await Promise.all([Promise.all(listPromises), Promise.all(placePromises)]);
            
            const listsMap = new Map(listDocs.map(doc => [doc.id, doc.data()]));
            const placesMap = new Map(placeDocs.map(doc => [doc.id, doc.data()]));
            
            const enrichedReviews = reviewsData.map(review => ({
                ...review,
                listName: listsMap.get(review.listId)?.name || 'Lista Desconocida',
                establishmentName: placesMap.get(review.placeId)?.name || 'Lugar Desconocido',
            }));
            
            this.renderUserReviews(enrichedReviews);
        } catch (error) {
            console.error(`page-profile: Error fetching reviews:`, error);
            this.elements.myReviewsUl.innerHTML = '<li class="error-placeholder">Error al cargar las reseñas.</li>';
        }
    },

    renderUserReviews: function(reviews) {
        if (!this.elements.myReviewsUl) return;
        this.elements.myReviewsUl.innerHTML = '';
        if (reviews.length === 0) {
            this.elements.myReviewsUl.innerHTML = '<li>Este usuario aún no ha escrito ninguna reseña.</li>';
            return;
        }
        reviews.forEach(review => {
            const li = document.createElement('li');
            li.className = 'profile-review-item';

            const establishmentText = ListopicApp.uiUtils.escapeHtml(review.establishmentName);
            const itemText = review.itemName ? ` - ${ListopicApp.uiUtils.escapeHtml(review.itemName)}` : '';
            const listNameText = `en lista: ${ListopicApp.uiUtils.escapeHtml(review.listName)}`;
            const rating = review.overallRating !== undefined ? `[${review.overallRating.toFixed(1)}]` : '';

            li.innerHTML = `
                <a href="detail-view.html?listId=${review.listId}&id=${review.id}">
                    <div class="profile-review-item-main">
                        <strong class="profile-review-item-title">${establishmentText}${itemText}</strong>
                        <span class="profile-review-rating">${rating} <i class="fas fa-star"></i></span>
                    </div>
                    <div class="profile-review-item-meta">
                        <span><i class="fas fa-list"></i> ${listNameText}</span>
                    </div>
                </a>
            `;
            this.elements.myReviewsUl.appendChild(li);
        });
    },
};

// Log de confirmación para saber si el archivo se ha parseado correctamente.
console.log("page-profile.js: Script PARSEADO y EJECUTADO exitosamente.");