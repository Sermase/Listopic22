import { describe, expect, it } from 'vitest';
import {
    buildAreaOptions,
    contextualRanks,
    decodeArea,
    distinctContextRanks,
    encodeArea,
    geoValue,
    matchesArea,
    normalizeCcaa,
    primaryContextRank,
    inferUserGeo,
    localAreaOptions,
} from './geoAreas';

const vll = { city: 'Valladolid', province: 'Valladolid', region: 'Castilla y León', country: 'España' };
const leon = { city: 'León', province: 'León', region: 'Castilla y León', country: 'España' };
const mad = { city: 'Madrid', province: 'Madrid', region: 'Comunidad de Madrid', country: 'España' };

describe('geoAreas', () => {
    it('normaliza CCAA igual que el servidor', () => {
        expect(normalizeCcaa('Euskadi')).toBe('País Vasco');
        expect(normalizeCcaa('Catalunya')).toBe('Cataluña');
        expect(normalizeCcaa('Île-de-France')).toBe('Île-de-France');
        expect(geoValue({ country: 'Spain' }, 'country')).toBe('España');
    });

    it('etiquetas y opciones por nivel, de más a menos elementos', () => {
        const options = buildAreaOptions([vll, vll, leon, mad]);
        expect(options.city.map((o) => o.label)).toEqual(['Valladolid', 'León', 'Madrid']);
        expect(options.province[0]).toMatchObject({ label: 'Valladolid provincia', count: 2 });
        expect(options.region[0]).toMatchObject({ label: 'Castilla y León', count: 3 });
        expect(options.country).toEqual([{ level: 'country', value: 'España', label: 'España', count: 4 }]);
    });

    it('filtra por la zona elegida; «cerca» no filtra aquí (lo hace el radio)', () => {
        expect(matchesArea(vll, { kind: 'region', value: 'Castilla y León' })).toBe(true);
        expect(matchesArea(mad, { kind: 'region', value: 'Castilla y León' })).toBe(false);
        expect(matchesArea({ region: 'Euskadi' }, { kind: 'region', value: 'País Vasco' })).toBe(true);
        expect(matchesArea({}, { kind: 'near' })).toBe(true);
    });

    it('guarda y recupera la zona; valores raros vuelven a «cerca»', () => {
        const area = { kind: 'province', value: 'Valladolid' } as const;
        expect(decodeArea(encodeArea(area))).toEqual(area);
        expect(decodeArea('mundo:Tierra')).toEqual({ kind: 'near' });
        expect(decodeArea(null)).toEqual({ kind: 'near' });
    });

    it('puesto con contexto: #n en su ciudad, provincia, CCAA y país', () => {
        const items = [
            { id: 'a', ...vll, average: 9, count: 5 },
            { id: 'b', ...vll, average: 8.5, count: 5 },
            { id: 'c', ...vll, average: 10, count: 1 },
            { id: 'd', ...leon, average: 9.5, count: 10 },
            { id: 'e', ...mad, average: 7, count: 3 },
        ];
        const ranks = contextualRanks(items);
        // En Valladolid: a (9 con 5) > b (8,5 con 5) > c (10 con 1): una valoración no basta.
        expect(ranks.get('a')!.find((r) => r.level === 'city')!.label).toBe('#1 en Valladolid');
        expect(ranks.get('c')!.find((r) => r.level === 'city')!.label).toBe('#3 en Valladolid');
        expect(ranks.get('d')!.find((r) => r.level === 'region')!.label).toBe('#1 en Castilla y León');
        expect(ranks.get('e')!.find((r) => r.level === 'country')!.label).toBe('#5 en España');
        // León y Madrid tienen menos de 3 elementos: sin puesto de ciudad.
        expect(ranks.get('d')!.some((r) => r.level === 'city')).toBe(false);
    });

    it('el puesto principal es el más concreto que no sea la zona que ya se mira', () => {
        const items = [1, 2, 3].map((n) => ({ id: `v${n}`, ...vll, average: 7 + n, count: 3 }));
        const ranks = contextualRanks(items).get('v3');
        expect(primaryContextRank(ranks, { kind: 'near' })!.label).toBe('#1 en Valladolid');
        expect(primaryContextRank(ranks, { kind: 'city', value: 'Valladolid' })!.label).toBe('#1 en Valladolid provincia');
        expect(primaryContextRank([], { kind: 'near' })).toBeNull();
    });

    it('se salta contextos con los mismos elementos que la zona activa', () => {
        const items = [1, 2, 3].map((n) => ({ id: `m${n}`, city: 'Madrid', province: 'Madrid', region: 'Comunidad de Madrid', country: 'España', average: 7 + n, count: 3 }))
            .concat([{ id: 'v', ...vll, average: 8, count: 3 }]);
        const ranks = contextualRanks(items).get('m3');
        // Mirando «Madrid» (3 elementos): «Madrid provincia» y la CCAA son lo mismo → se muestra España.
        expect(primaryContextRank(ranks, { kind: 'city', value: 'Madrid' }, 3)!.label).toBe('#1 en España');
        // Mirando toda la Lista (4 elementos): «#… en España» sobra.
        expect(primaryContextRank(contextualRanks(items).get('v'), { kind: 'near' }, 4)).toBeNull();
    });

    it('sin repeticiones cuando ciudad, provincia, CCAA y país son el mismo conjunto', () => {
        const items = [1, 2, 3].map((n) => ({ id: `v${n}`, ...vll, average: 7 + n, count: 3 }));
        const labels = distinctContextRanks(contextualRanks(items).get('v3')!).map((r) => r.label);
        expect(labels).toEqual(['#1 en Valladolid']);
    });
});

