import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    countSnap,
    firestoreError,
    firestoreMock,
    hasConstraint,
    missingDoc,
    mockDoc,
    mockSnap,
    resetFirestoreMock,
    ts,
    whereOf,
    type MockQuery,
} from '../../../test/firestoreMock';

vi.mock('../../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', async () => (await import('../../../test/firestoreMock')).firestoreMock);

import {
    PLACES_LIMIT,
    fetchAttention,
    fetchInterestPage,
    fetchInterestSummary,
    fetchPlaceList,
    fetchPlanHistory,
    searchPlaces,
    searchUsers,
} from './planQueries';

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
    resetFirestoreMock();
});

describe('fetchAttention', () => {
    it('Pro manual o de prueba que caduca en 14 días, pagos con problema y checkouts, sin índices compuestos', async () => {
        firestoreMock.getDocs.mockImplementation(async (q: MockQuery) => {
            if (whereOf(q, 'businessPlanExpiresAt')) {
                return mockSnap([
                    mockDoc('trial', { name: 'Bar Pepe', businessProActive: true, businessPlanSource: 'trial', businessPlanExpiresAt: ts(NOW + 3 * DAY) }),
                    mockDoc('stripe', { name: 'Café', businessProActive: true, businessPlanSource: 'stripe', businessPlanExpiresAt: ts(NOW + 3 * DAY) }),
                    mockDoc('free', { name: 'Free', businessProActive: false, businessPlanSource: 'manual', businessPlanExpiresAt: ts(NOW + 3 * DAY) }),
                ]);
            }
            const billing = whereOf(q, 'businessBillingStatus');
            if (billing?.op === 'in') {
                return mockSnap([
                    mockDoc('late', { name: 'Tarde', businessBillingStatus: 'past_due', businessBillingUpdatedAt: ts(NOW - DAY) }),
                    mockDoc('older', { name: 'Antes', businessBillingStatus: 'unpaid', businessBillingUpdatedAt: ts(NOW - 5 * DAY) }),
                ]);
            }
            return mockSnap([mockDoc('checkout', { name: 'Pide', businessBillingStatus: 'checkout_started' })]);
        });

        const result = await fetchAttention(NOW);

        expect(result.expiring.rows.map((place) => place.id)).toEqual(['trial']);
        expect(result.billing.rows.map((place) => place.id)).toEqual(['older', 'late']);
        expect(result.checkouts.rows.map((place) => place.id)).toEqual(['checkout']);

        const [expiringQuery] = firestoreMock.getDocs.mock.calls.map(([q]) => q as MockQuery).filter((q) => whereOf(q, 'businessPlanExpiresAt'));
        const range = expiringQuery.constraints.filter((c) => c.type === 'where');
        expect(range).toHaveLength(2);
        expect(expiringQuery.constraints).toContainEqual({ type: 'orderBy', field: 'businessPlanExpiresAt', direction: 'asc' });
        expect(whereOf(firestoreMock.getDocs.mock.calls[1][0] as MockQuery, 'businessBillingStatus')).toMatchObject({ op: 'in', value: ['past_due', 'unpaid'] });
    });

    it('si una sección falla, las demás se cargan', async () => {
        firestoreMock.getDocs.mockImplementation(async (q: MockQuery) => {
            if (whereOf(q, 'businessPlanExpiresAt')) throw firestoreError('permission-denied');
            return mockSnap([]);
        });
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await fetchAttention(NOW);
        expect(result.expiring.error).toBeTruthy();
        expect(result.billing.error).toBeNull();
    });
});

