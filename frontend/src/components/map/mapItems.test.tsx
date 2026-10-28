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
});