describe('geoAreas: contexto local', () => {
    const vllPlace = { ...vll, lat: 41.6523, lng: -4.7245 };
    const medina = { city: 'Medina del Campo', province: 'Valladolid', region: 'Castilla y León', country: 'España', lat: 41.312, lng: -4.914 };
    const madPlace = { ...mad, lat: 40.4168, lng: -3.7038 };
    const leonPlace = { ...leon, lat: 42.5987, lng: -5.5671 };

    it('deduce ciudad, comunidad y país del sitio cercano', () => {
        expect(inferUserGeo({ latitude: 41.65, longitude: -4.72 }, [madPlace, vllPlace, leonPlace]))
            .toEqual({ city: 'Valladolid', province: 'Valladolid', region: 'Castilla y León', country: 'España' });
    });

    it('lejos de todo: ni ciudad ni comunidad, sí país', () => {
        // En Madrid con una Lista solo de Valladolid (≈ 160 km).
        expect(inferUserGeo({ latitude: 40.4168, longitude: -3.7038 }, [vllPlace, medina]))
            .toEqual({ country: 'España' });
    });

    it('sin ubicación no hay contexto', () => {
        expect(inferUserGeo(null, [vllPlace])).toBeNull();
    });

    it('en la Lista solo se ofrecen tu ciudad, tu comunidad y tu país', () => {
        const all = buildAreaOptions([vll, vll, vll, medina, leon, mad]);
        const local = localAreaOptions(all, { city: 'Valladolid', province: 'Valladolid', region: 'Castilla y León', country: 'España' });
        expect(local.city.map((o) => o.label)).toEqual(['Valladolid']);
        expect(local.province).toEqual([]);
        expect(local.region.map((o) => `${o.label} ${o.count}`)).toEqual(['Castilla y León 5']);
        expect(local.country.map((o) => o.label)).toEqual(['España']);
        // Sin ubicación: solo país; nada de ciudades lejanas.
        const none = localAreaOptions(all, null);
        expect(none.city).toEqual([]);
        expect(none.region).toEqual([]);
        expect(none.country.map((o) => o.label)).toEqual(['España']);
    });
});
