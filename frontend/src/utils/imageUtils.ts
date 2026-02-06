
/**
 * Optimizes image URLs for performance by requesting smaller sizes or using thumbnails.
 * Supports Google Places/Photos and Firebase Storage.
 */
export const getOptimizedImageUrl = (url: string | null | undefined, width: number = 400): string | undefined => {
    if (!url) return undefined;

    // 1. Google User Content (lh3.googleusercontent.com, etc.)
    // These support dynamic resizing via appending =w{width}-h{height}-c (for crop) or just =w{width}
    if (url.includes('googleusercontent.com') || url.includes('lh3.google')) {
        // Remove existing params (everything after equality usually) if we want to override
        // But some URLs might rely on tokens. Usually Google params are appended at end.
        // Standard format: https://lh3.googleusercontent.com/...=s100

        // If it already has size params, stripe them
        const baseUrl = url.split('=')[0];
        return `${baseUrl}=w${width}`;
    }

    // 2. Google Maps API Photo References (fetched with getUrl/getURI)
    // Sometimes these are already optimal if fetched with maxWidth, but if we have the reference, we might not have control here.
    // If it's a direct maps.googleapis.com URL, it typically has valid signature which prevents tampering.
    // So we skip messing with signed URLs unless we know we can.

    // 3. Firebase Storage
    // Strategy: Predict the public thumbnail URL.
    // If the original is .../o/folder%2Fimage.jpg?alt=media&token=...
    // The thumb is .../o/folder%2Fimage_thumb_500.jpg?alt=media
    // We remove the token to rely on public access (rules allows read).

    if (url.includes('firebasestorage.googleapis.com')) {
        try {
            // Avoid double-thumbing
            if (url.includes('_thumb_')) return url;

            // 1. Parse the path from the URL
            const urlObj = new URL(url);
            // pathname is like /v0/b/bucket/o/folder%2Fimage.jpg
            const pathPart = urlObj.pathname.split('/o/')[1]; // folder%2Fimage.jpg
            if (!pathPart) return url;

            const decodedPath = decodeURIComponent(pathPart); // folder/image.jpg

            // 2. Insert _thumb_500 before extension
            const lastDotIndex = decodedPath.lastIndexOf('.');
            if (lastDotIndex === -1) return url; // No extension?

            const name = decodedPath.substring(0, lastDotIndex);
            const ext = decodedPath.substring(lastDotIndex); // .jpg
            const thumbPath = `${name}_thumb_500${ext}`;

            // 3. Reconstruct URL
            // We need to encode it back: folder%2Fimage_thumb_500.jpg
            const encodedThumbPath = encodeURIComponent(thumbPath);

            // Replace in original URL
            // We also STRIP the token because the thumb won't share the same token.
            // We assume public read access via rules.
            const newUrl = new URL(url);
            newUrl.pathname = newUrl.pathname.replace(pathPart, encodedThumbPath);
            newUrl.searchParams.delete('token'); // Remove token

            return newUrl.toString();

        } catch (e) {
            console.warn("Error predicting thumb url", e);
            return url;
        }
    }

    return url;
};
