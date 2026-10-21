/**
 * searchLanding: lo que enseña Buscar antes de escribir nada.
 *
 * Puro: sin React, sin Firestore, sin Date.now (el «ahora» llega como
 * parámetro). Todo sale de datos ya leídos (reseñas recientes, tus reseñas, a
 * quién sigues, tus chats) y de lo que guarda el navegador (búsquedas y listas
 * visitadas).
 *
 * API
 *   parseRecentSearches(raw, k?)            → string[]
 *   applyListVisit(entries, visit, now)     → ListVisit[] (LRU, máx. 30)
 *   topListVisits(entries, k?)              → ListVisit[] (frecuencia, luego recencia)
 *   pickNearby(reviews, kind, opts)         → { cards, radiusKm }
 *   rankTasteMatches(own, pool, opts)       → TasteSuggestion[]
 *   rankYourPeople(input)                   → PersonRank[]
 *   formatKm(km)                            → '800 m' | '1,2 km' | '12 km'
 */
import { computeTasteMatch, type TasteReview } from '../utils/tasteMatch';
import { dishKeyOf, isJunkName, isPermanentlyClosed, type HomeFeedCard, type HomeFeedReview } from './homeFeeds';
import { haversineMeters } from '../utils/geo';
import { DAY_MS, toMillis } from '../utils/adminTime';

export const LANDING_CAROUSEL_SIZE = 8;

// --- Utilidades ---------------------------------------------------------------

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const num = (value: unknown): number => {
    const n = typeof value === 'string' ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};
const recency = (at: number, now: number, scaleDays: number): number =>
    at > 0 ? Math.exp(-Math.max(0, now - at) / (scaleDays * DAY_MS)) : 0;

export const isBotType = (userType: unknown): boolean =>
    Array.isArray(userType) ? userType.includes('bot') : userType === 'bot';

export function formatKm(km: number): string {
    if (km < 1) return `${Math.max(100, Math.round(km * 10) * 100)} m`;
    if (km < 10) return `${(Math.round(km * 10) / 10).toFixed(1).replace('.', ',')} km`;
    return `${Math.round(km)} km`;
}

/** 'hoy', 'ayer', 'hace 3 d', 'hace 2 sem'… (vacío si es de hace más de 2 meses). */
export function agoLabel(at: number, now: number): string {
    if (!at) return '';
    const days = Math.floor(Math.max(0, now - at) / DAY_MS);
    if (days === 0) return 'hoy';
    if (days === 1) return 'ayer';
    if (days < 7) return `hace ${days} d`;
    if (days < 60) return `hace ${Math.floor(days / 7)} sem`;
    return '';
}

// --- Búsquedas recientes ------------------------------------------------------

/** Lee el JSON de 'listopic_recent_searches' sin fiarse de lo que haya dentro. */
export function parseRecentSearches(raw: string | null | undefined, k = LANDING_CAROUSEL_SIZE): string[] {
    if (!raw) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    parsed.forEach((value) => {
        const text = str(value);
        const key = text.toLowerCase();
        if (!text || seen.has(key)) return;
        seen.add(key);
        out.push(text);
    });
    return out.slice(0, k);
}

// --- Listas de siempre --------------------------------------------------------

export interface ListVisit {
    id: string;
    name: string;
    coverUrl: string | null;
    count: number;
    lastAt: number;
}

export const LIST_VISITS_CAP = 30;
/** Volver a la misma lista dentro de este margen (recargas, ir y volver) no suma. */
export const LIST_VISIT_DEBOUNCE_MS = 10 * 60 * 1000;

const isListVisit = (value: unknown): value is ListVisit => {
    const v = value as ListVisit;
    return !!v && typeof v === 'object' && typeof v.id === 'string' && v.id.length > 0
        && typeof v.count === 'number' && typeof v.lastAt === 'number';
};

export function parseListVisits(raw: string | null | undefined): ListVisit[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isListVisit) : [];
    } catch {
        return [];
    }
}

