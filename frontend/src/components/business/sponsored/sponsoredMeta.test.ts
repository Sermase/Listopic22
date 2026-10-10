import { describe, expect, it } from 'vitest';
import { DEFAULT_SPOTLIGHT_PRICING, type ItemSpotlight, type SponsoredPlacement } from '../../../services/BusinessProService';
import {
    campaignProgress,
    clampPlan,
    clampRadius,
    cleanOfferData,
    computeOfferStatus,
    daysAtRadius,
    formatCount,
    formatCtr,
    formatDateRange,
    formatKm,
    formatPublicDateRange,
    hasCondition,
    isSpotlightPaused,
    isValidOfferUrl,
    mergeCampaigns,
    offerEmoji,
    packRibbon,
    parsePromoSub,
    radiusPresetsFor,
    reachLabel,
    splitLeadingEmoji,
    toggleCondition,
    withLeadingEmoji,
} from './sponsoredMeta';

const NOW = new Date(2026, 9, 7);

describe('computeOfferStatus (S3)', () => {
    const today = '2026-10-07';
    it('separates live, scheduled, expired and draft like the public page', () => {
        expect(computeOfferStatus({ status: 'draft', startsAt: '', endsAt: '' }, today)).toBe('draft');
        expect(computeOfferStatus({ status: 'active', startsAt: '', endsAt: '' }, today)).toBe('live');
        expect(computeOfferStatus({ status: 'active', startsAt: '2026-10-07', endsAt: '2026-10-07' }, today)).toBe('live');
        expect(computeOfferStatus({ status: 'active', startsAt: '2026-10-08', endsAt: '' }, today)).toBe('scheduled');
        expect(computeOfferStatus({ status: 'active', startsAt: '', endsAt: '2026-10-06' }, today)).toBe('expired');
        expect(computeOfferStatus({ status: 'draft', startsAt: '', endsAt: '2026-10-06' }, today)).toBe('draft');
    });
});

describe('dates and numbers in es-ES (S6, S10)', () => {
    it('formats short dates and ranges without raw ISO', () => {
        expect(formatDateRange('2026-10-05', '2026-10-12', NOW)).toBe('5 oct → 12 oct');
        expect(formatDateRange('', '2026-10-12', NOW)).toBe('hasta 12 oct');
        expect(formatDateRange('2027-01-03', '', NOW)).toBe('desde 3 ene 2027');
        expect(formatDateRange('', '', NOW)).toBeNull();
        expect(formatPublicDateRange('2026-10-05', '2026-10-12', NOW)).toBe('Del 5 oct al 12 oct');
    });

    it('groups thousands and uses a decimal comma', () => {
        expect(formatCount(1240)).toBe('1.240');
        expect(formatCount(10000)).toBe('10.000');
        expect(formatCount(56)).toBe('56');
        expect(formatCtr({ impressions: 1240, clicks: 56 })).toBe('4,5 %');
        expect(formatCtr({ impressions: 0, clicks: 0 })).toBe('—');
        expect(formatKm(0.6)).toBe('0,6 km');
        expect(formatKm(2)).toBe('2 km');
    });
});

describe('offer titles', () => {
    it('reads and replaces the leading emoji, including ZWJ sequences', () => {
        expect(splitLeadingEmoji('🍻 2x1 en cañas')).toEqual({ emoji: '🍻', text: '2x1 en cañas' });
        expect(splitLeadingEmoji('👨‍👩‍👧 Menú infantil a 6 €')).toEqual({ emoji: '👨‍👩‍👧', text: 'Menú infantil a 6 €' });
        expect(splitLeadingEmoji('2x1 en cañas')).toEqual({ emoji: '', text: '2x1 en cañas' });
        expect(offerEmoji('Sin emoji')).toBe('🎟️');
        expect(withLeadingEmoji('🍻 2x1 en cañas', '🍷')).toBe('🍷 2x1 en cañas');
        expect(withLeadingEmoji('Happy hour', '⏰')).toBe('⏰ Happy hour');
    });
});

