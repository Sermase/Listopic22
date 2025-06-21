window.ListopicApp = window.ListopicApp || {};

ListopicApp.pageProfile = {
    // Objeto para guardar referencias a los elementos del DOM
    elements: {
        // --- Elementos de la página principal ---
        profilePhotoDisplay: null,
        profilePicturePlaceholder: null,
        displayNameElement: null,
        usernameDisplayElement: null,
        bioDisplayElement: null,
        locationDisplayElement: null,
        // --- NUEVOS ELEMENTOS PARA ESTADÍSTICAS ---
        listsCountElement: null,
        reviewsCountElement: null,
        followersCountElement: null,
        followingCountElement: null,
        myListsUl: null,
        myReviewsUl: null,
        openEditModalBtn: null,
        profileMessageArea: null,
        
        // --- Elementos del Modal ---
        editProfileModal: null,
        closeEditModalBtn: null,
        editProfileForm: null,
        modalMessageArea: null,
        saveProfileButton: null,
        
        // --- Campos del Formulario del Modal ---
        editDisplayNameInput: null,
        editSurnamesInput: null,
        editLocationInput: null,
        editBioInput: null,
        editPhotoUrlInput: null,
        editPhotoFileInput: null,
        editPhotoPreview: null,
    },

    // Variables de estado de la página
    currentUser: null,
    profileOwnerUserId: null,
    profileData: null, // Guardaremos los datos del perfil aquí
    selectedPhotoFile: null,

    init: function() {
        console.log("page-profile.js: init -> INICIADO");
        this.cacheDOMElements();

        const urlParams = new URLSearchParams(window.location.search);
        const userIdFromUrl = urlParams.get('viewUserId');

        ListopicApp.authService.onAuthStateChangedPromise().then(user => {
            this.currentUser = user;
            if (!this.currentUser) {
                window.location.href = 'auth.html';
                return;
            }
            this.profileOwnerUserId = userIdFromUrl || this.currentUser.uid;
            
            this.loadUserProfileData();
            this.attachEventListeners();
            this.updateEditButtonVisibility();
        });
    },

    cacheDOMElements: function() {
        this.elements.profilePhotoDisplay = document.getElementById('profile-photo-display');
        this.elements.profilePicturePlaceholder = document.getElementById('profile-picture-placeholder');
        this.elements.displayNameElement = document.getElementById('profile-display-name');
        this.elements.usernameDisplayElement = document.getElementById('profile-username-display');
        this.elements.bioDisplayElement = document.getElementById('profile-bio-display');
        this.elements.locationDisplayElement = document.getElementById('profile-location-display');
        this.elements.myListsUl = document.getElementById('my-lists-ul');
        this.elements.myReviewsUl = document.getElementById('my-reviews-ul');
        this.elements.openEditModalBtn = document.getElementById('open-edit-profile-modal-btn');
        this.elements.profileMessageArea = document.getElementById('profile-message-area');
        
        // --- CACHE DE LOS NUEVOS ELEMENTOS DE ESTADÍSTICAS ---
        this.elements.listsCountElement = document.getElementById('lists-count');
        this.elements.reviewsCountElement = document.getElementById('reviews-count');
        this.elements.followersCountElement = document.getElementById('followers-count');
        this.elements.followingCountElement = document.getElementById('following-count');
        
        this.elements.editProfileModal = document.getElementById('edit-profile-modal');
        this.elements.closeEditModalBtn = document.getElementById('close-edit-profile-modal-btn');
        this.elements.editProfileForm = document.getElementById('edit-profile-form');
        this.elements.modalMessageArea = document.getElementById('modal-message-area');
        this.elements.saveProfileButton = document.getElementById('save-profile-button');
        
        this.elements.editDisplayNameInput = document.getElementById('edit-displayName');
        this.elements.editSurnamesInput = document.getElementById('edit-surnames');
        this.elements.editLocationInput = document.getElementById('edit-location');
        this.elements.editBioInput = document.getElementById('edit-bio');
        this.elements.editPhotoUrlInput = document.getElementById('edit-photo-url');
        this.elements.editPhotoFileInput = document.getElementById('edit-photo-file');
        this.elements.editPhotoPreview = document.getElementById('edit-photo-preview');
    },
    
    updateEditButtonVisibility: function() {
        if (this.elements.openEditModalBtn) {
            const isOwnProfile = this.currentUser && this.currentUser.uid === this.profileOwnerUserId;
            this.elements.openEditModalBtn.style.display = isOwnProfile ? 'inline-block' : 'none';
        }
    },

    attachEventListeners: function() {
        this.elements.openEditModalBtn?.addEventListener('click', () => this.openEditModal());
        this.elements.closeEditModalBtn?.addEventListener('click', () => this.closeEditModal());
        this.elements.editProfileModal?.addEventListener('click', (event) => {
            if (event.target === this.elements.editProfileModal) {
                this.closeEditModal();
            }
        });
        this.elements.editProfileForm?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.saveProfileChanges();
        });
        this.elements.editPhotoFileInput?.addEventListener('change', (event) => {
            if (event.target.files && event.target.files[0]) {
                this.selectedPhotoFile = event.target.files[0];
                const reader = new FileReader();
                reader.onload = (e) => this.showImagePreview(e.target.result);
                reader.readAsDataURL(this.selectedPhotoFile);
            }
        });
        this.elements.editPhotoUrlInput?.addEventListener('input', (event) => {
            this.selectedPhotoFile = null;
            this.showImagePreview(event.target.value);
        });
    },

    loadUserProfileData: async function() {
        const db = ListopicApp.services.db;
        const userDocRef = db.collection('users').doc(this.profileOwnerUserId);
        try {
            const docSnap = await userDocRef.get();
            if (docSnap.exists) {
                this.profileData = docSnap.data();
                this.renderProfileData();
                this.fetchUserLists(this.profileOwnerUserId); // MODIFICADO: Pasar el ID
                this.fetchUserReviews(this.profileOwnerUserId); // MODIFICADO: Pasar el ID
            } else {
                this.elements.displayNameElement.textContent = "Perfil no encontrado";
            }
        } catch (error) {
            console.error(`page-profile: Error cargando perfil:`, error);
        }
    },

    renderProfileData: function() {
        const { displayName, username, bio, location, photoUrl, publicListsCount, privateListsCount, reviewsCount, followersCount, followingCount } = this.profileData;
        const totalLists = (publicListsCount || 0) + (privateListsCount || 0);

        if (this.elements.displayNameElement) this.elements.displayNameElement.textContent = displayName || username || 'Usuario';
        if (this.elements.usernameDisplayElement) this.elements.usernameDisplayElement.textContent = `@${username || 'usuario'}`;
        if (this.elements.bioDisplayElement) this.elements.bioDisplayElement.textContent = bio || 'Este usuario aún no ha añadido una biografía.';
        if (this.elements.locationDisplayElement) {
            if (location) {
                this.elements.locationDisplayElement.querySelector('span').textContent = location;
                this.elements.locationDisplayElement.style.display = 'block';
            } else {
                this.elements.locationDisplayElement.style.display = 'none';
            }
        }
        if (this.elements.profilePhotoDisplay) {
            this.elements.profilePhotoDisplay.src = photoUrl || 'img/default-avatar.png';
        }
        
        // --- RENDERIZADO DE LAS ESTADÍSTICAS ---
        if(this.elements.listsCountElement) this.elements.listsCountElement.textContent = totalLists;
        if(this.elements.reviewsCountElement) this.elements.reviewsCountElement.textContent = reviewsCount || 0;
        if(this.elements.followersCountElement) this.elements.followersCountElement.textContent = followersCount || 0;
        if(this.elements.followingCountElement) this.elements.followingCountElement.textContent = followingCount || 0;
    },

    openEditModal: function() {
        if (!this.profileData) return;
        this.elements.editDisplayNameInput.value = this.profileData.displayName || '';
        this.elements.editSurnamesInput.value = this.profileData.surnames || '';
        this.elements.editLocationInput.value = this.profileData.location || '';
        this.elements.editBioInput.value = this.profileData.bio || '';
        this.elements.editPhotoUrlInput.value = this.profileData.photoUrl || '';
        this.showImagePreview(this.profileData.photoUrl);
        this.selectedPhotoFile = null;
        this.elements.editPhotoFileInput.value = '';
        this.elements.modalMessageArea.style.display = 'none';
        this.elements.editProfileModal.classList.add('active');
    },

    closeEditModal: function() {
        this.elements.editProfileModal.classList.remove('active');
    },

    showImagePreview: function(src) {
        if (this.elements.editPhotoPreview) {
            this.elements.editPhotoPreview.innerHTML = src ? `<img src="${src}" alt="Previsualización">` : '';
        }
    },
    
    displayModalMessage: function(message, isError = false) {
        const area = this.elements.modalMessageArea;
        area.textContent = message;
        area.className = isError ? 'error' : 'success';
        area.style.display = 'block';
    },

    saveProfileChanges: async function() {
        this.elements.saveProfileButton.disabled = true;
        this.displayModalMessage("Guardando...", false);

        const auth = ListopicApp.services.auth;
        const db = ListopicApp.services.db;
        const storage = ListopicApp.services.storage;

        try {
            let newPhotoURL = this.elements.editPhotoUrlInput.value.trim();
            if (this.selectedPhotoFile) {
                const filePath = `profile-photos/${this.currentUser.uid}/${Date.now()}_${this.selectedPhotoFile.name}`;
                const fileRef = storage.ref(filePath);
                const uploadTask = await fileRef.put(this.selectedPhotoFile);
                newPhotoURL = await uploadTask.ref.getDownloadURL();
            }

            const updatesForFirestore = {
                displayName: this.elements.editDisplayNameInput.value.trim(),
                surnames: this.elements.editSurnamesInput.value.trim(),
                location: this.elements.editLocationInput.value.trim(),
                bio: this.elements.editBioInput.value.trim(),
                photoUrl: newPhotoURL,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp() // Buena práctica
            };
            
            const updatesForAuth = {
                displayName: updatesForFirestore.displayName,
                photoURL: newPhotoURL
            };

            await db.collection('users').doc(this.currentUser.uid).update(updatesForFirestore);
            await auth.currentUser.updateProfile(updatesForAuth);
            
            this.displayModalMessage("Perfil actualizado con éxito.", false);
            
            setTimeout(() => {
                this.closeEditModal();
                this.loadUserProfileData(); // Recargamos todos los datos
            }, 1500);

        } catch (error) {
            console.error("Error al guardar el perfil:", error);
            this.displayModalMessage(`Error: ${error.message}`, true);
        } finally {
            this.elements.saveProfileButton.disabled = false;
        }
    },

    fetchUserLists: async function(userIdToLoad) {
        if (!this.elements.myListsUl) return;
        this.elements.myListsUl.innerHTML = `<li class="loading-placeholder">Cargando listas...</li>`;
        
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
            this.renderUserLists(querySnapshot.docs);
        } catch (error) {
            console.error(`page-profile: Error fetching lists:`, error);
            this.elements.myListsUl.innerHTML = '<li class="error-placeholder">No se pudieron cargar las listas.</li>';
        }
    },

    renderUserLists: async function(listDocs) {
        if (!this.elements.myListsUl) return;
        this.elements.myListsUl.innerHTML = '';
        if (listDocs.length === 0) {
            this.elements.myListsUl.innerHTML = '<li>Este usuario aún no ha creado ninguna lista visible.</li>';
            return;
        }

        const uiUtils = ListopicApp.uiUtils;
        for (const doc of listDocs) {
            const list = doc.data();
            const li = document.createElement('li');
            li.className = 'profile-list-item';

            const privacyIcon = list.isPublic ? 'fa-globe-americas' : 'fa-lock';
            const privacyText = list.isPublic ? 'Pública' : 'Privada';
            const listIcon = await uiUtils.getListIcon(list);

            li.innerHTML = `
                <a href="list-view.html?listId=${doc.id}">
                    <strong class="profile-list-item-name"><i class="fas ${listIcon}" style="margin-right: 8px;"></i>${uiUtils.escapeHtml(list.name)}</strong>
                    <div class="profile-list-item-meta">
                        <span><i class="fas fa-pencil-alt"></i> ${list.reviewCount || 0} reseñas</span>
                        <span><i class="fas ${privacyIcon}"></i> ${privacyText}</span>
                    </div>
                </a>
            `;
            this.elements.myListsUl.appendChild(li);
        }
    },

    fetchUserReviews: async function(userIdToLoad) {
        if (!this.elements.myReviewsUl) return;
        this.elements.myReviewsUl.innerHTML = `<li class="loading-placeholder">Cargando reseñas...</li>`;
        
        try {
            // Usamos una collectionGroup query para buscar reseñas de este usuario en TODAS las listas
            const reviewsSnapshot = await ListopicApp.services.db.collectionGroup('reviews')
                .where('userId', '==', userIdToLoad)
                .orderBy('updatedAt', 'desc')
                .limit(20)
                .get();
            
            if (reviewsSnapshot.empty) {
                this.renderUserReviews([]);
                return;
            }

            const reviewsData = [];
            reviewsSnapshot.forEach(doc => reviewsData.push({ id: doc.id, ...doc.data() }));

            // Obtenemos los datos de las listas y lugares para enriquecer las reseñas
            const listIds = [...new Set(reviewsData.map(r => r.listId).filter(Boolean))];
            const placeIds = [...new Set(reviewsData.map(r => r.placeId).filter(Boolean))];
            
            const listPromises = listIds.map(id => ListopicApp.services.db.collection('lists').doc(id).get());
            const placePromises = placeIds.map(id => ListopicApp.services.db.collection('places').doc(id).get());
            
            const [listDocs, placeDocs] = await Promise.all([Promise.all(listPromises), Promise.all(placePromises)]);
            
            const listsMap = new Map(listDocs.filter(d => d.exists).map(doc => [doc.id, doc.data()]));
            const placesMap = new Map(placeDocs.filter(d => d.exists).map(doc => [doc.id, doc.data()]));
            
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
        const uiUtils = ListopicApp.uiUtils;
        reviews.forEach(review => {
            const li = document.createElement('li');
            li.className = 'profile-review-item';

            const establishmentText = uiUtils.escapeHtml(review.establishmentName);
            const itemText = review.itemName ? ` - ${uiUtils.escapeHtml(review.itemName)}` : '';
            const listNameText = `en lista: ${uiUtils.escapeHtml(review.listName)}`;
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

console.log("page-profile.js: Script PARSEADO y EJECUTADO exitosamente.");
