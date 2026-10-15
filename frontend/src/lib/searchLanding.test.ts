import { describe, expect, it } from 'vitest';
import {
    LIST_VISIT_DEBOUNCE_MS,
    agoLabel,
    applyListVisit,
    formatKm,
    parseListVisits,
    parseRecentSearches,
    pickNearby,
    rankTasteMatches,
    rankYourPeople,
    topListVisits,
    type LandingReview,
    type ListVisit,
} from './searchLanding';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 15, 12);
const MADRID = { latitude: 40.4168, longitude: -3.7038 };

let seq = 0;
const review = (patch: Partial<LandingReview>): LandingReview => ({
    id: `r${++seq}`,
    placeId: 'p1',
    placeName: 'Casa Pepe',
    itemName: 'Bravas',
    overallRating: 8,
    visibility: 'public',
    userId: 'u1',
    createdAt: NOW - DAY,
    placeLat: MADRID.latitude,
    placeLng: MADRID.longitude,
    ...patch,
});

describe('parseRecentSearches', () => {
    it('acepta solo textos, sin repetidos y como mucho k', () => {
        expect(parseRecentSearches('["bravas", "Bravas", 3, "", " ramen "]')).toEqual(['bravas', 'ramen']);
        expect(parseRecentSearches(JSON.stringify(Array.from({ length: 12 }, (_, i) => `q${i}`)))).toHaveLength(8);
    });
    it('tolera basura', () => {
        expect(parseRecentSearches(null)).toEqual([]);
        expect(parseRecentSearches('{nope')).toEqual([]);
        expect(parseRecentSearches('{"a":1}')).toEqual([]);
    });
});

describe('list visits', () => {
    it('cuenta visitas y no suma recargas seguidas', () => {
        let entries: ListVisit[] = [];
        entries = applyListVisit(entries, { id: 'a', name: 'Bravas', coverUrl: 'https://x/a.jpg' }, NOW);
        entries = applyListVisit(entries, { id: 'a', name: 'Bravas' }, NOW + 60_000);
        expect(entries[0]).toMatchObject({ id: 'a', count: 1, coverUrl: 'https://x/a.jpg' });
        entries = applyListVisit(entries, { id: 'a' }, NOW + LIST_VISIT_DEBOUNCE_MS + 60_000);
        expect(entries[0]).toMatchObject({ count: 2, name: 'Bravas' });
    });

    it('no guarda portadas en línea', () => {
        const [entry] = applyListVisit([], { id: 'a', name: 'X', coverUrl: 'data:image/png;base64,AAAA' }, NOW);
        expect(entry.coverUrl).toBeNull();
    });

    it('se queda con las 30 más recientes', () => {
        let entries: ListVisit[] = [];
        for (let i = 0; i < 35; i++) entries = applyListVisit(entries, { id: `l${i}`, name: `L${i}` }, NOW + i * DAY);
        expect(entries).toHaveLength(30);
        expect(entries.some((e) => e.id === 'l0')).toBe(false);
        expect(entries[0].id).toBe('l34');
    });

    it('ordena por frecuencia y desempata por recencia', () => {
        const entries: ListVisit[] = [
            { id: 'a', name: 'A', coverUrl: null, count: 2, lastAt: NOW - DAY },
            { id: 'b', name: 'B', coverUrl: null, count: 5, lastAt: NOW - 5 * DAY },
            { id: 'c', name: 'C', coverUrl: null, count: 2, lastAt: NOW },
            { id: 'd', name: '', coverUrl: null, count: 9, lastAt: NOW },
        ];
        expect(topListVisits(entries).map((e) => e.id)).toEqual(['b', 'c', 'a']);
    });

    it('parseListVisits descarta entradas rotas', () => {
        expect(parseListVisits('[{"id":"a","name":"A","count":1,"lastAt":1},{"id":""},5]')).toHaveLength(1);
        expect(parseListVisits('oops')).toEqual([]);
    });
});

