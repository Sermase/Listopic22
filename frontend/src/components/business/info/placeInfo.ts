/** Lo que la Ficha necesita saber del lugar de Google (placeholder y «Google muestra: …»). */
export interface FichaPlaceInfo {
    name?: string;
    phone?: string;
    website?: string;
}

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/** Del documento `places/{placeId}` (los mismos campos que usa usePlaceDetails). */
export const fichaPlaceInfoFromDoc = (data: Record<string, unknown> | null | undefined): FichaPlaceInfo => ({
    name: text(data?.name),
    phone: text(data?.formattedPhoneNumber) || text(data?.internationalPhoneNumber),
    website: text(data?.websiteUri) || text(data?.website),
});
