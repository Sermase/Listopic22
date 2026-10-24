import { describe, expect, it } from 'vitest';
import {
    buildHomeFeeds,
    buildListAreaStats,
    homeFeedAreaKey,
    isJunkName,
    previousDaySeed,
    seededWeightedOrder,
    type HomeFeedList,
    type HomeFeedPlace,
    type HomeFeedReview,
} from './homeFeeds';

const NOW = new Date(2026, 9, 15, 12).getTime();
const DAY = 24 * 60 * 60 * 1000;

const DISHES = ['Tarta de queso', 'Hamburguesa clásica', 'Croquetas de jamón', 'Tortilla de patatas', 'Bravas', 'Cachopo', 'Ramen tonkotsu', 'Pizza margarita'];
const LISTS = ['tartas', 'burgers', 'croquetas', 'tortillas', 'bravas', 'cachopos'];

let counter = 0;
function review(partial: Partial<HomeFeedReview> & { placeId: string }): HomeFeedReview {
    counter += 1;
    return {
        id: `r${counter}`,
        listId: 'tartas',
        itemName: 'Tarta de queso',
        overallRating: 8.5,
        photoUrl: `https://img/${counter}.jpg`,
        userId: 'ser',
        authorName: 'Ser',
        createdAt: NOW - counter * DAY,
        visibility: 'public',
        listName: 'Tartas de queso',
        placeName: `Sitio ${partial.placeId}`,
        placeAverageRating: 8.5,
        placeReviewsCount: 2,
        comment: 'Cremosa por dentro, tostada por fuera y con una base de galleta que cruje como debe.',
        ...partial,
    };
}

/** Madrid: un solo reseñador con 40 reseñas repartidas en 20 sitios y 6 listas. */
function madridData() {
    counter = 0;
    const reviews: HomeFeedReview[] = [];
    for (let i = 0; i < 40; i += 1) {
        const p = i % 20;
        const listId = LISTS[i % LISTS.length];
        reviews.push(review({
            placeId: `mad${p}`,
            placeName: `Casa Madrileña ${p}`,
            listId,
            listName: `Lista ${listId}`,
            itemName: DISHES[i % DISHES.length],
            overallRating: 7 + (i % 7) * 0.5,
            placeAverageRating: 7.5 + (p % 5) * 0.4,
            placeReviewsCount: 1 + (p % 6),
            createdAt: NOW - (i * 3 + 1) * DAY,
        }));
    }
    const lists: HomeFeedList[] = [
        ...LISTS.map((id) => ({ id, name: `Lista ${id}`, userId: 'ser', isPublic: true, mainImageUrl: `https://img/list-${id}.jpg` })),
        // La lista más grande del mundo, sin nada en Madrid.
        { id: 'playas', name: 'Playas', userId: 'otro', isPublic: true, mainImageUrl: 'https://img/playas.jpg' },
    ];
    const places: HomeFeedPlace[] = [
        { id: 'cerrado', name: 'Bar Cerrado', rating: 9.5, placeReviewsCount: 1, closedStatus: 'permanently_closed' },
    ];
    return { reviews, lists, places };
}

const allKeys = (result: ReturnType<typeof buildHomeFeeds>) => result.feeds.flatMap((feed) => feed.items.map((item) => item.key));

