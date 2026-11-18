import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStableMapItems, type MapInputItem } from './mapItems';
import { dishesForPlace, listPopupView } from './mapItems';
import { createClusterIcon, createMapPinIcon } from '../../utils/mapUtils';

const place = (id: string, rating = 8): MapInputItem => ({ id, name: id, lat: 40.4, lng: -3.7, rating });

describe('useStableMapItems', () => {
    it('devuelve el mismo array si los sitios no cambian, aunque llegue uno nuevo en cada render', () => {
        const { result, rerender } = renderHook(({ items }) => useStableMapItems(items), { initialProps: { items: [place('a'), place('b')] } });
        const first = result.current;
        rerender({ items: [place('a'), place('b')] });
        expect(result.current).toBe(first);
    });

    it('cambia cuando cambia un sitio (p. ej. su nota)', () => {
        const { result, rerender } = renderHook(({ items }) => useStableMapItems(items), { initialProps: { items: [place('a'), place('b')] } });
        const first = result.current;
        rerender({ items: [place('a'), place('b', 9)] });
        expect(result.current).not.toBe(first);
        expect(result.current[1].rating).toBe(9);
    });
});

describe('iconos del mapa', () => {
    it('reutiliza el mismo icono para el mismo pin (Leaflet no rehace la chincheta)', () => {
        expect(createMapPinIcon({ score: 8.5 })).toBe(createMapPinIcon({ score: 8.5 }));
        expect(createMapPinIcon({ score: 8.5 })).not.toBe(createMapPinIcon({ score: 8.5, highlighted: true }));
        expect(createClusterIcon(3, 7.24)).toBe(createClusterIcon(3, 7.21));
        expect(createClusterIcon(3, 7.2)).not.toBe(createClusterIcon(4, 7.2));
    });

    it('comparte icono entre notas que se ven igual, pero no si cambia el color', () => {
        expect(createMapPinIcon({ score: 8.26 })).toBe(createMapPinIcon({ score: 8.34 }));
        // 8,96 se ve «9.0» pero aún no es de la franja alta (≥ 9).
        expect(createMapPinIcon({ score: 8.96 })).not.toBe(createMapPinIcon({ score: 9 }));
    });

    it('al llenarse se van los que no se usan, no los que siguen en el mapa', () => {
        const kept = createMapPinIcon({ score: 7.5 });
        for (let i = 0; i < 1500; i++) {
            createClusterIcon(i + 2, null);
            if (i % 100 === 0) expect(createMapPinIcon({ score: 7.5 })).toBe(kept);
        }
        expect(createMapPinIcon({ score: 7.5 })).toBe(kept);
    });
});

describe('ficha del mapa de una Lista', () => {
    it('junta las valoraciones del mismo elemento y deja los sin probar al final', () => {
        const dishes = dishesForPlace('p1', [
            { name: 'Tarta', score: 8 }, { name: 'tarta ', score: 9, photo: 'https://x/t.jpg' }, { name: 'Flan', score: 9.5 },
        ], [{ name: 'Tarta', photo: 'https://x/c.jpg' }, { name: 'Tarta de queso azul', photo: 'https://x/a.jpg' }]);
        expect(dishes.map((d) => [d.name, d.score, d.pending ?? false])).toEqual([['Flan', 9.5, false], ['Tarta', 8.5, false], ['Tarta de queso azul', 0, true]]);
        expect(dishes[1]).toMatchObject({ photo: 'https://x/t.jpg', to: '/group/p1/Tarta' });
    });

    it('sin nota no cuenta en la media y los nombres se comparan sin tildes', () => {
        const dishes = dishesForPlace('p1', [{ name: 'Brava', score: 8 }, { name: 'Bravá!', score: null }, { name: 'Sola', score: null }]);
        expect(dishes.map((d) => [d.name, d.score])).toEqual([['Brava', 8], ['Sola', 0]]);
    });

    it('un elemento: su página; varios: elegir; ninguno: el sitio', () => {
        const base = { id: 'p1', placeId: 'p1', name: 'Bar Uno', lat: 1, lng: 1, photoUrl: 'https://x/sitio.jpg', rating: 9 };
        const one = listPopupView({ ...base, items: dishesForPlace('p1', [], [{ name: 'Bely', photo: 'https://x/b.jpg' }]) });
        expect(one).toMatchObject({ title: 'Bely', to: '/group/p1/Bely', photoUrl: 'https://x/b.jpg', score: null, subtitle: '🏆 Sin probar · Bar Uno' });
        const many = listPopupView({ ...base, items: dishesForPlace('p1', [{ name: 'A', score: 7 }, { name: 'B', score: 8, photo: 'https://x/b.jpg' }]) });
        expect(many).toMatchObject({ title: 'Bar Uno', to: null, photoUrl: 'https://x/b.jpg' });
        expect(many.dishes).toHaveLength(2);
        expect(listPopupView({ ...base, items: [{ name: 'Sin enlace', score: 5 }] })).toMatchObject({ title: 'Bar Uno', to: '/place/p1' });
    });
});
