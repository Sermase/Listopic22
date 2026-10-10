import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

const { callableMock, confirmMock } = vi.hoisted(() => ({
    callableMock: vi.fn(),
    confirmMock: vi.fn(),
}));

vi.mock('../../firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/firestore', async () => ({
    ...(await import('../../test/firestoreMock')).firestoreMock,
    documentId: () => '__name__',
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => callableMock) }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => confirmMock }));

import { BusinessManagersTab } from './BusinessManagersTab';
import { formatDate } from '../../utils/adminTime';

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const expiresAt = new Date(NOW + 10 * DAY);

let docs: Record<string, Record<string, unknown>>;

const renderTab = (props: { focusId?: string | null } = {}) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <MemoryRouter>
            <QueryClientProvider client={client}>
                <BusinessManagersTab {...props} />
            </QueryClientProvider>
        </MemoryRouter>,
    );
};

beforeEach(() => {
    resetFirestoreMock();
    callableMock.mockReset().mockResolvedValue({ data: { ok: true } });
    confirmMock.mockReset().mockResolvedValue(true);
    docs = {
        'users/u-ana': { displayName: 'Ana' },
        'places/p-lejano-1234567890': { name: 'Mesón Lejano', businessVerified: true, businessOwnerUserId: 'u-eva' },
    };
    firestoreMock.getDocs.mockImplementation(async (q: MockQuery) => {
        if (q.path === 'places') {
            return mockSnap([
                mockDoc('p1', {
                    name: 'Bar Pepe',
                    businessVerified: true,
                    businessOwnerUserId: 'u-juan',
                    businessManagerIds: ['u-juan', 'u-luis'],
                    businessClaimId: 'u-juan_p1',
                    businessClaimedAt: ts(NOW - 2 * DAY),
                    businessVerifiedBy: 'u-ana',
                    businessProActive: true,
                    businessPlanSource: 'trial',
                    businessPlanGrantedBy: 'beta',
                    businessPlanExpiresAt: expiresAt,
                }),
                mockDoc('p2', { name: 'Café Sol', businessVerified: true, businessBillingStatus: 'past_due' }),
            ]);
        }
        if (q.path === 'users') {
            return mockSnap([
                mockDoc('u-juan', { username: 'juan' }),
                mockDoc('u-luis', { username: 'luis' }),
            ]);
        }
        return mockSnap([]);
    });
    firestoreMock.getDoc.mockImplementation(async (ref: { path: string; id: string }) => (docs[ref.path]
        ? mockDoc(ref.id, docs[ref.path])
        : missingDoc(ref.id)));
    firestoreMock.getCountFromServer.mockImplementation(async (q: MockQuery) => {
        expect(whereOf(q, 'businessVerified')).toMatchObject({ op: '==', value: true });
        return countSnap(180);
    });
});

afterEach(() => {
    cleanup();
});

const findCard = (placeId: string) => waitFor(() => {
    const element = document.getElementById(`business-place-${placeId}`);
    expect(element).not.toBeNull();
    return element as HTMLElement;
});

describe('BusinessManagersTab', () => {
    it('da contexto en cada tarjeta: solicitud de origen, quién verificó, plan y total', async () => {
        renderTab();
        const link = await screen.findByRole('link', { name: /Solicitud de origen/ });
        expect(link).toHaveAttribute('href', '/developer?tab=businessClaims&view=resolved&focus=u-juan_p1');

        const card = document.getElementById('business-place-p1')!;
        expect(within(card).getByText(/Verificado/)).toBeInTheDocument();
        expect(await within(card).findByText('Ana')).toBeInTheDocument();
        expect(within(card).getByText(`Pro · Prueba (beta) · hasta ${formatDate(expiresAt)}`)).toBeInTheDocument();
        expect(within(card).getByText('Usuarios asignados (2)')).toBeInTheDocument();

        const cafe = document.getElementById('business-place-p2')!;
        expect(within(cafe).getByText('Free')).toBeInTheDocument();
        expect(within(cafe).getByText('💳 Pago atrasado')).toBeInTheDocument();
        expect(within(cafe).queryByRole('link', { name: /Solicitud de origen/ })).toBeNull();

        // «✨ Plan →» lleva a su fila en Planes: Pro activos si tiene Pro, Verificados sin Pro si no.
        expect(within(card).getByRole('link', { name: '✨ Plan →' })).toHaveAttribute('href', '/developer?tab=plans&view=pro&focus=p1');
        expect(within(cafe).getByRole('link', { name: '✨ Plan →' })).toHaveAttribute('href', '/developer?tab=plans&view=verified&focus=p2');

        expect(screen.getByText(/180 negocios verificados/)).toBeInTheDocument();
        expect(screen.getByText(/Mostrando 2 de 180/)).toBeInTheDocument();
    });

    it('quitar un gestor usa la confirmación de la app y no toca al propietario', async () => {
        renderTab();
        const card = await findCard('p1');
        await within(card).findByText('@luis');
        expect(within(card).getAllByRole('button', { name: /Quitar/ })).toHaveLength(1);
        fireEvent.click(within(card).getByRole('button', { name: /Quitar/ }));
        await waitFor(() => expect(callableMock).toHaveBeenCalledWith({ placeId: 'p1', action: 'remove', targetUserId: 'u-luis' }));
        expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ destructive: true, message: expect.stringContaining('@luis') }));
        await waitFor(() => expect(within(card).queryByText('@luis')).toBeNull());
        expect(within(card).getByText('@juan')).toBeInTheDocument();
    });

    it('hacer propietario a otro gestor pide confirmar la transferencia', async () => {
        confirmMock.mockResolvedValue(false);
        renderTab();
        const card = await findCard('p1');
        await within(card).findByText('@luis');
        fireEvent.click(within(card).getByRole('button', { name: 'Hacer propietario' }));
        await waitFor(() => expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining('de @juan a @luis'),
        })));
        expect(callableMock).not.toHaveBeenCalled();
    });

    it('el foco que no está entre los cargados se lee aparte y se resalta', async () => {
        renderTab({ focusId: 'p-lejano-1234567890' });
        expect(await screen.findByText('Mesón Lejano')).toBeInTheDocument();
        expect(document.getElementById('business-place-p-lejano-1234567890')?.className).toContain('ring-1');
    });
});