describe('pickNearby', () => {
    const far = { placeLat: 41.3874, placeLng: 2.1686 }; // Barcelona

    it('se queda con lo bien valorado cerca y pone la distancia', () => {
        const reviews = [
            review({ placeId: 'near1', placeName: 'Cerca 1', overallRating: 9 }),
            review({ placeId: 'near2', placeName: 'Cerca 2', overallRating: 8.5, placeLat: 40.42, placeLng: -3.71 }),
            review({ placeId: 'near3', placeName: 'Cerca 3', overallRating: 8 }),
            review({ placeId: 'near4', placeName: 'Cerca 4', overallRating: 7.5 }),
            review({ placeId: 'meh', placeName: 'Meh', overallRating: 4 }),
            review({ placeId: 'bcn', placeName: 'Lejos', overallRating: 10, ...far }),
        ];
        const { cards, radiusKm } = pickNearby(reviews, 'place', { origin: MADRID, now: NOW });
        expect(radiusKm).toBe(5);
        expect(cards.map((c) => c.id)).toEqual(['near1', 'near2', 'near3', 'near4']);
        expect(cards[1].subtitle).toMatch(/^a \d/);
        expect(cards[0].to).toBe('/place/near1');
    });

    it('amplía el radio si cerca hay poco y, si no hay nada, da el top general', () => {
        const reviews = [review({ placeId: 'bcn', ...far, overallRating: 9 })];
        const result = pickNearby(reviews, 'place', { origin: MADRID, now: NOW });
        expect(result.radiusKm).toBeNull();
        expect(result.cards.map((c) => c.id)).toEqual(['bcn']);
    });

    it('la foto del sitio cae a la de una reseña si el sitio no tiene', () => {
        const reviews = [review({ placeId: 'x', placeMainImage: null, photoUrls: ['https://img/r.jpg'] })];
        const [card] = pickNearby(reviews, 'place', { origin: null, now: NOW }).cards;
        expect(card.photoUrl).toBe('https://img/r.jpg');
    });

    it('agrupa platos por sitio + nombre y enlaza al grupo', () => {
        const reviews = [
            review({ placeId: 'p1', itemName: 'Bravas', overallRating: 9 }),
            review({ placeId: 'p1', itemName: 'bravas ', overallRating: 8 }),
            review({ placeId: 'p1', itemName: 'Croquetas', overallRating: 7.2 }),
            review({ placeId: 'p2', itemName: '', overallRating: 9 }),
        ];
        const { cards } = pickNearby(reviews, 'dish', { origin: null, now: NOW });
        expect(cards).toHaveLength(2);
        expect(cards[0]).toMatchObject({ kind: 'dish', count: 2, rating: 8.5, to: '/group/p1/Bravas' });
    });

    it('fuera bots, privadas, cerrados y repes', () => {
        const dup = review({ id: 'same', placeId: 'ok' });
        const reviews = [
            dup, { ...dup },
            review({ placeId: 'bot', authorUserType: ['bot'] }),
            review({ placeId: 'botid', userId: 'b1' }),
            review({ placeId: 'priv', visibility: 'private' }),
            review({ placeId: 'closed', placeClosedStatus: 'CLOSED_PERMANENTLY' }),
        ];
        const { cards } = pickNearby(reviews, 'place', { origin: null, now: NOW, botUserIds: new Set(['b1']) });
        expect(cards.map((c) => c.id)).toEqual(['ok']);
        expect(cards[0].count).toBe(1);
    });

    it('usa la nota pública del sitio cuando la hay', () => {
        const [card] = pickNearby(
            [review({ placeId: 'x', overallRating: 7, placeAverageRating: 8.8, placeReviewsCount: 12 })],
            'place', { origin: null, now: NOW },
        ).cards;
        expect(card).toMatchObject({ rating: 8.8, count: 12 });
    });
});

describe('rankTasteMatches', () => {
    const own = [
        { placeId: 'a', itemName: 'Bravas', overallRating: 9 },
        { placeId: 'b', overallRating: 6 },
        { placeId: 'c', overallRating: 8 },
    ];

    it('sugiere a quien puntúa parecido y excluye a seguidos, a ti y a bots', () => {
        const pool = [
            review({ userId: 'twin', placeId: 'a', itemName: 'Bravas', overallRating: 9 }),
            review({ userId: 'twin', placeId: 'b', overallRating: 6 }),
            review({ userId: 'twin', placeId: 'c', overallRating: 8 }),
            review({ userId: 'meh', placeId: 'a', overallRating: 2 }),
            review({ userId: 'followed', placeId: 'a', overallRating: 9 }),
            review({ userId: 'me', placeId: 'a', overallRating: 9 }),
            review({ userId: 'robot', placeId: 'a', overallRating: 9, authorUserType: 'bot' }),
            review({ userId: 'stranger', placeId: 'zzz', overallRating: 9 }),
        ];
        const result = rankTasteMatches(own, pool, { selfId: 'me', exclude: new Set(['followed']) });
        expect(result.map((r) => r.uid)).toEqual(['twin']);
        expect(result[0].score).toBeGreaterThanOrEqual(80);
        expect(result[0].reason).toContain('3 sitios en común');
    });

    it('sin reseñas propias no hay sugerencias', () => {
        expect(rankTasteMatches([], [review({})], { selfId: 'me' })).toEqual([]);
    });
});

describe('rankYourPeople', () => {
    it('chats recientes primero, luego actividad, luego seguidos', () => {
        const ranked = rankYourPeople({
            selfId: 'me',
            now: NOW,
            following: [
                { uid: 'quiet', followedAt: NOW - 300 * DAY, displayName: 'Quiet' },
                { uid: 'active', followedAt: NOW - 300 * DAY },
                { uid: 'chatty', followedAt: NOW - 300 * DAY },
            ],
            chats: [
                { participants: ['me', 'chatty'], updatedAt: NOW - DAY, type: 'private' },
                { participants: ['me', 'pal'], updatedAt: NOW - 200 * DAY, type: 'private' },
            ],
            pool: [review({ userId: 'active', createdAt: NOW - 2 * DAY, authorName: 'Act' }), review({ userId: 'random' })],
        });
        expect(ranked.map((p) => p.uid)).toEqual(['chatty', 'active', 'pal', 'quiet']);
        expect(ranked[0].reason).toBe('Habláis: ayer');
        expect(ranked[1]).toMatchObject({ reason: 'Reseñó hace 2 d', name: 'Act' });
        expect(ranked[3]).toMatchObject({ reason: 'Le sigues', name: 'Quiet' });
    });
});

describe('formatos', () => {
    it('formatKm', () => {
        expect(formatKm(0.42)).toBe('400 m');
        expect(formatKm(0.01)).toBe('100 m');
        expect(formatKm(1.24)).toBe('1,2 km');
        expect(formatKm(23.6)).toBe('24 km');
    });
    it('agoLabel', () => {
        expect(agoLabel(NOW - 1000, NOW)).toBe('hoy');
        expect(agoLabel(NOW - 1.5 * DAY, NOW)).toBe('ayer');
        expect(agoLabel(NOW - 20 * DAY, NOW)).toBe('hace 2 sem');
        expect(agoLabel(NOW - 90 * DAY, NOW)).toBe('');
    });
});