describe('fetchPlaceList', () => {
    it('Pro activos: count real y aviso de truncado', async () => {
        firestoreMock.getDocs.mockResolvedValue(mockSnap([
            mockDoc('b', { name: 'B', businessProActive: true, businessPlanSource: 'manual' }),
            mockDoc('a', { name: 'A', businessProActive: true, businessPlanSource: 'trial', businessPlanExpiresAt: ts(NOW + DAY) }),
        ]));
        firestoreMock.getCountFromServer.mockResolvedValue(countSnap(340));

        const list = await fetchPlaceList('pro', NOW);

        expect(list.rows.map((place) => place.id)).toEqual(['a', 'b']);
        expect(list.total).toBe(340);
        expect(list.truncated).toBe(true);
        const listQuery = firestoreMock.getDocs.mock.calls[0][0] as MockQuery;
        expect(whereOf(listQuery, 'businessProActive')).toMatchObject({ op: '==', value: true });
        expect(listQuery.constraints).toContainEqual({ type: 'limit', value: PLACES_LIMIT });
        expect(hasConstraint(listQuery, 'orderBy')).toBe(false);
    });

    it('Verificados sin Pro: quita los que ya tienen Pro', async () => {
        firestoreMock.getDocs.mockResolvedValue(mockSnap([
            mockDoc('pro', { name: 'Pro', businessVerified: true, businessProActive: true }),
            mockDoc('free', { name: 'Free', businessVerified: true }),
        ]));
        firestoreMock.getCountFromServer.mockResolvedValue(countSnap(2));
        const list = await fetchPlaceList('verified', NOW);
        expect(list.rows.map((place) => place.id)).toEqual(['free']);
        expect(list.truncated).toBe(false);
    });
});

describe('searchPlaces', () => {
    it('busca el id exacto y el prefijo del nombre, también con mayúscula inicial', async () => {
        firestoreMock.getDoc.mockResolvedValue(mockDoc('ChIJabcdefghijklmnop', { name: 'Mesón Lejano' }));
        firestoreMock.getDocs.mockResolvedValue(mockSnap([mockDoc('p9', { name: 'Mesón' })]));

        const byId = await searchPlaces('ChIJabcdefghijklmnop', NOW);
        expect(byId.map((place) => place.id)).toEqual(['ChIJabcdefghijklmnop', 'p9']);

        firestoreMock.getDocs.mockClear();
        await searchPlaces('mesón', NOW);
        const prefixes = firestoreMock.getDocs.mock.calls.map(([q]) => (q as MockQuery).constraints
            .filter((c) => c.type === 'where' && c.field === 'name')
            .map((c) => (c as { value: unknown }).value));
        expect(prefixes).toEqual([['mesón', 'mesón'], ['Mesón', 'Mesón']]);
    });

    it('no busca con menos de 3 letras', async () => {
        expect(await searchPlaces('ab', NOW)).toEqual([]);
        expect(firestoreMock.getDocs).not.toHaveBeenCalled();
    });
});

describe('searchUsers', () => {
    it('devuelve todos los candidatos (uid, @username, email), sin duplicados', async () => {
        firestoreMock.getDoc.mockResolvedValue(missingDoc('juan@bar.es'));
        firestoreMock.getDocs.mockImplementation(async (q: MockQuery) => {
            if (whereOf(q, 'emailLowerCase')) return mockSnap([mockDoc('u1', { username: 'juan', email: 'juan@bar.es' })]);
            if (whereOf(q, 'email')) return mockSnap([mockDoc('u1', { username: 'juan' }), mockDoc('u2', { username: 'juan2' })]);
            return mockSnap([]);
        });
        const users = await searchUsers('juan@bar.es', NOW);
        expect(users.map((user) => user.id)).toEqual(['u1', 'u2']);
    });
});

