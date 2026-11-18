// Sin Leaflet: lo usan también el mapa grande y otras vistas sin cargar el mapa.
import { useMemo, useState } from 'react';
import { normalizeItemName } from '../../lib/listElements';

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
    /** Emoji pequeño sobre la chincheta (premio «Chincheta propia» del dueño del mapa). */
    pinMark?: string;
    /** Miniatura del plato como chincheta (concursos): foto en un aro del color de su nota. */
    pinPhoto?: string;
    /** Línea bajo el nombre en la ficha (si no, el nº de reseñas). */
    subtitle?: string;
    /** Listas o categorías del sitio, para el filtro del mapa grande. */
    lists?: string[];
    /** Elementos del sitio en esta lista: la ficha enlaza a cada uno (no al sitio). */
    items?: MapSubItem[];
}

export interface MapSubItem {
    name: string;
    score: number;
    /** Página del elemento (p. ej. /group/{placeId}/{nombre}). */
    to?: string;
    photo?: string;
    /** Aspirante de concurso sin valorar. */
    pending?: boolean;
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
        pinMark: item.pinMark,
        pinPhoto: item.pinPhoto,
        subtitle: item.subtitle,
        // Solo listas: el campo «tags» de una reseña son sus etiquetas (Vegetariano…), no su lista.
        lists: item.lists ?? (item.listName ? [item.listName] : undefined),
        items: item.items
    }];
});


const signature = (items: MapItem[]) => items.map((i) => [
    i.id, i.placeId, i.lat, i.lng, i.name, i.photoUrl, i.rating, i.botRating, i.reviewsCount, i.emoji, i.color, i.pinMark, i.pinPhoto, i.subtitle,
    i.lists?.join(','), i.items?.map((sub) => `${sub.name}:${sub.score}:${sub.to ?? ''}:${sub.photo ?? ''}:${sub.pending ? 1 : 0}`).join(','),
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

export interface PopupView {
    title: string;
    subtitle?: string | null;
    photoUrl?: string | null;
    score?: number | null;
    /** null: la ficha no lleva a ningún sitio, se elige uno de sus elementos. */
    to: string | null;
    dishes: MapSubItem[];
}

/**
 * Ficha de un pin en el mapa de una Lista: con un solo elemento, ese elemento
 * (su foto, su nota y su página); con varios, el sitio con la foto de uno y la
 * lista de elementos para elegir. Sin elementos enlazables, el sitio.
 */
export function listPopupView(item: MapItem): PopupView {
    const dishes = (item.items ?? []).filter((d) => d.to);
    if (dishes.length === 1) {
        const [d] = dishes;
        return {
            title: d.name,
            subtitle: d.pending ? `🏆 Sin probar · ${item.name}` : item.name,
            photoUrl: d.photo || item.photoUrl,
            score: d.pending || d.score <= 0 ? null : d.score,
            to: d.to!,
            dishes: [],
        };
    }
    if (dishes.length > 1) {
        return {
            title: item.name,
            subtitle: `${dishes.length} elementos`,
            photoUrl: dishes.find((d) => d.photo)?.photo || item.photoUrl,
            score: item.rating,
            to: null,
            dishes,
        };
    }
    return { title: item.name, subtitle: item.subtitle, photoUrl: item.photoUrl, score: item.rating, to: `/place/${item.placeId || item.id}`, dishes: [] };
}

/** Página de un elemento (sitio + nombre). */
export const elementPath = (placeId: string, itemName: string, listId?: string): string =>
    `/group/${encodeURIComponent(placeId)}/${encodeURIComponent(itemName)}${listId ? `?listId=${encodeURIComponent(listId)}` : ''}`;

/**
 * Elementos de un sitio para la ficha del mapa: las valoraciones del mismo
 * elemento se juntan (nota media, primera foto) y los aspirantes sin probar van al final.
 */
export function dishesForPlace(
    placeId: string,
    reviewed: { name: string; score: number | null; photo?: string }[],
    pending: { name: string; photo?: string }[] = [],
    listId?: string,
): MapSubItem[] {
    // Misma clave que el ranking (sin tildes ni signos); la nota media solo con las que tienen nota.
    const byName = new Map<string, { name: string; sum: number; n: number; photo?: string }>();
    reviewed.forEach((r) => {
        const name = (r.name || '').trim();
        const key = normalizeItemName(name);
        if (!key) return;
        const entry = byName.get(key) ?? { name, sum: 0, n: 0 };
        if (typeof r.score === 'number' && Number.isFinite(r.score)) {
            entry.sum += r.score;
            entry.n += 1;
        }
        if (!entry.photo && r.photo) entry.photo = r.photo;
        byName.set(key, entry);
    });
    const done: MapSubItem[] = [...byName.values()]
        .map((e) => ({ name: e.name, score: e.n ? Number((e.sum / e.n).toFixed(2)) : 0, to: elementPath(placeId, e.name, listId), ...(e.photo ? { photo: e.photo } : {}) }))
        .sort((a, b) => b.score - a.score);
    const untried: MapSubItem[] = pending
        .filter((p) => normalizeItemName(p.name) && !byName.has(normalizeItemName(p.name)))
        .map((p) => ({ name: p.name.trim(), score: 0, pending: true, to: elementPath(placeId, p.name.trim(), listId), ...(p.photo ? { photo: p.photo } : {}) }));
    return [...done, ...untried];
}
