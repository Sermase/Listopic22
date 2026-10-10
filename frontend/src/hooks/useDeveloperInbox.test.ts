import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    countSnap,
    firestoreError,
    firestoreMock,
    missingDoc,
    mockDoc,
    mockSnap,
    resetFirestoreMock,
    ts,
    whereOf,
    type MockQuery,
} from '../test/firestoreMock';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', async () => (await import('../test/firestoreMock')).firestoreMock);

import { fetchDeveloperInbox, fetchDeveloperPendingCounts } from './useDeveloperInbox';
import { DAY_MS, HOUR_MS } from '../utils/adminTime';

const NOW = new Date(2026, 9, 6, 12, 0, 0).getTime(); // hoy = 2026-10-06

const statusOf = (q: MockQuery) => whereOf(q, 'status')?.value;

beforeEach(() => {
    resetFirestoreMock();
});

describe('fetchDeveloperPendingCounts', () => {
    it('suma lo que hay por revisar y lo que pide atención por pestaña', async () => {
        firestoreMock.getCountFromServer.mockImplementation(async (q: MockQuery) => {
            if (q.path === 'reports') return countSnap(4);
            if (q.path === 'businessClaims') return countSnap(3);
            if (q.path === 'itemProposals') return countSnap(2);
            if (q.path === 'sponsoredPlacements' && whereOf(q, 'endsAt')) return countSnap(1);
            if (q.path === 'sponsoredPlacements') return countSnap(1);
            if (q.path === 'sponsoredItemSpotlights' && whereOf(q, 'endsAt')) throw firestoreError('failed-precondition');
            if (q.path === 'sponsoredItemSpotlights') return countSnap(0);
            if (q.path === 'places' && whereOf(q, 'businessPlanExpiresAt')) return countSnap(2);
            if (q.path === 'places' && whereOf(q, 'businessBillingStatus')) return countSnap(1);
            if (q.path === 'planInterest') return countSnap(6);
            throw new Error(`consulta inesperada ${q.path}`);
        });

        const counts = await fetchDeveloperPendingCounts(NOW);

        expect(counts).toMatchObject({
            reports: 4,
            businessClaims: 3,
            itemProposals: 2,
            sponsoredPlacements: 1,
            sponsoredItemSpotlights: 0,
            plansExpiring: 2,
            billingProblems: 1,
            campaignsOverdue: null,
            betaLeads: 6,
            toReview: 10,
            attention: 3,
        });
        expect(counts.badges).toEqual({
            pending: { review: 10, attention: 3 },
            reports: { review: 4, attention: 0 },
            businessClaims: { review: 3, attention: 0 },
            plans: { review: 0, attention: 3 },
            proProposals: { review: 3, attention: 0 },
        });
        const leadQuery = firestoreMock.getCountFromServer.mock.calls
            .map(([q]) => q as MockQuery)
            .find((q) => q.path === 'planInterest') as MockQuery;
        expect(whereOf(leadQuery, 'placeId')).toMatchObject({ op: '==', value: null });
    });
});

