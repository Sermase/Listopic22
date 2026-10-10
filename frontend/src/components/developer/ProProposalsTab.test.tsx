import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    countSnap,
    firestoreMock,
    missingDoc,
    mockDoc,
    mockSnap,
    resetFirestoreMock,
    ts,
    whereOf,
    type MockConstraint,
    type MockDocSnap,
    type MockQuery,
} from '../../test/firestoreMock';

const { callableMock, confirmMock } = vi.hoisted(() => ({
    callableMock: vi.fn(),
    confirmMock: vi.fn(),
}));

vi.mock('../../firebase', () => ({ db: {}, functions: {}, auth: {} }));
vi.mock('firebase/firestore', async () => ({
    ...(await import('../../test/firestoreMock')).firestoreMock,
    addDoc: vi.fn(async () => ({ id: 'duel-new' })),
    setDoc: vi.fn(async () => undefined),
    serverTimestamp: vi.fn(() => 'server-ts'),
}));
vi.mock('firebase/functions', () => ({
    httpsCallable: vi.fn((_functions: unknown, name: string) => (data: unknown) => callableMock(name, data)),
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'u-admin' } }) }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => confirmMock }));

import { ToastProvider } from '../../context/ToastContext';
import { ProProposalsTab } from './ProProposalsTab';
import type { DeveloperTabProps } from './developerTabs';

const NOW = Date.now();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type Store = Record<string, Record<string, Record<string, unknown>>>;
let store: Store;
let docs: Record<string, Record<string, unknown>>;
let failing: Set<string>;

const createdMs = (snap: MockDocSnap) => (snap.data()?.createdAt as { toMillis: () => number } | undefined)?.toMillis() ?? 0;

/** getDocs de mentira que respeta where status (== / in), orderBy createdAt, startAfter y limit. */
const runQuery = (q: MockQuery) => {
    if (failing.has(q.path)) throw Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
    let rows = Object.entries(store[q.path] ?? {}).map(([id, data]) => mockDoc(id, data));
    q.constraints.forEach((constraint: MockConstraint) => {
        if (constraint.type !== 'where') return;
        rows = rows.filter((row) => {
            const value = row.data()?.[constraint.field];
            return constraint.op === 'in' ? (constraint.value as unknown[]).includes(value) : value === constraint.value;
        });
    });
    const order = q.constraints.find((constraint) => constraint.type === 'orderBy');
    if (order && order.type === 'orderBy') {
        const sign = order.direction === 'desc' ? -1 : 1;
        rows.sort((a, b) => sign * (createdMs(a) - createdMs(b)));
    }
    const after = q.constraints.find((constraint) => constraint.type === 'startAfter');
    if (after && after.type === 'startAfter') {
        const index = rows.findIndex((row) => row.id === (after.cursor as MockDocSnap).id);
        rows = rows.slice(index + 1);
    }
    const lim = q.constraints.find((constraint) => constraint.type === 'limit');
    if (lim && lim.type === 'limit') rows = rows.slice(0, lim.value);
    return mockSnap(rows);
};

const update = (collection: string, id: string, patch: Record<string, unknown>) => {
    store[collection][id] = { ...store[collection][id], ...patch };
};

const renderTab = (props: Partial<DeveloperTabProps> = {}) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const onNavigate = vi.fn();
    const ui = (next: Partial<DeveloperTabProps>) => (
        <QueryClientProvider client={client}>
            <ToastProvider>
                <ProProposalsTab onNavigate={onNavigate} {...next} />
            </ToastProvider>
        </QueryClientProvider>
    );
    const result = render(ui(props));
    return { ...result, invalidate, onNavigate, rerenderWith: (next: Partial<DeveloperTabProps>) => result.rerender(ui(next)) };
};

const rowOf = (queue: string, id: string) => screen.getByTestId(`pro-row-${queue}-${id}`);
const findRow = (queue: string, id: string) => screen.findByTestId(`pro-row-${queue}-${id}`);
/** Filas de la sub-pestaña visible (las otras siguen montadas pero ocultas). */
const visibleRowIds = () => screen.queryAllByTestId(/^pro-row-/)
    .filter((element) => !element.closest('[hidden]'))
    .map((element) => element.getAttribute('data-testid')!.replace(/^pro-row-[A-Za-z]+-/, ''));

