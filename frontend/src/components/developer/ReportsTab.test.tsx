import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    type MockQuery,
} from '../../test/firestoreMock';
import { DAY_MS, HOUR_MS } from '../../utils/adminTime';

const mocks = vi.hoisted(() => ({
    updateReportStatus: vi.fn(),
    markGroupItemUnavailable: vi.fn(),
    syncPlaceStatusFromGoogle: vi.fn(),
    confirm: vi.fn(),
    invalidate: vi.fn(),
}));

vi.mock('../../firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/firestore', async () => (await import('../../test/firestoreMock')).firestoreMock);
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'jefe1' } }) }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => mocks.confirm }));
vi.mock('../../hooks/useDeveloperInbox', () => ({ useInvalidateDeveloper: () => mocks.invalidate }));
vi.mock('../../hooks/useAdminNames', () => ({
    useAdminName: (uid: string | null | undefined) => (uid ? 'Ana' : null),
    useAdminNames: (uids: string[]) => Object.fromEntries(uids.map((uid) => [uid, 'Ana'])),
}));
vi.mock('../../services/reportModeration', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../services/reportModeration')>();
    return {
        ...actual,
        updateReportStatus: mocks.updateReportStatus,
        markGroupItemUnavailable: mocks.markGroupItemUnavailable,
        syncPlaceStatusFromGoogle: mocks.syncPlaceStatusFromGoogle,
    };
});

import { ReportsTab } from './ReportsTab';

const NOW = Date.now();

const pendingDocs = [
    mockDoc('r-old', {
        status: 'pending',
        targetType: 'review',
        targetId: 'lists/l1/reviews/x',
        targetName: 'Reseña de Bar Pepe',
        issueType: 'spam',
        description: 'Publicidad',
        userId: 'u1',
        userName: 'Pepa',
        createdAt: ts(NOW - 5 * DAY_MS),
    }),
    mockDoc('r-urgent', {
        status: 'pending',
        targetType: 'list',
        targetId: 'l9',
        targetName: 'Lista Bares Centro',
        issueType: 'child_safety',
        userId: 'u2',
        createdAt: ts(NOW - 2 * HOUR_MS),
    }),
];

const resolvedDoc = mockDoc('r-done', {
    status: 'resolved',
    targetType: 'place',
    targetId: 'p1',
    targetName: 'Café Sol',
    issueType: 'place_closed',
    adminNotes: 'Confirmado por teléfono',
    resolvedBy: 'jefe1',
    resolvedAt: ts(NOW - DAY_MS),
    resolvedClosedStatus: 'permanently_closed',
    createdAt: ts(NOW - 3 * DAY_MS),
});

const statusesOf = (q: MockQuery): string[] => {
    const clause = whereOf(q, 'status');
    if (!clause) return [];
    return Array.isArray(clause.value) ? clause.value as string[] : [clause.value as string];
};

const renderTab = (props: Partial<React.ComponentProps<typeof ReportsTab>> = {}) => {
    const onNavigate = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const utils = render(
        <QueryClientProvider client={client}>
            <ReportsTab onNavigate={onNavigate} {...props} />
        </QueryClientProvider>,
    );
    return { ...utils, onNavigate };
};

beforeEach(() => {
    resetFirestoreMock();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.confirm.mockResolvedValue(true);
    mocks.updateReportStatus.mockResolvedValue(undefined);
    firestoreMock.getCountFromServer.mockImplementation(async (q: MockQuery) => {
        const [status] = statusesOf(q);
        return countSnap(status === 'pending' ? 2 : status === 'resolved' ? 7 : 3);
    });
    firestoreMock.getDocs.mockImplementation(async (q: MockQuery) => {
        const statuses = statusesOf(q);
        if (statuses.includes('pending')) return mockSnap(pendingDocs);
        if (statuses.includes('resolved')) return mockSnap([resolvedDoc]);
        return mockSnap([]);
    });
    firestoreMock.getDoc.mockResolvedValue(missingDoc('x'));
});

