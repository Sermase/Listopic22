import { describe, it, expect } from 'vitest';
import { SearchQueryParser } from './SearchQueryParser';

describe('SearchQueryParser.parse', () => {
    it('returns empty result for empty string', () => {
        const result = SearchQueryParser.parse('');
        expect(result.cleanedQuery).toBe('');
        expect(result.typeHint).toBeNull();
        expect(result.filters).toEqual({});
    });

    it('passes plain text through as cleanedQuery', () => {
        const result = SearchQueryParser.parse('restaurante japonés');
        expect(result.cleanedQuery).toBe('restaurante japonés');
        expect(result.typeHint).toBeNull();
    });

    it('extracts @mention as users typeHint and strips the @', () => {
        const result = SearchQueryParser.parse('@sergiom');
        expect(result.typeHint).toBe('users');
        expect(result.cleanedQuery).toBe('sergiom');
    });

    it('extracts #hashtag as items typeHint and strips the #', () => {
        const result = SearchQueryParser.parse('#brunch');
        expect(result.typeHint).toBe('items');
        expect(result.cleanedQuery).toBe('brunch');
    });

    it('does not override an existing typeHint with # default', () => {
        const result = SearchQueryParser.parse('@usuario #tag');
        expect(result.typeHint).toBe('users');
        expect(result.cleanedQuery).toBe('usuario tag');
    });

    it('parses city: filter', () => {
        const result = SearchQueryParser.parse('terraza city:Madrid');
        expect(result.filters['city']).toEqual(['Madrid']);
        expect(result.cleanedQuery).toBe('terraza');
    });

    it('parses ciudad: alias', () => {
        const result = SearchQueryParser.parse('ciudad:Sevilla');
        expect(result.filters['city']).toEqual(['Sevilla']);
    });

    it('sets typeHint from type:lista', () => {
        const result = SearchQueryParser.parse('type:lista');
        expect(result.typeHint).toBe('lists');
        expect(result.cleanedQuery).toBe('');
    });

    it('sets typeHint from tipo:lugar', () => {
        const result = SearchQueryParser.parse('tipo:lugar');
        expect(result.typeHint).toBe('places');
    });

    it('adds type filter for unknown type values', () => {
        const result = SearchQueryParser.parse('type:restaurante');
        expect(result.filters['type']).toEqual(['restaurante']);
        expect(result.typeHint).toBeNull();
    });

    it('parses price: filter', () => {
        const result = SearchQueryParser.parse('price:2');
        expect(result.filters['priceLevel']).toEqual(['2']);
    });

    it('parses category: filter', () => {
        const result = SearchQueryParser.parse('category:japonesa');
        expect(result.filters['category']).toEqual(['japonesa']);
    });

    it('accumulates multiple values for the same filter', () => {
        const result = SearchQueryParser.parse('city:Madrid city:Barcelona');
        expect(result.filters['city']).toEqual(['Madrid', 'Barcelona']);
    });

    it('strips quotes from facet values', () => {
        const result = SearchQueryParser.parse('city:"Nueva York"');
        expect(result.filters['city']).toEqual(['Nueva York']);
    });

    it('keeps unknown facets as plain query text', () => {
        const result = SearchQueryParser.parse('unknown:value');
        expect(result.cleanedQuery).toBe('unknown:value');
    });
});