beforeEach(() => {
    resetFirestoreMock();
    confirmMock.mockReset().mockResolvedValue(true);
    failing = new Set();
    store = {
        itemProposals: {
            'prop-old': {
                placeId: 'p1', placeName: 'Bar Pepe', type: 'merge', status: 'pending', createdBy: 'u-juan',
                note: 'Son el mismo plato',
                payload: { sourceItemId: 'bravas', sourceItemName: 'Bravas', targetItemId: 'patatas-bravas', targetItemName: 'Patatas bravas' },
                createdAt: ts(NOW - 5 * DAY),
            },
            'prop-new': {
                placeId: 'p2', placeName: 'Café Sol', type: 'rename', status: 'pending', createdBy: 'u-eva',
                payload: { itemId: 'tostada', currentName: 'Tostada', newName: 'Tostada con tomate' },
                createdAt: ts(NOW - HOUR),
            },
            'prop-approved': {
                placeId: 'p1', placeName: 'Bar Pepe', type: 'merge', status: 'approved', createdBy: 'u-juan',
                payload: { sourceItemId: 'caña', sourceItemName: 'Caña', targetItemId: 'cerveza', targetItemName: 'Cerveza' },
                reviewedBy: 'u-ana', reviewedAt: ts(NOW - DAY), applyResult: { reassignedReviews: 3 },
                createdAt: ts(NOW - 2 * DAY),
            },
        },
        sponsoredPlacements: {
            'plc-req': {
                placeId: 'p2', placeName: 'Café Sol', type: 'home', status: 'requested', headline: 'Desayunos 3€',
                startsAt: '2030-01-10', endsAt: '2030-01-17', createdBy: 'u-eva', createdAt: ts(NOW - 6 * HOUR),
            },
            'plc-overdue': {
                placeId: 'p1', placeName: 'Bar Pepe', type: 'search', status: 'active', headline: 'Menú del día',
                startsAt: '2020-01-01', endsAt: '2020-01-08', metrics: { impressions: 200, clicks: 9 },
                reviewedBy: 'u-ana', reviewedAt: ts(NOW - 10 * DAY), createdAt: ts(NOW - 20 * DAY),
            },
            'plc-nofin': {
                placeId: 'p3', placeName: 'La Tasca', type: 'home', status: 'active', createdAt: ts(NOW - 30 * DAY),
            },
            'plc-auto': {
                placeId: 'p1', placeName: 'Bar Pepe', type: 'home', status: 'ended', headline: 'Verano',
                endedAt: ts(NOW - HOUR), reviewedBy: 'u-ana', reviewedAt: ts(NOW - 20 * DAY), createdAt: ts(NOW - DAY),
            },
        },
        sponsoredItemSpotlights: {
            'spot-req': {
                placeId: 'p1', placeName: 'Bar Pepe', itemId: 'bravas', itemName: 'Bravas', status: 'requested',
                radiusKm: 3, days: 7, units: 2, impulses: 140, creditsUsed: 120, billedImpulses: 20, totalPriceEur: 1,
                createdBy: 'u-juan', createdAt: ts(NOW - DAY),
            },
            'spot-active': {
                placeId: 'p2', placeName: 'Café Sol', itemId: 'tarta', itemName: 'Tarta de queso', status: 'active',
                radiusKm: 1, days: 5, units: 1, impulses: 25, startsAt: '2030-01-01', endsAt: '2030-01-06',
                metrics: { impressions: 40, clicks: 2 }, createdAt: ts(NOW - 2 * DAY),
            },
            'spot-rejected': {
                placeId: 'p1', placeName: 'Bar Pepe', itemId: 'croquetas', itemName: 'Croquetas', status: 'rejected',
                radiusKm: 2, days: 3, units: 1, impulses: 120, creditsUsed: 120, creditsRefunded: true,
                adminNotes: 'Foto borrosa', reviewedBy: 'u-ana', reviewedAt: ts(NOW - 2 * DAY), createdAt: ts(NOW - 3 * DAY),
            },
        },
    };
    docs = {
        'users/u-ana': { displayName: 'Ana' },
        'users/u-admin': { displayName: 'Jefa' },
        'config/sponsoredPricing': { pricePerImpulseEur: 0.05, packs: [{ impulses: 100, priceEur: 5 }], updatedBy: 'u-ana', updatedAt: ts(NOW - DAY) },
    };
    firestoreMock.getDocs.mockImplementation(async (q: MockQuery) => runQuery(q));
    firestoreMock.getDoc.mockImplementation(async (ref: { path: string; id: string }) => {
        if (failing.has(ref.path)) throw new Error('unavailable');
        const [collection, id] = ref.path.split('/');
        const data = store[collection]?.[id] ?? docs[ref.path];
        return data ? mockDoc(ref.id, data) : missingDoc(ref.id);
    });
    firestoreMock.getCountFromServer.mockImplementation(async (q: MockQuery) => {
        const status = whereOf(q, 'status')?.value;
        return countSnap(Object.values(store[q.path] ?? {}).filter((data) => data.status === status).length);
    });
    // El servidor de mentira escribe lo mismo que los callables reales.
    callableMock.mockReset().mockImplementation(async (name: string, data: Record<string, unknown>) => {
        const reviewed = { adminNotes: data.adminNotes ?? null, reviewedBy: 'u-admin', reviewedAt: ts(NOW) };
        if (name === 'reviewItemProposal') {
            update('itemProposals', data.proposalId as string, {
                ...reviewed,
                status: data.decision === 'approve' ? 'approved' : 'rejected',
                applyResult: data.decision === 'approve' ? { reassignedReviews: 4 } : null,
            });
        }
        if (name === 'reviewSponsoredPlacement') {
            const next = { activate: 'active', reject: 'rejected', end: 'ended' }[data.decision as string];
            update('sponsoredPlacements', data.placementId as string, { ...reviewed, status: next });
        }
        if (name === 'reviewItemSpotlight') {
            const next = { activate: 'active', reject: 'rejected', end: 'ended' }[data.decision as string];
            update('sponsoredItemSpotlights', data.spotlightId as string, {
                ...reviewed,
                status: next,
                ...(data.decision === 'activate' ? { startsAt: '2031-02-01', endsAt: '2031-02-08' } : {}),
            });
        }
        if (name === 'adminUpdateSpotlightPricing') return { data: { pricing: data } };
        return { data: { ok: true } };
    });
});

