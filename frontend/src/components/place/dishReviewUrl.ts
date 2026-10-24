/**
 * Enlace al flujo de reseña con el plato ya fijado: sitio, nombre del
 * plato y, si se conoce, la lista donde se valora. CreateReviewPage lee estos
 * parámetros y bloquea el plato (y la lista cuando viene).
 */
export function dishReviewUrl(placeId: string, itemName: string, listId?: string | null): string {
    const params = new URLSearchParams();
    params.set('placeId', placeId);
    params.set('itemName', itemName.trim());
    const list = listId?.trim();
    if (list) params.set('listId', list);
    return `/create-review?${params.toString()}`;
}
