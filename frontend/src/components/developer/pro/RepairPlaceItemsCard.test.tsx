import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { RepairPlaceItemsResult } from '../../../services/BusinessProService';

const service = vi.hoisted(() => ({
    adminRepairPlaceItems: vi.fn(),
}));
vi.mock('../../../services/BusinessProService', () => service);

import { ConfirmProvider } from '../../../context/ConfirmContext';
import { ToastProvider } from '../../../context/ToastContext';
import { RepairPlaceItemsCard } from './RepairPlaceItemsCard';

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

const setup = () => render(
    <ToastProvider>
        <ConfirmProvider>
            <RepairPlaceItemsCard />
        </ConfirmProvider>
    </ToastProvider>,
);

beforeEach(() => {
    service.adminRepairPlaceItems.mockReset();
});

afterEach(() => {
    cleanup();
});

describe('RepairPlaceItemsCard · Reparar cartas', () => {
    it('simula con el placeId indicado y enseña totales, conflictos y duplicados', async () => {
        service.adminRepairPlaceItems.mockResolvedValue(repairResult(true));
        setup();

        fireEvent.change(screen.getByLabelText('placeId del sitio a reparar'), { target: { value: `  ${PLACE_ID} ` } });
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Simular' })); });

        expect(service.adminRepairPlaceItems).toHaveBeenCalledWith({ placeId: PLACE_ID, dryRun: true });
        const result = await screen.findByTestId('repair-result');
        expect(within(result).getByText(/Simulación \(no se ha cambiado nada\) · 2 sitios/)).toBeInTheDocument();
        expect(within(result).getByText('Sermase')).toBeInTheDocument();
        expect(within(result).getByText(/Conflicto «croqueta la original»: croqueta-prueba-1, croqueta-la-original/)).toBeInTheDocument();
        expect(within(result).getByText(/Duplicado «bravas»: bravas, patatas-bravas/)).toBeInTheDocument();
        expect(within(result).getByText('1 sitio sin cambios.')).toBeInTheDocument();
        expect(within(result).queryByText('Otro sitio')).not.toBeInTheDocument();
        // Totales con su etiqueta y enlace al lugar con algo que contar.
        expect(result).toHaveTextContent(/2\s*valoraciones renombradas/);
        expect(within(result).getByRole('link', { name: /Lugar/ })).toHaveAttribute('href', `/place/${PLACE_ID}`);
        expect(await screen.findByText(/Simulación lista: no se ha cambiado nada/)).toBeInTheDocument();
    });

    it('con Enter en el campo también simula (nunca aplica)', async () => {
        service.adminRepairPlaceItems.mockResolvedValue(repairResult(true));
        setup();

        const input = screen.getByLabelText('placeId del sitio a reparar');
        fireEvent.change(input, { target: { value: PLACE_ID } });
        await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });

        expect(service.adminRepairPlaceItems).toHaveBeenCalledTimes(1);
        expect(service.adminRepairPlaceItems).toHaveBeenCalledWith({ placeId: PLACE_ID, dryRun: true });
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('aplica solo tras confirmar', async () => {
        service.adminRepairPlaceItems.mockResolvedValue(repairResult(false));
        setup();

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

    it('con placeId, la confirmación nombra ese sitio', async () => {
        service.adminRepairPlaceItems.mockResolvedValue(repairResult(false));
        setup();

        fireEvent.change(screen.getByLabelText('placeId del sitio a reparar'), { target: { value: PLACE_ID } });
        fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
        const dialog = await screen.findByRole('alertdialog');
        expect(within(dialog).getByText('¿Reparar la carta de este sitio?')).toBeInTheDocument();
        expect(dialog).toHaveTextContent(PLACE_ID);
        await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' })); });

        expect(service.adminRepairPlaceItems).toHaveBeenCalledWith({ placeId: PLACE_ID, dryRun: false });
    });

    it('avisa si se cortó y enseña el error de un sitio sin ocultar el resto', async () => {
        service.adminRepairPlaceItems.mockResolvedValue({
            ...repairResult(true),
            truncated: true,
            places: [
                ...repairResult(true).places,
                { ...zero, placeId: 'roto', placeName: null, conflicts: [], duplicates: [], error: 'Lugar no encontrado' },
            ],
        });
        setup();

        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Simular' })); });

        const result = await screen.findByTestId('repair-result');
        expect(within(result).getByText(/Se cortó antes de terminar/)).toBeInTheDocument();
        expect(within(result).getByText('roto')).toBeInTheDocument();
        expect(within(result).getByText(/Lugar no encontrado/)).toBeInTheDocument();
        expect(within(result).getByText('Sermase')).toBeInTheDocument();
    });

    it('enseña el error del servidor sin romper la pestaña', async () => {
        service.adminRepairPlaceItems.mockRejectedValue(new Error('Solo un administrador puede reparar cartas.'));
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        setup();

        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Simular' })); });

        expect(await screen.findByText('Solo un administrador puede reparar cartas.')).toBeInTheDocument();
        expect(screen.queryByTestId('repair-result')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Simular' })).toBeEnabled();
        consoleError.mockRestore();
    });
});