afterEach(() => {
    cleanup();
});

describe('ProProposalsTab · Bandeja', () => {
    it('pide solo lo pendiente, del más antiguo al más reciente, con el contador en la sub-pestaña', async () => {
        renderTab();
        await findRow('itemProposals', 'prop-new');
        expect(visibleRowIds()).toEqual(['prop-old', 'spot-req', 'plc-req', 'prop-new']);

        const queries = firestoreMock.getDocs.mock.calls.map(([q]) => q as MockQuery);
        const proposals = queries.find((q) => q.path === 'itemProposals')!;
        expect(whereOf(proposals, 'status')).toMatchObject({ op: 'in', value: ['pending', 'applying'] });
        expect(proposals.constraints).toContainEqual({ type: 'orderBy', field: 'createdAt', direction: 'asc' });
        expect(whereOf(queries.find((q) => q.path === 'sponsoredItemSpotlights')!, 'status')).toMatchObject({ op: '==', value: 'requested' });

        await waitFor(() => expect(screen.getByRole('tab', { name: /Bandeja/ })).toHaveTextContent('4'));
        expect(screen.getByRole('tab', { name: /En curso/ })).toHaveTextContent('3');
        // Los precios no se leen hasta abrir su sub-pestaña.
        expect(firestoreMock.getDoc.mock.calls.some(([ref]) => (ref as { path: string }).path === 'config/sponsoredPricing')).toBe(false);
    });

    it('enseña qué parte del plato es de regalo y cuál se factura, y el contexto de cada propuesta', async () => {
        renderTab();
        const spot = await findRow('sponsoredItemSpotlights', 'spot-req');
        expect(spot).toHaveTextContent('140 impulsos');
        expect(spot).toHaveTextContent('🎁 120 de regalo');
        expect(spot).toHaveTextContent('💳 20 a facturar (1 €)');
        expect(spot).toHaveTextContent('El periodo empieza a contar al activarlo');

        const merge = rowOf('itemProposals', 'prop-old');
        expect(merge).toHaveTextContent('Fusionar "Bravas" con "Patatas bravas"');
        expect(merge).toHaveTextContent('Nota del negocio: “Son el mismo plato”');
        expect(within(merge).getByRole('link', { name: /Lugar/ })).toHaveAttribute('href', '/place/p1');
    });

    it('cada fila tiene su nota: el motivo escrito para un negocio no le llega a otro', async () => {
        const { invalidate } = renderTab();
        const oldRow = await findRow('itemProposals', 'prop-old');
        const newRow = rowOf('itemProposals', 'prop-new');
        fireEvent.change(within(oldRow).getByLabelText('Nota para el negocio'), { target: { value: 'No son el mismo plato' } });

        fireEvent.click(within(newRow).getByRole('button', { name: /Rechazar/ }));
        await waitFor(() => expect(callableMock).toHaveBeenCalledWith('reviewItemProposal', {
            proposalId: 'prop-new',
            decision: 'reject',
            adminNotes: undefined,
        }));
        expect(confirmMock).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining('Sin nota para el negocio.') }));
        expect(await within(newRow).findByText(/Rechazada\. Hemos avisado al negocio/)).toBeInTheDocument();
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['developer'] });

        // La nota de la otra fila sigue ahí y es la que se envía con su decisión.
        expect(within(oldRow).getByLabelText('Nota para el negocio')).toHaveValue('No son el mismo plato');
        fireEvent.click(within(oldRow).getByRole('button', { name: /Rechazar/ }));
        await waitFor(() => expect(callableMock).toHaveBeenCalledWith('reviewItemProposal', {
            proposalId: 'prop-old',
            decision: 'reject',
            adminNotes: 'No son el mismo plato',
        }));
        expect(confirmMock).toHaveBeenLastCalledWith(expect.objectContaining({
            message: expect.stringContaining('“No son el mismo plato”'),
            destructive: true,
        }));
        // Ya resuelta: sin nota editable y con quién decidió.
        await waitFor(() => expect(within(oldRow).queryByLabelText('Nota para el negocio')).toBeNull());
        expect(oldRow).toHaveTextContent('❌ Rechazada');
    });

    it('al activar un plato enseña las fechas que ha fijado el servidor', async () => {
        renderTab();
        const spot = await findRow('sponsoredItemSpotlights', 'spot-req');
        fireEvent.click(within(spot).getByRole('button', { name: /Activar/ }));
        await waitFor(() => expect(callableMock).toHaveBeenCalledWith('reviewItemSpotlight', {
            spotlightId: 'spot-req',
            decision: 'activate',
            adminNotes: undefined,
        }));
        expect(confirmMock).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining('Sus 7 días empiezan a contar hoy') }));
        expect(await within(spot).findByText(/Activado\. Ya está en «En curso»/)).toBeInTheDocument();
        await waitFor(() => expect(spot).toHaveTextContent('Activo del 01/02/2031 al 08/02/2031'));
        expect(spot).toHaveTextContent('Activado por Jefa');
        expect(within(spot).queryByRole('button', { name: /Finalizar/ })).toBeNull();
    });

    it('si cancelas la confirmación no se envía nada', async () => {
        confirmMock.mockResolvedValue(false);
        renderTab();
        const placement = await findRow('sponsoredPlacements', 'plc-req');
        fireEvent.click(within(placement).getByRole('button', { name: /Activar/ }));
        await waitFor(() => expect(confirmMock).toHaveBeenCalled());
        expect(callableMock).not.toHaveBeenCalled();
    });

    it('un error al cargar una cola se ve en la sección y no se confunde con «no hay nada»', async () => {
        failing.add('sponsoredItemSpotlights');
        renderTab();
        expect(await screen.findByText('⚠️ No se pudieron cargar los platos destacados.')).toBeInTheDocument();
        expect(visibleRowIds()).toEqual(['prop-old', 'plc-req', 'prop-new']);

        failing.delete('sponsoredItemSpotlights');
        fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
        await findRow('sponsoredItemSpotlights', 'spot-req');
        expect(screen.queryByText('⚠️ No se pudieron cargar los platos destacados.')).toBeNull();
    });

    it('el error del servidor queda en la propia fila', async () => {
        callableMock.mockRejectedValueOnce(Object.assign(new Error('La campaña ya no está en un estado compatible con esa acción.'), { code: 'functions/failed-precondition' }));
        renderTab();
        const placement = await findRow('sponsoredPlacements', 'plc-req');
        fireEvent.click(within(placement).getByRole('button', { name: /Rechazar/ }));
        expect(await within(placement).findByRole('alert')).toHaveTextContent('La campaña ya no está en un estado compatible');
    });

    it('si el navegador deja de esperar, lo dice en castellano y relee la fila', async () => {
        callableMock.mockRejectedValueOnce(Object.assign(new Error('deadline-exceeded'), { code: 'functions/deadline-exceeded' }));
        renderTab();
        const row = await findRow('itemProposals', 'prop-old');
        update('itemProposals', 'prop-old', { status: 'applying', reviewedBy: 'u-admin', applyingAt: ts(NOW) });
        fireEvent.click(within(row).getByRole('button', { name: /Aprobar/ }));
        const alert = await within(row).findByRole('alert');
        expect(alert).toHaveTextContent('El servidor está tardando más de lo normal');
        expect(alert).not.toHaveTextContent('deadline-exceeded');
        // Se relee: el servidor sigue aplicándola.
        await waitFor(() => expect(rowOf('itemProposals', 'prop-old')).toHaveTextContent('Aplicándose ahora'));
    });

    it('filtra por tipo y busca en lo cargado', async () => {
        renderTab();
        await findRow('itemProposals', 'prop-old');
        fireEvent.click(screen.getByRole('button', { name: /Platos/ }));
        expect(visibleRowIds()).toEqual(['spot-req']);
        fireEvent.click(screen.getByRole('button', { name: /Todo/ }));
        fireEvent.change(screen.getByPlaceholderText(/Lugar, plato/), { target: { value: 'cafe sol' } });
        expect(visibleRowIds()).toEqual(['plc-req', 'prop-new']);
    });
});

