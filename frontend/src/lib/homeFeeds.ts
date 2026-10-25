/**
 * homeFeeds: carruseles de la Home («La lista del momento» y los carruseles de
 * descubrimiento), siempre dentro de la zona elegida y rotando cada día.
 *
 * Puro: sin React, sin Firestore, sin Math.random ni Date.now. Todo sale de los
 * datos que la Home ya ha leído (cero lecturas extra) y de una semilla de texto
 * (la fecha local 'YYYY-MM-DD' + la zona), así el contenido no salta en cada
 * render pero cambia de un día a otro y de una zona a otra.
 *
 * API
 *   buildHomeFeeds(input: HomeFeedsInput): HomeFeedsResult
 *       { featuredList, feeds: [{ id, title, subtitle, kind, items }] } con los
 *       carruseles en el orden en que se pintan. Un carrusel con menos de
 *       `minItems` tarjetas no se devuelve. Ninguna tarjeta (ni su sitio) se
 *       repite entre carruseles ni con `exclude` (p. ej. el top del ranking).
 *   buildListAreaStats(reviews, lists, botUserIds): ListAreaStats[]
 *       Actividad de cada lista DENTRO de la zona, contada con sus reseñas en
 *       `reviews` (ya filtradas por zona). Una lista sin reseñas en la zona no
 *       aparece (nunca se usa su reviewCount global). Sirve también a «Sorpresa».
 *   homeFeedAreaKey(area: ListArea, rangeKm: number | null): string
 *   isJunkName(value: unknown): boolean
 *   hashString(value: string): number            FNV-1a 32 bits
 *   mulberry32(seed: number): () => number        generador [0, 1)
 *   seededWeightedOrder(items, idOf, weightOf, seed): T[]
 *   previousDaySeed(seed: string): string | null  '2026-10-15' → '2026-10-14'
 */
import { compareByRank, rankPosition } from './scoring';
import { encodeArea, type ListArea } from './geoAreas';
import { DAY_MS, toMillis } from '../utils/adminTime';

// --- Tipos de entrada (lo que ya hay en la Home) ------------------------------

export interface HomeFeedReview {
    id: string;
    listId?: string | null;
    placeId?: string | null;
    itemName?: string | null;
    comment?: string | null;
    overallRating?: unknown;
    photoUrl?: string | null;
    photoUrls?: unknown;
    userId?: string | null;
    authorId?: string | null;
    authorName?: string | null;
    authorPhoto?: string | null;
    createdAt?: unknown;
    reactionCounts?: { like?: unknown; love?: unknown; useful?: unknown } | null;
    visibility?: string | null;
    listName?: string | null;
    categoryId?: string | null;
    placeName?: string | null;
    placeMainImage?: string | null;
    placeAverageRating?: unknown;
    placeReviewsCount?: unknown;
    placeClosedStatus?: string | null;
}

export interface HomeFeedPlace {
    id?: string | null;
    placeId?: string | null;
    name?: string | null;
    photoUrl?: string | null;
    rating?: unknown;
    /** Reseñas públicas reales del sitio (enriquecido desde la reseña). */
    placeReviewsCount?: unknown;
    /** Recuento de respaldo (en sitios sacados de reseñas: las cargadas). */
    reviewsCount?: unknown;
    closedStatus?: string | null;
}

export interface HomeFeedList {
    id: string;
    name?: string | null;
    userId?: string | null;
    isPublic?: boolean | null;
    visibility?: string | null;
    parentListId?: string | null;
    categoryId?: string | null;
    mainImageUrl?: string | null;
    thumbnailUrl?: string | null;
    coverUrl?: string | null;
    photoUrl?: string | null;
    imageUrl?: string | null;
}

export interface HomeFeedUser {
    uid: string;
    displayName?: string | null;
    username?: string | null;
    photoUrl?: string | null;
    userType?: unknown;
}

export interface HomeFeedsInput {
    /** Reseñas ya filtradas por zona/radio y categoría (reviewsInRange). */
    reviews: ReadonlyArray<HomeFeedReview>;
    /** Sitios de la zona (filteredPlaces): aportan nota y recuento públicos. */
    places?: ReadonlyArray<HomeFeedPlace>;
    /** Metadatos de listas (nombre, portada, autor). Nunca deciden la zona. */
    lists?: ReadonlyArray<HomeFeedList>;
    /** Perfiles conocidos: nombre/foto de autores y detección de bots. */
    users?: ReadonlyArray<HomeFeedUser>;
    botUserIds?: Iterable<string>;
    /** Semilla del día, p. ej. '2026-10-15'. */
    seed: string;
    /** Zona (homeFeedAreaKey): misma fecha, zona distinta → otra rotación. */
    areaKey?: string;
    /** Usuario que mira (para no recomendarle tanto lo que ya probó). */
    userId?: string | null;
    /** Ahora en ms. Si falta y la semilla es una fecha, se usa su mediodía. */
    now?: number;
    /** Ya visible en otro bloque (ranking): no se repite en los carruseles. */
    exclude?: { placeIds?: Iterable<string>; dishKeys?: Iterable<string>; listIds?: Iterable<string> };
    /** Tarjetas mínimas para mostrar un carrusel (por defecto 3; listas 2). */
    minItems?: number;
    /** Reseñas antiguas del propio usuario (también privadas), ya filtradas por zona: «Recuerdos». */
    memories?: ReadonlyArray<HomeFeedReview>;
    /** Solo estos carruseles: los demás ni se calculan ni se quedan sitios que los visibles necesitan. */
    only?: ReadonlyArray<string>;
}

// --- Tipos de salida ----------------------------------------------------------

export type HomeFeedKind = 'dish' | 'place' | 'list' | 'review';