export function applyListVisit(
    entries: ReadonlyArray<ListVisit>,
    visit: { id: string; name?: string | null; coverUrl?: string | null },
    now: number,
    cap = LIST_VISITS_CAP,
): ListVisit[] {
    const id = str(visit.id);
    if (!id) return [...entries];
    const name = str(visit.name);
    // Las portadas en línea (data:) pueden pesar megas: no van al navegador.
    const cover = str(visit.coverUrl);
    const coverUrl = cover && !cover.startsWith('data:') ? cover : null;
    const previous = entries.find((entry) => entry.id === id);
    const counts = !previous || now - previous.lastAt >= LIST_VISIT_DEBOUNCE_MS;
    const updated: ListVisit = {
        id,
        name: name || previous?.name || '',
        coverUrl: coverUrl ?? previous?.coverUrl ?? null,
        count: (previous?.count ?? 0) + (counts ? 1 : 0),
        lastAt: now,
    };
    return [updated, ...entries.filter((entry) => entry.id !== id)]
        .sort((a, b) => b.lastAt - a.lastAt)
        .slice(0, cap);
}

export function topListVisits(entries: ReadonlyArray<ListVisit>, k = LANDING_CAROUSEL_SIZE): ListVisit[] {
    return entries
        .filter((entry) => entry.name)
        .slice()
        .sort((a, b) => (b.count - a.count) || (b.lastAt - a.lastAt))
        .slice(0, k);
}

// --- Sitios y platos top cerca ------------------------------------------------

export interface LandingReview extends HomeFeedReview {
    placeLat?: unknown;
    placeLng?: unknown;
    lat?: unknown;
    lng?: unknown;
    authorUserType?: unknown;
}

export interface GeoPoint {
    latitude: number;
    longitude: number;
}

export interface NearbyOptions {
    origin: GeoPoint | null;
    now: number;
    k?: number;
    /** Radios que se prueban de menor a mayor hasta reunir `minItems`. */
    radiiKm?: number[];
    minItems?: number;
    /** Nota mínima para entrar («bien valorados»). */
    minRating?: number;
    botUserIds?: ReadonlySet<string>;
}

export interface NearbyResult {
    cards: HomeFeedCard[];
    /** Radio usado; null si no hay ubicación o nada cerca (entonces es top general). */
    radiusKm: number | null;
}

interface Bucket {
    id: string;
    placeId: string;
    placeName: string;
    itemName: string;
    ratings: number[];
    latest: number;
    reviewPhoto: string | null;
    reviewPhotoAt: number;
    placeImage: string | null;
    publicAvg: number;
    publicCount: number;
    distanceKm: number | null;
}

const reviewPhoto = (review: HomeFeedReview): string | null => {
    if (Array.isArray(review.photoUrls)) {
        const first = review.photoUrls.find((url) => typeof url === 'string' && url.trim());
        if (typeof first === 'string') return first;
    }
    return str(review.photoUrl) || null;
};

const reviewAuthor = (review: LandingReview): string => str(review.userId) || str(review.authorId);

const coordsOf = (review: LandingReview): { lat: number; lng: number } | null => {
    const lat = num(review.placeLat) || num(review.lat);
    const lng = num(review.placeLng) || num(review.lng);
    return lat && lng ? { lat, lng } : null;
};

