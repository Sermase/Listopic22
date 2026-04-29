export function isGooglePlacePhotoUrl(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const url = value.toLowerCase();
    return url.includes('maps.googleapis.com/maps/api/place/photo')
        || (url.includes('places.googleapis.com') && url.includes('/photos/'))
        || (url.includes('googleapis.com') && url.includes('place/photo'));
}

export function usablePlaceImageUrl(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const url = value.trim();
    if (!url || isGooglePlacePhotoUrl(url)) return undefined;
    return url;
}

export function firstUsablePlaceImage(...values: unknown[]): string | undefined {
    for (const value of values) {
        if (Array.isArray(value)) {
            const found = value.map(usablePlaceImageUrl).find(Boolean);
            if (found) return found;
            continue;
        }
        const url = usablePlaceImageUrl(value);
        if (url) return url;
    }
    return undefined;
}