export interface HomeFeedCard {
    /** Clave única entre todos los carruseles: 'dish:…', 'place:…', 'list:…', 'review:…'. */
    key: string;
    kind: HomeFeedKind;
    /** Id de la entidad: clave de plato, placeId, listId o id de reseña. */
    id: string;
    title: string;
    subtitle?: string;
    badge?: string;
    photoUrl: string | null;
    /** Media real mostrada (o la nota de la reseña). */
    rating: number | null;
    /** Reseñas que respaldan la media (en la zona o públicas del sitio). */
    count: number;
    /** Ruta de la tarjeta: /list/:id, /place/:id, /group/:placeId/:item, /profile/:uid. */
    to: string;
    placeId?: string;
    placeName?: string;
    itemName?: string;
    listId?: string;
    listName?: string;
    authorId?: string;
    authorName?: string;
    authorPhoto?: string | null;
    comment?: string;
    createdAt?: number;
    /** Puesto en un ranking (1, 2, 3…). */
    rank?: number;
}

export interface HomeFeed {
    id: string;
    title: string;
    subtitle?: string;
    kind: HomeFeedKind;
    items: HomeFeedCard[];
    /** Destino de «Ver todo» cuando no es una búsqueda (la lista, tu perfil). */
    viewAllTo?: string;
}

export interface FeaturedListCard extends HomeFeedCard {
    kind: 'list';
    inAreaReviews: number;
    inAreaPlaces: number;
    inAreaAuthors: number;
    parentListId?: string;
    categoryId?: string;
}

export interface HomeFeedsResult {
    featuredList: FeaturedListCard | null;
    feeds: HomeFeed[];
}

// --- Azar con semilla ---------------------------------------------------------