const groupPath = (placeId: string, itemName: string): string => `/group/${placeId}/${encodeURIComponent(itemName)}`;
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function pickNearby(
    reviews: ReadonlyArray<LandingReview>,
    kind: 'place' | 'dish',
    options: NearbyOptions,
): NearbyResult {
    const {
        origin, now, k = LANDING_CAROUSEL_SIZE, radiiKm = [5, 15, 40], minItems = 4, minRating = 7,
        botUserIds,
    } = options;

    const buckets = new Map<string, Bucket>();
    const seen = new Set<string>();
    reviews.forEach((review) => {
        const reviewId = str(review.id);
        const placeId = str(review.placeId);
        if (!reviewId || !placeId || seen.has(reviewId)) return;
        if (review.visibility && review.visibility !== 'public') return;
        if (isPermanentlyClosed(review.placeClosedStatus)) return;
        const author = reviewAuthor(review);
        if ((author && botUserIds?.has(author)) || isBotType(review.authorUserType)) return;
        const rating = num(review.overallRating);
        if (rating <= 0 || rating > 10) return;
        const itemName = str(review.itemName);
        const placeName = str(review.placeName);
        if (kind === 'dish' && (!itemName || isJunkName(itemName))) return;
        if (placeName && isJunkName(placeName)) return;
        seen.add(reviewId);

        const id = kind === 'place' ? placeId : dishKeyOf(placeId, itemName);
        let bucket = buckets.get(id);
        if (!bucket) {
            const coords = coordsOf(review);
            bucket = {
                id, placeId, placeName, itemName,
                ratings: [], latest: 0, reviewPhoto: null, reviewPhotoAt: 0,
                placeImage: str(review.placeMainImage) || null,
                publicAvg: num(review.placeAverageRating),
                publicCount: num(review.placeReviewsCount),
                distanceKm: origin && coords
                    ? haversineMeters(origin.latitude, origin.longitude, coords.lat, coords.lng) / 1000
                    : null,
            };
            buckets.set(id, bucket);
        }
        const at = toMillis(review.createdAt);
        bucket.ratings.push(rating);
        bucket.latest = Math.max(bucket.latest, at);
        if (!bucket.placeName && placeName) bucket.placeName = placeName;
        if (!bucket.placeImage && str(review.placeMainImage)) bucket.placeImage = str(review.placeMainImage);
        const photo = reviewPhoto(review);
        // La foto de la reseña más reciente con foto: siempre hay una imagen si alguien la subió.
        if (photo && at >= bucket.reviewPhotoAt) {
            bucket.reviewPhoto = photo;
            bucket.reviewPhotoAt = at;
        }
    });

    const scored = Array.from(buckets.values()).map((bucket) => {
        const localAvg = bucket.ratings.reduce((sum, r) => sum + r, 0) / bucket.ratings.length;
        const usePublic = kind === 'place' && bucket.publicAvg > 0 && bucket.publicCount > 0;
        const rating = usePublic ? bucket.publicAvg : localAvg;
        const count = usePublic ? Math.max(bucket.publicCount, bucket.ratings.length) : bucket.ratings.length;
        // Media bayesiana: una sola nota de 10 no gana a ocho de 9.
        const bayes = (rating * count + 7 * 2) / (count + 2);
        const photo = kind === 'place' ? (bucket.placeImage || bucket.reviewPhoto) : (bucket.reviewPhoto || bucket.placeImage);
        const score = bayes
            + 1.2 * recency(bucket.latest, now, 30)
            + 0.25 * Math.log2(1 + bucket.ratings.length)
            + (photo ? 0.4 : 0);
        return { bucket, rating, count, photo, score };
    }).filter((entry) => entry.rating >= minRating);

    const toCards = (entries: typeof scored, radiusKm: number | null): HomeFeedCard[] => entries
        .slice()
        .sort((a, b) => {
            const closeness = (e: typeof a) => (radiusKm && e.bucket.distanceKm !== null ? 0.5 * (1 - e.bucket.distanceKm / radiusKm) : 0);
            return (b.score + closeness(b)) - (a.score + closeness(a)) || (a.bucket.id < b.bucket.id ? -1 : 1);
        })
        .slice(0, k)
        .map(({ bucket, rating, count, photo }) => {
            const distance = bucket.distanceKm !== null && radiusKm ? `a ${formatKm(bucket.distanceKm)}` : '';
            const ago = agoLabel(bucket.latest, now);
            const subtitle = kind === 'place'
                ? [distance, plural(count, 'reseña', 'reseñas')].filter(Boolean).join(' · ')
                : [bucket.placeName, distance].filter(Boolean).join(' · ');
            return {
                key: `${kind}:${bucket.id}`,
                kind,
                id: bucket.id,
                title: kind === 'place' ? (bucket.placeName || 'Sitio') : bucket.itemName,
                subtitle,
                badge: ago && bucket.latest > now - 14 * DAY_MS ? `Reseña ${ago}` : undefined,
                photoUrl: photo,
                rating: Math.round(rating * 10) / 10,
                count,
                to: kind === 'place' ? `/place/${bucket.placeId}` : groupPath(bucket.placeId, bucket.itemName),
                placeId: bucket.placeId,
                placeName: bucket.placeName,
                itemName: bucket.itemName || undefined,
                createdAt: bucket.latest,
            } satisfies HomeFeedCard;
        });

    if (!origin) return { cards: toCards(scored, null), radiusKm: null };

    const located = scored.filter((entry) => entry.bucket.distanceKm !== null);
    let fallback: NearbyResult | null = null;
    for (const radius of radiiKm) {
        const inside = located.filter((entry) => entry.bucket.distanceKm! <= radius);
        if (inside.length >= minItems) return { cards: toCards(inside, radius), radiusKm: radius };
        if (inside.length > 0) fallback = { cards: toCards(inside, radius), radiusKm: radius };
    }
    // Nada cerca: mejor algo bueno de donde sea que una sección vacía.
    return fallback ?? { cards: toCards(scored, null), radiusKm: null };
}

