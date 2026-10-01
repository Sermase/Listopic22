import { describe, expect, it } from 'vitest';
import { buildZoneTree, exploreSearchUrl, parseZones, searchZoneTree, zoneAttributes, zonesFilter, zonesLabel } from './searchZones';

describe('searchZones', () => {
    it('atributos por pestaña', () => {
        expect(zoneAttributes('places').region).toBe('region');
        expect(zoneAttributes('items').region).toBe('placeRegion');
    });

    it('lee las zonas de la URL sin repetidas ni niveles desconocidos', () => {
        expect(parseZones(['region:Comunidad de Madrid', 'province:Segovia', 'province:Segovia', 'barrio:Centro', 'city:', 'nada'])).toEqual([
            { level: 'region', value: 'Comunidad de Madrid' },
            { level: 'province', value: 'Segovia' },
        ]);
        expect(parseZones(['city:Valencia: centro'])).toEqual([{ level: 'city', value: 'Valencia: centro' }]);
    });

    it('filtro O entre zonas de niveles distintos, con comillas escapadas', () => {
        expect(zonesFilter('items', [])).toBe('');
        expect(zonesFilter('items', [{ level: 'region', value: 'Comunidad de Madrid' }, { level: 'province', value: 'Segovia' }]))
            .toBe('(placeRegion:"Comunidad de Madrid" OR placeProvince:"Segovia")');
        expect(zonesFilter('places', [{ level: 'city', value: 'Bar "El" Sitio' }])).toBe('(city:"Bar \\"El\\" Sitio")');
    });

    it('etiqueta de la selección', () => {
        expect(zonesLabel([])).toBeNull();
        expect(zonesLabel([{ level: 'province', value: 'Valladolid' }])).toBe('Valladolid provincia');
        expect(zonesLabel([{ level: 'city', value: 'Madrid' }, { level: 'city', value: 'Barcelona' }])).toBe('Madrid + Barcelona');
        expect(zonesLabel([{ level: 'city', value: 'A' }, { level: 'city', value: 'B' }, { level: 'city', value: 'C' }])).toBe('3 zonas');
    });

    it('árbol con recuentos; si falta la provincia, la ciudad cuelga de la comunidad', () => {
        const tree = buildZoneTree([
            { country: 'España', region: 'Castilla y León', province: 'Valladolid', city: 'Valladolid' },
            { country: 'España', region: 'Castilla y León', province: 'Valladolid', city: 'Medina del Campo' },
            { country: 'España', region: 'Castilla y León', province: 'Valladolid', city: 'Valladolid' },
            { country: 'España', region: 'Cantabria', province: null, city: 'Santander' },
            { country: 'España', region: 'Cantabria', province: 'Cantabria', city: 'Laredo' },
        ]);
        expect(tree).toHaveLength(1);
        expect(tree[0]).toMatchObject({ level: 'country', value: 'España', count: 5 });
        const [cyl, cant] = tree[0].children;
        expect(cyl).toMatchObject({ value: 'Castilla y León', count: 3 });
        expect(cyl.children[0].children.map((c) => [c.value, c.count])).toEqual([['Valladolid', 2], ['Medina del Campo', 1]]);
        expect(cant.children.map((c) => [c.level, c.value])).toEqual([['province', 'Cantabria'], ['city', 'Santander']]);
    });

    it('búsqueda sin tildes con la ruta', () => {
        const tree = buildZoneTree([
            { country: 'España', region: 'Castilla y León', province: 'León', city: 'León' },
            { country: 'España', region: 'Castilla y León', province: 'León', city: 'Astorga' },
        ]);
        const hits = searchZoneTree(tree, 'leon');
        expect(hits.map((h) => `${h.node.level}:${h.node.value}`)).toEqual(['region:Castilla y León', 'province:León', 'city:León']);
        expect(hits[2].path.map((p) => p.value)).toEqual(['España', 'Castilla y León', 'León']);
    });

    it('enlace a Buscar con la Lista y la zona de la Lista', () => {
        const url = exploreSearchUrl({ listId: 'L1', listName: 'Patatas bravas', zone: { level: 'city', value: 'Valladolid' } });
        const params = new URLSearchParams(url.split('?')[1]);
        expect(params.get('listId')).toBe('L1');
        expect(params.get('sort')).toBe('grouped_items_by_score');
        expect(parseZones(params.getAll('zone'))).toEqual([{ level: 'city', value: 'Valladolid' }]);
        expect(exploreSearchUrl({})).toBe('/search?type=items&sort=grouped_items_by_score');
    });
});
