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
} from '../test/firestoreMock';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', async () => (await import('../test/firestoreMock')).firestoreMock);

import {
    PROPOSAL_APPLY_STALE_MS,
    QUEUES,
    countByStatus,
    countEachStatus,
    fetchActive,
    fetchPending,
    fetchQueue,
    fetchResolved,
    isMissingIndexError,
    isStuckApplying,
    lookupExact,
    looksLikeId,
    matchesSearch,
    toInboxItem,
    viewForStatus,
} from './adminQueues';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../utils/adminTime';

const NOW = new Date(2026, 9, 6, 12, 0, 0).getTime();
const lastQuery = (): MockQuery => firestoreMock.getDocs.mock.calls.at(-1)?.[0] as MockQuery;

beforeEach(() => {
    resetFirestoreMock();
});

describe('toInboxItem', () => {
    it('marca como urgentes los reportes de seguridad infantil, acoso y suplantación', () => {
        const item = toInboxItem('reports', 'r1', {
            status: 'pending',
            issueType: 'child_safety',
            targetType: 'list',
            targetId: 'list123',
            targetName: 'Lista Bares Centro',
            userName: 'Ana',
            userId: 'uid-ana',
            createdAt: ts(NOW - 2 * HOUR_MS),
        }, NOW);
        expect(item).toMatchObject({
            key: 'reports:r1',
            queue: 'reports',
            urgent: true,
            emoji: '🧒',
            title: 'Lista Bares Centro',
            userId: 'uid-ana',
            ageLevel: 'fresh',
            target: { tab: 'reports', view: 'pending', focus: 'r1' },
        });
        expect(item.subtitle).toBe('Seguridad infantil · 📋 Lista · por Ana');
        expect(toInboxItem('reports', 'r2', { issueType: 'harassment' }, NOW).urgent).toBe(true);
        expect(toInboxItem('reports', 'r3', { issueType: 'impersonation' }, NOW).urgent).toBe(true);
        expect(toInboxItem('reports', 'r4', { issueType: 'spam' }, NOW).urgent).toBe(false);
    });

    it('calcula la antigüedad: gris < 24 h, ámbar 1 a 3 d, rojo > 3 d', () => {
        const at = (ms: number) => toInboxItem('businessClaims', 'c', { status: 'pending', createdAt: ts(NOW - ms) }, NOW).ageLevel;
        expect(at(5 * HOUR_MS)).toBe('fresh');
        expect(at(2 * DAY_MS)).toBe('warning');
        expect(at(5 * DAY_MS)).toBe('old');
    });

    it('trata un reporte sin estado como pendiente y uno resuelto va a Resueltos', () => {
        expect(toInboxItem('reports', 'r', {}, NOW).target.view).toBe('pending');
        expect(toInboxItem('reports', 'r', { status: 'resolved' }, NOW).target).toEqual({ tab: 'reports', view: 'resolved', focus: 'r' });
    });

    it('resume solicitudes de negocio con solicitante, rol y email, y avisa del reenvío', () => {
        const item = toInboxItem('businessClaims', 'uid_place', {
            status: 'pending',
            placeId: 'place1',
            placeName: 'Bar Pepe',
            userId: 'uid-juan',
            userName: 'Juan López',
            role: 'Propietario',
            contactEmail: 'juan@bar.es',
            previousReviews: [{ status: 'rejected' }],
            createdAt: ts(NOW - 5 * DAY_MS),
        }, NOW);
        expect(item.title).toBe('Bar Pepe');
        expect(item.subtitle).toBe('Juan López (Propietario) · juan@bar.es');
        expect(item.badges).toEqual([{ emoji: '🔁', text: 'Reenvío nº 1', tone: 'info' }]);
        expect(item.target).toEqual({ tab: 'businessClaims', view: 'pending', focus: 'uid_place' });
        expect(item.ageLevel).toBe('old');
    });

    it('describe propuestas de carta y enlaza a la bandeja o al historial', () => {
        const pending = toInboxItem('itemProposals', 'p1', {
            status: 'pending',
            type: 'merge',
            placeName: 'Bar Pepe',
            payload: { sourceItemName: 'Bravas', targetItemName: 'Patatas bravas' },
            createdBy: 'uid-1',
        }, NOW);
        expect(pending.emoji).toBe('🔀');
        expect(pending.subtitle).toBe('Fusión · «Bravas» → «Patatas bravas»');
        expect(pending.target).toEqual({ tab: 'proProposals', view: 'inbox', focus: 'p1' });
        expect(toInboxItem('itemProposals', 'p2', { status: 'approved', type: 'rename' }, NOW).target.view).toBe('history');
    });

    it('enseña las propuestas que se están aplicando y marca «⏳ Atascada» pasados 10 minutos', () => {
        const merge = { type: 'merge', placeName: 'Bar Pepe', payload: { sourceItemName: 'Bravas', targetItemName: 'Patatas bravas' } };
        const applying = toInboxItem('itemProposals', 'p1', {
            ...merge,
            status: 'applying',
            reviewedBy: 'uid-ana',
            applyingAt: ts(NOW - 2 * MINUTE_MS),
        }, NOW);
        expect(applying.status).toBe('applying');
        expect(applying.target).toEqual({ tab: 'proProposals', view: 'inbox', focus: 'p1' });
        expect(applying.badges).toEqual([{ emoji: '⚙️', text: 'Aplicándose ahora', tone: 'info' }]);

        const stuck = toInboxItem('itemProposals', 'p2', {
            ...merge,
            status: 'applying',
            applyingAt: ts(NOW - 11 * MINUTE_MS),
        }, NOW);
        expect(stuck.badges).toEqual([{ emoji: '⏳', text: 'Atascada', tone: 'danger' }]);
        expect(stuck.target.view).toBe('inbox');

        expect(PROPOSAL_APPLY_STALE_MS).toBe(10 * MINUTE_MS);
        expect(isStuckApplying({ status: 'applying', applyingAt: ts(NOW - PROPOSAL_APPLY_STALE_MS) }, NOW)).toBe(true);
        expect(isStuckApplying({ status: 'applying', reviewedAt: ts(NOW - HOUR_MS) }, NOW)).toBe(true);
        expect(isStuckApplying({ status: 'applying' }, NOW)).toBe(true);
        expect(isStuckApplying({ status: 'pending', applyingAt: ts(NOW - HOUR_MS) }, NOW)).toBe(false);
    });

    it('avisa en la fila de una propuesta cuyo último intento de aplicarla falló', () => {
        const item = toInboxItem('itemProposals', 'p3', {
            status: 'pending',
            type: 'rename',
            payload: { currentName: 'Bravas', newName: 'Croquetas' },
            applyError: { message: 'Ya hay un elemento llamado «Croquetas». Si son el mismo plato, propón fusionarlos.', code: 'already-exists' },
        }, NOW);
        expect(item.badges).toHaveLength(1);
        expect(item.badges[0]).toMatchObject({ emoji: '⚠️', tone: 'danger' });
        expect(item.badges[0].text).toMatch(/^No se pudo aplicar: Ya hay un elemento llamado «Croquetas»/);
        expect(item.badges[0].text.length).toBeLessThanOrEqual(110);
        // Ya resuelta, el fallo viejo no se repite como aviso.
        expect(toInboxItem('itemProposals', 'p4', { status: 'approved', applyError: { message: 'x' } }, NOW).badges).toEqual([]);
    });

    it('avisa de campañas vencidas y enlaza según su estado', () => {
        const requested = toInboxItem('sponsoredPlacements', 's1', {
            status: 'requested',
            type: 'home',
            placeName: 'Café Sol',
            headline: 'Desayunos 3€',
            startsAt: '2026-09-20',
            endsAt: '2026-09-30',
        }, NOW);
        expect(requested.subtitle).toBe('Home · «Desayunos 3€» · del 20/09 al 30/09');
        expect(requested.badges.map((badge) => badge.text)).toEqual(['Ya vencida sin revisar']);
        expect(requested.target.view).toBe('inbox');

        const active = toInboxItem('sponsoredPlacements', 's2', { status: 'active', type: 'search' }, NOW);
        expect(active.target.view).toBe('active');
        expect(active.badges.map((badge) => badge.text)).toEqual(['Sin fecha de fin']);

        const overdue = toInboxItem('sponsoredPlacements', 's3', { status: 'active', endsAt: '2026-10-01' }, NOW);
        expect(overdue.badges[0]).toMatchObject({ emoji: '🧹', text: 'Vencida sin cerrar', tone: 'danger' });

        expect(toInboxItem('sponsoredPlacements', 's4', { status: 'ended' }, NOW).target.view).toBe('history');
    });

    it('muestra radio, días e impulsos de regalo de un plato destacado', () => {
        const item = toInboxItem('sponsoredItemSpotlights', 'd1', {
            status: 'requested',
            itemName: 'Bravas',
            placeName: 'Bar Pepe',
            radiusKm: 3,
            days: 7,
            units: 1,
            impulses: 140,
            creditsUsed: 120,
        }, NOW);
        expect(item.title).toBe('Bravas');
        expect(item.subtitle).toBe('Bar Pepe · 3 km × 7 d · 140 impulsos (120 de regalo)');
        expect(item.emoji).toBe('🍽️');
        expect(item.badges).toEqual([]);
    });

    it('marca «🚫 Plato retirado · no se muestra» en las campañas cuyo plato salió de la carta', () => {
        const item = toInboxItem('sponsoredItemSpotlights', 'd2', {
            status: 'active',
            itemName: 'Bravas',
            itemInactive: true,
            endsAt: '2026-10-01',
        }, NOW);
        expect(item.badges[0]).toEqual({ emoji: '🚫', text: 'Plato retirado · no se muestra', tone: 'danger' });
        expect(item.badges.map((badge) => badge.text)).toContain('Vencida sin cerrar');
        expect(toInboxItem('sponsoredItemSpotlights', 'd3', { status: 'requested', itemInactive: false }, NOW).badges).toEqual([]);
    });

    it('busca sin tildes ni mayúsculas en lugar, usuario, email e id', () => {
        const item = toInboxItem('businessClaims', 'claim-xyz', {
            placeName: 'Café Sol',
            userName: 'Ana Ruiz',
            contactEmail: 'ana@sol.es',
            placeId: 'place-777',
        }, NOW);
        expect(matchesSearch(item, 'cafe')).toBe(true);
        expect(matchesSearch(item, 'ANA sol')).toBe(true);
        expect(matchesSearch(item, 'ana@sol.es')).toBe(true);
        expect(matchesSearch(item, 'place-777')).toBe(true);
        expect(matchesSearch(item, 'claim-xyz')).toBe(true);
        expect(matchesSearch(item, 'pepe')).toBe(false);
        expect(matchesSearch(item, '   ')).toBe(true);
    });
});

