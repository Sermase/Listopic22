window.ListopicApp = window.ListopicApp || {};

ListopicApp.pageProfile = {
    elements: {
        profilePicturePlaceholder: null,
        profilePictureImg: null,
        profilePictureIcon: null,
        displayName: null,
        email: null,
        myListsUl: null,
        myReviewsContainer: null,
        logoutButton: null,
        // Menu elements that might be on this page too
        userMenuLogoutButton: null,
    },

    init: function() {
        console.log("Profile page init");
        this.elements.profilePicturePlaceholder = document.getElementById('profile-picture-placeholder');
        // Assuming the placeholder has an img and an i tag initially, or we add them dynamically
        // For simplicity, let's assume the structure is:
        // <div id="profile-picture-placeholder">
        //   <i class="fas fa-user-circle" id="profile-icon-placeholder" style="font-size: 80px; color: var(--accent-color-primary);"></i>
        //   <img id="profile-image" src="" alt="Profile Picture" style="width: 100px; height: 100px; border-radius: 50%; display: none;">
        // </div>
        // We'll need to adjust the HTML or create these elements if they don't exist.
        // For now, directly get the planned icon from profile.html
        this.elements.profilePictureIcon = this.elements.profilePicturePlaceholder.querySelector('i');
        // Let's add an img tag dynamically for now if needed, or ensure it's in the HTML.
        // For now, let's assume an img tag will be dynamically created or use one if present.
        // To simplify, the HTML has a placeholder icon. We'll hide it and show an img if photoURL exists.


        this.elements.displayName = document.getElementById('profile-display-name');
        this.elements.email = document.getElementById('profile-email');
        this.elements.myListsUl = document.getElementById('my-lists-ul');
        this.elements.myReviewsContainer = document.getElementById('my-reviews-container');
        // this.elements.logoutButton = document.getElementById('logout-button'); // This ID was for a removed button
        // this.elements.userMenuLogoutButton = document.getElementById('user-menu-logout-button'); // This ID is from the old profile.html header menu

        // The logout button in the standardized header is #logoutBtnUserMenu and should be handled by a global listener in main.js or authService.js

        ListopicApp.authService.onAuthStateChangedPromise()
            .then(user => {
                if (user) {
                    this.displayUserData(user);
                    this.loadMyLists(); // Call to load lists
                    this.loadMyReviews(); // Call to load reviews
                } else {
                    console.log("User not logged in, redirecting to auth.html");
                    window.location.href = 'auth.html';
                }
            })
            .catch(error => {
                console.error("Error checking auth state:", error);
                ListopicApp.uiUtils.showFeedback('Error checking user status. Please try again.', 'error');
                // Potentially redirect if auth state is critical and unknown
                 window.location.href = 'auth.html';
            });

        if (this.elements.logoutButton) {
            this.elements.logoutButton.addEventListener('click', () => {
                ListopicApp.authService.logoutUser()
                    .then(() => {
                        // Redirect is handled by onAuthStateChanged in main.js or authService
                    })
                    .catch(error => {
                         ListopicApp.uiUtils.showFeedback(`Logout failed: ${error.message}`, 'error', 5000);
                    });
            });
        }

        // Removed event listener for 'user-menu-logout-button' as it's no longer the correct ID
        // and logout from the header menu should be handled globally.

        // Initial placeholder messages
        if (this.elements.myListsUl) {
            this.elements.myListsUl.innerHTML = '<li>Lists loading...</li>';
        }
        if (this.elements.myReviewsContainer) {
            this.elements.myReviewsContainer.innerHTML = '<p>Reviews loading...</p>';
        }
    },

    displayUserData: function(user) {
        if (!this.elements.displayName || !this.elements.email || !this.elements.profilePicturePlaceholder) {
            console.error("Profile page display elements not found.");
            return;
        }

        this.elements.displayName.textContent = user.displayName || 'N/A';
        this.elements.email.textContent = user.email || 'N/A';

        const iconElement = this.elements.profilePicturePlaceholder.querySelector('i.fa-user-circle'); // Get existing icon
        let imgElement = this.elements.profilePicturePlaceholder.querySelector('img.profile-image-dynamic');

        if (user.photoURL) {
            if (!imgElement) { // If img doesn't exist, create it
                imgElement = document.createElement('img');
                imgElement.alt = "Profile Picture";
                imgElement.className = "profile-image-dynamic"; // Use class for styling from CSS
                // Styles like width, height, border-radius should be in CSS
                this.elements.profilePicturePlaceholder.appendChild(imgElement);
            }
            imgElement.src = user.photoURL;
            imgElement.style.display = 'block';
            if (iconElement) iconElement.style.display = 'none'; // Hide icon if image is shown
        } else {
            if (iconElement) iconElement.style.display = 'block'; // Show icon
            // Be specific about hiding only the dynamically added profile image if no photoURL
            const dynamicImgElement = this.elements.profilePicturePlaceholder.querySelector('img.profile-image-dynamic');
            if (dynamicImgElement) dynamicImgElement.style.display = 'none';
        }
    },

    // Future helper functions for fetching/rendering lists and reviews
    // fetchUserLists: function(userId) { ... }
    // renderUserLists: function(lists) { ... }
    // fetchUserReviews: function(userId) { ... }
    // renderUserReviews: function(reviews) { ... }
};

// Initialize the page logic if on the profile page
// This relies on a global ListopicApp.currentPage being set, or a more robust routing.
// For now, let's assume if this script is loaded, it's the profile page.
// A better approach would be to have main.js call init based on current page.
// For this structure, we'll call init directly, assuming this file is only for profile.html
// Consider moving this to a more centralized page loading mechanism in main.js later.
// document.addEventListener('DOMContentLoaded', () => {
//    ListopicApp.pageProfile.init();
// });
// This will be called from main.js based on the body ID or a similar mechanism.
