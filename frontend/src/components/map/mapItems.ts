// Sin Leaflet: lo usan también el mapa grande y otras vistas sin cargar el mapa.

export interface MapItem {
    id: string;
    placeId?: string; // Added field
    lat?: number;
    lng?: number;
    name: string;
    photoUrl?: string;
    rating?: number;
    /** Sitio sin nota pública pero con reseñas de bots: su media, que no cuenta. */
    botRating?: number | null;
    reviewsCount?: number;
    emoji?: string;
    color?: string;
    /** Línea bajo el nombre en la ficha (si no, el nº de reseñas). */
    subtitle?: string;
    /** Listas o categorías del sitio, para el filtro del mapa grande. */
    tags?: string[];
    items?: {
        name: string;
        score: number;
    }[];
}

export interface MapInputItem extends Partial<MapItem> {
    latitude?: number;
    longitude?: number;
    placeName?: string;
    placeMainImage?: string;
    mainImageUrl?: string;
    placeAverageRating?: number;
    overallRating?: number;
    avgRating?: number;
    reviewCount?: number;
    count?: number;
    listName?: string;
}

/** Deja cada entrada (sitio, reseña, resultado…) con la forma de MapItem; las que no tienen coordenadas se quedan fuera. */
export const normalizeMapItems = (items: MapInputItem[]): MapItem[] => items.flatMap((item, index) => {
    const lat = item.lat ?? item.latitude;
    const lng = item.lng ?? item.longitude;

    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return [];
    }

    return [{
        id: item.id ?? item.placeId ?? `map-item-${index}-${lat}-${lng}`,
        placeId: item.placeId, // Preserve placeId
        lat,
        lng,
        name: item.name ?? item.placeName ?? 'Lugar desconocido',
        photoUrl: item.photoUrl ?? item.placeMainImage ?? item.mainImageUrl,
        rating: item.rating ?? item.placeAverageRating ?? item.overallRating ?? item.avgRating ?? 0,
        botRating: item.botRating ?? null,
        reviewsCount: item.reviewsCount ?? item.reviewCount ?? item.count ?? 0,
        emoji: item.emoji,
        color: item.color,
        subtitle: item.subtitle,
        tags: item.tags ?? (item.listName ? [item.listName] : undefined),
        items: item.items
    }];
});