describe('helpers', () => {
    it('isJunkName: marca basura sin tocar nombres reales', () => {
        ['', 'x', 'test', 'Prueba 2', 'asdfgh', 'qwerty', 'zzzz', 'bxbxbxkt', 'Holaaaaa', '1234', '---'].forEach((name) => {
            expect(isJunkName(name), name).toBe(true);
        });
        ['Tarta de queso', 'BBQ', 'KFC', 'La Sanabresa', 'Ñaque', 'Bar ....', 'Schmidt\'s Grill', 'Bo', 'Café Comercial'].forEach((name) => {
            expect(isJunkName(name), name).toBe(false);
        });
        expect(isJunkName(null)).toBe(true);
    });

    it('isJunkName: no castiga otros alfabetos ni palabras largas reales', () => {
        ['ラーメン', 'Борщ', '北京烤鸭店', 'Weltschmerz'].forEach((name) => {
            expect(isJunkName(name), name).toBe(false);
        });
    });

    it('seededWeightedOrder: misma semilla, mismo orden; otra semilla, otro orden', () => {
        const items = Array.from({ length: 30 }, (_, i) => `i${i}`);
        const a = seededWeightedOrder(items, (x) => x, () => 1, '2026-10-15');
        const b = seededWeightedOrder([...items].reverse(), (x) => x, () => 1, '2026-10-15');
        const c = seededWeightedOrder(items, (x) => x, () => 1, '2026-10-16');
        expect(a).toEqual(b);
        expect(a).not.toEqual(c);
        expect([...a].sort()).toEqual([...items].sort());
    });

    it('seededWeightedOrder: el peso alto suele ir primero', () => {
        let wins = 0;
        for (let d = 1; d <= 28; d += 1) {
            const order = seededWeightedOrder(['big', 'a', 'b', 'c'], (x) => x, (x) => (x === 'big' ? 50 : 1), `2026-02-${String(d).padStart(2, '0')}`);
            if (order[0] === 'big') wins += 1;
        }
        expect(wins).toBeGreaterThan(20);
    });

    it('previousDaySeed y homeFeedAreaKey', () => {
        expect(previousDaySeed('2026-03-01')).toBe('2026-02-28');
        expect(previousDaySeed('2026-01-01|city:madrid')).toBe('2025-12-31|city:madrid');
        expect(previousDaySeed('hola')).toBeNull();
        expect(homeFeedAreaKey({ kind: 'near' }, 5)).toBe('near:5');
        expect(homeFeedAreaKey({ kind: 'near' }, null)).toBe('near:all');
        expect(homeFeedAreaKey({ kind: 'city', value: 'Madrid' }, 5)).toBe('city:madrid');
    });
});

describe('buildListAreaStats', () => {
    it('solo cuenta reseñas de la zona y nunca el recuento global', () => {
        counter = 0;
        const stats = buildListAreaStats(
            [review({ placeId: 'a', listId: 'tartas' }), review({ placeId: 'b', listId: 'tartas' })],
            [{ id: 'tartas', name: 'Tartas' }, { id: 'playas', name: 'Playas' }],
        );
        expect(stats.map((s) => s.id)).toEqual(['tartas']);
        expect(stats[0]).toMatchObject({ inAreaReviews: 2, inAreaPlaces: 2, inAreaAuthors: 1, name: 'Tartas' });
    });

    it('descarta listas de bots y privadas', () => {
        counter = 0;
        const stats = buildListAreaStats(
            [review({ placeId: 'a', listId: 'bot' }), review({ placeId: 'b', listId: 'priv' }), review({ placeId: 'c', listId: 'ok' })],
            [{ id: 'bot', name: 'Bot list', userId: 'robot' }, { id: 'priv', name: 'Privada', isPublic: false }, { id: 'ok', name: 'Buena' }],
            ['robot'],
        );
        expect(stats.map((s) => s.id)).toEqual(['ok']);
    });
});

