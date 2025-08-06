window.ListopicApp = window.ListopicApp || {};

ListopicApp.pageProfile = {
    elements: {
        profilePhotoDisplay: null,
        displayNameElement: null,
        usernameDisplayElement: null,
        bioDisplayElement: null,
        locationDisplayElement: null,
        listsCountElement: null,
        reviewsCountElement: null,
        followersCountElement: null,
        followingCountElement: null,
        myListsUl: null,
        myReviewsContainer: null,
        openEditModalBtn: null,
        followUnfollowBtn: null,
        profileMessageArea: null,
        
        editProfileModal: null,
        closeEditModalBtn: null,
        editProfileForm: null,
        modalMessageArea: null,
        saveProfileButton: null,
        
        editDisplayNameInput: null,
        editSurnamesInput: null,
        editLocationInput: null,
        editBioInput: null,
        editPhotoUrlInput: null,
        editPhotoFileInput: null,
        editPhotoPreview: null,
        
        // Pestañas
        tabsContainer: null,
        tabButtons: [],
        tabContents: [],

        photoModal: null,
        closePhotoModalBtn: null,
        modalPhotoImg: null
    },

    currentUser: null,
    profileOwnerUserId: null,
    profileData: null,
    selectedPhotoFile: null,
    isFollowing: false,

    init: function() {
        this.cacheDOMElements();
        const urlParams = new URLSearchParams(window.location.search);
        const userIdFromUrl = urlParams.get('viewUserId');

        ListopicApp.authService.onAuthStateChangedPromise().then(async (user) => {
            if (!user) {
                window.location.href = 'auth.html';
                return;
            }
            this.currentUser = user;
            this.profileOwnerUserId = userIdFromUrl || this.currentUser.uid;
            
            if (this.currentUser.uid !== this.profileOwnerUserId) {
                await this.checkFollowStatus();
            }

            this.updateProfileButtons(); 
            this.loadUserProfileData();
            this.attachEventListeners();
        });
    },

    cacheDOMElements: function() {
        // ... (resto de elementos cacheados como los tenías) ...
        this.elements.profilePhotoDisplay = document.getElementById('profile-photo-display');
        this.elements.displayNameElement = document.getElementById('profile-display-name');
        this.elements.usernameDisplayElement = document.getElementById('profile-username-display');
        this.elements.bioDisplayElement = document.getElementById('profile-bio-display');
        this.elements.locationDisplayElement = document.getElementById('profile-location-display');
        this.elements.myListsUl = document.getElementById('my-lists-ul');
        this.elements.myReviewsContainer = document.getElementById('my-reviews-container');
        this.elements.openEditModalBtn = document.getElementById('open-edit-profile-modal-btn');
        this.elements.followUnfollowBtn = document.getElementById('follow-unfollow-btn');
        this.elements.profileMessageArea = document.getElementById('profile-message-area');
        
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

        // Cache para las pestañas
        this.elements.tabsContainer = document.querySelector('.profile-tabs');
        this.elements.tabButtons = document.querySelectorAll('.profile-tab-button');
        this.elements.tabContents = document.querySelectorAll('.profile-tab-content');
    
        // Cache para el modal de la foto
        this.elements.photoModal = document.getElementById('photo-modal');
        this.elements.closePhotoModalBtn = document.getElementById('close-photo-modal-btn');
        this.elements.modalPhotoImg = document.getElementById('modal-photo-img');
    },
    
    attachEventListeners: function() {
        // ... (resto de listeners) ...
        this.elements.openEditModalBtn?.addEventListener('click', () => this.openEditModal());
        this.elements.followUnfollowBtn?.addEventListener('click', () => this.handleFollowToggle());
        this.elements.closeEditModalBtn?.addEventListener('click', () => this.closeEditModal());
        this.elements.editProfileModal?.addEventListener('click', (event) => {
            if (event.target === this.elements.editProfileModal) this.closeEditModal();
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

        // Listener para las pestañas
        this.elements.tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tab = button.dataset.tab;
                this.activateTab(tab);
            });
        });

        // Listeners para el modal de la foto
    this.elements.profilePhotoDisplay?.addEventListener('click', () => this.openPhotoModal());
        this.elements.closePhotoModalBtn?.addEventListener('click', () => this.closePhotoModal());
        this.elements.photoModal?.addEventListener('click', (event) => {
            if (event.target === this.elements.photoModal) {
                this.closePhotoModal();
            }
        });
    },

    activateTab: function(tab) {
        this.elements.tabContents.forEach(content => {
            content.classList.remove('active');
        });
        this.elements.tabButtons.forEach(button => {
            button.classList.remove('active');
        });

        document.getElementById(`${tab}-content`).classList.add('active');
        this.elements.tabsContainer.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    },

    // ... (El resto de las funciones: checkFollowStatus, updateFollowButtonUI, handleFollowToggle, etc., se mantienen exactamente igual que las tenías) ...
    // Asegúrate de copiar el resto de funciones desde tu último `page-profile.js` para mantener la funcionalidad de edición de perfil, seguimiento, etc.
    // Aquí incluyo el resto para que sea completo:

    updateProfileButtons: function() {
        const isOwnProfile = this.currentUser && this.currentUser.uid === this.profileOwnerUserId;
        if (this.elements.openEditModalBtn) {
            this.elements.openEditModalBtn.style.display = isOwnProfile ? 'inline-block' : 'none';
        }
        if (this.elements.followUnfollowBtn) {
            this.elements.followUnfollowBtn.style.display = isOwnProfile ? 'none' : 'inline-block';
        }
    },

    checkFollowStatus: async function() {
        if (this.currentUser.uid === this.profileOwnerUserId) return;
        const db = ListopicApp.services.db;
        const followDocRef = db.collection('users').doc(this.currentUser.uid).collection('following').doc(this.profileOwnerUserId);
        try {
            const doc = await followDocRef.get();
            this.isFollowing = doc.exists;
            this.updateFollowButtonUI();
        } catch (error) {
            console.error("Error al comprobar el estado de seguimiento:", error);
        }
    },
    
    updateFollowButtonUI: function() {
        const btn = this.elements.followUnfollowBtn;
        if (!btn) return;
        if (this.isFollowing) {
            btn.innerHTML = `<i class="fas fa-user-check"></i> Siguiendo`;
            btn.classList.remove('primary-button');
            btn.classList.add('secondary-button');
        } else {
            btn.innerHTML = `<i class="fas fa-user-plus"></i> Seguir`;
            btn.classList.remove('secondary-button');
            btn.classList.add('primary-button');
        }
    },

    handleFollowToggle: async function() {
        const btn = this.elements.followUnfollowBtn;
        if (!btn) return;
        btn.disabled = true;
        try {
            const functions = firebase.app().functions('europe-west1');
            const toggleFollow = functions.httpsCallable('toggleFollowUser');
            const result = await toggleFollow({ userIdToFollow: this.profileOwnerUserId });
            this.isFollowing = result.data.status === 'followed';
            this.updateFollowButtonUI();
            const followersCountEl = this.elements.followersCountElement;
            let currentFollowers = parseInt(followersCountEl.textContent, 10);
            followersCountEl.textContent = this.isFollowing ? currentFollowers + 1 : currentFollowers - 1;
            ListopicApp.services.showNotification(result.data.message, 'success');
        } catch (error) {
            console.error("Error al seguir/dejar de seguir:", error);
            ListopicApp.services.showNotification(`Error: ${error.message}`, 'error');
        } finally {
            btn.disabled = false;
        }
    },

    loadUserProfileData: async function() {
        const db = ListopicApp.services.db;
        const userDocRef = db.collection('users').doc(this.profileOwnerUserId);
        try {
            const docSnap = await userDocRef.get();
            if (docSnap.exists) {
                this.profileData = docSnap.data();
                this.renderProfileData();
                this.fetchUserLists(this.profileOwnerUserId);
                this.fetchUserReviews(this.profileOwnerUserId);
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
            this.elements.profilePhotoDisplay.src = photoUrl || 'img/placeholder-avatar.png';
        }
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
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
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
                this.loadUserProfileData();
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
        let listsQuery = ListopicApp.services.db.collection('lists').where('userId', '==', userIdToLoad);
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
        const container = this.elements.myReviewsContainer;
        if (!container) return;
        container.innerHTML = `<p class="loading-placeholder">Buscando reseñas...</p>`;
        try {
            const reviewsSnapshot = await ListopicApp.services.db.collectionGroup('reviews')
                .where('userId', '==', userIdToLoad)
                .orderBy('updatedAt', 'desc').limit(20).get();
            if (reviewsSnapshot.empty) {
                this.renderUserReviews([]);
                return;
            }
            const reviewsData = [];
            reviewsSnapshot.forEach(doc => reviewsData.push({ id: doc.id, ...doc.data() }));
            const listIds = [...new Set(reviewsData.map(r => r.listId).filter(Boolean))];
            const placeIds = [...new Set(reviewsData.map(r => r.placeId).filter(Boolean))];
            const authorIds = [...new Set(reviewsData.map(r => r.userId).filter(Boolean))];
            const listPromises = listIds.map(id => ListopicApp.services.db.collection('lists').doc(id).get());
            const placePromises = placeIds.map(id => ListopicApp.services.db.collection('places').doc(id).get());
            const authorPromises = authorIds.map(id => ListopicApp.services.db.collection('users').doc(id).get());
            const [listDocs, placeDocs, authorDocs] = await Promise.all([
                Promise.all(listPromises), 
                Promise.all(placePromises),
                Promise.all(authorPromises)
            ]);
            const listsMap = new Map(listDocs.map(doc => [doc.id, doc.data()]));
            const placesMap = new Map(placeDocs.map(doc => [doc.id, doc.data()]));
            const authorsMap = new Map(authorDocs.map(doc => [doc.id, doc.data()]));
            const enrichedReviews = reviewsData.map(review => {
                const listData = listsMap.get(review.listId);
                const authorData = authorsMap.get(review.userId);
                const placeData = placesMap.get(review.placeId);
                return {
                    ...review,
                    listName: listData?.name || 'Lista Desconocida',
                    criteriaDefinition: listData?.criteriaDefinition || {},
                    author: {
                        id: review.userId,
                        name: authorData?.displayName || authorData?.username || 'Usuario',
                        photoUrl: authorData?.photoUrl || 'img/placeholder-avatar.png'
                    },
                    place: {
                        id: review.placeId,
                        name: placeData?.name || 'Lugar Desconocido',
                        googleMapsUrl: placeData?.googleMapsUrl || '#'
                    }
                };
            });
            this.renderUserReviews(enrichedReviews);
        } catch (error) {
            console.error(`page-profile: Error fetching reviews:`, error);
            container.innerHTML = '<p class="error-placeholder">Error al cargar las reseñas.</p>';
        }
    },

    renderUserReviews: function(reviews) {
        const container = this.elements.myReviewsContainer;
        if (!container) return;
        container.innerHTML = '';
        if (reviews.length === 0) {
            container.innerHTML = '<p>Este usuario aún no ha escrito ninguna reseña.</p>';
            return;
        }
        container.innerHTML = reviews.map(review => 
            ListopicApp.uiUtils.renderReviewSuperCard(review)
        ).join('');
    },

    openPhotoModal: function() {
        if (this.elements.modalPhotoImg && this.elements.profilePhotoDisplay) {
            this.elements.modalPhotoImg.src = this.elements.profilePhotoDisplay.src;
            this.elements.photoModal.classList.add('active');
        }
    },
    
    closePhotoModal: function() {
        if (this.elements.photoModal) {
            this.elements.photoModal.classList.remove('active');
        }
    }
};

console.log("page-profile.js: Script PARSEADO y EJECUTADO exitosamente.");