describe('ProProposalsTab · En curso', () => {
    it('ordena por fecha de fin, avisa de vencidas y sin fin, y finaliza con la nota de la fila', async () => {
        renderTab({ view: 'active' });
        await findRow('sponsoredPlacements', 'plc-overdue');
        expect(visibleRowIds()).toEqual(['plc-overdue', 'spot-active', 'plc-nofin']);

        const overdue = rowOf('sponsoredPlacements', 'plc-overdue');
        expect(overdue).toHaveTextContent('Vencida sin cerrar');
        expect(overdue).toHaveTextContent('200 impresiones únicas');
        expect(overdue).toHaveTextContent('CTR 4,5 %');
        expect(rowOf('sponsoredPlacements', 'plc-nofin')).toHaveTextContent('Sin fecha de fin');
        expect(screen.getByText(/Hay 1 vencida sin cerrar/)).toBeInTheDocument();
        await waitFor(() => expect(overdue).toHaveTextContent('Activada por Ana'));

        fireEvent.change(within(overdue).getByLabelText('Nota para el negocio'), { target: { value: 'Campaña vencida' } });
        fireEvent.click(within(overdue).getByRole('button', { name: /Finalizar/ }));
        await waitFor(() => expect(callableMock).toHaveBeenCalledWith('reviewSponsoredPlacement', {
            placementId: 'plc-overdue',
            decision: 'end',
            adminNotes: 'Campaña vencida',
        }));
        expect(await within(overdue).findByText(/Finalizada\. Queda archivada en «Historial»/)).toBeInTheDocument();
    });
});

