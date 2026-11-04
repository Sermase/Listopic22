import { describe, expect, it } from 'vitest';
import { createMapPinIcon } from './mapUtils';

describe('createMapPinIcon', () => {
    it('la chincheta propia pone el emoji en la esquina sin quitar la nota', () => {
        const html = String(createMapPinIcon({ score: 8.4, mark: '🍕' }).options.html);
        expect(html).toContain('8.4');
        expect(html).toContain('<span class="lt-pin__mark" aria-hidden="true">🍕</span>');
        expect(String(createMapPinIcon({ score: 8.4 }).options.html)).not.toContain('lt-pin__mark');
    });
});