// --- Gente con tu gusto -------------------------------------------------------

export interface PersonMeta {
    displayName?: string | null;
    username?: string | null;
    photoUrl?: string | null;
    userType?: unknown;
}

export interface TasteSuggestion {
    uid: string;
    name: string;
    photoUrl: string | null;
    score: number;
    reason: string;
    sharedPlaces: number;
}

export interface TasteOptions {
    selfId: string;
    /** Ya seguidos (y cualquier otro que no proceda sugerir). */
    exclude?: ReadonlySet<string>;
    botUserIds?: ReadonlySet<string>;
    minScore?: number;
    k?: number;
}

export function rankTasteMatches(
    own: ReadonlyArray<TasteReview>,
    pool: ReadonlyArray<LandingReview>,
    options: TasteOptions,
): TasteSuggestion[] {
    const { selfId, exclude, botUserIds, minScore = 30, k = LANDING_CAROUSEL_SIZE } = options;
    if (own.length === 0) return [];
    const byUser = new Map<string, { name: string; photo: string | null; reviews: TasteReview[]; ids: Set<string> }>();
    pool.forEach((review) => {
        const uid = reviewAuthor(review);
        if (!uid || uid === selfId || exclude?.has(uid) || botUserIds?.has(uid) || isBotType(review.authorUserType)) return;
        if (review.visibility && review.visibility !== 'public') return;
        let entry = byUser.get(uid);
        if (!entry) {
            entry = { name: str(review.authorName), photo: str(review.authorPhoto) || null, reviews: [], ids: new Set() };
            byUser.set(uid, entry);
        }
        const id = str(review.id);
        if (id && entry.ids.has(id)) return;
        if (id) entry.ids.add(id);
        if (!entry.photo && str(review.authorPhoto)) entry.photo = str(review.authorPhoto);
        entry.reviews.push({
            placeId: str(review.placeId) || undefined,
            itemName: str(review.itemName) || undefined,
            overallRating: num(review.overallRating) || undefined,
        });
    });

    const out: TasteSuggestion[] = [];
    byUser.forEach((entry, uid) => {
        const match = computeTasteMatch([...own], entry.reviews);
        if (!match || match.score < minScore) return;
        out.push({
            uid,
            name: entry.name || 'Alguien',
            photoUrl: entry.photo,
            score: match.score,
            reason: match.reason,
            sharedPlaces: match.sharedPlaces,
        });
    });
    return out
        .sort((a, b) => (b.score - a.score) || (b.sharedPlaces - a.sharedPlaces) || (a.uid < b.uid ? -1 : 1))
        .slice(0, k);
}

// --- Tu gente -----------------------------------------------------------------

