/**
 * «Tu zona esta semana» y «Tus colegas» (Inicio): se calculan con las reseñas
 * que Inicio ya ha cargado, sin lecturas extra. «Esta semana» = los últimos 7 días.
 */
import { DAY_MS, toMillis } from '../utils/adminTime';
import { isJunkName, isPermanentlyClosed, type HomeFeedReview } from './homeFeeds';

export interface ZoneWeekLink {
    title: string;
    detail?: string;
    score?: number;
    to: string;
}

export interface ZoneWeek {
    reviews: number;
    withPhoto: number;
    newPlaces: number;
    /** La mejor nota de la semana (solo platos). */
    star: ZoneWeekLink | null;
    /** El sitio que se ha estrenado más recientemente. */
    newcomer: ZoneWeekLink | null;
    /** La lista con más valoraciones esta semana (2 o más). */
    busiestList: (ZoneWeekLink & { count: number }) | null;
}

export interface FriendBite {
    id: string;
    authorId: string;
    authorName: string;
    authorPhoto: string | null;
    title: string;
    place: string;
    score: number;
    photo: string | null;
    at: number;
    to: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown): number => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : NaN;
};
const groupPath = (placeId: string, itemName: string) => `/group/${placeId}/${encodeURIComponent(itemName)}`;
const authorOf = (r: HomeFeedReview) => str(r.userId) || str(r.authorId);

/** Reseñas públicas, con nota y sin bots ni sitios cerrados del todo. */
function usable(reviews: ReadonlyArray<HomeFeedReview>, bots: ReadonlySet<string>): HomeFeedReview[] {
    const seen = new Set<string>();
    return reviews.filter((r) => {
        if (!r.id || seen.has(r.id) || !str(r.placeId)) return false;
        if (r.visibility && r.visibility !== 'public') return false;
        if (isPermanentlyClosed(r.placeClosedStatus)) return false;
        const author = authorOf(r);
        if (author && bots.has(author)) return false;
        const rating = num(r.overallRating);
        if (!(rating >= 0 && rating <= 10)) return false;
        if (isJunkName(str(r.itemName)) || (str(r.placeName) && isJunkName(str(r.placeName)))) return false;
        seen.add(r.id);
        return true;
    });
}

export function buildZoneWeek(input: {
    reviews: ReadonlyArray<HomeFeedReview>;
    now: number;
    bots?: ReadonlySet<string>;
    /** Qué cuenta como plato (las playas no son platos). */
    isDish?: (review: HomeFeedReview) => boolean;
}): ZoneWeek {
    const all = usable(input.reviews, input.bots ?? new Set());
    const since = input.now - 7 * DAY_MS;
    const week = all.filter((r) => toMillis(r.createdAt) >= since);

    // Sitios nuevos: su primera reseña cargada es de esta semana y están todas cargadas
    // (si faltan, la primera de verdad es más antigua).
    const byPlace = new Map<string, { first: number; loaded: number; total: number; name: string; author: string }>();
    all.forEach((r) => {
        const placeId = str(r.placeId);
        const at = toMillis(r.createdAt);
        const entry = byPlace.get(placeId) ?? { first: Infinity, loaded: 0, total: 0, name: '', author: '' };
        entry.loaded += 1;
        entry.total = Math.max(entry.total, num(r.placeReviewsCount) || 0);
        if (at && at < entry.first) {
            entry.first = at;
            entry.name = str(r.placeName);
            entry.author = str(r.authorName);
        }
        byPlace.set(placeId, entry);
    });
    const debuts = Array.from(byPlace.entries())
        .filter(([, p]) => p.first >= since && p.first <= input.now && p.loaded >= p.total && p.name)
        .sort((a, b) => b[1].first - a[1].first);

    const isDish = input.isDish ?? (() => true);
    const star = week
        .filter((r) => isDish(r) && str(r.itemName))
        .sort((a, b) => (num(b.overallRating) - num(a.overallRating))
            || (Number(Boolean(b.photoUrl)) - Number(Boolean(a.photoUrl)))
            || (toMillis(b.createdAt) - toMillis(a.createdAt)))[0];

    const lists = new Map<string, { name: string; count: number }>();
    week.forEach((r) => {
        const id = str(r.listId);
        const name = str(r.listName);
        if (!id || !name) return;
        const entry = lists.get(id) ?? { name, count: 0 };
        entry.count += 1;
        lists.set(id, entry);
    });
    const busiest = Array.from(lists.entries()).sort((a, b) => (b[1].count - a[1].count) || (a[0] < b[0] ? -1 : 1))[0];

    return {
        reviews: week.length,
        withPhoto: week.filter((r) => str(r.photoUrl)).length,
        newPlaces: debuts.length,
        star: star ? {
            title: str(star.itemName),
            detail: str(star.placeName) || undefined,
            score: num(star.overallRating),
            to: groupPath(str(star.placeId), str(star.itemName)),
        } : null,
        newcomer: debuts[0] ? {
            title: debuts[0][1].name,
            detail: debuts[0][1].author ? `lo estrenó ${debuts[0][1].author.split(/\s+/)[0]}` : undefined,
            to: `/place/${debuts[0][0]}`,
        } : null,
        busiestList: busiest && busiest[1].count >= 2 ? { title: busiest[1].name, count: busiest[1].count, to: `/list/${busiest[0]}` } : null,
    };
}

/** Lo último de cada persona a la que sigues (una por persona, del último mes, lo más nuevo primero). */
export function buildFriendBites(input: {
    reviews: ReadonlyArray<HomeFeedReview & { authorPhotoURL?: string | null; userPhoto?: string | null }>;
    following: ReadonlyArray<string>;
    me?: string | null;
    now: number;
    max?: number;
}): FriendBite[] {
    if (!input.following.length) return [];
    const following = new Set(input.following);
    const since = input.now - 30 * DAY_MS;
    const latest = new Map<string, FriendBite>();
    usable(input.reviews, new Set()).forEach((r) => {
        const author = authorOf(r);
        if (!author || author === input.me || !following.has(author)) return;
        const at = toMillis(r.createdAt);
        if (at < since || !str(r.itemName)) return;
        const prev = latest.get(author);
        if (prev && prev.at >= at) return;
        latest.set(author, {
            id: r.id,
            authorId: author,
            authorName: str(r.authorName).split(/\s+/)[0] || 'Tu colega',
            authorPhoto: str(r.authorPhoto) || null,
            title: str(r.itemName),
            place: str(r.placeName),
            score: num(r.overallRating),
            photo: str(r.photoUrl) || null,
            at,
            to: groupPath(str(r.placeId), str(r.itemName)),
        });
    });
    return Array.from(latest.values()).sort((a, b) => b.at - a.at).slice(0, input.max ?? 8);
}

/** «hoy», «ayer», «3 d», «2 sem». */
export function shortAgo(at: number, now: number): string {
    const day = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const days = Math.round((day(now) - day(at)) / DAY_MS);
    if (days <= 0) return 'hoy';
    if (days === 1) return 'ayer';
    if (days < 14) return `${days} d`;
    return `${Math.floor(days / 7)} sem`;
}
