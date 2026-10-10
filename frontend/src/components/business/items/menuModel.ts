/**
 * Modelo de la carta en el cliente: ficha completa de un plato, orden dentro
 * de cada sección (el mismo que la carta pública) y agrupación por secciones.
 *
 *   const data = itemBusinessDataFrom(item);            // SIEMPRE completa al guardar
 *   const { sections, unsectioned } = buildBoard(items, sectionNames);
 *   itemsFor(items, 'Postres');                          // platos de esa sección, en orden
 */
import type { CanonicalPlaceItem } from '../../../services/CanonicalItemService';
import {
    normalizeItemName,
    type ItemBusinessData,
    type ItemProposal,
} from '../../../services/BusinessProService';

export const MAX_MENU_SECTIONS = 20;
/** Contenedor del tablero para los platos sin sección (o de una sección que ya no existe). */
export const UNSECTIONED = '__none__';

/** Ids de @dnd-kit: zona de soltar de una sección (o del cajón) y sección arrastrable. */
export const containerDndId = (key: string) => `container:${key}`;
export const sectionDndId = (name: string) => `sec:${name}`;

const readString = (raw: Record<string, unknown>, key: string): string => (typeof raw[key] === 'string' ? raw[key] as string : '');

/**
 * La ficha completa de un plato tal y como está. El servidor reconstruye todos
 * los campos al guardar, así que cualquier cambio sale de aquí + el campo nuevo.
 */
export const itemBusinessDataFrom = (item: CanonicalPlaceItem | null | undefined): ItemBusinessData => {
    const raw = (item?.businessData || {}) as Record<string, unknown>;
    return {
        group: readString(raw, 'group'),
        price: readString(raw, 'price'),
        discount: readString(raw, 'discount'),
        ingredients: readString(raw, 'ingredients'),
        description: readString(raw, 'description'),
        allergens: Array.isArray(raw.allergens)
            ? raw.allergens.filter((entry): entry is string => typeof entry === 'string')
            : [],
        available: raw.available !== false,
        menuOrder: typeof raw.menuOrder === 'number' && Number.isFinite(raw.menuOrder) ? raw.menuOrder : null,
    };
};

export const itemGroupOf = (item: CanonicalPlaceItem): string => readString((item.businessData || {}) as Record<string, unknown>, 'group');

export const itemNameOf = (item: Pick<CanonicalPlaceItem, 'id' | 'canonicalName'>): string => item.canonicalName || item.id;

export const ratingOf = (item: CanonicalPlaceItem): number | null => (
    typeof item.stats?.averageRating === 'number' ? item.stats.averageRating : null
);

export const reviewCountOf = (item: CanonicalPlaceItem): number => (
    typeof item.stats?.reviewCount === 'number' ? item.stats.reviewCount : 0
);

export interface MenuSortable {
    menuOrder?: number | null;
    rating: number | null;
    name: string;
}

/**
 * Orden dentro de una sección (igual en la carta pública): primero los que el
 * negocio ordenó (menuOrder), después por nota y por nombre.
 */
export const compareMenuRows = (a: MenuSortable, b: MenuSortable): number => {
    const aOrdered = typeof a.menuOrder === 'number';
    const bOrdered = typeof b.menuOrder === 'number';
    if (aOrdered && bOrdered && a.menuOrder !== b.menuOrder) return (a.menuOrder as number) - (b.menuOrder as number);
    if (aOrdered !== bOrdered) return aOrdered ? -1 : 1;
    return (b.rating ?? -1) - (a.rating ?? -1) || a.name.localeCompare(b.name, 'es');
};

const sortableOf = (item: CanonicalPlaceItem): MenuSortable => ({
    menuOrder: itemBusinessDataFrom(item).menuOrder,
    rating: ratingOf(item),
    name: itemNameOf(item),
});

export const sortForMenu = (rows: CanonicalPlaceItem[]): CanonicalPlaceItem[] => (
    [...rows].sort((a, b) => compareMenuRows(sortableOf(a), sortableOf(b)))
);

/** Platos de una sección, en el orden de la carta. */
export const itemsFor = (items: CanonicalPlaceItem[], sectionName: string): CanonicalPlaceItem[] => (
    sortForMenu(items.filter((item) => itemGroupOf(item) === sectionName))
);

/** Sin sección o con una sección que ya no está en la carta. */
export const isUnsectioned = (item: CanonicalPlaceItem, sectionNames: readonly string[]): boolean => {
    const group = itemGroupOf(item);
    return !group || !sectionNames.includes(group);
};

export interface MenuBoardData {
    sections: Array<{ name: string; items: CanonicalPlaceItem[] }>;
    unsectioned: CanonicalPlaceItem[];
}

export const buildBoard = (items: CanonicalPlaceItem[], sectionNames: readonly string[]): MenuBoardData => ({
    sections: sectionNames.map((name) => ({ name, items: itemsFor(items, name) })),
    unsectioned: sortForMenu(items.filter((item) => isUnsectioned(item, sectionNames))),
});

/** Ids de platos por contenedor del tablero (secciones y UNSECTIONED), en orden. */
export type BoardContainers = Record<string, string[]>;

/** Lo que cambia de un plato al soltarlo: su sección ('' = sin sección) y su sitio en ella. */
export interface MenuItemMove {
    itemId: string;
    group: string;
    menuOrder: number | null;
}