describe('ProProposalsTab · Historial', () => {
    it('mezcla lo resuelto por fecha con quién lo cerró, lo aplicado y los impulsos devueltos', async () => {
        const { onNavigate } = renderTab({ view: 'history' });
        await findRow('sponsoredItemSpotlights', 'spot-rejected');
        expect(visibleRowIds()).toEqual(['plc-auto', 'prop-approved', 'spot-rejected']);

        const queries = firestoreMock.getDocs.mock.calls.map(([q]) => q as MockQuery);
        const placements = queries.find((q) => q.path === 'sponsoredPlacements')!;
        expect(whereOf(placements, 'status')).toMatchObject({ op: 'in', value: ['rejected', 'ended'] });
        expect(placements.constraints).toContainEqual({ type: 'orderBy', field: 'createdAt', direction: 'desc' });

        const approved = rowOf('itemProposals', 'prop-approved');
        await waitFor(() => expect(approved).toHaveTextContent('Aprobada por Ana'));
        expect(approved).toHaveTextContent('🔀 3 reseñas movidas');
        expect(within(approved).queryByRole('textbox')).toBeNull();
        expect(rowOf('sponsoredPlacements', 'plc-auto')).toHaveTextContent('🤖 Automático');
        const rejected = rowOf('sponsoredItemSpotlights', 'spot-rejected');
        expect(rejected).toHaveTextContent('120 impulsos devueltos');
        expect(rejected).not.toHaveTextContent('El periodo empieza');
        expect(rejected).toHaveTextContent('“Foto borrosa”');

        fireEvent.click(screen.getByRole('button', { name: /Rechazadas/ }));
        expect(onNavigate).toHaveBeenCalledWith({ status: 'rejected', focus: null });
    });

    it('con ?status= pide solo ese estado y enseña la fila enfocada aunque no encaje', async () => {
        renderTab({ view: 'history', status: 'rejected', focusId: 'prop-approved' });
        await findRow('sponsoredItemSpotlights', 'spot-rejected');
        await waitFor(() => expect(visibleRowIds()).toEqual(['prop-approved', 'spot-rejected']));
        const queries = firestoreMock.getDocs.mock.calls.map(([q]) => q as MockQuery);
        expect(queries.filter((q) => q.path === 'sponsoredPlacements').every((q) => whereOf(q, 'status')?.value === 'rejected')).toBe(true);
        // La enfocada sale desplegada, con sus ids.
        expect(rowOf('itemProposals', 'prop-approved')).toHaveTextContent('propuesta prop-approved');
    });

    it('pagina de 25 en 25', async () => {
        store.itemProposals = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`old-${index}`, {
            placeId: 'p1', placeName: 'Bar Pepe', type: 'rename', status: 'approved', payload: {}, createdAt: ts(NOW - (index + 1) * HOUR),
        }]));
        renderTab({ view: 'history' });
        await findRow('itemProposals', 'old-0');
        await waitFor(() => expect(visibleRowIds()).toHaveLength(25));
        fireEvent.click(screen.getByRole('button', { name: /Cargar 25 más/ }));
        await findRow('itemProposals', 'old-29');
        // 30 propuestas + la campaña y el plato resueltos del resto de colas.
        expect(visibleRowIds()).toHaveLength(32);
        expect(screen.getByText(/No hay más/)).toBeInTheDocument();
    });
});