describe('fetchPlanHistory', () => {
    it('filtra por acción y ordena por fecha en el servidor', async () => {
        firestoreMock.getDocs.mockResolvedValue(mockSnap([mockDoc('a1', { action: 'sponsored.creditsGranted', createdAt: ts(NOW) })]));
        const page = await fetchPlanHistory({ filter: 'impulses' });
        const q = firestoreMock.getDocs.mock.calls[0][0] as MockQuery;
        expect(whereOf(q, 'action')).toMatchObject({ op: 'in', value: ['sponsored.creditsGranted', 'sponsored.impulsesPurchased'] });
        expect(q.constraints).toContainEqual({ type: 'orderBy', field: 'createdAt', direction: 'desc' });
        expect(page.degraded).toBe(false);
        expect(page.rows[0].action).toBe('sponsored.creditsGranted');
    });

    it('sin índice: repite sin orden, ordena aquí y marca degraded', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        firestoreMock.getDocs
            .mockRejectedValueOnce(firestoreError('failed-precondition'))
            .mockResolvedValueOnce(mockSnap([
                mockDoc('old', { action: 'businessPlan.expired', createdAt: ts(NOW - DAY) }),
                mockDoc('new', { action: 'businessPlan.manualGrant', createdAt: ts(NOW) }),
            ]));
        const page = await fetchPlanHistory({ filter: 'all' });
        expect(page).toMatchObject({ degraded: true, hasMore: false, cursor: null });
        expect(page.rows.map((row) => row.id)).toEqual(['new', 'old']);
        expect(hasConstraint(firestoreMock.getDocs.mock.calls[1][0] as MockQuery, 'orderBy')).toBe(false);
    });
});

describe('beta «Lo quiero»', () => {
    it('«en prueba ahora» se cuenta en los locales, no en planInterest.trialExpiresAt', async () => {
        firestoreMock.getCountFromServer.mockImplementation(async (q: MockQuery) => {
            if (q.path === 'places' && whereOf(q, 'businessPlanSource')) return countSnap(7);
            if (q.path === 'places' && whereOf(q, 'businessPlanGrantedBy')) return countSnap(4);
            if (q.path === 'adminAuditLog') return countSnap(11);
            if (whereOf(q, 'placeId')) return countSnap(3);
            if (whereOf(q, 'billing')) return countSnap(2);
            return countSnap(20);
        });
        const summary = await fetchInterestSummary(NOW);
        expect(summary).toMatchObject({ interested: 20, withoutPlace: 3, yearly: 2, trialsNow: 7, betaTrialsNow: 4, betaTrialsGranted: 11 });

        const trialQuery = firestoreMock.getCountFromServer.mock.calls
            .map(([q]) => q as MockQuery)
            .find((q) => q.path === 'places' && whereOf(q, 'businessPlanSource')) as MockQuery;
        expect(whereOf(trialQuery, 'businessPlanSource')).toMatchObject({ op: '==', value: 'trial' });
        expect(whereOf(trialQuery, 'businessProActive')).toMatchObject({ op: '==', value: true });
        expect(firestoreMock.getDocs).not.toHaveBeenCalled();
    });

    it('la lista va por páginas ordenadas por lastAt; «Sin local» usa solo igualdades', async () => {
        firestoreMock.getDocs.mockResolvedValue(mockSnap([
            mockDoc('a', { plan: 'business_pro', placeId: null, lastAt: ts(NOW - DAY) }),
            mockDoc('b', { plan: 'business_pro', placeId: null, lastAt: ts(NOW) }),
        ]));
        await fetchInterestPage({ filter: 'all' });
        const allQuery = firestoreMock.getDocs.mock.calls[0][0] as MockQuery;
        expect(allQuery.constraints).toContainEqual({ type: 'orderBy', field: 'lastAt', direction: 'desc' });

        const noPlace = await fetchInterestPage({ filter: 'noPlace' });
        const noPlaceQuery = firestoreMock.getDocs.mock.calls[1][0] as MockQuery;
        expect(whereOf(noPlaceQuery, 'placeId')).toMatchObject({ op: '==', value: null });
        expect(hasConstraint(noPlaceQuery, 'orderBy')).toBe(false);
        expect(noPlace.rows.map((row) => row.id)).toEqual(['b', 'a']);
    });
});