/**
 * Platos que hay que guardar al soltar `itemId` en `target`, comparando el
 * tablero de antes de arrastrar (`before`) con el de después (`after`):
 * - en el cajón «Sin sección» solo cambia su sección (no tiene orden público);
 * - en una sección, cada plato que no tenga ya esa sección y ese puesto
 *   (menuOrder = su posición), para que la carta pública salga igual;
 * - nada si el plato vuelve a donde estaba.
 */
export const planDropMoves = (
    itemId: string,
    target: string,
    before: BoardContainers,
    after: BoardContainers,
    itemsById: ReadonlyMap<string, CanonicalPlaceItem>,
): MenuItemMove[] => {
    const origin = Object.keys(before).find((key) => before[key].includes(itemId)) ?? null;
    if (target === UNSECTIONED) {
        return origin !== UNSECTIONED && itemsById.has(itemId) ? [{ itemId, group: '', menuOrder: null }] : [];
    }
    const list = after[target] || [];
    const previous = before[target] || [];
    const sameSpot = origin === target && list.length === previous.length && list.every((id, index) => previous[index] === id);
    if (sameSpot) return [];
    return list.flatMap((id, index) => {
        const item = itemsById.get(id);
        if (!item) return [];
        const unchanged = itemGroupOf(item) === target && itemBusinessDataFrom(item).menuOrder === index;
        return unchanged ? [] : [{ itemId: id, group: target, menuOrder: index }];
    });
};

/** Mismo orden que getCanonicalPlaceItems: más valoraciones primero y luego por nombre. */
export const sortPlaceItems = (rows: CanonicalPlaceItem[]): CanonicalPlaceItem[] => [...rows].sort((a, b) =>
    reviewCountOf(b) - reviewCountOf(a) || itemNameOf(a).localeCompare(itemNameOf(b), 'es'));

const curatedAliasesOf = (item: CanonicalPlaceItem): string[] => {
    const raw = (item as { curatedAliasesNormalized?: unknown }).curatedAliasesNormalized;
    return Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === 'string') : [];
};

/**
 * El plato de la carta que ya tiene ese nombre (su nombre o uno de sus nombres
 * curados, como hace el servidor al dar de alta). Null si está libre.
 */
export const findItemByName = (
    items: CanonicalPlaceItem[],
    name: string,
    exceptItemId?: string,
): CanonicalPlaceItem | null => {
    const typed = name.trim();
    if (!typed) return null;
    const normalized = normalizeItemName(typed);
    return items.find((item) => {
        if (item.id === exceptItemId || item.status === 'inactive') return false;
        if (!normalized) return itemNameOf(item).trim().toLowerCase() === typed.toLowerCase();
        return normalizeItemName(itemNameOf(item)) === normalized
            || curatedAliasesOf(item).some((alias) => normalizeItemName(alias) === normalized);
    }) || null;
};

/** «12 oct 2026». */
export const formatReviewDate = (ms: number): string => {
    if (!ms) return '';
    return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Nota con coma: 8,6 · 10 · —. */
export const formatScoreEs = (score: number | null | undefined): string => {
    if (typeof score !== 'number' || !Number.isFinite(score)) return '—';
    return Number.isInteger(score) ? String(score) : score.toFixed(1).replace('.', ',');
};

export type ProposalWhen = 'today' | 'week' | 'older';

export const PROPOSAL_WHEN_LABELS: Record<ProposalWhen, string> = {
    today: 'Hoy',
    week: 'Esta semana',
    older: 'Antes',
};

/** Hoy, los últimos 7 días o antes (para la línea de tiempo del historial). */
export const proposalWhen = (createdAtMs: number, now: Date = new Date()): ProposalWhen => {
    if (!createdAtMs) return 'older';
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (createdAtMs >= startOfToday) return 'today';
    if (createdAtMs >= startOfToday - (6 * 24 * 60 * 60 * 1000)) return 'week';
    return 'older';
};

export const groupProposalsByWhen = (proposals: ItemProposal[], now: Date = new Date()) => {
    const groups: Record<ProposalWhen, ItemProposal[]> = { today: [], week: [], older: [] };
    proposals.forEach((proposal) => groups[proposalWhen(proposal.createdAtMs, now)].push(proposal));
    return (['today', 'week', 'older'] as const)
        .map((when) => ({ when, label: PROPOSAL_WHEN_LABELS[when], proposals: groups[when] }))
        .filter((group) => group.proposals.length > 0);
};

const reviewedKey = (placeId: string) => `listopic_carta_sin_alergenos:${placeId}`;

/**
 * Platos marcados «✅ Revisado: sin alérgenos» en este navegador. Solo cuenta
 * para el progreso; no se guarda en el servidor ni sale en la carta.
 */
export const readReviewedNoAllergens = (placeId: string): Set<string> => {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(reviewedKey(placeId)) || '[]');
        return new Set(Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []);
    } catch {
        return new Set();
    }
};

export const writeReviewedNoAllergens = (placeId: string, ids: ReadonlySet<string>): void => {
    try {
        localStorage.setItem(reviewedKey(placeId), JSON.stringify(Array.from(ids)));
    } catch {
        // Sin almacenamiento: dura lo que dure la página.
    }
};

/** Una lista en trozos (lotes de updateBusinessMenuItems). */
export const chunk = <T,>(rows: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
    return out;
};
