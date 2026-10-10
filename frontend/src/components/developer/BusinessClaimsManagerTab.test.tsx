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
    type MockDocSnap,
    type MockQuery,
} from '../../test/firestoreMock';

const { callableMock, confirmMock } = vi.hoisted(() => ({
    callableMock: vi.fn(),
    confirmMock: vi.fn(),
}));

vi.mock('../../firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/firestore', async () => (await import('../../test/firestoreMock')).firestoreMock);
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => callableMock) }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'u-admin' } }) }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => confirmMock }));

import { BusinessClaimsManagerTab } from './BusinessClaimsManagerTab';
import type { DeveloperTabProps } from './developerTabs';

const NOW = Date.now();
const HOUR = 60 * 60 * 1000;

const claim = (id: string, data: Record<string, unknown>) => mockDoc(id, {
    userId: 'u-juan',
    userName: 'Juan López',
    userEmail: 'juan@gmail.com',
    placeId: 'p1',
    placeName: 'Bar Pepe',
    role: 'Propietario',
    contactEmail: 'juan@bar.es',
    message: 'Soy el dueño del bar',
    truthDeclarationAccepted: true,
    status: 'pending',
    proofs: [{ name: 'cif.pdf', size: 2048, type: 'application/pdf', storagePath: `docs/${id}`, downloadUrl: `https://files/${id}` }],
    createdAt: ts(NOW - 5 * 24 * HOUR),
    ...data,
});

let pendingDocs: MockDocSnap[];
let resolvedDocs: MockDocSnap[];
let auditDocs: MockDocSnap[];
let docs: Record<string, Record<string, unknown>>;

const renderTab = (props: Partial<DeveloperTabProps> = {}) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const onNavigate = vi.fn();
    const ui = (next: Partial<DeveloperTabProps>) => (
        <QueryClientProvider client={client}>
            <BusinessClaimsManagerTab onNavigate={onNavigate} {...next} />
        </QueryClientProvider>
    );
    const result = render(ui(props));
    return { ...result, invalidate, onNavigate, rerenderWith: (next: Partial<DeveloperTabProps>) => result.rerender(ui(next)) };
};

const cardOf = (id: string) => screen.getByTestId(`business-claim-${id}`);

beforeEach(() => {
    resetFirestoreMock();
    callableMock.mockReset().mockResolvedValue({ data: { ok: true } });
    confirmMock.mockReset().mockResolvedValue(true);
    pendingDocs = [
        claim('u-juan_p1', { contactPhone: '600 111 222', website: 'barpepe.es', placeAddress: 'Calle Mayor 1' }),
        claim('u-luis_p1', { userId: 'u-luis', userName: 'Luis Gil', createdAt: ts(NOW - 2 * HOUR) }),
        claim('u-eva_p2', { userId: 'u-eva', userName: 'Eva Ruiz', placeId: 'p2', placeName: 'Café Sol', createdAt: ts(NOW - HOUR) }),
    ];
    resolvedDocs = [];
    auditDocs = [];
    docs = {
        'places/p1': { name: 'Bar Pepe', businessVerified: true, businessOwnerUserId: 'u-ana', businessManagerIds: ['u-ana'] },
        'places/p2': { name: 'Café Sol' },
        'users/u-ana': { displayName: 'Ana' },
        'users/u-admin': { displayName: 'Jefa' },
    };
    firestoreMock.getDocs.mockImplementation(async (q: MockQuery) => {
        if (q.path === 'businessClaims') {
            const status = whereOf(q, 'status');
            return mockSnap(status?.op === '==' && status.value === 'pending' ? pendingDocs : resolvedDocs);
        }
        if (q.path === 'adminAuditLog') return mockSnap(auditDocs);
        return mockSnap([]);
    });
    firestoreMock.getDoc.mockImplementation(async (ref: { path: string; id: string }) => (docs[ref.path]
        ? mockDoc(ref.id, docs[ref.path])
        : missingDoc(ref.id)));
    firestoreMock.getCountFromServer.mockImplementation(async (q: MockQuery) => {
        const status = whereOf(q, 'status')?.value;
        return countSnap(status === 'pending' ? 3 : status === 'approved' ? 12 : status === 'rejected' ? 4 : 0);
    });
});

afterEach(() => {
    cleanup();
});