describe('condition chips', () => {
    it('adds and removes chip text joined with « · »', () => {
        const one = toggleCondition('', 'Solo en sala');
        expect(one).toBe('Solo en sala');
        const two = toggleCondition(one as string, 'No acumulable');
        expect(two).toBe('Solo en sala · No acumulable');
        expect(hasCondition(two as string, 'no acumulable')).toBe(true);
        expect(toggleCondition(two as string, 'Solo en sala')).toBe('No acumulable');
        expect(toggleCondition('Solo en sala · No acumulable · Con reserva', 'No acumulable')).toBe('Solo en sala · Con reserva');
    });

    it('keeps free text and refuses to go over the limit', () => {
        expect(toggleCondition('Válido hasta fin de existencias', 'Con reserva')).toBe('Válido hasta fin de existencias · Con reserva');
        expect(toggleCondition('x'.repeat(295), 'Con reserva')).toBeNull();
    });

    it('cleans the payload like the server', () => {
        expect(cleanOfferData({
            title: '  🍻 2x1  ',
            description: ' Hola ',
            conditions: ' · Solo en sala · ',
            ctaUrl: ' tuweb.com ',
            startsAt: '2026-10-05',
            endsAt: '',
            status: 'active',
        })).toEqual({
            title: '🍻 2x1',
            description: 'Hola',
            conditions: 'Solo en sala',
            ctaUrl: 'tuweb.com',
            startsAt: '2026-10-05',
            endsAt: '',
            status: 'active',
        });
    });

    it('validates links the way the server would keep them', () => {
        expect(isValidOfferUrl('')).toBe(true);
        expect(isValidOfferUrl('tuweb.com/oferta')).toBe(true);
        expect(isValidOfferUrl('https://tuweb.com')).toBe(true);
        expect(isValidOfferUrl('foto')).toBe(false);
        expect(isValidOfferUrl('mi web.com')).toBe(false);
    });
});

describe('spotlight reach', () => {
    const pricing = DEFAULT_SPOTLIGHT_PRICING;

    it('clamps radius presets to the pricing limits without duplicates', () => {
        expect(radiusPresetsFor(pricing).map((preset) => preset.km)).toEqual([0.6, 2, 5, 10, 20]);
        const small = { ...pricing, maxRadiusKm: 4 };
        expect(radiusPresetsFor(small).map((preset) => `${preset.key}:${preset.km}`)).toEqual(['barrio:0.6', 'zona:2', 'ciudad:4']);
        expect(clampRadius(pricing, 0.07)).toBe(0.2);
        expect(clampRadius(pricing, 2.13)).toBe(2.2);
    });

    it('clamps a restored plan', () => {
        expect(clampPlan({ ...pricing, maxDays: 30, maxIntensity: 3 }, { step: 3, itemId: 'x', radiusKm: 50, days: 90, intensity: 7 }))
            .toEqual({ step: 3, itemId: 'x', radiusKm: 20, days: 30, intensity: 3 });
    });

    it('estimates days of spotlight at 2 km and the reach label', () => {
        expect(daysAtRadius(pricing, 340)).toBe(34);
        expect(daysAtRadius(pricing, 0)).toBe(0);
        expect(reachLabel(2)).toBe('≈ 25 min andando');
        expect(reachLabel(5)).toBe('≈ 20 min en bici');
        expect(reachLabel(10)).toBe('≈ 20 min en coche');
    });

    it('marks the popular and the best value pack', () => {
        const packs = pricing.packs;
        expect(packs.map((_, index) => packRibbon(pricing, packs, index))).toEqual([null, 'Más elegido', null, 'Mejor precio']);
    });
});

describe('campaigns', () => {
    const placement = (id: string, createdAtMs: number): SponsoredPlacement => ({
        id, placeId: 'p', type: 'home', status: 'requested', metrics: { impressions: 0, clicks: 0 }, createdAtMs,
    });
    const spotlight = (id: string, createdAtMs: number): ItemSpotlight => ({
        id, placeId: 'p', itemId: 'i', itemName: 'Croquetas', linkedListIds: [], itemAverageRating: null, itemReviewCount: 0,
        center: null, radiusKm: 2, units: 1, status: 'active', itemInactive: false, metrics: { impressions: 0, clicks: 0 }, createdAtMs,
    });

    it('merges placements and spotlights, newest first', () => {
        expect(mergeCampaigns([placement('a', 1), placement('c', 3)], [spotlight('b', 2)]).map((row) => `${row.kind}:${row.id}`))
            .toEqual(['placement:c', 'spotlight:b', 'placement:a']);
    });

    it('computes progress between both dates', () => {
        expect(campaignProgress('2026-10-01', '2026-10-10', '2026-10-05')).toBe(50);
        expect(campaignProgress('2026-10-01', '2026-10-10', '2026-09-20')).toBe(0);
        expect(campaignProgress('2026-10-01', '2026-10-10', '2026-11-01')).toBe(100);
        expect(campaignProgress(undefined, '2026-10-10', '2026-10-05')).toBeNull();
    });

    it('a spotlight whose dish left the menu is paused only while it is open (#274)', () => {
        expect(isSpotlightPaused({ itemInactive: true, status: 'active' })).toBe(true);
        expect(isSpotlightPaused({ itemInactive: true, status: 'requested' })).toBe(true);
        expect(isSpotlightPaused({ itemInactive: true, status: 'ended' })).toBe(false);
        expect(isSpotlightPaused({ itemInactive: true, status: 'rejected' })).toBe(false);
        expect(isSpotlightPaused({ itemInactive: false, status: 'active' })).toBe(false);
    });

    it('parses the sub-tab param', () => {
        expect(parsePromoSub('plato')).toBe('plato');
        expect(parsePromoSub('nada')).toBeNull();
        expect(parsePromoSub(null)).toBeNull();
    });
});
