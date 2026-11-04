// Espejo público de users/{uid} (publicProfiles/{uid}): lo que cualquiera puede leer.
// Una sola lista para el trigger (social.js) y el rellenado de Developer (admin-users.js).

const PUBLIC_PROFILE_FIELDS = [
    "username",
    "usernameLower",
    "displayName",
    "name",
    "surnames",
    "bio",
    "location",
    "residence",
    "photoUrl",
    "photoStoragePath",
    "userType",
    "reviewsCount",
    "followersCount",
    "followingCount",
    "followingListsCount",
    "followingPlacesCount",
    "level",
    "xp",
    "badges",
    "badgeDates",
    // Premios de medallas que ven los demás (aro, chincheta, reseña fijada) y el color del aro.
    "abilityPrefs",
    "themePreference",
    "createdAt",
    "updatedAt",
];

function buildPublicProfile(uid, data = {}) {
    const publicProfile = { uid };
    for (const field of PUBLIC_PROFILE_FIELDS) {
        if (data[field] !== undefined) publicProfile[field] = data[field];
    }
    return publicProfile;
}

module.exports = { PUBLIC_PROFILE_FIELDS, buildPublicProfile };