describe('QUEUES', () => {
    it('declara estados pendientes y resueltos de cada colección', () => {
        expect(QUEUES.reports.pendingStatuses).toEqual(['pending']);
        expect(QUEUES.itemProposals.pendingStatuses).toEqual(['pending', 'applying']);
        expect(viewForStatus('itemProposals', 'applying')).toBe('inbox');
        expect(QUEUES.businessClaims.resolvedStatuses).toEqual(['approved', 'rejected']);
        expect(QUEUES.sponsoredPlacements.pendingStatuses).toEqual(['requested']);
        expect(QUEUES.sponsoredItemSpotlights.resolvedStatuses).toEqual(['rejected', 'ended']);
        expect(viewForStatus('sponsoredItemSpotlights', 'active')).toBe('active');
        expect(viewForStatus('businessClaims', 'rejected')).toBe('resolved');
    });
});

describe('fetchPending / fetchResolved', () => {
    it('pide pendientes con orden ascendente y uno de más para saber si hay otra página', async () => {
        firestoreMock.getDocs.mockResolvedValueOnce(mockSnap([
            mockDoc('a', { status: 'pending', placeName: 'A', createdAt: ts(NOW - 3 * DAY_MS) }),
            mockDoc('b', { status: 'pending', placeName: 'B', createdAt: ts(NOW - DAY_MS) }),
        ]));
        const page = await fetchPending('businessClaims', { now: NOW });
        const q = lastQuery();
        expect(q.path).toBe('businessClaims');
        expect(whereOf(q, 'status')).toMatchObject({ op: '==', value: 'pending' });
        expect(q.constraints).toContainEqual({ type: 'orderBy', field: 'createdAt', direction: 'asc' });
        expect(q.constraints).toContainEqual({ type: 'limit', value: 51 });
        expect(page.items.map((item) => item.id)).toEqual(['a', 'b']);
        expect(page).toMatchObject({ hasMore: false, degraded: false, cursor: null });
    });

    it('la bandeja de propuestas incluye las que se están aplicando', async () => {
        firestoreMock.getDocs.mockResolvedValueOnce(mockSnap([
            mockDoc('p-old', { status: 'pending', type: 'merge', createdAt: ts(NOW - 2 * DAY_MS) }),
            mockDoc('p-stuck', { status: 'applying', type: 'rename', createdAt: ts(NOW - DAY_MS), applyingAt: ts(NOW - HOUR_MS) }),
        ]));
        const page = await fetchPending('itemProposals', { now: NOW });
        const q = lastQuery();
        expect(whereOf(q, 'status')).toMatchObject({ op: 'in', value: ['pending', 'applying'] });
        expect(q.constraints).toContainEqual({ type: 'orderBy', field: 'createdAt', direction: 'asc' });
        expect(page.items.map((item) => [item.id, item.badges.map((badge) => badge.text)])).toEqual([
            ['p-old', []],
            ['p-stuck', ['Atascada']],
        ]);
    });

    it('marca hasMore y devuelve el cursor cuando llegan más de las pedidas', async () => {
        const docs = Array.from({ length: 4 }, (_, index) => mockDoc(`d${index}`, { status: 'requested', createdAt: ts(NOW - index) }));
        firestoreMock.getDocs.mockResolvedValueOnce(mockSnap(docs));
        const page = await fetchPending('sponsoredPlacements', { pageSize: 3, now: NOW });
        expect(page.items).toHaveLength(3);
        expect(page.hasMore).toBe(true);
        expect(page.cursor).toBe(docs[2]);
        expect(whereOf(lastQuery(), 'status')).toMatchObject({ op: '==', value: 'requested' });
    });

    it('pide resueltos con status in, orden descendente y startAfter del cursor', async () => {
        const cursor = mockDoc('prev', {});
        firestoreMock.getDocs.mockResolvedValueOnce(mockSnap([mockDoc('x', { status: 'rejected' })]));
        await fetchResolved('itemProposals', { cursor: cursor as never, now: NOW });
        const q = lastQuery();
        expect(whereOf(q, 'status')).toMatchObject({ op: 'in', value: ['approved', 'rejected'] });
        expect(q.constraints).toContainEqual({ type: 'orderBy', field: 'createdAt', direction: 'desc' });
        expect(q.constraints).toContainEqual({ type: 'startAfter', cursor });
        expect(q.constraints).toContainEqual({ type: 'limit', value: 26 });
    });

    it('filtra resueltos por un solo estado', async () => {
        firestoreMock.getDocs.mockResolvedValueOnce(mockSnap([]));
        await fetchResolved('businessClaims', { statuses: ['approved'] });
        expect(whereOf(lastQuery(), 'status')).toMatchObject({ op: '==', value: 'approved' });
    });

    it('no consulta nada si la cola no tiene ese estado', async () => {
        const page = await fetchActive('businessClaims');
        expect(page.items).toEqual([]);
        expect(firestoreMock.getDocs).not.toHaveBeenCalled();
    });

    it('si falta el índice repite sin orderBy (limit 200), ordena en cliente y marca degraded', async () => {
        firestoreMock.getDocs
            .mockRejectedValueOnce(firestoreError('failed-precondition'))
            .mockResolvedValueOnce(mockSnap([
                mockDoc('nuevo', { status: 'pending', createdAt: ts(NOW - HOUR_MS) }),
                mockDoc('viejo', { status: 'pending', createdAt: ts(NOW - 5 * DAY_MS) }),
                mockDoc('medio', { status: 'pending', createdAt: ts(NOW - DAY_MS) }),
            ]));
        const page = await fetchPending('reports', { now: NOW });
        const fallback = lastQuery();
        expect(firestoreMock.getDocs).toHaveBeenCalledTimes(2);
        expect(hasConstraint(fallback, 'orderBy')).toBe(false);
        expect(fallback.constraints).toContainEqual({ type: 'limit', value: 200 });
        expect(page.items.map((item) => item.id)).toEqual(['viejo', 'medio', 'nuevo']);
        expect(page).toMatchObject({ degraded: true, hasMore: false, cursor: null });
    });

    it('en el fallback de resueltos ordena del más reciente al más antiguo', async () => {
        firestoreMock.getDocs
            .mockRejectedValueOnce(firestoreError('failed-precondition'))
            .mockResolvedValueOnce(mockSnap([
                mockDoc('viejo', { status: 'ended', createdAt: ts(NOW - 5 * DAY_MS) }),
                mockDoc('nuevo', { status: 'rejected', createdAt: ts(NOW - HOUR_MS) }),
            ]));
        const page = await fetchResolved('sponsoredItemSpotlights', { now: NOW });
        expect(page.items.map((item) => item.id)).toEqual(['nuevo', 'viejo']);
        expect(page.degraded).toBe(true);
    });

    it('no repite la consulta con cursor si falta el índice', async () => {
        firestoreMock.getDocs.mockRejectedValueOnce(firestoreError('failed-precondition'));
        const page = await fetchQueue('reports', { statuses: ['resolved'], cursor: mockDoc('c', {}) as never });
        expect(page).toEqual({ items: [], cursor: null, hasMore: false, degraded: true });
        expect(firestoreMock.getDocs).toHaveBeenCalledTimes(1);
    });

    it('propaga los demás errores', async () => {
        firestoreMock.getDocs.mockRejectedValueOnce(firestoreError('permission-denied'));
        await expect(fetchPending('reports')).rejects.toMatchObject({ code: 'permission-denied' });
        expect(isMissingIndexError(firestoreError('failed-precondition'))).toBe(true);
        expect(isMissingIndexError(new Error('x'))).toBe(false);
    });
});

