import { describe, expect, it } from 'vitest';
import { isChunkLoadError } from './chunkErrors';

describe('isChunkLoadError', () => {
    it('reconoce los mensajes de Chrome, Safari y Firefox', () => {
        expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://listopic.es/assets/ListPage-abc.js'))).toBe(true);
        expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
        expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
        expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/index-1.css'))).toBe(true);
    });

    it('no confunde otros errores', () => {
        expect(isChunkLoadError(new Error('Missing or insufficient permissions.'))).toBe(false);
        expect(isChunkLoadError(null)).toBe(false);
        expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false);
    });
});