describe('buildHomeFeeds', () => {
    it('la lista del momento sale de la zona: Playas nunca en Madrid', () => {
        const data = madridData();
        for (let d = 1; d <= 20; d += 1) {
            const result = buildHomeFeeds({ ...data, seed: `2026-10-${String(d).padStart(2, '0')}`, userId: 'ser', now: NOW });
            expect(result.featuredList).not.toBeNull();
            expect(result.featuredList!.id).not.toBe('playas');
            expect(LISTS).toContain(result.featuredList!.id);
            expect(result.featuredList!.to).toBe(`/list/${result.featuredList!.id}`);
            expect(result.featuredList!.inAreaReviews).toBeGreaterThanOrEqual(3);
            const listIds = result.feeds.filter((f) => f.kind === 'list').flatMap((f) => f.items.map((i) => i.id));
            expect(listIds).not.toContain('playas');
        }
    });

    it('sin reseñas en la zona no hay lista destacada ni carruseles', () => {
        const result = buildHomeFeeds({ reviews: [], lists: madridData().lists, seed: '2026-10-15' });
        expect(result.featuredList).toBeNull();
        expect(result.feeds).toEqual([]);
    });

    it('determinista con la misma semilla; rota con otra', () => {
        const data = madridData();
        const a = buildHomeFeeds({ ...data, seed: '2026-10-15', areaKey: 'city:madrid', userId: 'ser', now: NOW });
        const b = buildHomeFeeds({ ...data, reviews: [...data.reviews].reverse(), seed: '2026-10-15', areaKey: 'city:madrid', userId: 'ser', now: NOW });
        expect(b).toEqual(a);

        const days = ['2026-10-16', '2026-10-17', '2026-10-18'].map((seed) =>
            buildHomeFeeds({ ...data, seed, areaKey: 'city:madrid', userId: 'ser', now: NOW }));
        const joyas = (r: typeof a) => r.feeds.find((f) => f.id === 'joyas')?.items.map((i) => i.id).join(',');
        const platos = (r: typeof a) => r.feeds.find((f) => f.id === 'platos')?.items.map((i) => i.id).join(',');
        expect(joyas(a)).toBeTruthy();
        expect(platos(a)).toBeTruthy();
        expect(days.some((r) => joyas(r) !== joyas(a))).toBe(true);
        expect(days.some((r) => platos(r) !== platos(a))).toBe(true);

        const otherArea = buildHomeFeeds({ ...data, seed: '2026-10-15', areaKey: 'near:5', userId: 'ser', now: NOW });
        expect(allKeys(otherArea)).not.toEqual(allKeys(a));
    });

    it('nada se repite entre carruseles ni con el ranking excluido', () => {
        const data = madridData();
        const exclude = { placeIds: ['mad0', 'mad1'], dishKeys: ['mad2::bravas'] };
        for (let d = 1; d <= 10; d += 1) {
            const result = buildHomeFeeds({ ...data, seed: `2026-11-${String(d).padStart(2, '0')}`, userId: 'ser', now: NOW, exclude });
            const keys = allKeys(result);
            expect(new Set(keys).size).toBe(keys.length);
            // Un sitio sale una vez entre los carruseles normales; el top de una lista
            // y tus recuerdos solo reservan su plato.
            const placeIds = result.feeds.filter((f) => f.kind !== 'list' && f.id !== 'ranking').flatMap((f) => f.items.map((i) => i.placeId));
            expect(new Set(placeIds).size).toBe(placeIds.length);
            expect(placeIds).not.toContain('cerrado');
            const dishKeys = result.feeds.flatMap((f) => f.items).filter((i) => i.placeId && i.itemName)
                .map((i) => `${i.placeId}::${i.itemName!.toLowerCase()}`);
            expect(new Set(dishKeys).size).toBe(dishKeys.length);
            // El top de una lista es fiel a su orden: puede coincidir con el ranking de arriba, el resto no.
            const notRanking = result.feeds.filter((f) => f.kind !== 'list' && f.id !== 'ranking').flatMap((f) => f.items.map((i) => i.placeId));
            expect(notRanking).not.toContain('mad0');
            expect(notRanking).not.toContain('mad1');
            const listIds = result.feeds.filter((f) => f.kind === 'list').flatMap((f) => f.items.map((i) => i.id));
            expect(listIds).not.toContain(result.featuredList?.id);
            result.feeds.forEach((feed) => {
                expect(feed.title).toBeTruthy();
                feed.items.forEach((item) => {
                    expect(item.to).toMatch(/^\/(list|place|group|profile)\//);
                    expect(item.title).toBeTruthy();
                });
            });
        }
    });

    it('con muy pocos datos devuelve lo que puede y oculta carruseles cojos', () => {
        counter = 0;
        const reviews = [
            review({ placeId: 'p1', placeName: 'La Tasca', listId: 'tartas', createdAt: NOW - 2 * DAY }),
            review({ placeId: 'p2', placeName: 'El Rincón', listId: 'tartas', itemName: 'Croquetas', createdAt: NOW - 5 * DAY }),
        ];
        const result = buildHomeFeeds({ reviews, lists: [{ id: 'tartas', name: 'Tartas de queso' }], seed: '2026-10-15', userId: 'ser' });
        expect(result.featuredList?.id).toBe('tartas');
        expect(result.featuredList?.subtitle).toContain('2 sitios valorados aquí');
        result.feeds.forEach((feed) => expect(feed.items.length).toBeGreaterThanOrEqual(2));
        expect(result.feeds.find((f) => f.id === 'listas')).toBeUndefined();
    });

    it('excluye bots, sitios cerrados y nombres basura', () => {
        counter = 0;
        const reviews = [
            review({ placeId: 'b1', placeName: 'Bot Place', userId: 'robot', listId: 'botlist', listName: 'Bot list' }),
            review({ placeId: 'c1', placeName: 'Cerrado', placeClosedStatus: 'permanently_closed', listId: 'cerrados', listName: 'Cerrados' }),
            review({ placeId: 'j1', placeName: 'preubrababxbx', itemName: 'asdf', listId: 'junk', listName: 'Junk' }),
            review({ placeId: 'j2', placeName: 'Bar Pepe', listId: 'test', listName: 'test' }),
            ...['a', 'b', 'c', 'd'].map((p) => review({ placeId: p, placeName: `Mesón ${p.toUpperCase()}`, listId: 'buena', listName: 'Buena' })),
        ];
        const result = buildHomeFeeds({ reviews, botUserIds: ['robot'], seed: '2026-10-15', now: NOW, minItems: 1 });
        expect(result.featuredList?.id).toBe('buena');
        const placeIds = result.feeds.flatMap((f) => f.items.map((i) => i.placeId)).filter(Boolean);
        expect(placeIds).not.toContain('b1');
        expect(placeIds).not.toContain('c1');
        expect(placeIds).not.toContain('j1');
        const lists = buildListAreaStats(reviews, [], ['robot']).map((s) => s.id);
        expect(lists).toEqual(expect.arrayContaining(['buena']));
        expect(lists).not.toContain('botlist');
        expect(lists).not.toContain('test');
    });

    it('joyas usa el recuento público real: un sitio famoso no es joya', () => {
        counter = 0;
        const reviews = ['f', 'g1', 'g2', 'g3', 'g4'].map((p) => review({
            placeId: p,
            placeName: p === 'f' ? 'Famoso' : `Escondido ${p}`,
            placeAverageRating: 9.2,
            placeReviewsCount: p === 'f' ? 40 : 2,
        }));
        const result = buildHomeFeeds({ reviews, seed: '2026-10-15', now: NOW });
        const allPlaceIds = result.feeds.filter((f) => f.id === 'joyas').flatMap((f) => f.items.map((i) => i.placeId));
        expect(allPlaceIds).not.toContain('f');
    });

    it('enlaces de plato con el nombre codificado', () => {
        counter = 0;
        const reviews = ['a', 'b', 'c', 'd'].map((p, i) => review({ placeId: p, itemName: `Tarta n.º ${i} / especial` }));
        const result = buildHomeFeeds({ reviews, seed: '2026-10-15', now: NOW });
        const dish = result.feeds.find((f) => f.kind === 'dish')!.items[0];
        expect(dish.to).toBe(`/group/${dish.placeId}/${encodeURIComponent(dish.itemName!)}`);
    });
});

describe('revisión', () => {
    it('recién llegados: no llama nuevo a un sitio con reseñas antiguas fuera de la ventana', () => {
        counter = 0;
        // 'viejo' tiene 3 reseñas públicas, pero solo 2 recientes cargadas: no es un debut.
        const reviews = [
            ...['n1', 'n2', 'n3'].map((p) => review({ placeId: p, placeName: `Nuevo ${p}`, placeReviewsCount: 1, createdAt: NOW - 3 * DAY })),
            ...[1, 2].map(() => review({ placeId: 'viejo', placeName: 'Casa Vieja', placeReviewsCount: 3, createdAt: NOW - 5 * DAY })),
        ];
        const result = buildHomeFeeds({ reviews, seed: '2026-10-15', now: NOW, minItems: 1 });
        const nuevos = result.feeds.find((f) => f.id === 'novedades')?.items.map((i) => i.placeId) ?? [];
        expect(nuevos).not.toContain('viejo');
    });

    it('un sitio sin media pública usa la media de sus reseñas, no la primera', () => {
        counter = 0;
        const reviews = [9.5, 5, 5].map((rating) => review({
            placeId: 'pepe', placeName: 'Bar Pepe', overallRating: rating, placeAverageRating: undefined, placeReviewsCount: 3,
        }));
        const result = buildHomeFeeds({ reviews, seed: '2026-10-15', now: NOW, minItems: 1 });
        const cards = result.feeds.flatMap((f) => f.items).filter((i) => i.kind === 'place' && i.placeId === 'pepe');
        cards.forEach((card) => expect(card.rating).toBeCloseTo(6.5, 5));
    });
});

describe('poca variedad', () => {
    it('todo en una sola lista: los platos se muestran igual (sin tope por lista)', () => {
        counter = 0;
        const reviews = ['a', 'b', 'c', 'd'].map((p) => review({ placeId: p, listId: 'tartas' }));
        const result = buildHomeFeeds({ reviews, seed: '2026-10-15', now: NOW });
        expect(result.feeds.find((f) => f.id === 'platos')?.items.length).toBe(4);
    });
});

describe('el top de una lista', () => {
    it('ordena por nota bayesiana, numera el podio y enlaza a la lista', () => {
        counter = 0;
        const reviews = [
            ...['a', 'b', 'c', 'd', 'e'].map((p) => review({ placeId: `t${p}`, placeName: `Tarta ${p}`, listId: 'tartas', listName: 'Tartas de queso' })),
            review({ placeId: 'c1', placeName: 'Croqueta Uno', itemName: 'Croquetas', listId: 'croquetas', listName: 'Croquetas', overallRating: 9.8 }),
            ...[1, 2, 3].map(() => review({ placeId: 'c2', placeName: 'Croqueta Dos', itemName: 'Croquetas', listId: 'croquetas', listName: 'Croquetas', overallRating: 9.2 })),
            review({ placeId: 'c3', placeName: 'Croqueta Tres', itemName: 'Croquetas', listId: 'croquetas', listName: 'Croquetas', overallRating: 7 }),
        ];
        const lists = [{ id: 'tartas', name: 'Tartas de queso' }, { id: 'croquetas', name: 'Croquetas' }];
        const results = Array.from({ length: 20 }, (_, d) =>
            buildHomeFeeds({ reviews, lists, seed: `2026-10-${String(d + 1).padStart(2, '0')}`, now: NOW }));
        // La lista del momento nunca se repite como ranking.
        results.forEach((r) => expect(r.feeds.find((f) => f.id === 'ranking')?.viewAllTo).not.toBe(`/list/${r.featuredList?.id}`));
        const result = results.find((r) => r.featuredList?.id === 'tartas')!;
        expect(result).toBeTruthy();
        const top = result.feeds.find((f) => f.id === 'ranking');
        expect(top?.title).toBe('El top: Croquetas');
        expect(top?.viewAllTo).toBe('/list/croquetas');
        // 3 reseñas de 9,2 ganan a una sola de 9,8.
        expect(top?.items.map((i) => i.placeId)).toEqual(['c2', 'c1', 'c3']);
        expect(top?.items.map((i) => i.rank)).toEqual([1, 2, 3]);
        const elsewhere = result.feeds.filter((f) => f.id !== 'ranking').flatMap((f) => f.items)
            .filter((i) => i.itemName?.toLowerCase() === 'croquetas').map((i) => i.placeId);
        ['c1', 'c2', 'c3'].forEach((id) => expect(elsewhere).not.toContain(id));
        // Ni la lista del ranking vuelve a salir en «Listas con sabor local».
        results.forEach((r) => {
            const rankingList = r.feeds.find((f) => f.id === 'ranking')?.viewAllTo?.split('/').pop();
            const listas = r.feeds.find((f) => f.id === 'listas')?.items.map((i) => i.id) ?? [];
            if (rankingList) expect(listas).not.toContain(rankingList);
        });
    });

    it('sin una lista con 3 sitios en la zona no hay ranking', () => {
        counter = 0;
        const reviews = ['a', 'b'].map((p) => review({ placeId: p, listId: 'croquetas', listName: 'Croquetas' }));
        const result = buildHomeFeeds({ reviews, seed: '2026-10-15', now: NOW, minItems: 1 });
        expect(result.feeds.find((f) => f.id === 'ranking')).toBeUndefined();
    });
});

describe('recuerdos', () => {
    const memory = (daysAgo: number, partial: Omit<Partial<HomeFeedReview>, 'placeId'> = {}) =>
        review({ placeId: `m${daysAgo}`, placeName: `Mesón ${daysAgo}`, itemName: `Plato ${daysAgo}`, createdAt: NOW - daysAgo * DAY, ...partial });

    it('solo tus reseñas de 3+ semanas, privadas incluidas, con cuánto hace', () => {
        counter = 0;
        const memories = [
            memory(5),
            memory(40, { visibility: 'private' }),
            memory(100),
            memory(365),
            memory(200, { userId: 'otro' }),
        ];
        const result = buildHomeFeeds({ reviews: [], memories, seed: '2026-10-15', userId: 'ser', now: NOW });
        const feed = result.feeds.find((f) => f.id === 'recuerdos');
        expect(feed?.viewAllTo).toBe('/profile');
        const byPlace = new Map(feed!.items.map((i) => [i.placeId, i.badge]));
        expect([...byPlace.keys()].sort()).toEqual(['m100', 'm365', 'm40']);
        expect(byPlace.get('m40')).toBe('Hace 6 semanas');
        expect(byPlace.get('m100')).toBe('Hace 3 meses');
        expect(byPlace.get('m365')).toBe('Hace 1 año');
    });

    it('sin sesión no hay recuerdos, y no le quitan sitios a los demás', () => {
        counter = 0;
        const memories = [memory(30), memory(60), memory(90)];
        expect(buildHomeFeeds({ reviews: [], memories, seed: '2026-10-15', now: NOW }).feeds).toEqual([]);

        // El mismo sitio puede salir en Joyas aunque esté en tus recuerdos (otro plato).
        const reviews = ['m30', 'x1', 'x2', 'x3'].map((p) => review({ placeId: p, placeName: `Sitio ${p}`, itemName: 'Otra cosa', placeAverageRating: 9, placeReviewsCount: 2 }));
        const result = buildHomeFeeds({ reviews, memories, seed: '2026-10-15', userId: 'ser', now: NOW, minItems: 1 });
        expect(result.feeds.find((f) => f.id === 'recuerdos')?.items.length).toBe(3);
        const order = result.feeds.map((f) => f.id);
        expect(order.indexOf('recuerdos')).toBeLessThan(order.indexOf('joyas'));
    });
});