describe('ProProposalsTab · plato que ya no está en la carta', () => {
    // Un solo aviso (el de adminQueues), en la fila y en «📥 Pendientes».
    const CHIP = '🚫Plato retirado · no se muestra';

    it('lo avisa en la Bandeja, En curso y el Historial', async () => {
        update('sponsoredItemSpotlights', 'spot-req', { itemInactive: true });
        update('sponsoredItemSpotlights', 'spot-active', { itemInactive: true });
        update('sponsoredItemSpotlights', 'spot-rejected', { itemInactive: true });

        const { rerenderWith } = renderTab({ view: 'inbox' });
        expect(await findRow('sponsoredItemSpotlights', 'spot-req')).toHaveTextContent(CHIP);
        expect(rowOf('itemProposals', 'prop-old')).not.toHaveTextContent('Plato retirado');

        rerenderWith({ view: 'active' });
        expect(await findRow('sponsoredItemSpotlights', 'spot-active')).toHaveTextContent(CHIP);
        expect(rowOf('sponsoredPlacements', 'plc-overdue')).not.toHaveTextContent('Plato retirado');

        rerenderWith({ view: 'history' });
        expect(await findRow('sponsoredItemSpotlights', 'spot-rejected')).toHaveTextContent(CHIP);
    });

    it('sin la marca no sale el aviso', async () => {
        renderTab();
        expect(await findRow('sponsoredItemSpotlights', 'spot-req')).not.toHaveTextContent('Plato retirado');
    });

    it('al activar avisa de que el plato ya no está en la carta', async () => {
        update('sponsoredItemSpotlights', 'spot-req', { itemInactive: true });
        renderTab();
        const spot = await findRow('sponsoredItemSpotlights', 'spot-req');
        fireEvent.click(within(spot).getByRole('button', { name: /Activar/ }));
        await waitFor(() => expect(confirmMock).toHaveBeenLastCalledWith(expect.objectContaining({
            message: expect.stringContaining('El plato ya no está en la carta: si sigue así, no se podrá activar.'),
        })));
    });
});

