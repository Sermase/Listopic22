import { describe, expect, it } from 'vitest';
import { EMPTY_VISUAL_DATA } from '../../../services/BusinessProService';
import { HERO_STYLE_CLASSES, heroStyleOf } from './heroStyles';
import {
    BAD_IMAGE_LINK,
    CUSTOM_COLOR,
    HERO_URL_MAX,
    SWATCHES,
    colorChoiceOf,
    colorLabel,
    countStepsDone,
    hexLuminance,
    isStandardLook,
    luminanceWarning,
    normalizeHex,
    normalizeImageUrl,
    stepSummary,
    visualStepsDone,
} from './visualMeta';

describe('normalizeHex', () => {
    it('expands short hex, adds the missing # and lowercases', () => {
        expect(normalizeHex('#abc')).toBe('#aabbcc');
        expect(normalizeHex('ABC')).toBe('#aabbcc');
        expect(normalizeHex('E4572E')).toBe('#e4572e');
        expect(normalizeHex('  #E4572e ')).toBe('#e4572e');
    });

    it('rejects what the server would silently store as empty', () => {
        expect(normalizeHex('rojo')).toBeNull();
        expect(normalizeHex('#ff')).toBeNull();
        expect(normalizeHex('#ggg')).toBeNull();
        expect(normalizeHex('#e4572e0')).toBeNull();
        expect(normalizeHex('')).toBeNull();
    });
});

describe('colour helpers', () => {
    it('marks Listopic for the empty value and El mío for unknown colours (no fake swatch)', () => {
        expect(colorChoiceOf('')).toBe('');
        expect(colorChoiceOf('#E4572E')).toBe('#e4572e');
        expect(colorChoiceOf('#123456')).toBe(CUSTOM_COLOR);
    });

    it('every swatch is a valid stored colour, except Listopic', () => {
        expect(SWATCHES[0].value).toBe('');
        SWATCHES.slice(1).forEach((swatch) => expect(swatch.value).toMatch(/^#[0-9a-f]{6}$/));
        expect(new Set(SWATCHES.map((swatch) => swatch.value)).size).toBe(SWATCHES.length);
    });

    it('warns when a colour is nearly invisible in a theme', () => {
        expect(hexLuminance('#000000')).toBe(0);
        expect(hexLuminance('#ffffff')).toBeCloseTo(1);
        expect(luminanceWarning('#101010')).toMatch(/Muy oscuro/);
        expect(luminanceWarning('#f8f8f0')).toMatch(/Muy claro/);
        expect(luminanceWarning('#e4572e')).toBeNull();
        expect(luminanceWarning('')).toBeNull();
        SWATCHES.slice(1).forEach((swatch) => expect(luminanceWarning(swatch.value)).toBeNull());
    });

    it('labels colours with their food name', () => {
        expect(colorLabel('#e4572e')).toBe('🍅 Tomate');
        expect(colorLabel('#123456')).toBe('#123456');
    });
});

describe('normalizeImageUrl', () => {
    it('adds https:// like the server does', () => {
        expect(normalizeImageUrl('cdn.example.com/foto.jpg')).toEqual({ url: 'https://cdn.example.com/foto.jpg' });
        expect(normalizeImageUrl(' https://example.com/a.png ')).toEqual({ url: 'https://example.com/a.png' });
    });

    it('rejects things that are not links', () => {
        expect(normalizeImageUrl('foto')).toEqual({ error: BAD_IMAGE_LINK });
        expect(normalizeImageUrl('mi foto.jpg')).toEqual({ error: BAD_IMAGE_LINK });
        expect(normalizeImageUrl('ftp://example.com/a.png')).toEqual({ error: BAD_IMAGE_LINK });
        expect(normalizeImageUrl('')).toHaveProperty('error');
    });

    it('rejects links the server would cut in half', () => {
        const long = `https://example.com/${'a'.repeat(HERO_URL_MAX)}.jpg`;
        expect(normalizeImageUrl(long)).toHaveProperty('error');
    });
});

describe('steps', () => {
    it('counts what the owner made their own', () => {
        expect(isStandardLook(EMPTY_VISUAL_DATA)).toBe(true);
        expect(countStepsDone(EMPTY_VISUAL_DATA)).toBe(0);
        const custom = { accentColor: '#e4572e', visualStyle: 'night' as const, heroText: 'Hola', heroImageUrl: 'https://x.es/a.jpg' };
        expect(visualStepsDone(custom)).toEqual({ cover: true, phrase: true, color: true, style: true });
        expect(countStepsDone(custom)).toBe(4);
        expect(isStandardLook({ ...EMPTY_VISUAL_DATA, heroText: '  ' })).toBe(true);
        expect(isStandardLook({ ...EMPTY_VISUAL_DATA, visualStyle: 'warm' })).toBe(false);
    });

    it('summarises closed steps', () => {
        const data = { ...EMPTY_VISUAL_DATA, heroText: 'Cocina de mercado, hecha cada mañana con producto local', accentColor: '#2f9e5b' };
        expect(stepSummary('cover', data)).toBe('la foto del local');
        expect(stepSummary('phrase', data)).toMatch(/^«Cocina de mercado.*…»$/);
        expect(stepSummary('color', data)).toBe('🌿 Albahaca');
        expect(stepSummary('color', EMPTY_VISUAL_DATA)).toBe('🟣 Listopic');
        expect(stepSummary('style', data)).toBe('📰 Editorial');
    });
});

describe('heroStyleOf', () => {
    it('keeps the usual look for editorial and unknown values', () => {
        expect(heroStyleOf('editorial')).toEqual({ hero: '', image: '', title: '', phrase: '' });
        expect(heroStyleOf(undefined)).toBe(HERO_STYLE_CLASSES.editorial);
        expect(heroStyleOf('neon')).toBe(HERO_STYLE_CLASSES.editorial);
    });

    it('gives every other style something visible', () => {
        (['clean', 'warm', 'night'] as const).forEach((style) => {
            const classes = heroStyleOf(style);
            expect(classes.image).not.toBe('');
            // Tailwind 4: valores arbitrarios sin comas.
            Object.values(classes).forEach((value) => expect(value).not.toMatch(/\[[^\]]*,[^\]]*\]/));
        });
    });
});