describe('BusinessClaimsManagerTab · Pendientes', () => {
    it('pide las pendientes por antigüedad y avisa de propietario y solicitudes que compiten', async () => {
        renderTab();
        expect(await screen.findByText('Eva Ruiz')).toBeInTheDocument();

        const pendingQuery = firestoreMock.getDocs.mock.calls
            .map(([q]) => q as MockQuery)
            .find((q) => q.path === 'businessClaims');
        expect(whereOf(pendingQuery!, 'status')).toMatchObject({ op: '==', value: 'pending' });
        expect(pendingQuery!.constraints).toContainEqual({ type: 'orderBy', field: 'createdAt', direction: 'asc' });

        const juan = cardOf('u-juan_p1');
        expect(await within(juan).findByText(/Ya verificado · propietario Ana/)).toBeInTheDocument();
        expect(within(juan).getByText(/2 solicitudes para este lugar/)).toBeInTheDocument();
        expect(within(cardOf('u-luis_p1')).getByText(/2 solicitudes para este lugar/)).toBeInTheDocument();
        expect(within(cardOf('u-eva_p2')).queryByText(/solicitudes para este lugar/)).toBeNull();
        expect(screen.getByRole('tab', { name: /Pendientes/ })).toHaveTextContent('3');
    });

    it('al desplegar enseña teléfono, web, dirección, pruebas y la nota de esa fila', async () => {
        renderTab();
        const juan = await screen.findByTestId('business-claim-u-juan_p1');
        expect(within(juan).queryByRole('textbox')).toBeNull();
        fireEvent.click(within(juan).getByRole('button', { name: 'Desplegar' }));

        expect(within(juan).getByRole('link', { name: '600 111 222' })).toHaveAttribute('href', 'tel:600111222');
        expect(within(juan).getByRole('link', { name: 'barpepe.es' })).toHaveAttribute('href', 'https://barpepe.es/');
        expect(within(juan).getByText('Calle Mayor 1')).toBeInTheDocument();
        expect(within(juan).getByRole('link', { name: /cif\.pdf/ })).toHaveAttribute('href', 'https://files/u-juan_p1');
        expect(within(juan).getByRole('textbox')).toHaveValue('');
        expect(within(juan).getByRole('button', { name: /Rechazar/ })).toBeDisabled();
    });

    it('aprobar sobre otro propietario pide confirmar la transferencia y envía allowOwnerTransfer', async () => {
        const { invalidate } = renderTab();
        const juan = await screen.findByTestId('business-claim-u-juan_p1');
        fireEvent.click(within(juan).getByRole('button', { name: 'Desplegar' }));
        await within(juan).findByText(/la propiedad pasa de Ana a Juan López/);

        fireEvent.click(within(juan).getByRole('button', { name: /Aprobar y transferir/ }));

        await waitFor(() => expect(callableMock).toHaveBeenCalledTimes(1));
        expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({
            title: '⚠️ ¿Transferir la propiedad?',
            message: expect.stringContaining('de Ana a Juan López'),
        }));
        expect(callableMock).toHaveBeenCalledWith({
            claimId: 'u-juan_p1',
            status: 'approved',
            adminNotes: '',
            allowOwnerTransfer: true,
        });
        expect(await within(juan).findByText(/Aprobada\. Juan López ya puede gestionar Bar Pepe/)).toBeInTheDocument();
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['developer'] });
        expect(screen.getByRole('tab', { name: /Pendientes/ })).toHaveTextContent('2');
        // La otra solicitud del mismo lugar ya avisa del nuevo propietario.
        expect(await within(cardOf('u-luis_p1')).findByText(/Ya verificado · propietario/)).toBeInTheDocument();
    });

    it('rechazar exige motivo, lo enseña en la confirmación y no transfiere nada', async () => {
        renderTab();
        const eva = await screen.findByTestId('business-claim-u-eva_p2');
        fireEvent.click(within(eva).getByRole('button', { name: 'Desplegar' }));
        fireEvent.change(within(eva).getByRole('textbox'), { target: { value: 'Faltan pruebas del local' } });
        fireEvent.click(within(eva).getByRole('button', { name: /Rechazar/ }));

        await waitFor(() => expect(callableMock).toHaveBeenCalledWith({
            claimId: 'u-eva_p2',
            status: 'rejected',
            adminNotes: 'Faltan pruebas del local',
        }));
        expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining('“Faltan pruebas del local”'),
            destructive: true,
        }));
        expect(await within(eva).findByText(/Rechazada\. Hemos avisado a Eva Ruiz/)).toBeInTheDocument();
        expect(within(eva).queryByRole('textbox')).toBeNull();
    });

    it('si cancelas la confirmación no se envía nada', async () => {
        confirmMock.mockResolvedValue(false);
        renderTab();
        const eva = await screen.findByTestId('business-claim-u-eva_p2');
        fireEvent.click(within(eva).getByRole('button', { name: 'Desplegar' }));
        fireEvent.click(within(eva).getByRole('button', { name: /Aprobar/ }));
        await waitFor(() => expect(confirmMock).toHaveBeenCalled());
        expect(callableMock).not.toHaveBeenCalled();
    });

    it('enseña el error del servidor en la propia fila', async () => {
        callableMock.mockRejectedValue(Object.assign(new Error('Esta solicitud ya fue revisada.'), { code: 'functions/failed-precondition' }));
        renderTab();
        const eva = await screen.findByTestId('business-claim-u-eva_p2');
        fireEvent.click(within(eva).getByRole('button', { name: 'Desplegar' }));
        fireEvent.click(within(eva).getByRole('button', { name: /Aprobar/ }));
        expect(await within(eva).findByRole('alert')).toHaveTextContent('Esta solicitud ya fue revisada.');
    });
});

