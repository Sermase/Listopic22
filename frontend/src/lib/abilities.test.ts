import { describe, expect, it } from 'vitest';
import { abilityAllowed, ringFor, sanitizeAbilityPrefs, signatureFor, unlockedFilterCount } from './abilities';
import { PHOTO_FILTERS, applyFilterToPixels, filterMatrix, photoFilterById } from './photoFilters';

const gate = { abilitiesConfig: {}, inactiveBadges: new Set<string>() };

describe('abilities', () => {
    it('da el premio con la medalla, y lo quita si se apaga la medalla o el premio', () => {
        expect(abilityAllowed('goldRing', ['GRAN_MAESTRE'], gate)).toBe(true);
        expect(abilityAllowed('goldRing', ['PIONERO'], gate)).toBe(false);
        expect(abilityAllowed('goldRing', ['GRAN_MAESTRE'], { ...gate, abilitiesConfig: { goldRing: false } })).toBe(false);
        expect(abilityAllowed('goldRing', ['GRAN_MAESTRE'], { ...gate, inactiveBadges: new Set(['GRAN_MAESTRE']) })).toBe(false);
        // El Jefe los tiene para probar, salvo que estén apagados.
        expect(abilityAllowed('goldRing', [], gate, true)).toBe(true);
        expect(abilityAllowed('goldRing', [], { ...gate, abilitiesConfig: { goldRing: false } }, true)).toBe(false);
    });

    it('un filtro con la medalla y otro cada 7 fotos, hasta 6', () => {
        expect(unlockedFilterCount(7)).toBe(1);
        expect(unlockedFilterCount(13)).toBe(1);
        expect(unlockedFilterCount(14)).toBe(2);
        expect(unlockedFilterCount(41)).toBe(5);
        expect(unlockedFilterCount(500)).toBe(6);
        expect(unlockedFilterCount(0, true)).toBe(6);
    });

    it('elige el aro: lo pedido si lo tiene, si no el mejor', () => {
        expect(ringFor({}, true, true)).toBe('gold');
        expect(ringFor({ ring: 'theme' }, true, true)).toBe('theme');
        expect(ringFor({ ring: 'gold' }, false, true)).toBe('theme');
        expect(ringFor({ ring: 'off' }, true, true)).toBeNull();
        expect(ringFor({}, false, false)).toBeNull();
    });

    it('limpia las preferencias', () => {
        expect(sanitizeAbilityPrefs({ signature: `  ${'x'.repeat(80)}`, ring: 'diamante', pinnedReview: 'sin-barra', pinEmoji: '🍕', other: 1 }))
            .toEqual({ signature: 'x'.repeat(40), pinEmoji: '🍕' });
    });

    it('la firma: la frase de la medalla elegida (si la tiene) o la propia', () => {
        const info = (id: string) => (id === 'CRITICO_DE_BARRIO' ? { name: 'Crítico de Barrio', icon: '📝', description: 'Diez reseñas: ya se nota criterio.' } : undefined);
        const prefs = { signature: 'Si no cruje, no es croqueta', signatureBadge: 'CRITICO_DE_BARRIO' };
        expect(signatureFor(prefs, ['CRITICO_DE_BARRIO'], info)).toEqual({ text: 'Diez reseñas: ya se nota criterio.', badge: '📝 Crítico de Barrio' });
        // Sin esa medalla de verdad, la frase propia.
        expect(signatureFor(prefs, [], info)).toEqual({ text: 'Si no cruje, no es croqueta' });
        expect(signatureFor({}, ['CRITICO_DE_BARRIO'], info)).toBeUndefined();
    });
});

describe('photoFilters', () => {
    it('hay 6 filtros con ids únicos', () => {
        expect(PHOTO_FILTERS).toHaveLength(6);
        expect(new Set(PHOTO_FILTERS.map((f) => f.id)).size).toBe(6);
    });

    it('blanco y negro deja los tres canales iguales', () => {
        const px = new Uint8ClampedArray([200, 80, 40, 255]);
        applyFilterToPixels(px, photoFilterById('byn')!);
        expect(px[0]).toBe(px[1]);
        expect(px[1]).toBe(px[2]);
        expect(px[3]).toBe(255);
    });

    it('el brillo multiplica y el contraste gira alrededor del gris medio', () => {
        const m = filterMatrix({ id: 't', name: 't', emoji: '', steps: [['brightness', 0.5], ['contrast', 2]] });
        // gris 0.5 → brillo 0.25 → contraste (0.25 - 0.5) * 2 + 0.5 = 0
        expect(m[0][0] * 0.5 + m[0][1] * 0.5 + m[0][2] * 0.5 + m[0][3]).toBeCloseTo(0, 5);
    });
});
