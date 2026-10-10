import { describe, expect, it } from 'vitest';
import type { CanonicalPlaceItem } from '../../../services/CanonicalItemService';
import type { ManagerPlaceReview } from '../../../services/BusinessProService';
import {
    bandCounts,
    computeDelta,
    computeHeadlines,
    countReviewsIn,
    dateKeyOf,
    dayDetail,
    formatDayLabel,
    itemsToImprove,
    lastDateKeys,
    monthlyReviews,
    reviewCoverage,
    summarizeTraffic,
    topItemsByCount,
    topItemsByScore,
    weekdayIndex,
    weekdayStrengths,
    type DayStats,
    type HeadlineInput,
} from './statsModel';

const day = (date: string, patch: Partial<DayStats> = {}): DayStats => ({
    date,
    views: 0,
    sessions: 0,
    authViews: 0,
    anonViews: 0,
    bySource: {},
    byDevice: {},
    shares: 0,
    byShareChannel: {},
    byShareEntityType: {},
    ...patch,
});

const NOW = Date.UTC(2026, 9, 10, 10, 0); // sábado 10 oct 2026, 12:00 en Madrid

const review = (id: string, createdAtMs: number, overallRating: number | null = 8): ManagerPlaceReview => ({
    id,
    refPath: `lists/l/reviews/${id}`,
    itemId: 'croquetas',
    itemName: 'Croquetas',
    authorName: 'Ana',
    overallRating,
    comment: '',
    createdAtMs,
});

const item = (id: string, average: number | null, ratings: number, patch: Partial<CanonicalPlaceItem> = {}): CanonicalPlaceItem => ({
    id,
    canonicalName: id,
    stats: { reviewCount: ratings, ratingCount: ratings, averageRating: average, photoCount: 1 },
    ...patch,
});

describe('fechas de Madrid', () => {
    it('usa el día de Madrid, no el de UTC', () => {
        expect(dateKeyOf(Date.UTC(2026, 9, 3, 23, 30))).toBe('2026-10-04');
    });

    it('cuenta días de calendario aunque cambie la hora (no repite ni salta)', () => {
        // 31 mar 2025, 00:30 en Madrid: el 30 solo tuvo 23 horas.
        const keys = lastDateKeys(3, Date.UTC(2025, 2, 30, 22, 30));
        expect(keys).toEqual(['2025-03-29', '2025-03-30', '2025-03-31']);
        expect(new Set(lastDateKeys(60, NOW)).size).toBe(60);
        expect(lastDateKeys(60, NOW).at(-1)).toBe('2026-10-10');
    });

    it('días de la semana con el lunes como 0 y etiquetas en español', () => {
        expect(weekdayIndex('2026-10-05')).toBe(0);
        expect(weekdayIndex('2026-10-04')).toBe(6);
        expect(formatDayLabel('2026-10-04')).toBe('dom 4 oct');
        expect(formatDayLabel('2026-10-04', false)).toBe('4 oct');
        expect(dayDetail(day('2026-10-10', { views: 12, shares: 1 }))).toBe('sáb 10 oct · 12 visitas · 1 compartido');
    });
});

describe('computeDelta', () => {
    it('siempre con flecha y texto', () => {
        expect(computeDelta(118, 100)).toEqual({ kind: 'up', arrow: '▲', text: '18 % vs. periodo anterior' });
        expect(computeDelta(50, 100)).toEqual({ kind: 'down', arrow: '▼', text: '50 % vs. periodo anterior' });
        expect(computeDelta(5, 5)?.arrow).toBe('＝');
        expect(computeDelta(0, 0)?.kind).toBe('same');
        expect(computeDelta(3, 0)?.text).toBe('Antes no había ninguna');
        expect(computeDelta(3, null)).toBeNull();
    });
});

describe('summarizeTraffic', () => {
    const keys = lastDateKeys(60, NOW);
    const all = keys.map((key, index) => day(key, {
        views: index < 30 ? 1 : 2,
        sessions: 1,
        shares: index >= 53 ? 1 : 0,
        byShareChannel: index >= 53 ? { whatsapp: 1 } : {},
        bySource: { search: 1 },
    }));

    it('periodo actual y anterior', () => {
        const week = summarizeTraffic(all, 7);
        expect(week.views).toBe(14);
        expect(week.prevViews).toBe(14);
        expect(week.shares).toBe(7);
        expect(week.topShareChannel).toBe('whatsapp');
        const month = summarizeTraffic(all, 30);
        expect(month.views).toBe(60);
        expect(month.prevViews).toBe(30);
        expect(month.days).toHaveLength(30);
    });

    it('sin periodo anterior completo no compara', () => {
        expect(summarizeTraffic(all.slice(-10), 7).prevViews).toBeNull();
    });
});

describe('weekdayStrengths', () => {
    it('corona el día con más visitas de media si hay suficientes', () => {
        const keys = lastDateKeys(60, NOW);
        const all = keys.map((key) => day(key, { views: weekdayIndex(key) === 5 ? 10 : 1 }));
        const result = weekdayStrengths(all);
        expect(result.best?.name).toBe('sábado');
        expect(result.best?.plural).toBe('sábados');
        expect(result.days).toHaveLength(7);
    });

    it('con pocas visitas no corona a nadie', () => {
        const keys = lastDateKeys(60, NOW);
        const all = keys.map((key, index) => day(key, { views: index === 59 ? 3 : 0 }));
        expect(weekdayStrengths(all).best).toBeNull();
    });
});

