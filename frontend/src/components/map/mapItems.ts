// Sin Leaflet: lo usan también el mapa grande y otras vistas sin cargar el mapa.
import { useMemo, useState } from 'react';

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
    lists?: string[];
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
        // Solo listas: el campo «tags» de una reseña son sus etiquetas (Vegetariano…), no su lista.
        lists: item.lists ?? (item.listName ? [item.listName] : undefined),
        items: item.items
    }];
});


const signature = (items: MapItem[]) => items.map((i) => [
    i.id, i.placeId, i.lat, i.lng, i.name, i.photoUrl, i.rating, i.botRating, i.reviewsCount, i.emoji, i.color, i.subtitle,
    i.lists?.join(','), i.items?.map((sub) => `${sub.name}:${sub.score}`).join(','),
].join('~')).join('|');

/**
 * normalizeMapItems estable: mientras los sitios sean los mismos devuelve el mismo array,
 * aunque quien llama cree uno nuevo en cada render. Si no, el mapa vuelve a encuadrar
 * (y deshace el zoom o el arrastre de la persona) cada vez que se pinta la página.
 */
export function useStableMapItems(items: MapInputItem[]): MapItem[] {
    const normalized = useMemo(() => normalizeMapItems(items), [items]);
    const sig = useMemo(() => signature(normalized), [normalized]);
    const [kept, setKept] = useState({ sig, items: normalized });
    if (kept.sig !== sig) {
        setKept({ sig, items: normalized });
        return normalized;
    }
    return kept.items;
}
