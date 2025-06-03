window.ListopicApp = window.ListopicApp || {};

ListopicApp.pageProfile = {
    elements: {
        profilePhotoDisplay: null,
        profileIconPlaceholder: null,
        displayNameElement: null,
        usernameDisplayElement: null,
        bioDisplayElement: null,
        emailDisplayElement: null,
        followersCountElement: null,
        followingCountElement: null,
        myListsUl: null,
        myReviewsUl: null,
        editProfileButton: null,
        profileMessageArea: null,
        editProfileModal: null,
        profileEditForm: null,
        saveProfileButton: null,
        closeEditModalButton: null,
        modalBioInput: null,
        modalDobInput: null,
        modalResidenceInput: null,
        photoViewModal: null,
        closePhotoModalButton: null,
        enlargedProfilePhoto: null,
        openPhotoEditButton: null,
        photoEditControls: null,
        modalPhotoFileInput: null,
        modalPhotoUrlInput: null,
        saveNewPhotoButton: null,
        pageTitleHeader: null, // Para el h1 "User Profile"
    },
    currentUser: null, // Usuario logueado
    profileOwnerUser: null, // Datos del perfil que se está viendo (de Firestore)
    profileOwnerUserId: null, // ID del perfil que se está viendo
    originalProfileData: {}, // Para comparar cambios en el formulario de edición

    init: function() {
        console.log("page-profile.js: init");
        this.cacheDOMElements();

        const urlParams = new URLSearchParams(window.location.search);
        const userIdFromUrl = urlParams.get('viewUserId');

        ListopicApp.authService.onAuthStateChangedPromise()
            .then(user => {
                this.currentUser = user; // Guardar el usuario logueado

                if (!user && !userIdFromUrl) { // Si no hay usuario logueado Y no se está pidiendo ver un perfil específico
                    console.log("page-profile: Usuario no logueado y no hay viewUserId, redirigiendo a auth.html");
                    window.location.href = 'auth.html';
                    return;
                }
                
                // Determinar qué perfil cargar
                this.profileOwnerUserId = userIdFromUrl || (this.currentUser ? this.currentUser.uid : null);

                if (!this.profileOwnerUserId) {
                    // Esto podría pasar si hay viewUserId pero el usuario logueado es null (perfil público no implementado)
                    // O si no hay viewUserId y tampoco hay currentUser (ya cubierto arriba)
                    console.error("page-profile: No se pudo determinar el ID del perfil a cargar.");
                    this.displayMessage("No se pudo cargar el perfil.", true);
                    if (this.elements.displayNameElement) this.elements.displayNameElement.textContent = "Perfil no disponible";
                    return;
                }
                
                this.loadUserProfileData(this.profileOwnerUserId);
                this.attachEventListeners();
                this.updateEditButtonVisibility();
                
                if (this.elements.pageTitleHeader) {
                    this.elements.pageTitleHeader.style.display = 'none';
                }
            })
            .catch(error => {
                console.error("page-profile: Error esperando el estado de autenticación:", error);
                this.displayMessage("Error al verificar tu sesión. Intenta recargar.", true);
            });
    },

    cacheDOMElements: function() {
        // ... (copia tu función cacheDOMElements completa de la versión anterior)
        // Asegúrate de que todos los IDs coincidan con tu profile.html
        const profilePicturePlaceholder = document.getElementById('profile-picture-placeholder');
        if (profilePicturePlaceholder) {
            this.elements.profilePhotoDisplay = profilePicturePlaceholder.querySelector('img#profile-photo-display'); // Asumiendo <img id="profile-photo-display">
            this.elements.profileIconPlaceholder = profilePicturePlaceholder.querySelector('i.fa-user-circle');
        }
        this.elements.displayNameElement = document.getElementById('profile-display-name');
        this.elements.usernameDisplayElement = document.getElementById('profile-username-display');
        this.elements.bioDisplayElement = document.getElementById('profile-bio-display');
        this.elements.emailDisplayElement = document.getElementById('profile-email-display');
        this.elements.followersCountElement = document.getElementById('followers-count');
        this.elements.followingCountElement = document.getElementById('following-count');
        this.elements.myListsUl = document.getElementById('my-lists-ul');
        this.elements.myReviewsUl = document.getElementById('my-reviews-ul');
        this.elements.editProfileButton = document.getElementById('open-edit-profile-modal-button');
        this.elements.profileMessageArea = document.getElementById('profile-message-area');
        this.elements.editProfileModal = document.getElementById('edit-profile-modal');
        this.elements.profileEditForm = document.getElementById('profile-edit-form');
        this.elements.saveProfileButton = document.getElementById('save-profile-button');
        this.elements.closeEditModalButton = document.getElementById('close-edit-modal-button');
        this.elements.modalBioInput = document.getElementById('modal-profile-bio');
        this.elements.modalDobInput = document.getElementById('modal-profile-dob');
        this.elements.modalResidenceInput = document.getElementById('modal-profile-residence');
        this.elements.photoViewModal = document.getElementById('photo-view-modal');
        this.elements.closePhotoModalButton = document.getElementById('close-photo-modal-button');
        this.elements.enlargedProfilePhoto = document.getElementById('enlarged-profile-photo');
        this.elements.openPhotoEditButton = document.getElementById('open-photo-edit-button');
        this.elements.photoEditControls = document.getElementById('photo-edit-controls');
        this.elements.modalPhotoFileInput = document.getElementById('modal-photo-file');
        this.elements.modalPhotoUrlInput = document.getElementById('modal-photo-url');
        this.elements.saveNewPhotoButton = document.getElementById('save-new-photo-button');
        this.elements.pageTitleHeader = document.querySelector('.profile-page-container > h1.brand-title.section-title');
    },
    
    updateEditButtonVisibility: function() {
        if (this.elements.editProfileButton) {
            if (this.currentUser && this.profileOwnerUserId && this.currentUser.uid === this.profileOwnerUserId) {
                this.elements.editProfileButton.style.display = 'inline-block';
            } else {
                this.elements.editProfileButton.style.display = 'none';
            }
        }
    },

    attachEventListeners: function() { /* ... (Copia tu función attachEventListeners de la versión anterior) ... */ },
    displayMessage: function(message, isError = false) { /* ... (Copia tu función) ... */ },
    formatDateForInput: function(timestamp) { /* ... (Copia tu función) ... */ },
    updateProfilePhotoViews: function(url) { /* ... (Copia tu función) ... */ },
    populateEditModal: function() { /* ... (Copia tu función) ... */ },
    checkProfileDataChanges: function() { /* ... (Copia tu función) ... */ },
    saveProfileDataChanges: async function() { /* ... (Copia tu función, asegurando que usa this.profileOwnerUserId para la ref) ... */ },
    saveNewPhoto: async function() { /* ... (Copia tu función, asegurando que usa this.profileOwnerUserId) ... */ },

    loadUserProfileData: async function(userIdToLoad) {
        if (!userIdToLoad) {
            console.error("page-profile: No userIdToLoad proporcionado para cargar perfil.");
            return;
        }
        const db = ListopicApp.services.db;
        const userDocRef = db.collection('users').doc(userIdToLoad);

        try {
            const docSnap = await userDocRef.get();
            if (docSnap.exists) {
                this.profileOwnerUser = docSnap.data(); // Datos del perfil de Firestore
                this.originalProfileData = {...this.profileOwnerUser}; // Para el modal de edición

                if (this.elements.displayNameElement) this.elements.displayNameElement.textContent = this.profileOwnerUser.username || this.profileOwnerUser.displayName || 'Usuario';
                if (this.elements.usernameDisplayElement) this.elements.usernameDisplayElement.textContent = `@${this.profileOwnerUser.username || 'usuario'}`;
                if (this.elements.bioDisplayElement) this.elements.bioDisplayElement.textContent = this.profileOwnerUser.bio || 'No hay biografía disponible.';
                this.updateProfilePhotoViews(this.profileOwnerUser.photoUrl);
                if (this.elements.emailDisplayElement) { // Mostrar email solo si es el perfil propio y hay currentUser
                    this.elements.emailDisplayElement.textContent = (this.currentUser && this.currentUser.uid === userIdToLoad) ? (this.currentUser.email || 'Email no disponible') : 'Email privado';
                }
                if (this.elements.followersCountElement) this.elements.followersCountElement.textContent = this.profileOwnerUser.followersCount || 0;
                if (this.elements.followingCountElement) this.elements.followingCountElement.textContent = this.profileOwnerUser.followingCount || 0;
            } else {
                if (this.elements.displayNameElement) this.elements.displayNameElement.textContent = "Perfil no encontrado";
                console.warn(`page-profile: Documento de perfil no encontrado en Firestore para UID: ${userIdToLoad}.`);
            }
        } catch (error) {
            console.error(`page-profile: Error cargando perfil de Firestore para UID ${userIdToLoad}:`, error);
            this.displayMessage("Error al cargar los datos de este perfil.", true);
        }
        // Cargar listas y reseñas del perfil que se está viendo
        this.fetchUserLists(userIdToLoad);
        this.fetchUserReviews(userIdToLoad);
    },

    fetchUserLists: async function(userIdToLoad) {
        if (!this.elements.myListsUl || !ListopicApp.services.db) return;
        this.elements.myListsUl.innerHTML = `<li class="loading-placeholder">Cargando listas...</li>`;
        try {
            const querySnapshot = await ListopicApp.services.db.collection('lists')
                                        .where('userId', '==', userIdToLoad)
                                        .orderBy('createdAt', 'desc')
                                        .get();
            const lists = [];
            querySnapshot.forEach(doc => {
                lists.push({ id: doc.id, ...doc.data() });
            });
            this.renderUserLists(lists);
        } catch (error) {
            console.error(`page-profile: Error fetching lists for user ${userIdToLoad}:`, error);
            this.elements.myListsUl.innerHTML = '<li class="error-placeholder">Error al cargar las listas.</li>';
        }
    },

    renderUserLists: function(lists) {
        if (!this.elements.myListsUl) return;
        this.elements.myListsUl.innerHTML = ''; 
        if (lists.length === 0) {
            this.elements.myListsUl.innerHTML = '<li>Este usuario aún no ha creado ninguna lista.</li>';
            return;
        }
        lists.forEach(list => {
            const li = document.createElement('li');
            li.className = 'profile-list-item card-like'; // Clase para estilizar

            const listName = ListopicApp.uiUtils.escapeHtml(list.name || 'Lista sin nombre');
            const reviewCount = list.reviewCount || 0;
            const createdAtDate = list.createdAt?.toDate ? list.createdAt.toDate().toLocaleDateString() : 'Fecha desconocida';

            li.innerHTML = `
                <a href="list-view.html?listId=${list.id}" class="profile-list-item-link">
                    <strong class="profile-list-item-name">${listName}</strong>
                    <div class="profile-list-item-meta">
                        <span><i class="fas fa-list-ol"></i> ${reviewCount} reseñas</span>
                        <span><i class="fas fa-calendar-alt"></i> Creada: ${createdAtDate}</span>
                    </div>
                </a>
            `;
            this.elements.myListsUl.appendChild(li);
        });
    },

    fetchUserReviews: async function(userIdToLoad) {
        if (!this.elements.myReviewsUl || !ListopicApp.services.db) return;
        this.elements.myReviewsUl.innerHTML = `<li class="loading-placeholder">Cargando reseñas...</li>`;
        const db = ListopicApp.services.db;

        console.log(`page-profile: Fetching reviews for user ${userIdToLoad}`);
        try {
            const reviewsSnapshot = await db.collectionGroup('reviews')
                                          .where('userId', '==', userIdToLoad)
                                          .orderBy('updatedAt', 'desc') 
                                          .limit(20)
                                          .get();
            
            console.log(`page-profile: Found ${reviewsSnapshot.size} reviews for user ${userIdToLoad}`);
            if (reviewsSnapshot.empty) {
                this.renderUserReviews([]);
                return;
            }

            const reviewsData = [];
            reviewsSnapshot.forEach(doc => {
                reviewsData.push({ id: doc.id, ...doc.data() });
            });

            const listIds = [...new Set(reviewsData.map(r => r.listId).filter(id => !!id))];
            const placeIds = [...new Set(reviewsData.map(r => r.placeId).filter(id => !!id))];

            console.log(`page-profile: Unique listIds to fetch:`, listIds);
            console.log(`page-profile: Unique placeIds to fetch:`, placeIds);

            const listPromises = listIds.map(id => db.collection('lists').doc(id).get());
            const placePromises = placeIds.map(id => db.collection('places').doc(id).get());

            const [listDocsSnaps, placeDocsSnaps] = await Promise.all([
             listIds.length > 0 ? Promise.all(listPromises) : Promise.resolve([]),
             placeIds.length > 0 ? Promise.all(placePromises) : Promise.resolve([])
            ]);

            const listsMap = new Map();
            listDocsSnaps.forEach(doc => { if (doc.exists) listsMap.set(doc.id, doc.data()); });
            
            const placesMap = new Map();
            placeDocsSnaps.forEach(doc => { if (doc.exists) placesMap.set(doc.id, doc.data()); });

            console.log(`page-profile: Fetched ${listsMap.size} list details and ${placesMap.size} place details.`);

            const enrichedReviews = reviewsData.map(review => {
                const listInfo = listsMap.get(review.listId);
                const placeInfo = placesMap.get(review.placeId);
                return {
                    ...review,
                    listName: listInfo ? listInfo.name : 'Lista Desconocida',
                    establishmentName: placeInfo ? placeInfo.name : 'Lugar Desconocido' 
                };
            }).filter(review => review !== null); // Filtrar nulos si añades la comprobación comentada arriba

            this.renderUserReviews(enrichedReviews);

        } catch (error) {
            console.error(`page-profile: Error fetching user reviews for ${userIdToLoad}:`, error);
            if (error.code === 'failed-precondition') {
                 this.elements.myReviewsUl.innerHTML = `<li class="error-placeholder">Error al cargar reseñas: La consulta requiere un índice. Por favor, revisa la consola del navegador para el enlace de creación del índice.</li>`;
                 ListopicApp.services.showNotification("Error de índice en reseñas del perfil: " + error.message, "error");
            } else {
                this.elements.myReviewsUl.innerHTML = '<li class="error-placeholder">Error al cargar las reseñas.</li>';
            }
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
            li.className = 'profile-review-item card-like'; // Clase para estilizar

            const reviewLink = document.createElement('a');
            reviewLink.href = `detail-view.html?listId=${review.listId}&id=${review.id}`;
            
            const establishmentText = ListopicApp.uiUtils.escapeHtml(review.establishmentName || 'Establecimiento Desconocido');
            const itemText = review.itemName ? ` - ${ListopicApp.uiUtils.escapeHtml(review.itemName)}` : '';
            const listNameText = review.listName ? ` (en lista: ${ListopicApp.uiUtils.escapeHtml(review.listName)})` : '';
            const overallRatingText = review.overallRating !== undefined ? `<span class="profile-review-rating">[${review.overallRating.toFixed(1)} <i class="fas fa-star"></i>]</span>` : '';
            const reviewDateObj = review.updatedAt?.toDate ? review.updatedAt.toDate() : (review.createdAt?.toDate ? review.createdAt.toDate() : null);
            const reviewDate = reviewDateObj ? reviewDateObj.toLocaleDateString() : '';

            reviewLink.innerHTML = `
                <div class="profile-review-item-main">
                    <strong class="profile-review-item-title">${establishmentText}${itemText}</strong>
                    ${overallRatingText}
                </div>
                <div class="profile-review-item-meta">
                    <span class="profile-review-item-listname"><i class="fas fa-list"></i> ${listNameText}</span>
                    ${reviewDate ? `<span class="profile-review-item-date"><i class="fas fa-calendar-alt"></i> ${reviewDate}</span>` : ''}
                </div>
            `;
            li.appendChild(reviewLink);
            this.elements.myReviewsUl.appendChild(li);
        });
    }
};