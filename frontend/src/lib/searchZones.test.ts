import { describe, expect, it } from 'vitest';
import { activeZoneLabel, zoneAttributes } from './searchZones';

describe('searchZones', () => {
    it('atributos por pestaña', () => {
        expect(zoneAttributes('places').region).toBe('region');
        expect(zoneAttributes('items').region).toBe('placeRegion');
    });

    it('etiqueta de la zona activa (una sola)', () => {
        expect(activeZoneLabel('items', [{ attribute: 'placeProvince', refinements: [{ value: 'Valladolid' }] }])).toBe('Valladolid provincia');
        expect(activeZoneLabel('items', [{ attribute: 'placeCity', refinements: [{ value: 'León' }] }, { attribute: 'listName', refinements: [{ value: 'Bravas' }] }])).toBe('León');
        expect(activeZoneLabel('items', [{ attribute: 'placeCity', refinements: [{ value: 'León' }, { value: 'Madrid' }] }])).toBeNull();
        expect(activeZoneLabel('items', [])).toBeNull();
    });
});