describe('countByStatus / countEachStatus', () => {
    it('cuenta con == o in según los estados', async () => {
        firestoreMock.getCountFromServer.mockResolvedValueOnce(countSnap(7)).mockResolvedValueOnce(countSnap(3));
        await expect(countByStatus('reports', 'pending')).resolves.toBe(7);
        expect(whereOf(firestoreMock.getCountFromServer.mock.calls[0][0] as MockQuery, 'status')).toMatchObject({ op: '==', value: 'pending' });
        await expect(countByStatus('sponsoredPlacements', ['requested', 'active'])).resolves.toBe(3);
        expect(whereOf(firestoreMock.getCountFromServer.mock.calls[1][0] as MockQuery, 'status')).toMatchObject({ op: 'in' });
        await expect(countByStatus('reports', [])).resolves.toBe(0);
    });

    it('devuelve null en el estado cuyo count falla', async () => {
        firestoreMock.getCountFromServer.mockImplementation(async (q: MockQuery) => {
            if (whereOf(q, 'status')?.value === 'rejected') throw firestoreError('unavailable');
            return countSnap(whereOf(q, 'status')?.value === 'pending' ? 2 : 9);
        });
        await expect(countEachStatus('businessClaims')).resolves.toEqual({ pending: 2, approved: 9, rejected: null });
    });
});

