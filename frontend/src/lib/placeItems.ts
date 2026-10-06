/**
 * Elementos de la carta de un sitio (places/{placeId}/items) vistos desde el
 * cliente: a qué elemento pertenece una reseña y qué elemento corresponde a un
 * nombre de URL (/group/:placeId/:itemName).
 * Espejo simplificado de functions/modules/lib/canonical-resolve.js. Quien
 * manda es el servidor: al curar un elemento (renombre, fusión, mover una
 * valoración) reescribe el itemName de sus reseñas al nombre canónico, así que
 * esto solo cubre enlaces antiguos y datos aún sin reparar.
 */
import { normalizeItemName } from './listElements';

export interface PlaceItemLike {
    id: string;
    canonicalName?: unknown;
    status?: unknown;
    mergedInto?: unknown;
    source?: unknown;
    businessCreated?: unknown;
    curatedAliasesNormalized?: unknown;
    aliasesNormalized?: unknown;
    stats?: { reviewCount?: unknown } | null;
}

export interface ReviewItemRef {
    itemName?: unknown;
    itemNameOriginal?: unknown;
    canonicalItemId?: unknown;
    canonicalItemFor?: unknown;
}

const MAX_MERGE_HOPS = 5;

/** Id del documento de item para un nombre (mismo slug que el backend). */
export function itemDocIdFromName(name: unknown): string {
    const normalized = normalizeItemName(name);
    return normalized
        ? normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 140)
        : 'sin-nombre';
}

/**
 * Clave para comparar nombres de elemento. Igual que la agrupación de las
 * Listas; si el nombre no deja nada (寿司, 🍺) se compara el texto tal cual.
 */
export function itemNameKey(name: unknown): string {
    return normalizeItemName(name) || String(name ?? '').trim().toLowerCase();
}

const safeDocId = (value: unknown): string => (
    typeof value === 'string' ? value.trim().replace(/\//g, '-').slice(0, 300) : ''
);

const stringList = (value: unknown): string[] => (
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : []
);

const reviewTypedName = (review: ReviewItemRef): string => {
    if (typeof review.itemName === 'string' && review.itemName) return review.itemName;
    return typeof review.itemNameOriginal === 'string' ? review.itemNameOriginal : '';
};

/**
 * Elemento al que pertenece una reseña: canonicalItemId mientras siga valiendo
 * para su nombre actual y, si no, el slug del nombre.
 * Sin canonicalItemFor es un enlace antiguo (mover/fusionar de antes) y se
 * respeta; con él, deja de valer en cuanto el autor cambia el nombre.
 */
export function reviewItemId(review: ReviewItemRef): string {
    const name = reviewTypedName(review);
    const pinned = safeDocId(review.canonicalItemId);
    if (pinned) {
        const pinnedFor = review.canonicalItemFor;
        if (pinnedFor === undefined || pinnedFor === null || pinnedFor === normalizeItemName(name)) return pinned;
    }
    return itemDocIdFromName(name);
}

/** Sigue mergedInto desde un elemento inactivo hasta uno vivo (máx. 5 saltos, sin ciclos). */
export function followMergedItem<T extends PlaceItemLike>(item: T, byId: ReadonlyMap<string, T>): T | null {
    let current: T | undefined = item;
    const seen = new Set<string>();
    for (let hop = 0; current && hop <= MAX_MERGE_HOPS; hop += 1) {
        if (current.status !== 'inactive') return current;
        seen.add(current.id);
        const next = safeDocId(current.mergedInto);
        if (!next || seen.has(next)) return null;
        current = byId.get(next);
    }
    return null;
}

const isCurated = (item: PlaceItemLike): boolean => item.source === 'business'
    || item.businessCreated === true
    || stringList(item.curatedAliasesNormalized).length > 0;

const reviewCountOf = (item: PlaceItemLike): number => {
    const count = item.stats?.reviewCount;
    return typeof count === 'number' && Number.isFinite(count) ? count : 0;
};

const byId = (a: PlaceItemLike, b: PlaceItemLike) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Elemento vivo que corresponde a un nombre: su nombre canónico o un alias
 * curado (renombres y fusiones), después un elemento fusionado que lleve a
 * otro, después los nombres escritos en sus reseñas y, por último, el slug
 * (el id no cambia al renombrar). Null si no hay ninguno.
 */
export function resolvePlaceItemByName<T extends PlaceItemLike>(items: readonly T[], name: unknown): T | null {
    const target = normalizeItemName(name);
    if (!target) return null;
    const slug = itemDocIdFromName(name);
    const itemsById = new Map(items.map((item) => [item.id, item] as const));
    const canonicalOf = (item: T) => normalizeItemName(item.canonicalName);
    const curatedOf = (item: T) => stringList(item.curatedAliasesNormalized).map(normalizeItemName);
    const derivedOf = (item: T) => stringList(item.aliasesNormalized).map(normalizeItemName);
    const live = items.filter((item) => item.status !== 'inactive');

    // 1. Nombre canónico o alias curado; mismo desempate que el índice del servidor.
    const claimed = live.filter((item) => canonicalOf(item) === target || curatedOf(item).includes(target));
    if (claimed.length > 0) {
        const rank = (item: T) => [
            isCurated(item) ? 0 : 1,
            canonicalOf(item) === target ? 0 : 1,
            item.id === slug ? 0 : 1,
        ];
        return [...claimed].sort((a, b) => {
            const ra = rank(a);
            const rb = rank(b);
            for (let i = 0; i < ra.length; i += 1) {
                if (ra[i] !== rb[i]) return ra[i] - rb[i];
            }
            return byId(a, b);
        })[0];
    }

    // 2. Un elemento fusionado lleva a su destino.
    const merged = items
        .filter((item) => item.status === 'inactive' && safeDocId(item.mergedInto))
        .filter((item) => canonicalOf(item) === target || curatedOf(item).includes(target) || derivedOf(item).includes(target))
        .sort(byId);
    for (const item of merged) {
        const destination = followMergedItem(item, itemsById);
        if (destination) return destination;
    }

    // 3. Nombres escritos en las reseñas: el elemento con más valoraciones.
    const derived = live
        .filter((item) => derivedOf(item).includes(target))
        .sort((a, b) => reviewCountOf(b) - reviewCountOf(a) || byId(a, b));
    if (derived.length > 0) return derived[0];

    // 4. Slug del nombre.
    const bySlug = itemsById.get(slug);
    return bySlug ? followMergedItem(bySlug, itemsById) : null;
}