describe('valoraciones', () => {
    const DAY = 86_400_000;
    const keys = lastDateKeys(7, NOW);

    it('cuenta las del periodo y avisa si la lectura se quedó corta', () => {
        const reviews = [review('a', NOW - DAY), review('b', NOW - 2 * DAY), review('c', NOW - 20 * DAY)];
        const full = reviewCoverage(reviews, { newestFirst: true, capped: false });
        expect(countReviewsIn(reviews, keys, full)).toEqual({ count: 2, partial: false });

        // Leídas las 100 más recientes y la más antigua cae dentro del periodo: puede haber más.
        const recent = [review('a', NOW - DAY), review('b', NOW - 2 * DAY)];
        expect(countReviewsIn(recent, keys, reviewCoverage(recent, { newestFirst: true, capped: true })).partial).toBe(true);
        // La más antigua es de antes del periodo: el periodo está completo.
        expect(countReviewsIn(reviews, keys, reviewCoverage(reviews, { newestFirst: true, capped: true })).partial).toBe(false);
        // Sin orden, 100 cualquiera: nunca es completo.
        expect(countReviewsIn(reviews, keys, reviewCoverage(reviews, { newestFirst: false, capped: true })).partial).toBe(true);
    });

    it('reparte por tramos y por mes', () => {
        const reviews = [review('a', NOW, 9.5), review('b', NOW, 7), review('c', NOW - 40 * DAY, 2), review('d', NOW, null)];
        expect(bandCounts(reviews)).toEqual({ top: 1, good: 1, ok: 0, low: 0, bad: 1 });
        const months = monthlyReviews(reviews, 6, NOW);
        expect(months.map((month) => month.key)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
        expect(months[5]).toMatchObject({ label: 'oct', count: 3, average: 8.25 });
        expect(months[4]).toMatchObject({ count: 0, average: null });
        expect(months[3]).toMatchObject({ count: 1, average: 2 });
    });
});

describe('platos', () => {
    const items = [
        item('croquetas', 9.2, 12),
        item('pulpo', 8.1, 3),
        item('tortilla', 9.8, 2), // < 3 valoraciones: no entra en «Mejor nota»
        item('bravas', 5.5, 6),
        item('flan', 6.4, 4),
        item('nuevo', null, 0),
    ];

    it('mejor nota: al menos 3 valoraciones y desde «Muy bueno»; más valorados por cantidad', () => {
        expect(topItemsByScore(items, 5).map((entry) => entry.id)).toEqual(['croquetas', 'pulpo']);
        expect(topItemsByCount(items, 3).map((entry) => entry.id)).toEqual(['croquetas', 'bravas', 'flan']);
    });

    it('margen de mejora: por debajo de «Muy bueno», los más flojos primero', () => {
        expect(itemsToImprove(items, new Set(), 3).map((entry) => entry.id)).toEqual(['bravas', 'flan']);
        expect(itemsToImprove(items, new Set(['bravas']), 3).map((entry) => entry.id)).toEqual(['flan']);
    });
});

describe('computeHeadlines', () => {
    const traffic = (patch: Partial<NonNullable<HeadlineInput['traffic']>> = {}): HeadlineInput['traffic'] => ({
        views: 40,
        prevViews: 40,
        totalViews: 80,
        searchViews: 0,
        topShareChannel: null,
        bestWeekdayPlural: null,
        ...patch,
    });
    const star = { id: 'croquetas', name: 'Croquetas', average: 9.2, ratings: 12, reviews: 12, photos: 0 };

    it('racha, estrella y buscadores, como mucho 3', () => {
        const list = computeHeadlines({
            traffic: traffic({ views: 60, searchViews: 30, topShareChannel: 'whatsapp', bestWeekdayPlural: 'sábados' }),
            bestItem: star,
        });
        expect(list.map((entry) => entry.key)).toEqual(['streak', 'star', 'search']);
        expect(list[0].text).toBe('¡Tu ficha está en racha! +50 % visitas');
        expect(list[1].text).toBe('Tu estrella es Croquetas · 9.2 🤩');
        expect(list[2].text).toBe('Más de la mitad de tus visitas llega desde buscadores');
    });

    it('días tranquilos lleva a Promos', () => {
        const [calm] = computeHeadlines({ traffic: traffic({ views: 20, prevViews: 40 }), bestItem: null });
        expect(calm).toMatchObject({ key: 'calm', action: 'sponsored' });
    });

    it('«1 de cada k» con una parte de buscadores', () => {
        const list = computeHeadlines({ traffic: traffic({ searchViews: 12 }), bestItem: null });
        expect(list[0].text).toBe('1 de cada 3 visitas llega desde buscadores');
    });

    it('«estamos empezando» solo con muy pocas visitas; sin tráfico, nada', () => {
        expect(computeHeadlines({ traffic: traffic({ views: 2, prevViews: 1, totalViews: 3 }), bestItem: null })[0].key).toBe('empty');
        expect(computeHeadlines({ traffic: traffic(), bestItem: null })).toEqual([]);
        expect(computeHeadlines({ traffic: null, bestItem: null })).toEqual([]);
    });
});