/** FNV-1a de 32 bits. */
export function hashString(value: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/** Generador determinista en [0, 1). */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Orden aleatorio ponderado con semilla (Efraimidis-Spirakis): lo de más peso
 * suele ir delante pero rota con la semilla. Cada elemento tira su propio dado
 * (semilla + id), así añadir o quitar uno no baraja a los demás.
 */
export function seededWeightedOrder<T>(
    items: ReadonlyArray<T>,
    idOf: (item: T) => string,
    weightOf: (item: T) => number,
    seed: string,
): T[] {
    return items
        .map((item) => {
            const id = idOf(item);
            const u = mulberry32(hashString(`${seed}|${id}`))() || 1e-12;
            const w = weightOf(item);
            const weight = Number.isFinite(w) && w > 0 ? w : 1e-6;
            return { item, id, key: Math.log(u) / weight };
        })
        .sort((a, b) => (b.key - a.key) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((entry) => entry.item);
}

const DATE_SEED = /^(\d{4})-(\d{2})-(\d{2})/;

/** Semilla del día anterior si la semilla empieza por 'YYYY-MM-DD'. */
export function previousDaySeed(seed: string): string | null {
    const match = DATE_SEED.exec(seed);
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (!Number.isFinite(date.getTime())) return null;
    date.setUTCDate(date.getUTCDate() - 1);
    const iso = date.toISOString().slice(0, 10);
    return iso + seed.slice(10);
}

/** Clave de zona para la semilla: 'near:5', 'near:all', 'city:Madrid'… */
export function homeFeedAreaKey(area: ListArea, rangeKm: number | null): string {
    return area.kind === 'near' ? `near:${rangeKm ?? 'all'}` : encodeArea(area).toLowerCase();
}

// --- Nombres basura -----------------------------------------------------------

const LETTER = /\p{L}/u;
const LATIN = /\p{Script=Latin}/u;
const VOWEL = /[aeiouyáéíóúàèìòùäëïöüâêîôû]/i;
const PLACEHOLDER = /^(test|testing|prueba|pruebas|asdf\w*|qwer\w*|lorem ipsum|xxx+|aaa+)[\s\d._-]*$/i;

/**
 * Conservador: solo marca lo claramente basura (pruebas, teclazos). Basura si
 * * tiene menos de 2 letras, una letra repetida 4+ veces, una palabra placeholder
 * («test», «prueba 2», «asdf»), y, en alfabeto latino, ninguna vocal con 4+
 * letras o 7+ consonantes seguidas.
 */
export function isJunkName(value: unknown): boolean {
    if (typeof value !== 'string') return true;
    const text = value.trim();
    const letters = Array.from(text).filter((ch) => LETTER.test(ch));
    if (letters.length < 2) return true;
    if (/(\p{L})\1{3,}/u.test(text.toLowerCase())) return true;
    if (PLACEHOLDER.test(text)) return true;
    // Vocales y consonantes solo dicen algo en alfabeto latino («ラーメン» o «Борщ» son nombres buenos).
    if (!letters.every((ch) => LATIN.test(ch))) return false;
    const words = text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
    if (letters.length >= 4 && !VOWEL.test(words.join(''))) return true;
    if (words.some((word) => /[bcdfghjklmnñpqrstvwxz]{7,}/.test(word))) return true;
    return false;
}

// --- Normalización ------------------------------------------------------------

const num = (value: unknown): number => {
    const n = typeof value === 'string' ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};
const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const round1 = (value: number): number => Math.round(value * 10) / 10;
const fmt = (value: number): string => round1(value).toFixed(1).replace('.', ',');
const log2p = (value: number): number => Math.log2(1 + Math.max(0, value));
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

const reviewPhoto = (review: HomeFeedReview): string | null => {
    if (Array.isArray(review.photoUrls)) {
        const first = review.photoUrls.find((url) => typeof url === 'string' && url.trim());
        if (typeof first === 'string') return first;
    }
    return str(review.photoUrl) || null;
};

const listImage = (list: HomeFeedList | undefined): string | null =>
    (list && (str(list.mainImageUrl) || str(list.coverUrl) || str(list.photoUrl) || str(list.thumbnailUrl) || str(list.imageUrl))) || null;

/** Cierre definitivo, venga del campo propio o del estado de Google. */
export const isPermanentlyClosed = (status: unknown): boolean => {
    const value = typeof status === 'string' ? status.trim().toLowerCase() : '';
    return value === 'permanently_closed' || value === 'closed_permanently';
};

export const dishKeyOf = (placeId: string, itemName: string): string => `${placeId}::${itemName.trim().toLowerCase()}`;
const groupPath = (placeId: string, itemName: string): string => `/group/${placeId}/${encodeURIComponent(itemName)}`;

interface CleanReview {
    id: string;
    listId: string;
    placeId: string;
    dishKey: string;
    itemName: string;
    placeName: string;
    rating: number;
    photo: string | null;
    comment: string;
    authorId: string;
    authorName: string;
    authorPhoto: string | null;
    createdAt: number;
    reactions: number;
    listName: string;
    categoryId: string;
    placeImage: string | null;
    placePublicAvg: number;
    placePublicCount: number;
}

function cleanReviews(reviews: ReadonlyArray<HomeFeedReview>, bots: Set<string>, allowPrivate = false): CleanReview[] {
    const out: CleanReview[] = [];
    const seen = new Set<string>();
    reviews.forEach((review) => {
        const id = str(review.id);
        const placeId = str(review.placeId);
        if (!id || !placeId || seen.has(id)) return;
        if (!allowPrivate && review.visibility && review.visibility !== 'public') return;
        if (isPermanentlyClosed(review.placeClosedStatus)) return;
        const authorId = str(review.userId) || str(review.authorId);
        if (authorId && bots.has(authorId)) return;
        const rating = typeof review.overallRating === 'number' ? review.overallRating : Number(review.overallRating);
        if (!Number.isFinite(rating) || rating < 0 || rating > 10) return;
        const itemName = str(review.itemName);
        const placeName = str(review.placeName);
        if (isJunkName(itemName) || (placeName && isJunkName(placeName))) return;
        seen.add(id);
        const reactions = review.reactionCounts
            ? num(review.reactionCounts.like) + num(review.reactionCounts.love) + num(review.reactionCounts.useful)
            : 0;
        out.push({
            id,
            listId: str(review.listId),
            placeId,
            dishKey: dishKeyOf(placeId, itemName),
            itemName,
            placeName,
            rating,
            photo: reviewPhoto(review),
            comment: str(review.comment),
            authorId,
            authorName: str(review.authorName),
            authorPhoto: str(review.authorPhoto) || null,
            createdAt: toMillis(review.createdAt),
            reactions,
            listName: str(review.listName),
            categoryId: str(review.categoryId),
            placeImage: str(review.placeMainImage) || null,
            placePublicAvg: num(review.placeAverageRating),
            placePublicCount: num(review.placeReviewsCount),
        });
    });
    // Orden estable e independiente del orden de llegada.
    return out.sort((a, b) => (b.createdAt - a.createdAt) || (a.id < b.id ? -1 : 1));
}

const isBotProfile = (user: HomeFeedUser): boolean =>
    Array.isArray(user.userType) ? user.userType.includes('bot') : user.userType === 'bot';

// --- Estadísticas de listas en la zona ----------------------------------------

export interface ListAreaStats {
    id: string;
    name: string;
    inAreaReviews: number;
    inAreaPlaces: number;
    inAreaAuthors: number;
    inAreaAvg: number;
    lastActivity: number;
    coverUrl: string | null;
    parentListId?: string;
    categoryId?: string;
}

function listStatsFromClean(
    clean: ReadonlyArray<CleanReview>,
    lists: ReadonlyArray<HomeFeedList>,
    bots: Set<string>,
): ListAreaStats[] {
    const meta = new Map(lists.map((list) => [list.id, list]));
    const acc = new Map<string, {
        reviews: number; sum: number; places: Set<string>; authors: Set<string>;
        last: number; best: CleanReview | null; listName: string; categoryId: string;
    }>();
    clean.forEach((review) => {
        if (!review.listId) return;
        const entry = acc.get(review.listId) ?? {
            reviews: 0, sum: 0, places: new Set<string>(), authors: new Set<string>(),
            last: 0, best: null, listName: '', categoryId: '',
        };
        entry.reviews += 1;
        entry.sum += review.rating;
        entry.places.add(review.placeId);
        if (review.authorId) entry.authors.add(review.authorId);
        entry.last = Math.max(entry.last, review.createdAt);
        if (review.photo && (!entry.best || review.rating > entry.best.rating)) entry.best = review;
        if (!entry.listName && review.listName) entry.listName = review.listName;
        if (!entry.categoryId && review.categoryId) entry.categoryId = review.categoryId;
        acc.set(review.listId, entry);
    });

    const out: ListAreaStats[] = [];
    acc.forEach((entry, id) => {
        const list = meta.get(id);
        if (list) {
            if (list.userId && bots.has(list.userId)) return;
            if (list.isPublic === false && list.visibility !== 'public') return;
        }
        const name = str(list?.name) || entry.listName;
        if (!name || isJunkName(name)) return;
        out.push({
            id,
            name,
            inAreaReviews: entry.reviews,
            inAreaPlaces: entry.places.size,
            inAreaAuthors: entry.authors.size,
            inAreaAvg: entry.sum / entry.reviews,
            lastActivity: entry.last,
            coverUrl: listImage(list) || entry.best?.photo || null,
            parentListId: str(list?.parentListId) || undefined,
            categoryId: str(list?.categoryId) || entry.categoryId || undefined,
        });
    });
    return out.sort((a, b) => (b.inAreaReviews - a.inAreaReviews) || (a.id < b.id ? -1 : 1));
}

/** Actividad de cada lista dentro de la zona (solo listas con reseñas en ella). */
export function buildListAreaStats(
    reviews: ReadonlyArray<HomeFeedReview>,
    lists: ReadonlyArray<HomeFeedList> = [],
    botUserIds: Iterable<string> = [],
): ListAreaStats[] {
    const bots = new Set(botUserIds);
    return listStatsFromClean(cleanReviews(reviews, bots), lists, bots);
}

const recency = (at: number, now: number, scaleDays: number): number =>
    (at > 0 && now > 0 ? Math.exp(-Math.max(0, now - at) / (scaleDays * DAY_MS)) : 0);

const listScore = (list: ListAreaStats, now: number): number =>
    rankPosition(list.inAreaAvg, list.inAreaReviews)
    + 0.8 * log2p(list.inAreaPlaces)
    + 0.5 * log2p(list.inAreaAuthors)
    + 0.6 * recency(list.lastActivity, now, 30);

// --- Selección con topes de diversidad ----------------------------------------

type Caps<T> = Array<{ keyOf: (item: T) => string | undefined; max: number }>;

function takeWithCaps<T>(ordered: ReadonlyArray<T>, k: number, caps: Caps<T>, accept?: (item: T) => boolean): T[] {
    const counters = caps.map(() => new Map<string, number>());
    const out: T[] = [];
    for (const item of ordered) {
        if (out.length >= k) break;
        if (accept && !accept(item)) continue;
        const keys = caps.map((cap) => cap.keyOf(item));
        if (keys.some((key, i) => key !== undefined && (counters[i].get(key) ?? 0) >= caps[i].max)) continue;
        keys.forEach((key, i) => {
            if (key !== undefined) counters[i].set(key, (counters[i].get(key) ?? 0) + 1);
        });
        out.push(item);
    }
    return out;
}

/** Ids que ayer salieron en cabeza: hoy pesan menos, para que la apertura cambie. */
function yesterdayTop<T>(
    items: ReadonlyArray<T>,
    idOf: (item: T) => string,
    weightOf: (item: T) => number,
    seed: string | null,
    n: number,
): Set<string> {
    if (!seed) return new Set();
    return new Set(seededWeightedOrder(items, idOf, weightOf, seed).slice(0, n).map(idOf));
}

// --- Constructor principal ----------------------------------------------------

interface DishGroup {
    key: string;
    placeId: string;
    placeName: string;
    itemName: string;
    listId: string;
    listName: string;
    count: number;
    avg: number;
    authors: Set<string>;
    photo: string | null;
    triedByMe: boolean;
}

interface PlaceAgg {
    id: string;
    name: string;
    photo: string | null;
    rating: number;
    realCount: number;
    loaded: number;
    loadedAvg: number;
    firstSeen: number;
    authors: Set<string>;
    mainListId: string;
    triedByMe: boolean;
    firstReview: CleanReview | null;
}

export const FEED_TITLES = {
    featured: 'La lista del momento',
    platos: { title: 'Hoy te toca probar…', subtitle: 'Buena nota y mejor pinta, por tu zona' },
    joyas: { title: 'Joyas ocultas', subtitle: 'Mucha nota y poca fama (de momento)' },
    listas: { title: 'Listas con sabor local', subtitle: 'Donde más se cuece por aquí' },
    novedades: { title: 'Recién llegados', subtitle: 'Acaban de aterrizar en Listopic' },
    resenas: { title: 'Top reciente', subtitle: 'Las mejores reseñas de estos días, por tu zona' },
    recuerdos: { title: 'Recuerdos', subtitle: 'Lo que probaste hace un tiempo. ¿Repetimos?' },
    ranking: { title: 'El top de una lista', subtitle: 'Lo mejor de una lista, en tu zona' },
} as const;

/** Orden en que se pintan los carruseles (se calculan en otro orden). */
const FEED_ORDER = ['platos', 'recuerdos', 'ranking', 'resenas', 'joyas', 'listas', 'novedades'];

/** Aniversarios de «Recuerdos» (días atrás) y su margen. */
const MEMORY_MIN_AGE_DAYS = 21;
const MEMORY_ANNIVERSARIES: ReadonlyArray<[number, number]> = [[30, 5], [91, 10], [182, 14], [365, 21], [730, 30]];

/** «Hace 3 semanas», «Hace 4 meses», «Hace 1 año». */
export function memoryAgoLabel(days: number): string {
    if (days < 60) return `Hace ${plural(Math.max(1, Math.round(days / 7)), 'semana', 'semanas')}`;
    if (days < 335) return `Hace ${plural(Math.round(days / 30.4), 'mes', 'meses')}`;
    return `Hace ${plural(Math.max(1, Math.round(days / 365)), 'año', 'años')}`;
}

export function buildHomeFeeds(input: HomeFeedsInput): HomeFeedsResult {
    const minItems = Math.max(1, input.minItems ?? 3);
    const want = (feed: string) => !input.only || input.only.includes(feed);
    const me = str(input.userId);
    const seedBase = input.areaKey ? `${input.seed}|${input.areaKey}` : input.seed;
    const prevBase = previousDaySeed(input.seed);
    const prevSeedBase = prevBase ? (input.areaKey ? `${prevBase}|${input.areaKey}` : prevBase) : null;
    const seedFor = (feed: string) => `${seedBase}|${feed}`;
    const prevSeedFor = (feed: string) => (prevSeedBase ? `${prevSeedBase}|${feed}` : null);
    const dateMatch = DATE_SEED.exec(input.seed);
    const now = input.now ?? (dateMatch ? toMillis(dateMatch[0]) + DAY_MS / 2 : 0);

    const bots = new Set(input.botUserIds ?? []);
    (input.users ?? []).forEach((user) => { if (user.uid && isBotProfile(user)) bots.add(user.uid); });
    const userById = new Map((input.users ?? []).map((user) => [user.uid, user]));

    const clean = cleanReviews(input.reviews, bots);

    // Lo ya visible (ranking) y lo que va saliendo: nada se repite.
    const used = new Set<string>();
    for (const id of input.exclude?.placeIds ?? []) used.add(`place:${id}`);
    for (const key of input.exclude?.dishKeys ?? []) used.add(`dish:${key}`);
    for (const id of input.exclude?.listIds ?? []) used.add(`list:${id}`);
    const placeFree = (placeId: string) => !used.has(`place:${placeId}`);

    // --- Sitios de la zona: nota y recuento públicos reales -------------------
    const placeAgg = new Map<string, PlaceAgg>();
    (input.places ?? []).forEach((place) => {
        const id = str(place.placeId) || str(place.id);
        if (!id || isPermanentlyClosed(place.closedStatus)) return;
        const name = str(place.name);
        if (!name || isJunkName(name)) return;
        placeAgg.set(id, {
            id, name, photo: str(place.photoUrl) || null,
            rating: num(place.rating),
            realCount: num(place.placeReviewsCount) || num(place.reviewsCount),
            loaded: 0, loadedAvg: 0, firstSeen: 0, authors: new Set(), mainListId: '',
            triedByMe: false, firstReview: null,
        });
    });
    const listCountByPlace = new Map<string, Map<string, number>>();
    clean.forEach((review) => {
        let agg = placeAgg.get(review.placeId);
        if (!agg) {
            if (!review.placeName) return;
            agg = {
                id: review.placeId, name: review.placeName, photo: review.placeImage,
                rating: review.placePublicAvg, realCount: review.placePublicCount,
                loaded: 0, loadedAvg: 0, firstSeen: 0, authors: new Set(), mainListId: '',
                triedByMe: false, firstReview: null,
            };
            placeAgg.set(review.placeId, agg);
        }
        agg.loadedAvg = (agg.loadedAvg * agg.loaded + review.rating) / (agg.loaded + 1);
        agg.loaded += 1;
        if (!agg.photo) agg.photo = review.placeImage || review.photo;
        if (review.authorId) agg.authors.add(review.authorId);
        if (me && review.authorId === me) agg.triedByMe = true;
        if (review.createdAt && (!agg.firstSeen || review.createdAt < agg.firstSeen)) {
            agg.firstSeen = review.createdAt;
            agg.firstReview = review;
        }
        if (review.listId) {
            const counts = listCountByPlace.get(review.placeId) ?? new Map<string, number>();
            counts.set(review.listId, (counts.get(review.listId) ?? 0) + 1);
            listCountByPlace.set(review.placeId, counts);
        }
    });
    placeAgg.forEach((agg) => {
        if (!agg.rating) agg.rating = agg.loadedAvg;
        agg.realCount = Math.max(agg.realCount, agg.loaded);
        const counts = listCountByPlace.get(agg.id);
        if (counts) {
            agg.mainListId = Array.from(counts.entries())
                .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))[0][0];
        }
    });

    // --- La lista del momento -------------------------------------------------
    const listStats = listStatsFromClean(clean, input.lists ?? [], bots)
        .filter((list) => !used.has(`list:${list.id}`));
    const scoreOf = new Map(listStats.map((list) => [list.id, listScore(list, now)]));
    const tierA = listStats.filter((list) => list.inAreaReviews >= 3 && list.inAreaPlaces >= 2);
    const tier = tierA.length > 0 ? tierA : listStats;
    const pool = [...tier]
        .sort((a, b) => (scoreOf.get(b.id)! - scoreOf.get(a.id)!) || (a.id < b.id ? -1 : 1))
        .slice(0, 5);
    const featuredWeight = (list: ListAreaStats) => scoreOf.get(list.id)! ** 3 * (list.coverUrl ? 1 : 0.5);
    let featuredPool = pool;
    const prevFeatured = prevSeedFor('featured');
    if (prevFeatured && pool.length >= 2) {
        const yesterday = seededWeightedOrder(pool, (l) => l.id, featuredWeight, prevFeatured)[0];
        featuredPool = pool.filter((list) => list.id !== yesterday.id);
    }
    const featuredStats = seededWeightedOrder(featuredPool, (l) => l.id, featuredWeight, seedFor('featured'))[0];
    let featuredList: FeaturedListCard | null = null;
    if (featuredStats) {
        used.add(`list:${featuredStats.id}`);
        featuredList = {
            key: `list:${featuredStats.id}`,
            kind: 'list',
            id: featuredStats.id,
            title: featuredStats.name,
            subtitle: `${plural(featuredStats.inAreaPlaces, 'sitio valorado', 'sitios valorados')} aquí · ${fmt(featuredStats.inAreaAvg)} de media`,
            photoUrl: featuredStats.coverUrl,
            rating: round1(featuredStats.inAreaAvg),
            count: featuredStats.inAreaReviews,
            to: `/list/${featuredStats.id}`,
            listId: featuredStats.id,
            listName: featuredStats.name,
            inAreaReviews: featuredStats.inAreaReviews,
            inAreaPlaces: featuredStats.inAreaPlaces,
            inAreaAuthors: featuredStats.inAreaAuthors,
            parentListId: featuredStats.parentListId,
            categoryId: featuredStats.categoryId,
        };
    }

    const feeds: HomeFeed[] = [];
    const pushFeed = (
        id: keyof typeof FEED_TITLES,
        kind: HomeFeedKind,
        items: HomeFeedCard[],
        min = minItems,
        extra: { title?: string; subtitle?: string; viewAllTo?: string; claimPlaces?: boolean } = {},
    ) => {
        if (items.length < min) return;
        const meta = FEED_TITLES[id];
        if (typeof meta === 'string') return;
        items.forEach((item) => {
            used.add(item.key);
            if (item.placeId && extra.claimPlaces !== false) used.add(`place:${item.placeId}`);
            if (item.placeId && item.itemName) used.add(`dish:${dishKeyOf(item.placeId, item.itemName)}`);
        });
        feeds.push({
            id,
            title: extra.title ?? meta.title,
            subtitle: extra.subtitle ?? meta.subtitle,
            kind,
            items,
            ...(extra.viewAllTo ? { viewAllTo: extra.viewAllTo } : {}),
        });
    };

    let rankingList: ListAreaStats | null = null;

    // --- 0. El top 5 de una lista (ranking fiel: va primero y sus platos no se repiten
    // abajo; sus sitios sí pueden salir con otro plato, que con pocos datos no hay para todos).
    if (want('ranking')) {
        type RankGroup = DishGroup & { sum: number; photoRating: number };
        const byList = new Map<string, Map<string, RankGroup>>();
        clean.forEach((review) => {
            if (!review.listId) return;
            const placeName = review.placeName || placeAgg.get(review.placeId)?.name || '';
            if (!placeName) return;
            const groups = byList.get(review.listId) ?? new Map<string, RankGroup>();
            const group: RankGroup = groups.get(review.dishKey) ?? {
                key: review.dishKey, placeId: review.placeId, placeName, itemName: review.itemName,
                listId: review.listId, listName: review.listName, count: 0, avg: 0, sum: 0,
                authors: new Set<string>(), photo: null, triedByMe: false, photoRating: -1,
            };
            group.count += 1;
            group.sum += review.rating;
            group.avg = group.sum / group.count;
            if (review.authorId) group.authors.add(review.authorId);
            if (review.photo && review.rating > group.photoRating) {
                group.photo = review.photo;
                group.photoRating = review.rating;
            }
            groups.set(review.dishKey, group);
            byList.set(review.listId, groups);
        });
        const related = (list: ListAreaStats) => !!featuredList
            && (list.id === featuredList.id || list.parentListId === featuredList.id || list.id === featuredList.parentListId);
        const candidates = listStats
            .filter((list) => !related(list))
            .map((list) => {
                const ranked = Array.from(byList.get(list.id)?.values() ?? [])
                    .sort((a, b) => compareByRank({ average: a.avg, count: a.count }, { average: b.avg, count: b.count })
                        || (a.key < b.key ? -1 : 1));
                const rows = takeWithCaps(ranked, 5, [{ keyOf: (g) => g.placeId, max: 1 }]);
                return { list, rows };
            })
            .filter((c) => c.rows.length >= Math.max(3, minItems));
        // Mejor una lista cuyo podio no esté ya a la vista (ranking de arriba, portada).
        const overlap = (c: (typeof candidates)[number]) => c.rows.slice(0, 3)
            .filter((g) => used.has(`dish:${g.key}`) || used.has(`place:${g.placeId}`)).length;
        const weight = (c: (typeof candidates)[number]) =>
            (scoreOf.get(c.list.id) ?? 0.1) ** 2
            * (1 + 0.2 * c.rows.length)
            * (c.rows.filter((g) => g.photo).length >= 2 ? 1 : 0.5)
            * 0.35 ** overlap(c);
        let pool = candidates;
        const prevRanking = prevSeedFor('ranking');
        if (prevRanking && candidates.length >= 2) {
            const yesterday = seededWeightedOrder(candidates, (c) => c.list.id, weight, prevRanking)[0];
            pool = candidates.filter((c) => c.list.id !== yesterday.list.id);
        }
        const chosen = seededWeightedOrder(pool, (c) => c.list.id, weight, seedFor('ranking'))[0];
        if (chosen) {
            rankingList = chosen.list;
            used.add(`list:${chosen.list.id}`);
            const reviewsInList = chosen.rows.reduce((total, g) => total + g.count, 0);
            pushFeed('ranking', 'dish', chosen.rows.map((g, index) => ({
                key: `dish:${g.key}`,
                kind: 'dish' as const,
                id: g.key,
                title: g.itemName,
                subtitle: g.placeName,
                photoUrl: g.photo || placeAgg.get(g.placeId)?.photo || null,
                rating: round1(g.avg),
                count: g.count,
                to: groupPath(g.placeId, g.itemName),
                placeId: g.placeId,
                placeName: g.placeName,
                itemName: g.itemName,
                listId: chosen.list.id,
                listName: chosen.list.name,
                rank: index + 1,
            })), Math.max(3, minItems), {
                title: `El top: ${chosen.list.name}`,
                subtitle: `Según ${plural(reviewsInList, 'reseña', 'reseñas')} de tu zona`,
                viewAllTo: `/list/${chosen.list.id}`,
                claimPlaces: false,
            });
        }
    }

    // --- 1. Hoy te toca probar… (platos con foto y buena nota) ---------------
    if (want('platos')) {
        const groups = new Map<string, DishGroup & { sum: number; bestRating: number; photoRating: number }>();
        clean.forEach((review) => {
            const placeName = review.placeName || placeAgg.get(review.placeId)?.name || '';
            if (!placeName) return;
            const group = groups.get(review.dishKey) ?? {
                key: review.dishKey, placeId: review.placeId, placeName, itemName: review.itemName,
                listId: review.listId, listName: review.listName, count: 0, avg: 0, sum: 0,
                authors: new Set<string>(), photo: null, triedByMe: false, bestRating: -1, photoRating: -1,
            };
            group.count += 1;
            group.sum += review.rating;
            group.avg = group.sum / group.count;
            if (review.authorId) group.authors.add(review.authorId);
            if (me && review.authorId === me) group.triedByMe = true;
            if (review.photo && review.rating > group.photoRating) {
                group.photo = review.photo;
                group.photoRating = review.rating;
            }
            if (review.rating > group.bestRating) {
                group.bestRating = review.rating;
                group.itemName = review.itemName;
                if (review.listId) { group.listId = review.listId; group.listName = review.listName; }
            }
            groups.set(review.dishKey, group);
        });
        const free = (g: DishGroup) => !used.has(`dish:${g.key}`) && placeFree(g.placeId);
        let eligible = Array.from(groups.values()).filter((g) => g.avg >= 7.5 && g.photo && free(g));
        if (eligible.length < 4) eligible = Array.from(groups.values()).filter((g) => g.avg >= 7.5 && free(g));
        const base = (g: DishGroup) =>
            Math.max(0.05, rankPosition(g.avg, g.count) + 0.3 * log2p(g.authors.size) - 6.5) ** 2
            * (g.photo ? 1 : 0.4)
            * (g.triedByMe ? 0.35 : 1);
        const yesterday = yesterdayTop(eligible, (g) => g.key, base, prevSeedFor('platos'), 3);
        const ordered = seededWeightedOrder(eligible, (g) => g.key, (g) => base(g) * (yesterday.has(g.key) ? 0.3 : 1), seedFor('platos'));
        let picked = takeWithCaps(ordered, 8, [
            { keyOf: (g) => g.placeId, max: 1 },
            { keyOf: (g) => g.listId || undefined, max: 2 },
        ]);
        // Poca variedad de listas (un solo reseñador): mejor algo que nada.
        if (picked.length < minItems) picked = takeWithCaps(ordered, 8, [{ keyOf: (g) => g.placeId, max: 1 }]);
        pushFeed('platos', 'dish', picked.map((g) => ({
            key: `dish:${g.key}`,
            kind: 'dish' as const,
            id: g.key,
            title: g.itemName,
            subtitle: g.placeName,
            photoUrl: g.photo || placeAgg.get(g.placeId)?.photo || null,
            rating: round1(g.avg),
            count: g.count,
            to: groupPath(g.placeId, g.itemName),
            placeId: g.placeId,
            placeName: g.placeName,
            itemName: g.itemName,
            listId: g.listId || undefined,
            listName: g.listName || undefined,
        })));
    }

    // --- 1b. Recuerdos (tus reseñas de hace un tiempo, también las privadas) --
    if (want('recuerdos') && me && now > 0 && input.memories?.length) {
        const mine = cleanReviews(input.memories, new Set(), true).filter((review) =>
            review.authorId === me
            && review.placeName
            && review.createdAt > 0
            && now - review.createdAt >= MEMORY_MIN_AGE_DAYS * DAY_MS
            && !used.has(`dish:${review.dishKey}`));
        const ageDays = (review: CleanReview) => (now - review.createdAt) / DAY_MS;
        const isAnniversary = (review: CleanReview) =>
            MEMORY_ANNIVERSARIES.some(([days, margin]) => Math.abs(ageDays(review) - days) <= margin);
        const base = (review: CleanReview) =>
            (review.rating >= 8 ? 2 : review.rating >= 6.5 ? 1 : 0.3)
            * (isAnniversary(review) ? 3 : 1)
            * (review.photo ? 1.3 : 1);
        const yesterday = yesterdayTop(mine, (r) => r.id, base, prevSeedFor('recuerdos'), 3);
        const ordered = seededWeightedOrder(mine, (r) => r.id, (r) => base(r) * (yesterday.has(r.id) ? 0.3 : 1), seedFor('recuerdos'));
        const picked = takeWithCaps(ordered, 8, [{ keyOf: (r) => r.placeId, max: 1 }]);
        // Tus recuerdos no le quitan sitios a los demás carruseles: solo ese plato.
        pushFeed('recuerdos', 'review', picked.map((r) => ({
            key: `review:${r.id}`,
            kind: 'review' as const,
            id: r.id,
            title: r.itemName,
            subtitle: r.placeName,
            badge: memoryAgoLabel(Math.floor(ageDays(r))),
            photoUrl: r.photo || r.placeImage,
            rating: round1(r.rating),
            count: 1,
            to: groupPath(r.placeId, r.itemName),
            placeId: r.placeId,
            placeName: r.placeName,
            itemName: r.itemName,
            listId: r.listId || undefined,
            listName: r.listName || undefined,
            comment: r.comment || undefined,
            createdAt: r.createdAt,
        })), minItems, { viewAllTo: '/profile', claimPlaces: false });
    }

    // --- 1c. Top reciente: las mejores reseñas de estos días en la zona -------
    // Solo notas altas (8 o más; si no llega, 7,5), las mejores y más frescas
    // primero, con foto antes que sin ella. Un plato no se repite y un sitio, dos
    // veces como mucho. Solo se queda el plato: su sitio puede salir en las joyas.
    if (want('resenas')) {
        const base = clean.filter((r) => r.placeName && !used.has(`dish:${r.dishKey}`));
        const byOthers = base.filter((r) => !me || r.authorId !== me);
        const pool = me && byOthers.length >= 6 ? byOthers : base;
        const ageDays = (r: CleanReview) => (now > 0 && r.createdAt ? Math.max(0, (now - r.createdAt) / DAY_MS) : 0);
        const score = (r: CleanReview) => r.rating + (r.photo ? 0.6 : 0) + 0.15 * Math.min(r.reactions, 6) - ageDays(r) / 60;
        const pick = (minRating: number, maxDays: number) => takeWithCaps(
            pool.filter((r) => r.rating >= minRating && ageDays(r) <= maxDays)
                .sort((a, b) => (score(b) - score(a)) || (a.id < b.id ? -1 : 1)),
            15,
            [
                { keyOf: (r) => r.dishKey, max: 1 },
                { keyOf: (r) => r.placeId, max: 2 },
                { keyOf: (r) => r.authorId || undefined, max: 4 },
            ],
        );
        let picked = pick(8, 45);
        if (picked.length < 8) picked = pick(8, 120);
        if (picked.length < minItems) picked = pick(7.5, Infinity);
        pushFeed('resenas', 'review', picked.map((r) => {
            const profile = r.authorId ? userById.get(r.authorId) : undefined;
            return {
                key: `review:${r.id}`,
                kind: 'review' as const,
                id: r.id,
                title: r.itemName,
                subtitle: r.placeName,
                photoUrl: r.photo || r.placeImage,
                rating: round1(r.rating),
                count: 1,
                to: groupPath(r.placeId, r.itemName),
                placeId: r.placeId,
                placeName: r.placeName,
                itemName: r.itemName,
                listId: r.listId || undefined,
                listName: r.listName || undefined,
                authorId: r.authorId || undefined,
                authorName: r.authorName || str(profile?.displayName) || undefined,
                authorPhoto: r.authorPhoto || str(profile?.photoUrl) || null,
                comment: r.comment || undefined,
                createdAt: r.createdAt || undefined,
            };
        }), minItems, { claimPlaces: false });
    }

    // --- 2. Joyas por descubrir (nota alta, pocas reseñas reales) ------------
    if (want('joyas')) {
        const all = Array.from(placeAgg.values()).filter((p) => p.rating > 0 && p.realCount >= 1);
        const sorted = all.map((p) => p.rating).sort((a, b) => a - b);
        const median = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 8;
        const minRating = Math.min(8.5, Math.max(7.5, median));
        const free = all.filter((p) => placeFree(p.id));
        let eligible = free.filter((p) => p.rating >= minRating && p.realCount <= 8);
        if (eligible.length < 4) eligible = free.filter((p) => p.rating >= 7.5 && p.realCount <= 15);
        const base = (p: PlaceAgg) =>
            Math.max(0.05, p.rating - 7) ** 2
            * (1 + 0.15 * Math.max(0, 8 - p.realCount))
            * (p.photo ? 1 : 0.6)
            * (p.triedByMe ? 0.35 : 1);
        const yesterday = yesterdayTop(eligible, (p) => p.id, base, prevSeedFor('joyas'), 4);
        const ordered = seededWeightedOrder(eligible, (p) => p.id, (p) => base(p) * (yesterday.has(p.id) ? 0.3 : 1), seedFor('joyas'));
        const sameName = { keyOf: (p: PlaceAgg) => p.name.toLowerCase(), max: 1 };
        let picked = takeWithCaps(ordered, 10, [{ keyOf: (p) => p.mainListId || undefined, max: 2 }, sameName]);
        if (picked.length < minItems) picked = takeWithCaps(ordered, 10, [sameName]);
        pushFeed('joyas', 'place', picked.map((p) => ({
            key: `place:${p.id}`,
            kind: 'place' as const,
            id: p.id,
            title: p.name,
            subtitle: `${fmt(p.rating)} · ${plural(p.realCount, 'reseña', 'reseñas')}`,
            photoUrl: p.photo,
            rating: round1(p.rating),
            count: p.realCount,
            to: `/place/${p.id}`,
            placeId: p.id,
            placeName: p.name,
        })));
    }

    // --- 3. Listas con sabor local (solo listas con reseñas en la zona) ------
    if (want('listas')) {
        const candidates = listStats
            .filter((list) => !used.has(`list:${list.id}`))
            .sort((a, b) => (scoreOf.get(b.id)! - scoreOf.get(a.id)!) || (a.id < b.id ? -1 : 1))
            .slice(0, 12);
        const ordered = seededWeightedOrder(candidates, (l) => l.id, (l) => scoreOf.get(l.id)! ** 2, seedFor('listas'));
        const picked = takeWithCaps(ordered, 8, [
            { keyOf: (l) => l.parentListId || l.id, max: 1 },
            { keyOf: (l) => l.categoryId, max: 3 },
        ], (l) => ![featuredList, rankingList].some((shown) => shown
            && (l.parentListId === shown.id || l.id === shown.parentListId)));
        pushFeed('listas', 'list', picked.map((l) => ({
            key: `list:${l.id}`,
            kind: 'list' as const,
            id: l.id,
            title: l.name,
            subtitle: `${plural(l.inAreaPlaces, 'sitio', 'sitios')} aquí · ${fmt(l.inAreaAvg)}`,
            photoUrl: l.coverUrl,
            rating: round1(l.inAreaAvg),
            count: l.inAreaReviews,
            to: `/list/${l.id}`,
            listId: l.id,
            listName: l.name,
        })), Math.min(minItems, 2));
    }

    // --- 4. Recién llegados (debut reciente en Listopic, nota digna) ---------
    if (want('novedades') && now > 0) {
        const debuts = Array.from(placeAgg.values()).filter((p) =>
            p.firstSeen > 0 && p.loaded > 0 && p.realCount <= 3 && p.loaded >= p.realCount && p.loadedAvg >= 6.5 && placeFree(p.id));
        let eligible = debuts.filter((p) => now - p.firstSeen <= 30 * DAY_MS);
        if (eligible.length < minItems) eligible = debuts.filter((p) => now - p.firstSeen <= 90 * DAY_MS);
        const others = eligible.filter((p) => !(me && p.authors.size === 1 && p.authors.has(me)));
        const mineLast = me && others.length >= 4;
        const ordered = [...eligible].sort((a, b) => {
            if (mineLast) {
                const am = others.includes(a) ? 0 : 1;
                const bm = others.includes(b) ? 0 : 1;
                if (am !== bm) return am - bm;
            }
            return (b.firstSeen - a.firstSeen) || (a.id < b.id ? -1 : 1);
        });
        pushFeed('novedades', 'place', ordered.slice(0, 10).map((p) => {
            const days = Math.max(0, Math.floor((now - p.firstSeen) / DAY_MS));
            const first = p.firstReview;
            const author = first?.authorName || (first?.authorId ? str(userById.get(first.authorId)?.displayName) : '');
            return {
                key: `place:${p.id}`,
                kind: 'place' as const,
                id: p.id,
                title: p.name,
                subtitle: author ? `Lo estrenó ${author}` : undefined,
                badge: days === 0 ? 'Nuevo · hoy' : `Nuevo · hace ${plural(days, 'día', 'días')}`,
                photoUrl: p.photo,
                rating: round1(p.loadedAvg),
                count: p.realCount,
                to: `/place/${p.id}`,
                placeId: p.id,
                placeName: p.name,
                authorId: first?.authorId || undefined,
                authorName: author || undefined,
                createdAt: p.firstSeen,
            };
        }));
    }

    feeds.sort((a, b) => FEED_ORDER.indexOf(a.id) - FEED_ORDER.indexOf(b.id));
    return { featuredList, feeds };
}
