import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const callables: Record<string, ReturnType<typeof vi.fn>> = {
    simulateCriteriaChange: vi.fn(),
    applyCriteriaChange: vi.fn(),
};
vi.mock('firebase/functions', () => ({
    httpsCallable: (_functions: unknown, name: string) => callables[name],
}));
vi.mock('../firebase', () => ({ functions: {} }));
const confirmMock = vi.fn(async () => true);
vi.mock('../context/ConfirmContext', () => ({ useConfirm: () => confirmMock }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

import { CriteriaMigrationModal } from './CriteriaMigrationModal';

const criteria = [{ id: 'sabor', label: 'Sabor' }, { id: 'textura', label: 'Textura' }];
const simulation = {
    fingerprint: 'abc',
    noChange: false,
    summary: { totalReviews: 4, changedReviews: 2, maxDelta: 1, rankingMoves: 1, minilistsAffected: 1 },
    reviews: [{ id: 'r1', itemName: 'Croqueta', sublistId: null, before: 7, after: 8 }],
    rankingChanges: [{ id: 'p1_croqueta', name: 'Croqueta', before: 2, after: 1 }],
};

const renderModal = (canApply: boolean, onApplied = vi.fn()) => render(
    <CriteriaMigrationModal
        isOpen
        onClose={vi.fn()}
        listId="madre"
        criteria={criteria}
        currentWeights={{ sabor: 1, textura: 1 }}
        canApply={canApply}
        onApplied={onApplied}
    />,
);

describe('CriteriaMigrationModal', () => {
    beforeEach(() => {
        callables.simulateCriteriaChange.mockReset().mockResolvedValue({ data: simulation });
        callables.applyCriteriaChange.mockReset().mockResolvedValue({ data: { applied: true } });
        confirmMock.mockClear();
    });

    it('sin cambios no deja simular; al cambiar un peso simula solo la diferencia', async () => {
        renderModal(false);
        const simulate = screen.getByRole('button', { name: /Simular/ });
        expect(simulate).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Peso de Sabor'), { target: { value: '3' } });
        fireEvent.click(simulate);
        await screen.findByText(/2 de 4 valoraciones cambian de nota/);
        expect(callables.simulateCriteriaChange).toHaveBeenCalledWith({ listId: 'madre', change: { weights: { sabor: 3 }, removeCriteria: [] } });
        expect(screen.getAllByText('Croqueta')).toHaveLength(2); // nota y puesto
        expect(screen.getByText('#2 →', { exact: false })).toBeInTheDocument();
        expect(screen.getByText(/lo hace un administrador/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Aplicar/ })).not.toBeInTheDocument();
    });

    it('no deja quitar todos los criterios que cuentan', () => {
        renderModal(true);
        screen.getAllByRole('checkbox', { name: /Quitar/ }).forEach((c) => fireEvent.click(c));
        expect(screen.getByRole('alert')).toHaveTextContent('Al menos un criterio');
        expect(screen.getByRole('button', { name: /Simular/ })).toBeDisabled();
    });

    it('un administrador aplica con la huella de la simulación', async () => {
        const onApplied = vi.fn();
        renderModal(true, onApplied);
        fireEvent.click(screen.getAllByRole('checkbox', { name: /Quitar/ })[1]);
        fireEvent.click(screen.getByRole('button', { name: /Simular/ }));
        fireEvent.click(await screen.findByRole('button', { name: /Aplicar y recalcular/ }));
        await waitFor(() => expect(onApplied).toHaveBeenCalled());
        expect(confirmMock).toHaveBeenCalled();
        expect(callables.applyCriteriaChange).toHaveBeenCalledWith({
            listId: 'madre',
            change: { weights: {}, removeCriteria: ['textura'] },
            fingerprint: 'abc',
        });
    });

    it('cambiar algo después de simular obliga a simular otra vez', async () => {
        renderModal(true);
        fireEvent.change(screen.getByLabelText('Peso de Sabor'), { target: { value: '2' } });
        fireEvent.click(screen.getByRole('button', { name: /Simular/ }));
        await screen.findByRole('button', { name: /Aplicar y recalcular/ });
        fireEvent.change(screen.getByLabelText('Peso de Sabor'), { target: { value: '3' } });
        expect(screen.queryByRole('button', { name: /Aplicar y recalcular/ })).not.toBeInTheDocument();
    });
});