describe('fetchDeveloperInbox', () => {
    beforeEach(() => {
        firestoreMock.getDocs.mockImplementation(async (q: MockQuery) => {
            const status = statusOf(q);
            if (q.path === 'reports') {
                return mockSnap([
                    mockDoc('r-old', { status: 'pending', issueType: 'spam', targetName: 'Bar X', createdAt: ts(NOW - 4 * DAY_MS) }),
                    mockDoc('r-urgent', { status: 'pending', issueType: 'child_safety', targetName: 'Lista', createdAt: ts(NOW - 2 * HOUR_MS) }),
                ]);
            }
            if (q.path === 'businessClaims') {
                return mockSnap([
                    mockDoc('c1', { status: 'pending', placeId: 'p1', placeName: 'Bar Pepe', userId: 'u1', createdAt: ts(NOW - 5 * DAY_MS) }),
                    mockDoc('c2', { status: 'pending', placeId: 'p1', placeName: 'Bar Pepe', userId: 'u2', createdAt: ts(NOW - DAY_MS) }),
                ]);
            }
            if (q.path === 'sponsoredPlacements' && status === 'requested') {
                return mockSnap([mockDoc('sp-req', { status: 'requested', type: 'home', placeName: 'Café Sol', endsAt: '2026-10-01', createdAt: ts(NOW - 6 * DAY_MS) })]);
            }
            if (q.path === 'sponsoredPlacements' && status === 'active') {
                return mockSnap([
                    mockDoc('sp-overdue', { status: 'active', type: 'search', placeName: 'Bar Pepe', endsAt: '2026-09-30', createdAt: ts(NOW - 20 * DAY_MS) }),
                    mockDoc('sp-soon', { status: 'active', type: 'home', placeName: 'Café Sol', endsAt: '2026-10-08', createdAt: ts(NOW - 10 * DAY_MS) }),
                    mockDoc('sp-later', { status: 'active', type: 'home', placeName: 'Otro', endsAt: '2026-11-08', createdAt: ts(NOW - 9 * DAY_MS) }),
                ]);
            }
            if (q.path === 'places' && whereOf(q, 'businessPlanExpiresAt')) {
                return mockSnap([
                    mockDoc('p-beta', {
                        name: 'Bar Pepe',
                        businessProActive: true,
                        businessPlanSource: 'trial',
                        businessPlanGrantedBy: 'beta',
                        businessPlanExpiresAt: ts(NOW + 8 * DAY_MS),
                    }),
                    mockDoc('p-stripe', { name: 'Stripe', businessProActive: true, businessPlanSource: 'stripe', businessPlanExpiresAt: ts(NOW + DAY_MS) }),
                ]);
            }
            if (q.path === 'places' && whereOf(q, 'businessBillingStatus')) {
                return mockSnap([mockDoc('p-due', { name: 'Café Sol', businessBillingStatus: 'past_due', businessBillingUpdatedAt: ts(new Date(2026, 9, 2).getTime()) })]);
            }
            return mockSnap([]);
        });
        firestoreMock.getDoc.mockImplementation(async (ref: { path: string; id: string }) => (ref.path === 'places/p1'
            ? mockDoc('p1', { businessVerified: true, businessOwnerUserId: 'owner-maria' })
            : missingDoc(ref.id)));
        firestoreMock.getCountFromServer.mockImplementation(async (q: MockQuery) => {
            if (q.path === 'reports') return countSnap(2);
            if (q.path === 'businessClaims') return countSnap(2);
            if (q.path === 'sponsoredPlacements') return countSnap(1);
            if (q.path === 'planInterest') return countSnap(6);
            if (q.path === 'places') return countSnap(2);
            return countSnap(0);
        });
    });

    it('separa los reportes urgentes y ordena los grupos de la bandeja', async () => {
        const inbox = await fetchDeveloperInbox(NOW);
        expect(inbox.groups.map((group) => group.key)).toEqual([
            'urgentReports',
            'reports',
            'businessClaims',
            'itemProposals',
            'sponsoredPlacements',
            'sponsoredItemSpotlights',
        ]);
        const [urgent, reports] = inbox.groups;
        expect(urgent.items.map((item) => item.id)).toEqual(['r-urgent']);
        expect(urgent.total).toBe(1);
        expect(reports.items.map((item) => item.id)).toEqual(['r-old']);
        expect(reports.total).toBe(1);
        expect(reports.target).toEqual({ tab: 'reports', view: 'pending' });
        expect(inbox.summary).toMatchObject({ toReview: 5, urgent: 1 });
        expect(inbox.summary.oldestMs).toBe(NOW - 6 * DAY_MS);
    });

    it('avisa en las solicitudes si el lugar ya tiene dueño y si compiten varias', async () => {
        const claims = (await fetchDeveloperInbox(NOW)).groups.find((group) => group.key === 'businessClaims');
        expect(claims?.items[0].badges).toEqual([
            { emoji: '⚠️', text: 'Ya verificado · propietario', tone: 'warning', userId: 'owner-maria' },
            { emoji: '👥', text: '2 solicitudes para este lugar', tone: 'warning' },
        ]);
        expect(firestoreMock.getDoc).toHaveBeenCalledTimes(1);
    });

    it('arma la sección Atención: planes que caducan, pagos y campañas vencidas', async () => {
        const inbox = await fetchDeveloperInbox(NOW);
        const section = (key: string) => inbox.attention.find((entry) => entry.key === key);

        expect(section('planExpiring')?.items).toHaveLength(1);
        expect(section('planExpiring')?.items[0]).toMatchObject({
            id: 'p-beta',
            title: 'Bar Pepe',
            subtitle: 'Prueba (beta) · caduca el 14/10 (en 8 d)',
            target: { tab: 'plans', view: 'attention', focus: 'p-beta' },
        });
        expect(section('billing')?.items[0].subtitle).toBe('Stripe: pago atrasado desde el 02/10');

        const overdue = section('campaignOverdue')?.items ?? [];
        expect(overdue.map((item) => item.id)).toEqual(['sp-overdue', 'sp-req']);
        expect(overdue[0]).toMatchObject({ title: 'Búsqueda · Bar Pepe', subtitle: 'terminó el 30/09 y sigue «activa»' });
        expect(overdue[0].target).toEqual({ tab: 'proProposals', view: 'active', focus: 'sp-overdue' });
        expect(overdue[1].target.view).toBe('inbox');

        const soon = section('campaignEndingSoon');
        expect(soon?.informative).toBe(true);
        expect(soon?.items.map((item) => item.subtitle)).toEqual(['termina el 08/10 (en 2 d)']);

        expect(inbox.summary.attention).toBe(4);
        expect(inbox.followUp).toMatchObject({ betaLeads: 6, checkoutsStarted: 2 });
        expect(inbox.errors).toEqual([]);
        expect(inbox.degraded).toBe(false);
    });

    it('si una sección falla, sigue con el resto y lo anota', async () => {
        const base = firestoreMock.getDocs.getMockImplementation();
        firestoreMock.getDocs.mockImplementation(async (q: MockQuery) => {
            if (q.path === 'itemProposals') throw firestoreError('permission-denied');
            return base?.(q);
        });
        const inbox = await fetchDeveloperInbox(NOW);
        const proposals = inbox.groups.find((group) => group.key === 'itemProposals');
        expect(proposals?.error).toBe('No se pudo cargar');
        expect(inbox.errors).toEqual(['Propuestas de carta']);
        expect(inbox.groups.find((group) => group.key === 'businessClaims')?.items).toHaveLength(2);
    });

    it('si fallan los reportes o las campañas en curso, el aviso sale una sola vez', async () => {
        const base = firestoreMock.getDocs.getMockImplementation();
        firestoreMock.getDocs.mockImplementation(async (q: MockQuery) => {
            if (q.path === 'reports') throw firestoreError('permission-denied');
            if (q.path === 'sponsoredPlacements' && statusOf(q) === 'active') throw firestoreError('permission-denied');
            return base?.(q);
        });
        const inbox = await fetchDeveloperInbox(NOW);
        const groupErrors = inbox.groups.filter((group) => group.error).map((group) => group.key);
        expect(groupErrors).toEqual(['reports']);
        const sectionErrors = inbox.attention.filter((section) => section.error).map((section) => section.key);
        expect(sectionErrors).toEqual(['campaignOverdue']);
    });
});
