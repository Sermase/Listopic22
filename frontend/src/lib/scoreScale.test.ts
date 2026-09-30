import { describe, expect, it } from 'vitest';
import { formatScore, SCORE_BADGE, scoreBand, scoreTextColor } from './scoreScale';

const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

describe('scoreScale', () => {
    it.each([
        [10, 'top'], [9, 'top'], [8.9, 'good'], [7, 'good'], [6.9, 'ok'], [5, 'ok'],
        [4.9, 'low'], [3, 'low'], [2.9, 'bad'], [0, 'bad'], [null, 'none'], [undefined, 'none'], [Number.NaN, 'none'], ['8', 'none'],
    ])('%s → %s', (score, band) => {
        expect(scoreBand(score)).toBe(band);
    });

    it('cada chapa tiene contraste AA (4.5:1) entre número y fondo', () => {
        Object.values(SCORE_BADGE).forEach(({ bg, fg }) => {
            expect(contrast(bg, fg)).toBeGreaterThanOrEqual(4.5);
        });
    });

    it('el color de texto depende del tema vía token', () => {
        expect(scoreTextColor(9.5)).toBe('var(--lt-score-top)');
        expect(scoreTextColor(undefined)).toBe('var(--lt-score-none)');
    });

    it('formatea con un decimal como mucho', () => {
        expect(formatScore(8.25)).toBe('8.3');
        expect(formatScore(7)).toBe('7');
        expect(formatScore(null)).toBe('—');
    });
});

describe('scoreScale: texto sobre fondos fijos', () => {
    it('sobre blanco y sobre fondo oscuro se lee (≥ 4.5:1)', async () => {
        const { SCORE_TEXT_ON_LIGHT, SCORE_TEXT_ON_DARK } = await import('./scoreScale');
        Object.values(SCORE_TEXT_ON_LIGHT).forEach((c) => expect(contrast(c, '#ffffff')).toBeGreaterThanOrEqual(4.5));
        Object.values(SCORE_TEXT_ON_DARK).forEach((c) => expect(contrast(c, '#0b1021')).toBeGreaterThanOrEqual(4.5));
    });
});
