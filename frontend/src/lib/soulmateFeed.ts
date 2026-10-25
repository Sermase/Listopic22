/**
 * «Les encantó» (Inicio): platos que han puntuado alto las personas
 * con tu mismo gusto (utils/tasteMatch) y que tú aún no has probado.
 * Puro, sin lecturas extra: sale de las reseñas que la Home ya tiene.
 */
import type { HomeFeedCard, HomeFeedReview } from './homeFeeds';
import { normalizeItemName } from './listElements';
import { toMillis } from '../utils/adminTime';

export interface Soulmate {
    uid: string;
    displayName?: string;
    photoUrl?: string | null;
    affinityScore: number;
}

const SOULMATE_MIN_RATING = 7.5;
const PER_SOULMATE = 2;
const MAX_CARDS = 12;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const photoOf = (review: HomeFeedReview): string | null => {
    if (Array.isArray(review.photoUrls)) {
        const first = review.photoUrls.find((url) => typeof url === 'string' && url.trim());
        if (typeof first === 'string') return first;
    }
    return text(review.photoUrl) || null;
};

const dishKey = (placeId: string, itemName: unknown): string => `${placeId}::${normalizeItemName(itemName)}`;

export function buildSoulmateFeed(
    soulmates: readonly Soulmate[],
    reviews: readonly HomeFeedReview[],
    ownReviews: readonly HomeFeedReview[],
): HomeFeedCard[] {
    if (soulmates.length === 0) return [];
    const byUid = new Map(soulmates.map((s) => [s.uid, s]));
    const tried = new Set(ownReviews.map((r) => (text(r.placeId) ? dishKey(text(r.placeId), r.itemName) : '')).filter(Boolean));

    const candidates = reviews
        .map((review) => {
            const uid = text(review.userId) || text(review.authorId);
            const soulmate = byUid.get(uid);
            const placeId = text(review.placeId);
            const itemName = text(review.itemName);
            const rating = typeof review.overallRating === 'number' ? review.overallRating : Number(review.overallRating);
            if (!soulmate || !placeId || !itemName || !Number.isFinite(rating) || rating < SOULMATE_MIN_RATING) return null;
            if (review.visibility === 'private' || tried.has(dishKey(placeId, itemName))) return null;
            return { review, soulmate, placeId, itemName, rating, at: toMillis(review.createdAt) };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null)
        // Lo más reciente primero; a igualdad, el alma más gemela.
        .sort((a, b) => b.at - a.at || b.soulmate.affinityScore - a.soulmate.affinityScore);

    const perUser = new Map<string, number>();
    const seenDish = new Set<string>();
    const cards: HomeFeedCard[] = [];
    for (const c of candidates) {
        const key = dishKey(c.placeId, c.itemName);
        const used = perUser.get(c.soulmate.uid) ?? 0;
        if (seenDish.has(key) || used >= PER_SOULMATE) continue;
        seenDish.add(key);
        perUser.set(c.soulmate.uid, used + 1);
        const placeName = text(c.review.placeName);
        cards.push({
            key: `review:soulmate:${c.review.id}`,
            kind: 'review',
            id: c.review.id,
            title: c.itemName,
            subtitle: `💞 ${c.soulmate.affinityScore}% afín${placeName ? ` · ${placeName}` : ''}`,
            photoUrl: photoOf(c.review) || text(c.review.placeMainImage) || null,
            rating: Math.round(c.rating * 10) / 10,
            count: 1,
            to: `/group/${c.placeId}/${encodeURIComponent(c.itemName)}`,
            placeId: c.placeId,
            placeName,
            itemName: c.itemName,
            authorId: c.soulmate.uid,
            authorName: c.soulmate.displayName || text(c.review.authorName) || 'Alma gemela',
            authorPhoto: c.soulmate.photoUrl || text(c.review.authorPhoto) || null,
            createdAt: c.at,
        });
        if (cards.length >= MAX_CARDS) break;
    }
    return cards;
}
