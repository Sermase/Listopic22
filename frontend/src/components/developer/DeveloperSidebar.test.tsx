import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DeveloperSidebar } from './DeveloperSidebar';

const badges = {
    pending: { review: 9, attention: 4 },
    reports: { review: 2, attention: 0 },
    businessClaims: { review: 0, attention: 0 },
    plans: { review: 0, attention: 3 },
    proProposals: { review: 120, attention: 1 },
};

const renderSidebar = (overrides: Partial<React.ComponentProps<typeof DeveloperSidebar>> = {}) => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
        <DeveloperSidebar activeTab="pending" onSelect={onSelect} open={false} onClose={onClose} badges={badges} {...overrides} />,
    );
    return { onSelect, onClose };
};

describe('DeveloperSidebar', () => {
    it('agrupa en secciones con Pendientes la primera', () => {
        renderSidebar();
        const nav = screen.getByRole('navigation', { name: 'Herramientas de Developer' });
        const tabs = within(nav).getAllByRole('button').filter((button) => button.getAttribute('aria-label') !== 'Cerrar menú');
        expect(tabs[0]).toHaveTextContent('Pendientes');
        expect(tabs).toHaveLength(24);
        expect(screen.getByText('Negocios y planes')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Pendientes/ })).toHaveAttribute('aria-current', 'page');
    });

    it('contador por revisar, punto de atención o nada', () => {
        renderSidebar();
        expect(screen.getByRole('button', { name: /Reportes.*2 por revisar/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Planes.*3 piden atención/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Patrocinios y Pro.*120 por revisar y 1 piden atención/ })).toHaveTextContent('99+');
        const claims = screen.getByRole('button', { name: /Solicitudes negocio/ });
        expect(claims).toHaveTextContent(/^Solicitudes negocio$/);
    });

    it('sin datos de contadores no pinta nada y avisa al elegir una pestaña', () => {
        const { onSelect } = renderSidebar({ badges: undefined });
        const reports = screen.getByRole('button', { name: 'Reportes' });
        fireEvent.click(reports);
        expect(onSelect).toHaveBeenCalledWith('reports');
    });

    it('en móvil se cierra con el fondo o con la X', () => {
        const { onClose } = renderSidebar({ open: true });
        const closers = screen.getAllByRole('button', { name: 'Cerrar menú' });
        expect(closers).toHaveLength(2);
        closers.forEach((button) => fireEvent.click(button));
        expect(onClose).toHaveBeenCalledTimes(2);
    });
});
