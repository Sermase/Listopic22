import { describe, expect, it } from 'vitest';
import { buildFriendBites, buildZoneWeek, isWeekSampleCapped, shortAgo } from './zoneWeek';
import type { HomeFeedReview } from './homeFeeds';

const NOW = new Date(2026, 10, 6, 20).getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000);
const r = (id: string, extra: Partial<HomeFeedReview>): HomeFeedReview => ({
    id, placeId: 'p1', placeName: 'Bar Uno', itemName: 'Bravas', overallRating: 8, userId: 'u1', authorName: 'Cris López',
    listId: 'l1', listName: 'Patatas bravas', visibility: 'public', createdAt: daysAgo(1), placeReviewsCount: 1, ...extra,
});

describe('tu zona esta semana', () => {
    it('cuenta valoraciones, fotos, plato estrella y lista más movida de los últimos 7 días', () => {
        const week = buildZoneWeek({
            now: NOW,
            reviews: [
                r('a', { overallRating: 9.2, photoUrl: 'x.jpg', placeId: 'p2', placeName: 'Casa Carta', itemName: 'Croqueta' }),
                r('b', { overallRating: 7 }),
                r('c', { overallRating: 9.9, createdAt: daysAgo(10) }),
                r('d', { overallRating: 6, listId: 'l2', listName: 'Tartas' }),
            ],
        });
        expect(week.reviews).toBe(3);
        expect(week.withPhoto).toBe(1);
        expect(week.star).toMatchObject({ title: 'Croqueta', detail: 'Casa Carta', score: 9.2, to: '/group/p2/Croqueta' });
        expect(week.busiestList).toMatchObject({ title: 'Patatas bravas', count: 2, to: '/list/l1' });
    });

    it('sitio nuevo: su primera reseña es de esta semana y están todas cargadas', () => {
        const week = buildZoneWeek({
            now: NOW,
            reviews: [
                r('a', { placeId: 'nuevo', placeName: 'La Viña', createdAt: daysAgo(2), placeReviewsCount: 1 }),
                r('b', { placeId: 'viejo', placeName: 'El Viejo', createdAt: daysAgo(1), placeReviewsCount: 5 }),
            ],
        });
        expect(week.newPlaces).toBe(1);
        expect(week.newcomer).toMatchObject({ title: 'La Viña', detail: 'lo estrenó Cris', to: '/place/nuevo' });
    });

    it('sin bots, privadas ni nombres basura', () => {
        const week = buildZoneWeek({
            now: NOW,
            bots: new Set(['bot']),
            reviews: [r('a', { userId: 'bot' }), r('b', { visibility: 'private' }), r('c', { itemName: 'asdf' })],
        });
        expect(week.reviews).toBe(0);
        expect(week.star).toBeNull();
    });
});

describe('reseñas cargadas con tope', () => {
    it('con 100 y la más antigua de esta semana, los totales son «o más»', () => {
        const recent = Array.from({ length: 100 }, (_, i) => ({ createdAt: daysAgo(i % 5) }));
        expect(isWeekSampleCapped(recent, NOW)).toBe(true);
        expect(isWeekSampleCapped([...recent.slice(1), { createdAt: daysAgo(9) }], NOW)).toBe(false);
        expect(isWeekSampleCapped(recent.slice(0, 40), NOW)).toBe(false);
    });
});

describe('tus colegas', () => {
    it('lo último de cada persona que sigues, del último mes', () => {
        const bites = buildFriendBites({
            now: NOW,
            me: 'yo',
            following: ['u1', 'u2'],
            reviews: [
                r('a', { userId: 'u1', createdAt: daysAgo(3), itemName: 'Tortilla' }),
                r('b', { userId: 'u1', createdAt: daysAgo(1), itemName: 'Bravas' }),
                r('c', { userId: 'u2', createdAt: daysAgo(40) }),
                r('d', { userId: 'u3' }),
                r('e', { userId: 'yo' }),
            ],
        });
        expect(bites.map((b) => [b.authorId, b.title])).toEqual([['u1', 'Bravas']]);
        expect(bites[0].authorName).toBe('Cris');
    });

    it('fecha corta', () => {
        expect(shortAgo(NOW - 3_600_000, NOW)).toBe('hoy');
        expect(shortAgo(daysAgo(1).getTime(), NOW)).toBe('ayer');
        expect(shortAgo(daysAgo(4).getTime(), NOW)).toBe('4 d');
    });
});
