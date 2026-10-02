// Mismo caso que functions/test/list-elements.test.js (lo que acaba en Algolia):
// si la Lista y Buscar dejan de coincidir, falla uno de los dos.
import { describe, expect, it } from 'vitest';
import vectors from './listElements.vectors.json';
import { normalizeItemName, placeGeoFields, rankListElements, type ListForRanking } from './listElements';

const places = vectors.places as Record<string, Record<string, unknown>>;

// Como la carga de una Lista pública (useListDetails): solo valoraciones
// públicas, de la más reciente a la más antigua, con la zona del sitio.
const listReviews = vectors.reviews
    .filter((r) => r.visibility === 'public')
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .map((r) => {
        const geo = placeGeoFields(places[r.placeId]);
        return { ...r, placeCity: geo.city, placeProvince: geo.province, placeRegion: geo.region, placeCountry: geo.country };
    });

const ranked = rankListElements(listReviews, vectors.list as unknown as ListForRanking, { excludeAuthorIds: new Set(vectors.botAuthorIds) });

describe('Lista: puestos del caso compartido con Buscar', () => {
    it('nombres de elemento comparables', () => {
        for (const { input, expected } of vectors.itemNames) expect(normalizeItemName(input)).toBe(expected);
    });

    it('elementos, media, nº de valoraciones, zona y puesto', () => {
        expect(ranked.map((e) => ({
            key: e.id,
            average: Number(e.average.toFixed(4)),
            count: e.count,
            city: e.city,
            province: e.province,
            region: e.region,
            country: e.country,
            rank: e.rank,
        }))).toEqual(vectors.expected.elements);
    });

    it('sin la Minilista privada, sin bots y sin valoraciones sin nota', () => {
        const leon = ranked.find((e) => e.id === 'p_leon_bravas')!;
        expect(leon).toMatchObject({ average: 7, count: 1 });
        expect(ranked.some((e) => vectors.expected.botOnlyKeys.includes(e.id))).toBe(false);
        expect(ranked.find((e) => e.id === 'p_vll2_bravas')).toMatchObject({ average: 7.5, count: 1 });
    });

    it('puesto por zona', () => {
        for (const [zone, keys] of Object.entries(vectors.expected.zones)) {
            if (keys.length < 3) continue;
            const [level, value] = zone.split(':');
            const inZone = ranked.filter((e) => e[level as 'city' | 'province' | 'region'] === value);
            expect(inZone.map((e) => e.id), zone).toEqual(keys);
            inZone.forEach((e, i) => {
                expect(e.contextRanks.find((r) => r.level === level)?.rank, `${zone} ${e.id}`).toBe(i + 1);
            });
        }
    });
});