export interface FollowEntry {
    uid: string;
    followedAt?: unknown;
    displayName?: string | null;
    photoUrl?: string | null;
}

export interface ChatEntry {
    participants: ReadonlyArray<string>;
    updatedAt?: unknown;
    type?: string | null;
}

export interface PersonRank {
    uid: string;
    score: number;
    reason: string;
    name: string;
    photoUrl: string | null;
}

export interface YourPeopleInput {
    selfId: string;
    following: ReadonlyArray<FollowEntry>;
    chats?: ReadonlyArray<ChatEntry>;
    /** Reseñas recientes ya leídas: dicen quién anda activo. */
    pool?: ReadonlyArray<LandingReview>;
    botUserIds?: ReadonlySet<string>;
    now: number;
    k?: number;
}

export function rankYourPeople(input: YourPeopleInput): PersonRank[] {
    const { selfId, following, chats = [], pool = [], botUserIds, now, k = LANDING_CAROUSEL_SIZE } = input;
    interface Acc { follow: number; chatAt: number; chatWeight: number; reviewAt: number; name: string; photo: string | null }
    const people = new Map<string, Acc>();
    const get = (uid: string): Acc => {
        let acc = people.get(uid);
        if (!acc) {
            acc = { follow: 0, chatAt: 0, chatWeight: 0, reviewAt: 0, name: '', photo: null };
            people.set(uid, acc);
        }
        return acc;
    };

    following.forEach((entry) => {
        const uid = str(entry.uid);
        if (!uid || uid === selfId) return;
        const acc = get(uid);
        acc.follow = 1 + 0.5 * recency(toMillis(entry.followedAt), now, 90);
        acc.name = acc.name || str(entry.displayName);
        acc.photo = acc.photo || str(entry.photoUrl) || null;
    });

    chats.forEach((chat) => {
        const at = toMillis(chat.updatedAt);
        const others = (chat.participants || []).filter((uid) => uid && uid !== selfId);
        if (others.length === 0) return;
        // Un grupo grande dice poco de cada persona.
        const weight = chat.type === 'group' || others.length > 1 ? 0.4 : 1;
        others.forEach((uid) => {
            const acc = get(uid);
            if (at > acc.chatAt || weight > acc.chatWeight) {
                acc.chatAt = Math.max(acc.chatAt, at);
                acc.chatWeight = Math.max(acc.chatWeight, weight);
            }
        });
    });

    // La actividad solo ordena a gente que ya es tuya; no añade desconocidos.
    pool.forEach((review) => {
        const uid = reviewAuthor(review);
        const acc = uid ? people.get(uid) : undefined;
        if (!acc) return;
        acc.reviewAt = Math.max(acc.reviewAt, toMillis(review.createdAt));
        acc.name = acc.name || str(review.authorName);
        acc.photo = acc.photo || str(review.authorPhoto) || null;
    });

    const ranked: PersonRank[] = [];
    people.forEach((acc, uid) => {
        if (botUserIds?.has(uid)) return;
        // Haber hablado alguna vez cuenta más que solo seguir.
        const chat = acc.chatWeight > 0 ? acc.chatWeight * (1.2 + 3 * recency(acc.chatAt, now, 21)) : 0;
        const active = 1.5 * recency(acc.reviewAt, now, 14);
        const score = acc.follow + chat + active;
        const chatAgo = agoLabel(acc.chatAt, now);
        const reviewAgo = agoLabel(acc.reviewAt, now);
        const reason = acc.chatAt && now - acc.chatAt < 7 * DAY_MS ? `Habláis: ${chatAgo}`
            : acc.reviewAt && now - acc.reviewAt < 14 * DAY_MS ? `Reseñó ${reviewAgo}`
                : acc.chatWeight > 0 ? 'Os escribís'
                    : 'Le sigues';
        ranked.push({ uid, score, reason, name: acc.name, photoUrl: acc.photo });
    });
    return ranked
        .sort((a, b) => (b.score - a.score) || (a.uid < b.uid ? -1 : 1))
        .slice(0, k);
}