describe('lookupExact', () => {
    it('solo busca en servidor si el término parece un id', async () => {
        expect(looksLikeId('bar pepe')).toBe(false);
        expect(looksLikeId('abc')).toBe(false);
        expect(looksLikeId('ChIJN1t_tDeuEmsRUsoyG83frY4')).toBe(true);
        await expect(lookupExact('bar pepe')).resolves.toEqual([]);
        expect(firestoreMock.getDoc).not.toHaveBeenCalled();
    });

    it('combina el documento con ese id y los que tienen ese placeId o autor, sin duplicados', async () => {
        const term = 'ChIJN1t_tDeuEmsRUsoyG83frY4';
        firestoreMock.getDoc.mockImplementation(async (ref: { path: string }) => (ref.path === `businessClaims/${term}`
            ? mockDoc(term, { status: 'approved', placeName: 'Bar Pepe', createdAt: ts(NOW - DAY_MS) })
            : missingDoc(term)));
        firestoreMock.getDocs.mockImplementation(async (q: MockQuery) => {
            if (q.path === 'businessClaims' && whereOf(q, 'placeId')) {
                return mockSnap([
                    mockDoc('otra', { status: 'pending', placeId: term, createdAt: ts(NOW - HOUR_MS) }),
                    mockDoc(term, { status: 'approved', placeName: 'Bar Pepe', createdAt: ts(NOW - DAY_MS) }),
                ]);
            }
            if (q.path === 'itemProposals' && whereOf(q, 'createdBy')) throw firestoreError('permission-denied');
            return mockSnap([]);
        });
        const items = await lookupExact(term, ['businessClaims', 'itemProposals'], NOW);
        expect(items.map((item) => item.key)).toEqual(['businessClaims:otra', `businessClaims:${term}`]);
        const fields = firestoreMock.getDocs.mock.calls.map(([q]) => (q as MockQuery).constraints[0]);
        expect(fields).toContainEqual({ type: 'where', field: 'userId', op: '==', value: term });
        expect(fields).toContainEqual({ type: 'where', field: 'createdBy', op: '==', value: term });
    });
});
