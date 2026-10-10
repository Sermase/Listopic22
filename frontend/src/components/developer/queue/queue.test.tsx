import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { firestoreMock, missingDoc, mockDoc, resetFirestoreMock } from '../../../test/firestoreMock';

vi.mock('../../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', async () => (await import('../../../test/firestoreMock')).firestoreMock);

import { AgeChip, LoadMoreButton, QueueToolbar, ResolvedMeta, StatusChip, statusLabel } from './index';
import { DAY_MS, HOUR_MS } from '../../../utils/adminTime';

const NOW = new Date(2026, 9, 6, 12, 0, 0).getTime();

const withQueryClient = (ui: React.ReactElement) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

beforeEach(() => {
    resetFirestoreMock();
});

describe('StatusChip / statusLabel', () => {
    it('concuerda en género y número', () => {
        expect(statusLabel('approved')).toBe('Aprobada');
        expect(statusLabel('resolved', { gender: 'm' })).toBe('Resuelto');
        expect(statusLabel('rejected', { gender: 'f', plural: true })).toBe('Rechazadas');
        expect(statusLabel('raro')).toBe('raro');
        expect(statusLabel('applying')).toBe('Aplicándose');
        render(<StatusChip status="ended" />);
        expect(screen.getByText('Finalizada')).toBeInTheDocument();
        expect(screen.getByText('🏁')).toBeInTheDocument();
    });
});

describe('AgeChip', () => {
    it('pinta la antigüedad con el color de su espera', () => {
        const { rerender, container } = render(<AgeChip at={NOW - 2 * HOUR_MS} now={NOW} />);
        expect(screen.getByText('hace 2 h')).toBeInTheDocument();
        expect(container.firstElementChild?.className).toContain('text-gray-300');
        rerender(<AgeChip at={NOW - 2 * DAY_MS} now={NOW} />);
        expect(container.firstElementChild?.className).toContain('text-amber-300');
        rerender(<AgeChip at={NOW - 5 * DAY_MS} now={NOW} />);
        expect(container.firstElementChild?.className).toContain('text-red-300');
        rerender(<AgeChip at={NOW - HOUR_MS} now={NOW} urgent />);
        expect(container.firstElementChild?.className).toContain('text-red-300');
        expect(screen.getByText('🚨')).toBeInTheDocument();
        rerender(<AgeChip at={null} now={NOW} />);
        expect(container.firstElementChild).toBeNull();
    });
});

describe('ResolvedMeta', () => {
    it('muestra quién decidió, cuándo y la nota', async () => {
        firestoreMock.getDoc.mockImplementation(async (ref: { id: string }) => (ref.id === 'uid-ana'
            ? mockDoc('uid-ana', { displayName: 'Ana' })
            : missingDoc(ref.id)));
        withQueryClient(<ResolvedMeta status="approved" by="uid-ana" at={new Date(2026, 8, 12, 18, 20).getTime()} notes="Todo en orden" />);
        expect(await screen.findByText('Ana')).toBeInTheDocument();
        expect(screen.getByText(/Aprobada/)).toBeInTheDocument();
        expect(screen.getByText('12/09 18:20')).toBeInTheDocument();
        expect(screen.getByText('“Todo en orden”')).toBeInTheDocument();
    });

    it('dice «Automático» si lo cerró el sistema', () => {
        withQueryClient(<ResolvedMeta status="ended" by="system" />);
        expect(screen.getByText('🤖 Automático')).toBeInTheDocument();
        expect(firestoreMock.getDoc).not.toHaveBeenCalled();
    });
});

describe('LoadMoreButton', () => {
    it('ofrece cargar más con el contador y avisa al final', () => {
        const onClick = vi.fn();
        const { rerender } = render(<LoadMoreButton onClick={onClick} hasMore shown={25} total={120} />);
        fireEvent.click(screen.getByRole('button', { name: /Cargar 25 más/ }));
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Mostrando 25 de 120')).toBeInTheDocument();
        rerender(<LoadMoreButton onClick={onClick} hasMore={false} shown={30} />);
        expect(screen.getByText(/No hay más/)).toBeInTheDocument();
    });
});

describe('QueueToolbar', () => {
    it('cambia de vista, de filtro y busca', () => {
        const onViewChange = vi.fn();
        const onFilterChange = vi.fn();
        const onSearchChange = vi.fn();
        const onRefresh = vi.fn();
        render(
            <QueueToolbar
                view="resolved"
                onViewChange={onViewChange}
                pendingCount={3}
                filters={[
                    { value: 'approved', label: 'Aprobadas', emoji: '✅', count: 12 },
                    { value: 'all', label: 'Todas' },
                ]}
                filter="approved"
                onFilterChange={onFilterChange}
                search=""
                onSearchChange={onSearchChange}
                onRefresh={onRefresh}
                degraded
            />,
        );
        fireEvent.click(screen.getByRole('tab', { name: /Pendientes/ }));
        expect(onViewChange).toHaveBeenCalledWith('pending');
        expect(screen.getByRole('tab', { name: /Pendientes/ })).toHaveTextContent('3');
        expect(screen.getByRole('button', { name: /Aprobadas/ })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: /Todas/ }));
        expect(onFilterChange).toHaveBeenCalledWith('all');
        fireEvent.change(screen.getByPlaceholderText(/Buscar/), { target: { value: 'bar' } });
        expect(onSearchChange).toHaveBeenCalledWith('bar');
        fireEvent.click(screen.getByRole('button', { name: /Actualizar/ }));
        expect(onRefresh).toHaveBeenCalled();
        // Sin índice se cargan como mucho 200 y sin orden de servidor: se avisa de las dos cosas.
        expect(screen.getByText(/Índice en construcción/)).toHaveTextContent('orden aproximado y quizá incompleto (máx. 200)');
    });
});
