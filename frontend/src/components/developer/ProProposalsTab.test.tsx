import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { RepairPlaceItemsResult } from '../../services/BusinessProService';

vi.mock('../../firebase', () => ({ auth: {}, db: {}, functions: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({
    addDoc: vi.fn(),
    collection: vi.fn(() => ({})),
    doc: vi.fn(() => ({})),
    getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
    limit: vi.fn(),
    query: vi.fn(() => ({})),
    serverTimestamp: vi.fn(),
    setDoc: vi.fn(),
    where: vi.fn(),
}));

const service = vi.hoisted(() => ({
    adminRepairPlaceItems: vi.fn(),
    getPendingItemProposals: vi.fn(async () => []),
    getOpenSponsoredPlacements: vi.fn(async () => []),
    getOpenItemSpotlights: vi.fn(async () => []),
    getSpotlightPricing: vi.fn(),
}));
vi.mock('../../services/BusinessProService', async (importOriginal) => {
    const original = await importOriginal<typeof import('../../services/BusinessProService')>();
    service.getSpotlightPricing.mockImplementation(async () => original.DEFAULT_SPOTLIGHT_PRICING);
    return { ...original, ...service };
});

import { ConfirmProvider } from '../../context/ConfirmContext';
import { ToastProvider } from '../../context/ToastContext';
import { ProProposalsTab } from './ProProposalsTab';

const PLACE_ID = 'ChIJc7hBUzEvQg0R_skP3Lbqgrc';

const zero = { renamedReviews: 0, stampedReviews: 0, deactivatedItems: 0, mergedItems: 0, fixedMergedItems: 0, spotlightsUpdated: 0 };

const repairResult = (dryRun: boolean): RepairPlaceItemsResult => ({
    ok: true,
    dryRun,
    truncated: false,
    totals: { ...zero, places: 2, renamedReviews: 2, stampedReviews: 3, mergedItems: 1 },
    places: [
        {
            ...zero,
            placeId: PLACE_ID,
            placeName: 'Sermase',
            renamedReviews: 2,
            stampedReviews: 3,
            mergedItems: 1,
            conflicts: [{ name: 'croqueta la original', itemIds: ['croqueta-prueba-1', 'croqueta-la-original'] }],
            duplicates: [{ name: 'bravas', itemIds: ['bravas', 'patatas-bravas'] }],
        },
        { ...zero, placeId: 'otro', placeName: 'Otro sitio', conflicts: [], duplicates: [] },
    ],
});

const setup = async () => {
    render(
        <ToastProvider>
            <ConfirmProvider>
                <ProProposalsTab />
            </ConfirmProvider>
        </ToastProvider>,
    );
    await waitFor(() => expect(service.getPendingItemProposals).toHaveBeenCalled());
};

describe('ProProposalsTab · Reparar cartas', () => {
    beforeEach(() => {
        service.adminRepairPlaceItems.mockReset();
    });

    it('simula con el placeId indicado y enseña totales, conflictos y duplicados', async () => {
        service.adminRepairPlaceItems.mockResolvedValue(repairResult(true));
        await setup();

        fireEvent.change(screen.getByLabelText('placeId del sitio a reparar'), { target: { value: `  ${PLACE_ID} ` } });
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Simular' })); });

        expect(service.adminRepairPlaceItems).toHaveBeenCalledWith({ placeId: PLACE_ID, dryRun: true });
        const result = await screen.findByTestId('repair-result');
        expect(within(result).getByText(/Simulación \(no se ha cambiado nada\)/)).toBeInTheDocument();
        expect(within(result).getByText('Sermase')).toBeInTheDocument();
        expect(within(result).getByText(/Conflicto «croqueta la original»: croqueta-prueba-1, croqueta-la-original/)).toBeInTheDocument();
        expect(within(result).getByText(/Duplicado «bravas»: bravas, patatas-bravas/)).toBeInTheDocument();
        expect(within(result).getByText('1 sitio sin cambios.')).toBeInTheDocument();
        expect(within(result).queryByText('Otro sitio')).not.toBeInTheDocument();
    });

    it('aplica solo tras confirmar', async () => {
        service.adminRepairPlaceItems.mockResolvedValue(repairResult(false));
        await setup();

        fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
        const dialog = await screen.findByRole('alertdialog');
        expect(within(dialog).getByText('¿Reparar todas las cartas?')).toBeInTheDocument();
        await act(async () => { fireEvent.click(within(dialog).getByText('Cancelar')); });
        expect(service.adminRepairPlaceItems).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
        const again = await screen.findByRole('alertdialog');
        await act(async () => { fireEvent.click(within(again).getByRole('button', { name: 'Aplicar' })); });

        expect(service.adminRepairPlaceItems).toHaveBeenCalledWith({ placeId: undefined, dryRun: false });
        expect(await screen.findByText(/Aplicado · 2 sitios/)).toBeInTheDocument();
    });

    it('enseña el error del servidor sin romper la pestaña', async () => {
        service.adminRepairPlaceItems.mockRejectedValue(new Error('Solo un administrador puede reparar cartas.'));
        await setup();

        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Simular' })); });

        expect(await screen.findByText('Solo un administrador puede reparar cartas.')).toBeInTheDocument();
        expect(screen.queryByTestId('repair-result')).not.toBeInTheDocument();
    });
});
