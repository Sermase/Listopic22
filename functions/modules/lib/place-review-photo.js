// functions/modules/lib/place-review-photo.js
/**
 * Foto de respaldo para un sitio sin portada propia: la de la valoración pública con
 * mejor nota que tenga foto. Sin esto, el sitio salía en Buscar sin foto aunque sus
 * platos sí la tuvieran. Solo lo público: nunca una foto de una Lista privada.
 */

function isGooglePlacePhotoUrl(url) {
    const lower = url.toLowerCase();
    return lower.includes("maps.googleapis.com/maps/api/place/photo")
        || (lower.includes("places.googleapis.com") && lower.includes("/photos/"))
        || (lower.includes("googleapis.com") && lower.includes("place/photo"));
}

function usableUrl(value) {
    if (typeof value !== "string") return null;
    const url = value.trim();
    if (!/^https?:\/\//i.test(url) || url.length > 2048 || isGooglePlacePhotoUrl(url)) return null;
    return url;
}

function firstUsable(...values) {
    for (const value of values) {
        if (Array.isArray(value)) {
            const found = firstUsable(...value);
            if (found) return found;
            continue;
        }
        const url = usableUrl(value);
        if (url) return url;
    }
    return null;
}

function pickReviewPhoto(reviews) {
    let best = null;
    let bestRating = -Infinity;
    (Array.isArray(reviews) ? reviews : []).forEach((review) => {
        if (!review || review.visibility !== "public") return;
        const url = firstUsable(review.photoUrls, review.photoUrl);
        if (!url) return;
        const rating = typeof review.overallRating === "number" && Number.isFinite(review.overallRating) ? review.overallRating : 0;
        if (rating > bestRating) {
            best = url;
            bestRating = rating;
        }
    });
    return best;
}

module.exports = { pickReviewPhoto };
