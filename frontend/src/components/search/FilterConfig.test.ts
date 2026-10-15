import { describe, expect, it } from 'vitest';
import { FILTER_SECTIONS, formatNumericRefinementLabel, visibleFacetItems, NUMERIC_FILTER_ATTRIBUTES } from './FilterConfig';

describe('FilterConfig', () => {
    it('quita los tipos genéricos de Google y respeta las listas permitidas', () => {
        const types = [{ value: 'restaurant' }, { value: 'point_of_interest' }, { value: 'establishment' }, { value: 'bar' }];
        expect(visibleFacetItems('types', types).map((i) => i.value)).toEqual(['restaurant', 'bar']);
        expect(visibleFacetItems('hasPhoto', [{ value: 'true' }, { value: 'false' }]).map((i) => i.value)).toEqual(['true']);
        expect(visibleFacetItems('itemTags', [{ value: 'picante' }])).toHaveLength(1);
    });

    it('formatea los filtros numéricos como «8+»', () => {
        expect(formatNumericRefinementLabel('≥ 8')).toBe('8+');
        expect(formatNumericRefinementLabel('>= 10')).toBe('10+');
        expect(formatNumericRefinementLabel('Asador')).toBe('Asador');
    });

    it('ya no ofrece filtros redundantes', () => {
        const attrs = (tab: string) => FILTER_SECTIONS[tab].map((s) => s.attribute);
        expect(attrs('places')).not.toContain('closedStatus');
        expect(attrs('items')).not.toContain('placeClosedStatus');
        expect(attrs('items')).not.toContain('groupTags');
        expect(attrs('lists')).not.toContain('hasPhoto');
        expect(attrs('places')[0]).toBe('types');
        expect(NUMERIC_FILTER_ATTRIBUTES.has('averageRating')).toBe(true);
        expect(NUMERIC_FILTER_ATTRIBUTES.has('avgGeneralScore')).toBe(true);
    });
});
