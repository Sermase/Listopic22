import { describe, expect, it } from 'vitest';
import { formatDate } from '../../../utils/adminTime';
import {
    computeExpiresAt,
    creditsConfirm,
    creditsResultText,
    describeHistoryEntry,
    durationOptions,
    expiryBase,
    historyActionsFor,
    isStripeManaged,
    isUserStripeManaged,
    mapInterestRow,
    mapPlanPlace,
    mapPlanUser,
    normalizeBetaFilter,
    normalizeHistoryFilter,
    normalizePlansView,
    normalizeProFilter,
    parseCredits,
    planSourceKey,
    PLAN_HISTORY_ACTIONS,
} from './planUtils';

const NOW = new Date(2026, 9, 6, 10, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;
const ts = (ms: number) => ({ toMillis: () => ms });

describe('vistas y filtros', () => {
    it('normaliza ?view= y ?status= con valores por defecto', () => {
        expect(normalizePlansView(null)).toBe('attention');
        expect(normalizePlansView('beta')).toBe('beta');
        expect(normalizePlansView('nope')).toBe('attention');
        expect(normalizeProFilter('beta')).toBe('beta');
        expect(normalizeProFilter('approved')).toBe('all');
        expect(normalizeHistoryFilter('impulses')).toBe('impulses');
        expect(normalizeHistoryFilter(undefined)).toBe('all');
        expect(normalizeBetaFilter('noPlace')).toBe('noPlace');
        expect(normalizeBetaFilter('x')).toBe('all');
    });

    it('el historial filtra por grupos de acciones y «Todo» las incluye todas', () => {
        expect(PLAN_HISTORY_ACTIONS).toHaveLength(12);
        expect(historyActionsFor('all')).toEqual(PLAN_HISTORY_ACTIONS);
        expect(historyActionsFor('impulses')).toEqual(['sponsored.creditsGranted', 'sponsored.impulsesPurchased']);
    });
});

describe('mapPlanPlace', () => {
    it('lee plan, quién lo concedió, nota, último cambio y saldo', () => {
        const place = mapPlanPlace('p1', {
            name: 'Bar Pepe',
            businessVerified: true,
            businessProActive: true,
            businessPlanSource: 'trial',
            businessPlanGrantedBy: 'beta',
            businessPlanNotes: 'Beta gratuita',
            businessPlanUpdatedAt: ts(NOW - DAY),
            businessPlanExpiresAt: ts(NOW + 8 * DAY),
            spotlightCredits: 120.7,
        }, NOW);
        expect(place).toMatchObject({
            name: 'Bar Pepe',
            proFlag: true,
            expired: false,
            grantedBy: 'beta',
            notes: 'Beta gratuita',
            updatedAtMs: NOW - DAY,
            expiresAtMs: NOW + 8 * DAY,
            spotlightCredits: 120,
        });
        expect(planSourceKey(place)).toBe('beta');
    });

    it('marca como caducado el Pro con la fecha pasada (lo degrada el proceso nocturno)', () => {
        const place = mapPlanPlace('p2', { businessProActive: true, businessPlanSource: 'manual', businessPlanExpiresAt: ts(NOW - 1000) }, NOW);
        expect(place.expired).toBe(true);
    });
});

describe('isStripeManaged', () => {
    const stripePlace = (extra: Record<string, unknown>) => mapPlanPlace('p', {
        businessProActive: true,
        businessPlanSource: 'stripe',
        businessBillingStatus: 'active',
        ...extra,
    }, NOW);

    it('exige stripeSubscriptionId, como el backend (hasActiveStripeSubscription)', () => {
        expect(isStripeManaged(stripePlace({ stripeSubscriptionId: 'sub_1' }))).toBe(true);
        expect(isStripeManaged(stripePlace({}))).toBe(false);
    });

    it('solo con estados activos de Stripe', () => {
        expect(isStripeManaged(stripePlace({ stripeSubscriptionId: 'sub_1', businessBillingStatus: 'past_due' }))).toBe(true);
        expect(isStripeManaged(stripePlace({ stripeSubscriptionId: 'sub_1', businessBillingStatus: 'canceled' }))).toBe(false);
    });

    it('premium de usuario con Stripe no se puede quitar desde aquí', () => {
        expect(isUserStripeManaged(mapPlanUser('u', { premium: { active: true, source: 'stripe' } }, NOW))).toBe(true);
        expect(isUserStripeManaged(mapPlanUser('u', { premium: { active: true, source: 'manual' } }, NOW))).toBe(false);
    });
});

describe('duración', () => {
    it('extender cuenta desde la caducidad actual si aún no ha pasado', () => {
        const expires = NOW + 8 * DAY;
        expect(expiryBase(expires, NOW)).toBe(expires);
        expect(expiryBase(NOW - DAY, NOW)).toBe(NOW);
        const iso = computeExpiresAt('1m', '', expires, NOW) as string;
        const expected = new Date(expires);
        expected.setMonth(expected.getMonth() + 1);
        expect(new Date(iso).getTime()).toBe(expected.getTime());
    });

    it('indefinida no manda fecha; la fecha concreta tiene que ser futura', () => {
        expect(computeExpiresAt('indefinite', '', NOW, NOW)).toBeUndefined();
        expect(() => computeExpiresAt('custom', '', NOW, NOW)).toThrow(/Elige la fecha/);
        expect(() => computeExpiresAt('custom', '2020-01-01', NOW, NOW)).toThrow(/futura/);
        expect(new Date(computeExpiresAt('custom', '2026-12-31', NOW, NOW) as string).getDate()).toBe(31);
    });

    it('las opciones enseñan la fecha resultante y dicen «más» al extender', () => {
        const options = durationOptions(NOW + 8 * DAY, NOW);
        expect(options.map((option) => option.value)).toEqual(['indefinite', '1m', '3m', 'custom']);
        expect(options[1].label).toMatch(/^1 mes más \(hasta el \d{2}\/\d{2}\)$/);
        expect(durationOptions(NOW, NOW)[1].label).toMatch(/^1 mes \(hasta el/);
    });
});

describe('impulsos', () => {
    it('valida la cantidad', () => {
        expect(parseCredits('')).toHaveProperty('error');
        expect(parseCredits('0')).toHaveProperty('error');
        expect(parseCredits('1.5')).toHaveProperty('error');
        expect(parseCredits('100001')).toHaveProperty('error');
        expect(parseCredits(' -50 ')).toEqual({ value: -50 });
    });

    it('el confirm dice la cantidad exacta, el signo y el saldo resultante', () => {
        const give = creditsConfirm('Bar Pepe', 100, 20, 'Invitación');
        expect(give.title).toBe('🎁 ¿Regalar 100 impulsos a Bar Pepe?');
        expect(give.message).toBe('Saldo total ahora: 20 impulsos. Después: 120 impulsos. Motivo: “Invitación”.');
        expect(give.destructive).toBe(false);

        const take = creditsConfirm('Bar Pepe', -50, 20);
        expect(take.title).toBe('➖ ¿Retirar 50 impulsos a Bar Pepe?');
        expect(take.message).toContain('Después: 0 impulsos (el saldo no baja de 0)');
        expect(take.destructive).toBe(true);
    });

    it('el resultado habla de saldo total, no «de regalo»', () => {
        const text = creditsResultText('Bar Pepe', 1);
        expect(text).toBe('⚡ Hecho. Saldo total de Bar Pepe: 1 impulso (regalados y comprados).');
        expect(text).not.toMatch(/de regalo/);
    });
});

describe('describeHistoryEntry', () => {
    const entry = (action: string, details: Record<string, unknown>, actorUid = 'u-ana') => ({ id: 'a1', action, actorUid, createdAtMs: NOW, details });

    it('concesiones y retiradas de Business Pro', () => {
        const grant = describeHistoryEntry(entry('businessPlan.manualGrant', {
            placeId: 'p1', placeName: 'Bar Pepe', source: 'trial', expiresAt: new Date(NOW + 30 * DAY).toISOString(), notes: 'Prensa',
        }));
        expect(grant).toMatchObject({ emoji: '✨', title: 'Business Pro concedido', placeId: 'p1', placeName: 'Bar Pepe', notes: 'Prensa' });
        expect(grant.parts).toEqual([`hasta el ${formatDate(NOW + 30 * DAY)}`]);
        expect(describeHistoryEntry(entry('businessPlan.manualRevoke', { placeId: 'p1' })).title).toBe('Business Pro retirado');
        expect(describeHistoryEntry(entry('businessPlan.expired', { placeId: 'p1', previousSource: 'trial' }, 'system')).parts)
            .toEqual(['era Periodo de prueba']);
    });

    it('impulsos regalados, retirados y comprados', () => {
        const gift = describeHistoryEntry(entry('sponsored.creditsGranted', { placeId: 'p1', credits: 100, previousBalance: 20, newBalance: 120 }));
        expect(gift).toMatchObject({ emoji: '🎁', title: '100 impulsos regalados', parts: ['saldo total 20 → 120'] });
        expect(describeHistoryEntry(entry('sponsored.creditsGranted', { credits: -5 })).title).toBe('5 impulsos retirados');
        const bought = describeHistoryEntry(entry('sponsored.impulsesPurchased', { placeId: 'p1', impulses: 500, amountTotalCents: 2500 }));
        expect(bought.title).toBe('Compra de 500 impulsos');
        expect(bought.parts[0]).toMatch(/25/);
    });

    it('premium y Stripe', () => {
        expect(describeHistoryEntry(entry('userPlan.manualGrant', { userId: 'u1', username: 'juan' }))).toMatchObject({ title: 'Premium concedido', userName: '@juan' });
        expect(describeHistoryEntry(entry('businessPro.subscriptionUpdated', { placeId: 'p1', status: 'past_due' })).title)
            .toBe('Suscripción de Stripe: pago atrasado');
    });
});

describe('mapInterestRow', () => {
    it('sabe si la prueba sigue en marcha cuando se leyó', () => {
        expect(mapInterestRow('i1', { plan: 'business_pro', trialExpiresAt: ts(NOW + DAY) }, NOW).trialActive).toBe(true);
        expect(mapInterestRow('i2', { plan: 'business_pro', trialExpiresAt: ts(NOW - DAY) }, NOW).trialActive).toBe(false);
        expect(mapInterestRow('i3', { plan: 'business_pro', placeId: null }, NOW)).toMatchObject({ placeId: null, clicks: 1, billing: 'monthly' });
    });
});
