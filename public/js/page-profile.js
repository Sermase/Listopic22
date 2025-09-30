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
        myReviewsContainer: null,
        openEditModalBtn: null,
        followUnfollowBtn: null, // NUEVO
        openChatButton: null,
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

    // --- Connections modal elements ---
    connectionsModal: null,
    closeConnectionsModalBtn: null,
    connectionsTabs: null,
    followersList: null,
    followingList: null,
    modalListsUl: null,
    listsToggle: null,
    },

    // Variables de estado de la página
    currentUser: null,
    profileOwnerUserId: null,
    profileData: null, // Guardaremos los datos del perfil aquí
    selectedPhotoFile: null,
    isFollowing: false, // NUEVO

    init: function() {
        this.cacheDOMElements();
        const urlParams = new URLSearchParams(window.location.search);
        const userIdFromUrl = urlParams.get('viewUserId');

        // La función dentro del .then() ahora es ASÍNCRONA
        ListopicApp.authService.onAuthStateChangedPromise().then(async (user) => {
            if (!user) {
                window.location.href = 'auth.html';
                return;
            }
            this.currentUser = user;
            this.profileOwnerUserId = userIdFromUrl || this.currentUser.uid;
            
            // PASO 1: ESPERAMOS a saber el estado de seguimiento (si no es nuestro perfil)
            if (this.currentUser.uid !== this.profileOwnerUserId) {
                await this.checkFollowStatus();
            }

            // PASO 2: AHORA SÍ, pintamos los botones con la información correcta.
            this.updateProfileButtons(); 
            
            // PASO 3: Cargamos el resto de la información y activamos listeners.
            this.loadUserProfileData();
            this.attachEventListeners();
        });
    },

    cacheDOMElements: function() {
        this.elements.profilePhotoDisplay = document.getElementById('profile-photo-display');
        this.elements.profilePicturePlaceholder = document.getElementById('profile-picture-placeholder');
        this.elements.displayNameElement = document.getElementById('profile-display-name');
        this.elements.usernameDisplayElement = document.getElementById('profile-username-display');
        this.elements.bioDisplayElement = document.getElementById('profile-bio-display');
        this.elements.locationDisplayElement = document.getElementById('profile-location-display');
        
        this.elements.listsToggleMain = document.getElementById('lists-toggle-main');
        this.elements.myListsUl = document.getElementById('my-lists-ul');
        this.elements.myReviewsContainer = document.getElementById('my-reviews-container'); // MODIFICADO
        this.elements.openEditModalBtn = document.getElementById('open-edit-profile-modal-btn');
        this.elements.followUnfollowBtn = document.getElementById('follow-unfollow-btn'); // NUEVO
        this.elements.openChatButton = document.getElementById('open-chat-button');
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
    
        // Dentro de cacheDOMElements en ListopicApp.pageProfile
        this.elements.photoModal = document.getElementById('photo-modal');
        this.elements.closePhotoModalBtn = document.getElementById('close-photo-modal-btn');
        this.elements.enlargedProfilePhoto = document.getElementById('enlarged-profile-photo');
    
        this.elements.profileTabs = document.querySelector('.profile-tabs'); // El contenedor de las pestañas
        this.elements.reviewsContent = document.getElementById('reviews-content');
        
        this.elements.listsToggleMain = document.getElementById('lists-toggle-main');
        this.elements.connectionsModal = document.getElementById('connections-modal');
        this.elements.closeConnectionsModalBtn = document.getElementById('close-connections-modal-btn');
        this.elements.connectionsTabs = document.getElementById('connections-tabs');
        this.elements.followersList = document.getElementById('followers-list');
        this.elements.followingList = document.getElementById('following-list');
        this.elements.modalListsUl = document.getElementById('modal-lists-ul');
        this.elements.listsToggle = document.getElementById('lists-toggle');
    },
    
    updateEditButtonVisibility: function() {
        if (this.elements.openEditModalBtn) {
            const isOwnProfile = this.currentUser && this.currentUser.uid === this.profileOwnerUserId;
            this.elements.openEditModalBtn.style.display = isOwnProfile ? 'inline-block' : 'none';
        }
    },

    updateProfileButtons: function() {
        // --- LÓGICA DE DEPURACIÓN ---
        // Forzamos ambos botones a ser visibles para ver si el problema es de la lógica o del renderizado.
        console.log("[DEBUG] Forzando botones a ser visibles para depuración.");
        const isOwnProfile = this.currentUser && this.currentUser.uid === this.profileOwnerUserId;
        
        if (this.elements.openEditModalBtn) {
            this.elements.openEditModalBtn.style.display = isOwnProfile ? 'inline-block' : 'none';
        }
        if (this.elements.followUnfollowBtn) {
            this.elements.followUnfollowBtn.style.display = isOwnProfile ? 'none' : 'inline-block';
        }
        if (this.elements.openChatButton) {
            this.elements.openChatButton.style.display = 'inline-block';
            this.elements.openChatButton.textContent = isOwnProfile ? 'Ir a mis chats' : 'Enviar mensaje';
        }
        // Cuando confirmemos que aparecen, volveremos a la lógica original.
    },

    // Dentro del objeto ListopicApp.pageProfile
    openPhotoModal: function() {
        if (this.elements.enlargedProfilePhoto && this.elements.photoModal && this.profileData.photoUrl) {
            this.elements.enlargedProfilePhoto.src = this.profileData.photoUrl;
            this.elements.photoModal.classList.add('active');
        }
    },

    closePhotoModal: function() {
        if (this.elements.photoModal) {
            this.elements.photoModal.classList.remove('active');
        }
    },

    attachEventListeners: function() {
        this.elements.openEditModalBtn?.addEventListener('click', () => this.openEditModal());
        this.elements.followUnfollowBtn?.addEventListener('click', () => this.handleFollowToggle()); // NUEVO
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
        // Dentro de attachEventListeners en ListopicApp.pageProfile
        this.elements.profilePhotoDisplay?.addEventListener('click', () => this.openPhotoModal());
        this.elements.openChatButton?.addEventListener('click', () => this.handleOpenChat());
        this.elements.closePhotoModalBtn?.addEventListener('click', () => this.closePhotoModal());
        this.elements.photoModal?.addEventListener('click', (event) => {
            if (event.target === this.elements.photoModal) {
                this.closePhotoModal();
        // Stats clicks
        document.getElementById('lists-count')?.parentElement?.addEventListener('click', () => this.openConnectionsModal('lists'));
        document.getElementById('followers-count')?.parentElement?.addEventListener('click', () => this.openConnectionsModal('followers'));
        document.getElementById('following-count')?.parentElement?.addEventListener('click', () => this.openConnectionsModal('following'));
        document.getElementById('reviews-count')?.parentElement?.addEventListener('click', () => {
            // Switch to reviews tab
            const tabBtn = document.querySelector('.profile-tab-button[data-tab="reviews"]');
            tabBtn?.click();
        });
        // Connections modal close and tab
        this.elements.closeConnectionsModalBtn?.addEventListener('click', () => this.closeConnectionsModal());
        this.elements.connectionsModal?.addEventListener('click', (e) => { if (e.target === this.elements.connectionsModal) this.closeConnectionsModal(); });
        this.elements.connectionsTabs?.addEventListener('click', (e) => {
            const btn = e.target.closest('.profile-tab-button'); if(!btn) return;
            const tab = btn.dataset.tab; this.showConnectionsTab(tab);
        });
            }
        });
        // Dentro de attachEventListeners en ListopicApp.pageProfile
        this.elements.listsStat?.addEventListener('click', () => {
            this.elements.reviewsTab.classList.remove('active');
            this.elements.listsTab.classList.add('active');
            this.elements.reviewsContent.style.display = 'none';
            this.elements.listsContent.style.display = 'block';
        });
        this.elements.profileTabs?.addEventListener('click', (event) => {
            const tabButton = event.target.closest('.profile-tab-button');
            if (!tabButton) return;

            const tabName = tabButton.dataset.tab;
        
            // Quitar 'active' de todos los botones y contenidos
            this.elements.profileTabs.querySelectorAll('.profile-tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.profile-tab-content').forEach(content => content.classList.remove('active'));
        
            // Añadir 'active' al botón y contenido correctos
            tabButton.classList.add('active');
            const activeContent = document.getElementById(`${tabName}-content`);
            if (activeContent) {
                activeContent.classList.add('active');
            }
        });
    },

    handleOpenChat: function() {
        if (!this.currentUser) {
            return;
        }
        const isOwnProfile = this.currentUser.uid === this.profileOwnerUserId;
        if (isOwnProfile) {
            window.location.href = 'chats.html';
            return;
        }
        if (this.profileOwnerUserId) {
            window.location.href = `chats.html?userId=${encodeURIComponent(this.profileOwnerUserId)}`;
        }
    },

    checkFollowStatus: async function() {
        if (this.currentUser.uid === this.profileOwnerUserId) return; // No necesitamos comprobar si es nuestro perfil
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
            btn.classList.add('secondary-button'); // O un estilo "activo" que prefieras
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

            // Actualizar estado y UI localmente para feedback instantáneo
            this.isFollowing = result.data.status === 'followed';
            this.updateFollowButtonUI();

            // Actualizar contador de seguidores en la página
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
                this.setupMainListsToggle && this.setupMainListsToggle();
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
    
            // --- INICIO DE LA MEJORA: ENRIQUECIMIENTO DE DATOS ---
            const reviewsData = [];
            reviewsSnapshot.forEach(doc => reviewsData.push({ id: doc.id, ...doc.data() }));
    
            const listIds = [...new Set(reviewsData.map(r => r.listId).filter(Boolean))];
            const placeIds = [...new Set(reviewsData.map(r => r.placeId).filter(Boolean))];
            const authorIds = [...new Set(reviewsData.map(r => r.userId).filter(Boolean))]; // <-- NUEVO
    
            const listPromises = listIds.map(id => ListopicApp.services.db.collection('lists').doc(id).get());
            const placePromises = placeIds.map(id => ListopicApp.services.db.collection('places').doc(id).get());
            const authorPromises = authorIds.map(id => ListopicApp.services.db.collection('users').doc(id).get()); // <-- NUEVO
            
            const [listDocs, placeDocs, authorDocs] = await Promise.all([ // <-- NUEVO
                Promise.all(listPromises), 
                Promise.all(placePromises),
                Promise.all(authorPromises) // <-- NUEVO
            ]);
            
            const listsMap = new Map(listDocs.map(doc => [doc.id, doc.data()]));
            const placesMap = new Map(placeDocs.map(doc => [doc.id, doc.data()]));
            const authorsMap = new Map(authorDocs.map(doc => [doc.id, doc.data()])); // <-- NUEVO
            
            const enrichedReviews = reviewsData.map(review => {
                const listData = listsMap.get(review.listId);
                const authorData = authorsMap.get(review.userId); // <-- NUEVO
                const placeData = placesMap.get(review.placeId); // <-- NUEVO
    
                return {
                    ...review,
                    listName: listData?.name || 'Lista Desconocida',
                    criteriaDefinition: listData?.criteriaDefinition || {},
                    // Objeto author completo
                    author: {                                        // <-- NUEVO
                        id: review.userId,
                        name: authorData?.displayName || authorData?.username || 'Usuario',
                        photoUrl: authorData?.photoUrl || 'img/placeholder-avatar.png'
                    },
                    // Objeto place completo
                    place: {                                         // <-- NUEVO
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
        if (!reviews || reviews.length === 0) {
            container.innerHTML = '<p>Este usuario aún no ha escrito ninguna reseña.</p>';
            return;
        }
        const ui = ListopicApp.uiUtils;
        const currentUid = (ListopicApp.services?.auth?.currentUser || {}).uid;
        reviews.forEach(r => {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = ui.renderReviewSuperCard(r);
            const article = wrapper.firstElementChild;
            if (article && currentUid && (r.author?.id === currentUid)) {
                const score = article.querySelector('.review-super-card__score');
                if (score) {
                    const menu = document.createElement('div');
                    menu.className = 'review-menu';
                    menu.innerHTML = `
                        <button class="review-menu__btn" title="Opciones"><i class="fas fa-ellipsis-h"></i></button>
                        <div class="review-menu__dropdown">
                            <button class="review-action" data-action="edit">Editar reseña</button>
                            <button class="review-action" data-action="share">Compartir</button>
                            <button class="review-action danger" data-action="delete">Eliminar</button>
                        </div>`;
                    score.appendChild(menu);
                    const btn = menu.querySelector('.review-menu__btn');
                    const dd = menu.querySelector('.review-menu__dropdown');
                    btn.addEventListener('click', (e)=>{ e.stopPropagation(); dd.classList.toggle('open'); });
                    menu.addEventListener('click', (e)=> e.stopPropagation());
                    dd.querySelectorAll('.review-action').forEach(actBtn => {
                        actBtn.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            const action = actBtn.dataset.action;
                            if (action === 'edit') {
                                window.location.href = `review-form.html?listId=${r.listId}&editId=${r.id}`;
                            } else if (action === 'share') {
                                const url = `${location.origin}${location.pathname.replace(/[^/]+$/, '')}detail-view.html?id=${r.id}&listId=${r.listId}`;
                                if (navigator.share) {
                                    try { await navigator.share({ title: 'Mi reseña en Listopic', url }); } catch(_){}
                                } else if (navigator.clipboard) {
                                    await navigator.clipboard.writeText(url);
                                    ListopicApp.services?.showNotification?.('Enlace copiado al portapapeles','success');
                                }
                            } else if (action === 'delete') {
                                if (!confirm('¿Eliminar esta reseña? Esta acción no se puede deshacer.')) return;
                                try {
                                    await ListopicApp.services.db.collection('lists').doc(r.listId).collection('reviews').doc(r.id).delete();
                                    article.remove();
                                    ListopicApp.services?.showNotification?.('Reseña eliminada','success');
                                } catch (err) {
                                    ListopicApp.services?.showNotification?.(err.message || 'Error eliminando reseña','error');
                                }
                            }
                            dd.classList.remove('open');
                        });
                    });
                }
            }
            container.appendChild(article);
        });
    }

};

console.log("page-profile.js: Script PARSEADO y EJECUTADO exitosamente.");







