import { getCanonicalPlaceItems, type CanonicalPlaceItem } from '../../../services/CanonicalItemService';
import {
    getPlaceReviewsForManager,
    rebuildPlaceItems,
    type ManagerPlaceReview,
} from '../../../services/BusinessProService';

// Carta del sitio para elegir elementos. Si hay reseñas (de cualquiera, bots incluidos)
// cuyo elemento no está en places/{id}/items (sitios anteriores a la carta persistida),
// se reconstruye una sola vez por sesión y negocio (aquí y en la gestión de la carta)
// y se vuelve a leer.
const healedPlaces = new Set<string>();

/** Con los elementos y reseñas ya leídos: reconstruye si hace falta y devuelve los elementos. */
export const healPlaceItems = async (
    placeId: string,
    itemRows: CanonicalPlaceItem[],
    reviewRows: ManagerPlaceReview[],
): Promise<CanonicalPlaceItem[]> => {
    const knownIds = new Set(itemRows.map((item) => item.id));
    const hasOrphans = reviewRows.some((review) => review.itemName && !knownIds.has(review.itemId));
    if (!hasOrphans || healedPlaces.has(placeId)) return itemRows;
    healedPlaces.add(placeId);
    try {
        await rebuildPlaceItems(placeId);
        return await getCanonicalPlaceItems(placeId);
    } catch (error) {
        console.warn('getPlaceItemsHealed: rebuild failed', error);
        return itemRows;
    }
};

export const getPlaceItemsHealed = async (placeId: string): Promise<CanonicalPlaceItem[]> => {
    const [itemRows, reviewRows] = await Promise.all([
        getCanonicalPlaceItems(placeId),
        getPlaceReviewsForManager(placeId).catch(() => [] as ManagerPlaceReview[]),
    ]);
    return healPlaceItems(placeId, itemRows, reviewRows);
};

/** Solo para tests: olvida qué negocios ya se reconstruyeron. */
export const resetHealedPlacesForTests = () => healedPlaces.clear();