describe('ProProposalsTab · propuesta que se está aplicando', () => {
    const MIN = 60 * 1000;

    it('enseña quién la aplica; si se atascó, solo «🔁 Reintentar» y cuenta en la Bandeja', async () => {
        store.itemProposals['prop-stuck'] = {
            placeId: 'p1', placeName: 'Bar Pepe', type: 'merge', status: 'applying', createdBy: 'u-juan', reviewedBy: 'u-ana',
            payload: { sourceItemId: 'tapa', sourceItemName: 'Tapa', targetItemId: 'tapas', targetItemName: 'Tapas' },
            applyingAt: ts(NOW - 30 * MIN), createdAt: ts(NOW - 3 * DAY),
        };
        store.itemProposals['prop-running'] = {
            placeId: 'p2', placeName: 'Café Sol', type: 'rename', status: 'applying', createdBy: 'u-eva', reviewedBy: 'u-admin',
            payload: { itemId: 'cafe', currentName: 'Café', newName: 'Café solo' },
            applyingAt: ts(NOW - 2 * MIN), createdAt: ts(NOW - 2 * DAY),
        };
        renderTab();

        const stuck = await findRow('itemProposals', 'prop-stuck');
        expect(stuck).toHaveTextContent('⚙️Aplicándose');
        expect(stuck).toHaveTextContent('⏳Atascada');
        expect(stuck).not.toHaveTextContent('applying');
        await waitFor(() => expect(stuck).toHaveTextContent('Aplicándose por Ana'));
        expect(within(stuck).queryByRole('button', { name: /Rechazar/ })).toBeNull();

        const running = rowOf('itemProposals', 'prop-running');
        expect(running).toHaveTextContent('Aplicándose ahora');
        expect(within(running).queryByRole('button', { name: /Reintentar|Aprobar|Rechazar/ })).toBeNull();
        expect(within(running).queryByLabelText('Nota para el negocio')).toBeNull();

        // La Bandeja cuenta lo mismo que lista: 4 de siempre + las 2 que se aplican.
        await waitFor(() => expect(screen.getByRole('tab', { name: /Bandeja/ })).toHaveTextContent('6'));

        fireEvent.click(within(stuck).getByRole('button', { name: '🔁 Reintentar' }));
        await waitFor(() => expect(callableMock).toHaveBeenCalledWith('reviewItemProposal', {
            proposalId: 'prop-stuck',
            decision: 'approve',
            adminNotes: undefined,
        }));
        expect(confirmMock).toHaveBeenLastCalledWith(expect.objectContaining({ title: '🔁 ¿Reintentar la propuesta?', confirmLabel: 'Reintentar' }));
        expect(await within(stuck).findByText(/Aprobada y aplicada/)).toBeInTheDocument();
    });

    it('si falló al aplicarse, «🔁 Reintentar» va primero y rechazar avisa de que puede estar ya hecha', async () => {
        update('itemProposals', 'prop-old', { applyError: { message: 'Firestore no responde', by: 'u-ana', at: ts(NOW - HOUR) } });
        renderTab();

        const row = await findRow('itemProposals', 'prop-old');
        expect(row).toHaveTextContent('No se pudo aplicar: Firestore no responde');
        const buttons = within(row).getAllByRole('button', { name: /Reintentar|Aprobar|Rechazar/ });
        expect(buttons.map((button) => button.textContent)).toEqual(['🔁 Reintentar', '❌ Rechazar']);

        fireEvent.click(within(row).getByRole('button', { name: '❌ Rechazar' }));
        await waitFor(() => expect(callableMock).toHaveBeenCalledWith('reviewItemProposal', {
            proposalId: 'prop-old',
            decision: 'reject',
            adminNotes: undefined,
        }));
        expect(confirmMock).toHaveBeenLastCalledWith(expect.objectContaining({
            title: '❌ ¿Rechazar la propuesta?',
            message: expect.stringContaining('puede que parte del cambio ya esté hecho'),
        }));
    });
});

describe('ProProposalsTab · foco', () => {
    it('abre la sub-pestaña donde está el elemento enfocado', async () => {
        const { onNavigate } = renderTab({ view: 'inbox', focusId: 'spot-active' });
        await waitFor(() => expect(onNavigate).toHaveBeenCalledWith({ view: 'active', status: '', focus: 'spot-active' }));
    });

    it('avisa si el enlace apunta a algo que no existe', async () => {
        renderTab({ focusId: 'no-existe-este-id' });
        expect(await screen.findByText(/No encuentro ninguna propuesta, campaña ni plato/)).toBeInTheDocument();
    });
});

describe('ProProposalsTab · Precios', () => {
    it('se carga al abrirlo, marca los cambios sin guardar y avisa antes de recargar', async () => {
        renderTab({ view: 'pricing' });
        const price = await screen.findByRole('spinbutton', { name: /€ por impulso/ });
        expect(price).toHaveValue(0.05);
        expect(screen.getByRole('button', { name: /Guardar precios/ })).toBeDisabled();
        expect(await screen.findByText(/Última actualización .* por Ana/)).toBeInTheDocument();

        fireEvent.change(price, { target: { value: '0.06' } });
        expect(screen.getByText('● Cambios sin guardar')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /Precios •/ })).toBeInTheDocument();

        confirmMock.mockResolvedValueOnce(false);
        fireEvent.click(screen.getByRole('button', { name: /Recargar/ }));
        await waitFor(() => expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ title: '¿Descartar los cambios sin guardar?' })));
        expect(screen.getByRole('spinbutton', { name: /€ por impulso/ })).toHaveValue(0.06);

        fireEvent.click(screen.getByRole('button', { name: /Guardar precios/ }));
        await waitFor(() => expect(callableMock).toHaveBeenCalledWith('adminUpdateSpotlightPricing', expect.objectContaining({ pricePerImpulseEur: 0.06 })));
        expect(await screen.findByText(/Precios guardados/)).toBeInTheDocument();
        expect(screen.queryByText('● Cambios sin guardar')).toBeNull();
    });

    it('si no se puede leer la configuración no rellena con valores por defecto ni deja guardar', async () => {
        failing.add('config/sponsoredPricing');
        renderTab({ view: 'pricing' });
        expect(await screen.findByText(/No se pudo leer la configuración de precios/)).toBeInTheDocument();
        expect(screen.queryByRole('spinbutton', { name: /€ por impulso/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Guardar precios/ })).toBeNull();
    });
});