describe('ReportsTab', () => {
    it('lista los pendientes ordenados por createdAt, con los urgentes arriba y etiquetas legibles', async () => {
        renderTab();
        const rows = await screen.findAllByRole('button', { expanded: false });
        expect(rows[0]).toHaveTextContent('Lista Bares Centro');
        expect(rows[0]).toHaveTextContent('🚨 Urgente');
        expect(rows[0]).toHaveTextContent('Seguridad infantil');
        expect(rows[1]).toHaveTextContent('Reseña de Bar Pepe');
        expect(rows[1]).toHaveTextContent('Spam');

        const listQuery = firestoreMock.getDocs.mock.calls[0][0] as MockQuery;
        expect(listQuery.constraints).toContainEqual({ type: 'orderBy', field: 'createdAt', direction: 'asc' });
        expect(statusesOf(listQuery)).toEqual(['pending']);
        // Contadores con getCountFromServer, no leyendo 500 documentos.
        await waitFor(() => expect(firestoreMock.getCountFromServer).toHaveBeenCalledTimes(3));
        expect(screen.getByText('🚨 Hay 1 reporte urgente (seguridad infantil, acoso o suplantación).')).toBeInTheDocument();
    });

    it('resolver pide confirmación con la nota, avisa en la fila e invalida los contadores', async () => {
        renderTab();
        fireEvent.click(await screen.findByRole('button', { name: /Reseña de Bar Pepe/ }));
        fireEvent.change(screen.getByPlaceholderText('Qué has comprobado o qué has hecho…'), { target: { value: 'Borrada' } });
        fireEvent.click(screen.getByRole('button', { name: 'Resolver' }));

        await waitFor(() => expect(mocks.updateReportStatus).toHaveBeenCalledTimes(1));
        expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Nota: “Borrada”') }));
        expect(mocks.updateReportStatus).toHaveBeenCalledWith(expect.objectContaining({
            reportId: 'r-old',
            status: 'resolved',
            notes: 'Borrada',
            actorUid: 'jefe1',
        }));
        expect(await screen.findByText('✅ Resuelto. Se ha avisado a quien lo reportó.')).toBeInTheDocument();
        expect(mocks.invalidate).toHaveBeenCalled();
        // Ya no ofrece decidir otra vez: ahora se puede reabrir.
        expect(screen.getByRole('button', { name: '↩️ Reabrir' })).toBeInTheDocument();
    });

    it('si se cancela la confirmación no escribe nada', async () => {
        mocks.confirm.mockResolvedValue(false);
        renderTab();
        fireEvent.click(await screen.findByRole('button', { name: /Reseña de Bar Pepe/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
        await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
        expect(mocks.updateReportStatus).not.toHaveBeenCalled();
    });

    it('historial: chips de estado con contador, ResolvedMeta y Reabrir', async () => {
        const { onNavigate } = renderTab({ view: 'resolved' });
        const row = await screen.findByRole('button', { name: /Café Sol/ });
        const listQuery = firestoreMock.getDocs.mock.calls[0][0] as MockQuery;
        expect(listQuery.constraints).toContainEqual({ type: 'orderBy', field: 'createdAt', direction: 'desc' });
        expect(statusesOf(listQuery)).toEqual(['resolved', 'rejected']);

        expect(screen.getByText((_, element) => element?.textContent === '✅ Resuelto por Ana')).toBeInTheDocument();
        expect(screen.getByText('“Confirmado por teléfono”', { exact: false })).toBeInTheDocument();
        expect(screen.getByText('🔒 Cerrado permanentemente')).toBeInTheDocument();
        expect(await screen.findByRole('button', { name: /Rechazados/ })).toHaveTextContent('3');

        fireEvent.click(screen.getByRole('button', { name: /Rechazados/ }));
        expect(onNavigate).toHaveBeenCalledWith({ status: 'rejected', focus: null });

        fireEvent.click(row);
        expect(screen.queryByPlaceholderText('Qué has comprobado o qué has hecho…')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '↩️ Reabrir' }));
        await waitFor(() => expect(mocks.updateReportStatus).toHaveBeenCalledWith(expect.objectContaining({ reportId: 'r-done', status: 'pending' })));
        expect(mocks.confirm).not.toHaveBeenCalled();
    });

    it('?focus= despliega el reporte cargado', async () => {
        renderTab({ focusId: 'r-old' });
        const row = await screen.findByRole('button', { name: /Reseña de Bar Pepe/ });
        expect(row).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('Publicidad', { selector: 'div' })).toBeInTheDocument();
    });

    it('?focus= de un reporte no cargado lo lee y cambia a su vista', async () => {
        firestoreMock.getDoc.mockResolvedValue(resolvedDoc);
        const { onNavigate } = renderTab({ focusId: 'r-done' });
        await waitFor(() => expect(onNavigate).toHaveBeenCalledWith({ view: 'resolved', status: '' }));
        expect(firestoreMock.doc).toHaveBeenCalledWith({}, 'reports', 'r-done');
    });

    it('tras decidir el reporte enlazado y Actualizar no salta a otra vista', async () => {
        const { onNavigate } = renderTab({ focusId: 'r-old' });
        await screen.findByRole('button', { name: /Reseña de Bar Pepe/, expanded: true });
        fireEvent.click(screen.getByRole('button', { name: 'Resolver' }));
        await screen.findByText('✅ Resuelto. Se ha avisado a quien lo reportó.');

        firestoreMock.getDocs.mockImplementation(async () => mockSnap([pendingDocs[1]]));
        firestoreMock.getDoc.mockResolvedValue(mockDoc('r-old', { ...pendingDocs[0].data(), status: 'resolved' }));
        fireEvent.click(screen.getByRole('button', { name: /Actualizar/ }));
        await waitFor(() => expect(screen.queryByRole('button', { name: /Reseña de Bar Pepe/ })).not.toBeInTheDocument());
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(onNavigate).not.toHaveBeenCalled();
    });

    it('tras decidir, volver a la pestaña no enseña el reporte como pendiente desde la caché', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const tree = () => (
            <QueryClientProvider client={client}>
                <ReportsTab onNavigate={vi.fn()} />
            </QueryClientProvider>
        );
        const first = render(tree());
        fireEvent.click(await screen.findByRole('button', { name: /Reseña de Bar Pepe/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Resolver' }));
        await screen.findByText('✅ Resuelto. Se ha avisado a quien lo reportó.');
        first.unmount();

        firestoreMock.getDocs.mockImplementation(async () => mockSnap([pendingDocs[1]]));
        render(tree());
        await screen.findByRole('button', { name: /Lista Bares Centro/ });
        await waitFor(() => expect(screen.queryByRole('button', { name: /Reseña de Bar Pepe/ })).not.toBeInTheDocument());
    });

    it('cambiar de vista limpia el estado y el foco', async () => {
        const { onNavigate } = renderTab();
        const tablist = await screen.findByRole('tablist');
        fireEvent.click(within(tablist).getByRole('tab', { name: /Historial/ }));
        expect(onNavigate).toHaveBeenCalledWith({ view: 'resolved', status: '', focus: null });
    });
});
