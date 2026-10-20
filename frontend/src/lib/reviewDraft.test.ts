import { describe, expect, it } from 'vitest';
import { parseReviewDraft, REVIEW_DRAFT_MAX_AGE_MS, shouldRestoreReviewDraft } from './reviewDraft';

const NOW = 1_800_000_000_000;
const draftJson = (extra: Record<string, unknown> = {}) => JSON.stringify({
    v: 3, placeId: 'bar-1', itemName: 'Tortilla', comment: '', criteriaScores: { sabor: 8 }, savedAt: NOW - 1000, ...extra,
});
const empty = { hasScores: false, comment: '' };

describe('parseReviewDraft', () => {
    it('lee un borrador válido', () => {
        expect(parseReviewDraft(draftJson(), NOW)).toMatchObject({ placeId: 'bar-1', itemName: 'Tortilla', criteriaScores: { sabor: 8 } });
    });

    it('descarta los borradores antiguos, sin sitio, rotos o caducados', () => {
        expect(parseReviewDraft(JSON.stringify({ v: 2, itemName: 'Tortilla', criteriaScores: { sabor: 8 } }), NOW)).toBeNull();
        expect(parseReviewDraft(draftJson({ placeId: '' }), NOW)).toBeNull();
        expect(parseReviewDraft('{roto', NOW)).toBeNull();
        expect(parseReviewDraft(draftJson({ savedAt: NOW - REVIEW_DRAFT_MAX_AGE_MS - 1 }), NOW)).toBeNull();
    });

    it('ignora notas que no son números', () => {
        expect(parseReviewDraft(draftJson({ criteriaScores: { sabor: 8, textura: 'x' } }), NOW)?.criteriaScores).toEqual({ sabor: 8 });
    });
});

describe('shouldRestoreReviewDraft', () => {
    const draft = parseReviewDraft(draftJson(), NOW);

    it('solo en el mismo sitio', () => {
        expect(shouldRestoreReviewDraft(draft, { ...empty, placeId: 'bar-1' })).toBe(true);
        expect(shouldRestoreReviewDraft(draft, { ...empty, placeId: 'bar-2' })).toBe(false);
        expect(shouldRestoreReviewDraft(draft, { ...empty, placeId: null })).toBe(false);
    });

    it('no pisa lo que ya se ha puntuado o escrito', () => {
        expect(shouldRestoreReviewDraft(draft, { placeId: 'bar-1', hasScores: true, comment: '' })).toBe(false);
        expect(shouldRestoreReviewDraft(draft, { placeId: 'bar-1', hasScores: false, comment: 'rica' })).toBe(false);
    });

    it('con el plato fijado, solo si es el mismo plato', () => {
        expect(shouldRestoreReviewDraft(draft, { ...empty, placeId: 'bar-1', lockedItemName: 'tortilla' })).toBe(true);
        expect(shouldRestoreReviewDraft(draft, { ...empty, placeId: 'bar-1', lockedItemName: 'Croquetas' })).toBe(false);
    });
});