describe('BusinessClaimsManagerTab · Resueltas y foco', () => {
    it('lista las resueltas del filtro, de la más reciente a la más antigua, en solo lectura', async () => {
        resolvedDocs = [claim('u-mar_p3', {
            userName: 'Mar Gil',
            placeName: 'Bar Luna',
            status: 'rejected',
            adminNotes: 'No es el dueño',
            reviewedBy: 'u-ana',
            reviewedAt: ts(NOW - HOUR),
        })];
        const { onNavigate } = renderTab({ view: 'resolved', status: 'rejected' });
        const card = await screen.findByTestId('business-claim-u-mar_p3');

        const resolvedQuery = firestoreMock.getDocs.mock.calls
            .map(([q]) => q as MockQuery)
            .find((q) => q.path === 'businessClaims' && whereOf(q, 'status')?.value === 'rejected');
        expect(resolvedQuery!.constraints).toContainEqual({ type: 'orderBy', field: 'createdAt', direction: 'desc' });
        expect(screen.getByRole('button', { name: /Rechazadas/ })).toHaveTextContent('4');
        expect(screen.getByRole('button', { name: /Aprobadas/ })).toHaveTextContent('12');
        expect(within(card).getByText('“No es el dueño”')).toBeInTheDocument();
        expect(await within(card).findByText('Ana')).toBeInTheDocument();

        fireEvent.click(within(card).getByRole('button', { name: 'Desplegar' }));
        expect(within(card).queryByRole('textbox')).toBeNull();
        expect(within(card).queryByRole('button', { name: /Aprobar|Rechazar/ })).toBeNull();
        expect(await within(card).findByText('🧾 Historial de decisiones')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Aprobadas/ }));
        expect(onNavigate).toHaveBeenCalledWith({ status: 'approved', focus: null });
    });

    it('un foco que no estaba cargado se lee, cambia a su vista y se fija desplegado con su historial', async () => {
        docs['businessClaims/u-old_p9'] = {
            userId: 'u-old',
            userName: 'Olga',
            placeId: 'p9',
            placeName: 'Mesón Viejo',
            role: 'Gerente',
            status: 'approved',
            adminNotes: 'Verificado por teléfono',
            reviewedBy: 'u-ana',
            reviewedAt: ts(NOW - 30 * 24 * HOUR),
            createdAt: ts(NOW - 31 * 24 * HOUR),
            proofs: [],
        };
        auditDocs = [mockDoc('log1', {
            action: 'businessClaim.review',
            actorUid: 'u-ana',
            details: { claimId: 'u-old_p9', status: 'approved', previousOwnerUserId: 'u-admin' },
            createdAt: ts(NOW - 30 * 24 * HOUR + 1000),
        })];

        const { onNavigate, rerenderWith } = renderTab({ focusId: 'u-old_p9' });
        await waitFor(() => expect(onNavigate).toHaveBeenCalledWith({ view: 'resolved', focus: 'u-old_p9' }));

        rerenderWith({ focusId: 'u-old_p9', view: 'resolved' });
        const card = await screen.findByTestId('business-claim-u-old_p9');
        expect(within(card).getByRole('button', { name: 'Plegar' })).toBeInTheDocument();
        const auditQuery = await waitFor(() => {
            const found = firestoreMock.getDocs.mock.calls
                .map(([q]) => q as MockQuery)
                .find((q) => q.path === 'adminAuditLog');
            expect(found).toBeDefined();
            return found!;
        });
        expect(whereOf(auditQuery, 'details.claimId')).toMatchObject({ op: '==', value: 'u-old_p9' });
        expect(await within(card).findByText(/Propiedad transferida de/)).toBeInTheDocument();
        expect(within(card).getAllByText('“Verificado por teléfono”').length).toBeGreaterThanOrEqual(2);
    });

    it('avisa si el foco no existe', async () => {
        renderTab({ focusId: 'no-existe-123' });
        expect(await screen.findByText(/No encuentro la solicitud no-existe-123/)).toBeInTheDocument();
    });
});
