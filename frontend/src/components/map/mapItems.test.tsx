import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStableMapItems, type MapInputItem } from './mapItems';
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