describe('ProProposalsTab · sub-pestañas', () => {
    it('al cambiar de sub-pestaña no se pierden las notas escritas', async () => {
        const { rerenderWith } = renderTab({ view: 'inbox' });
        const row = await findRow('itemProposals', 'prop-old');
        fireEvent.change(within(row).getByLabelText('Nota para el negocio'), { target: { value: 'Revisar con el dueño' } });
        rerenderWith({ view: 'history' });
        await findRow('itemProposals', 'prop-approved');
        rerenderWith({ view: 'inbox' });
        expect(within(rowOf('itemProposals', 'prop-old')).getByLabelText('Nota para el negocio')).toHaveValue('Revisar con el dueño');
    });

    it('cambiar de sub-pestaña escribe la vista en la URL y limpia estado y foco', async () => {
        const { onNavigate } = renderTab();
        fireEvent.click(screen.getByRole('tab', { name: /Historial/ }));
        expect(onNavigate).toHaveBeenCalledWith({ view: 'history', status: '', focus: null });
    });

    it('«🛠️ Herramientas» tiene «🧹 Reparar cartas» y simula con el callable', async () => {
        renderTab({ view: 'tools' });
        expect(screen.getByRole('tab', { name: /Herramientas/ })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('heading', { name: '🧹 Reparar cartas' })).toBeInTheDocument();
        // Nada se lanza solo al abrir la sub-pestaña.
        expect(callableMock).not.toHaveBeenCalledWith('adminRepairPlaceItems', expect.anything());

        fireEvent.change(screen.getByLabelText('placeId del sitio a reparar'), { target: { value: 'p1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Simular' }));
        await waitFor(() => expect(callableMock).toHaveBeenCalledWith('adminRepairPlaceItems', { placeId: 'p1', dryRun: true }));
        expect(await screen.findByTestId('repair-result')).toHaveTextContent('Simulación (no se ha cambiado nada) · 0 sitios');
    });

    it('tras «🧹 Aplicar» en Reparar cartas, la Bandeja se recarga al volver a ella', async () => {
        const { rerenderWith, invalidate } = renderTab({ view: 'inbox' });
        expect(await findRow('sponsoredItemSpotlights', 'spot-req')).not.toHaveTextContent('Plato retirado');

        rerenderWith({ view: 'tools' });
        // La reparación marca el plato como retirado.
        update('sponsoredItemSpotlights', 'spot-req', { itemInactive: true });
        fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
        await waitFor(() => expect(callableMock).toHaveBeenCalledWith('adminRepairPlaceItems', { dryRun: false }));
        await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['developer'] }));

        rerenderWith({ view: 'inbox' });
        await waitFor(() => expect(rowOf('sponsoredItemSpotlights', 'spot-req')).toHaveTextContent('Plato retirado'));
    });

    it('al pulsar «🛠️ Herramientas» pide esa vista en la URL', () => {
        const { onNavigate } = renderTab();
        fireEvent.click(screen.getByRole('tab', { name: /Herramientas/ }));
        expect(onNavigate).toHaveBeenCalledWith({ view: 'tools', status: '', focus: null });
    });

    it('el duelo avisa si no puede leer el activo en vez de decir que no hay', async () => {
        firestoreMock.getDocs.mockImplementation(async (q: MockQuery) => {
            if (q.path === 'duels') throw new Error('permission-denied');
            return runQuery(q);
        });
        renderTab({ view: 'duel' });
        expect(await screen.findByText(/permission-denied/)).toBeInTheDocument();
        expect(screen.queryByText('No hay duelo activo.')).toBeNull();
        expect(screen.getByRole('button', { name: /Crear y activar duelo/ })).toBeDisabled();
    });
});
