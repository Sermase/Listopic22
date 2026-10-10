import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { DeveloperInbox, InboxGroup } from '../../hooks/useDeveloperInbox';
import type { InboxItem, QueueKey } from '../../services/adminQueues';
import { DAY_MS, HOUR_MS } from '../../utils/adminTime';

const inboxState = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
    invalidate: vi.fn(),
}));

vi.mock('../../hooks/useDeveloperInbox', () => ({
    useDeveloperInbox: () => inboxState.current,
    useInvalidateDeveloper: () => inboxState.invalidate,
}));

vi.mock('../../hooks/useAdminNames', () => ({
    useAdminNames: (uids: string[]) => Object.fromEntries(uids.map((uid) => [uid, uid === 'owner1' ? '@maria' : uid])),
}));

import { PendingInboxTab } from './PendingInboxTab';

const NOW = Date.now();

const item = (queue: QueueKey, id: string, overrides: Partial<InboxItem> = {}): InboxItem => ({
    key: `${queue}:${id}`,
    id,
    queue,
    status: 'pending',
    emoji: '🏪',
    title: `Título ${id}`,
    subtitle: `Subtítulo ${id}`,
    placeId: null,
    placeName: null,
    userId: null,
    createdAtMs: NOW - 2 * HOUR_MS,
    ageLevel: 'fresh',
    urgent: false,
    badges: [],
    target: { tab: queue === 'businessClaims' ? 'businessClaims' : 'reports', view: 'pending', focus: id },
    searchText: id,
    data: {},
    ...overrides,
});

const group = (key: InboxGroup['key'], items: InboxItem[], overrides: Partial<InboxGroup> = {}): InboxGroup => ({
    key,
    emoji: '🏪',
    title: `Grupo ${key}`,
    items,
    total: items.length,
    oldestMs: items.length ? Math.min(...items.map((entry) => entry.createdAtMs)) : null,
    hasMore: false,
    degraded: false,
    error: null,
    target: { tab: key === 'businessClaims' ? 'businessClaims' : 'reports', view: 'pending' },
    ...overrides,
});

const emptyGroups = (): InboxGroup[] => (['urgentReports', 'reports', 'businessClaims', 'itemProposals', 'sponsoredPlacements', 'sponsoredItemSpotlights'] as const)
    .map((key) => group(key, []));

const inbox = (overrides: Partial<DeveloperInbox> = {}): DeveloperInbox => ({
    fetchedAt: NOW,
    groups: emptyGroups(),
    attention: [
        { key: 'planExpiring', emoji: '⏳', title: 'Business Pro que caduca en 14 días o menos', items: [], error: null, informative: false },
        { key: 'billing', emoji: '💳', title: 'Pagos con problema', items: [], error: null, informative: false },
        { key: 'campaignOverdue', emoji: '🧹', title: 'Campañas vencidas sin cerrar', items: [], error: null, informative: false },
        { key: 'campaignEndingSoon', emoji: '📅', title: 'Terminan en 3 días o menos', items: [], error: null, informative: true },
    ],
    followUp: {
        betaLeads: 0,
        checkoutsStarted: 0,
        betaTarget: { tab: 'plans', view: 'beta' },
        checkoutsTarget: { tab: 'plans', view: 'attention' },
    },
    summary: { toReview: 0, urgent: 0, attention: 0, oldestMs: null },
    degraded: false,
    errors: [],
    ...overrides,
});

const setInbox = (data: DeveloperInbox | undefined, extra: Record<string, unknown> = {}) => {
    inboxState.current = { data, isFetching: false, isError: false, error: null, dataUpdatedAt: data ? NOW - 60 * 1000 : 0, ...extra };
};

beforeEach(() => {
    inboxState.invalidate.mockReset();
});

describe('PendingInboxTab', () => {
    it('sin nada pendiente muestra «Todo al día» y el resumen de Atención', () => {
        const data = inbox();
        data.attention[0].items = [{
            key: 'planExpiring:p1',
            id: 'p1',
            kind: 'planExpiring',
            emoji: '⏳',
            title: 'Bar Pepe',
            subtitle: 'Prueba (beta) · caduca el 14/10 (en 8 d)',
            dateMs: NOW + 8 * DAY_MS,
            placeId: 'p1',
            target: { tab: 'plans', view: 'attention', focus: 'p1' },
            data: {},
        }];
        data.summary.attention = 1;
        setInbox(data);
        const goToTab = vi.fn();
        render(<PendingInboxTab goToTab={goToTab} enabled />);

        expect(screen.getByText('Todo al día. No hay nada pendiente')).toBeInTheDocument();
        expect(screen.getByText('Atención', { selector: 'span' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Gestionar →' }));
        expect(goToTab).toHaveBeenCalledWith('plans', { view: 'attention', status: undefined, focus: 'p1' });
    });

    it('pinta los grupos con 5 filas, «Ver N más» y los avisos de solicitudes', () => {
        const claims = Array.from({ length: 7 }, (_, index) => item('businessClaims', `c${index}`, {
            createdAtMs: NOW - (7 - index) * DAY_MS,
            badges: index === 0 ? [
                { emoji: '⚠️', text: 'Ya verificado · propietario', tone: 'warning', userId: 'owner1' },
                { emoji: '👥', text: '2 solicitudes para este lugar', tone: 'warning' },
            ] : [],
        }));
        const urgent = item('reports', 'r1', { urgent: true, emoji: '🧒', title: '«Lista Bares Centro»' });
        const data = inbox({
            groups: emptyGroups().map((entry) => {
                if (entry.key === 'businessClaims') return group('businessClaims', claims, { total: 9, title: 'Solicitudes de negocio' });
                if (entry.key === 'urgentReports') return group('urgentReports', [urgent], { title: 'Reportes urgentes' });
                return entry;
            }),
            summary: { toReview: 10, urgent: 1, attention: 0, oldestMs: NOW - 7 * DAY_MS },
        });
        setInbox(data);
        const goToTab = vi.fn();
        render(<PendingInboxTab goToTab={goToTab} enabled />);

        expect(screen.getByText('Por revisar').parentElement).toHaveTextContent('10');
        expect(screen.getByText('Más antigua').parentElement).toHaveTextContent('hace 7 d');

        const claimsSection = screen.getByRole('region', { name: 'Solicitudes de negocio' });
        expect(within(claimsSection).getAllByRole('button', { name: /^Revisar/ })).toHaveLength(5);
        expect(within(claimsSection).getByText('Ver 4 más →')).toBeInTheDocument();
        expect(within(claimsSection).getByText('@maria')).toBeInTheDocument();
        expect(within(claimsSection).getByText('2 solicitudes para este lugar')).toBeInTheDocument();

        fireEvent.click(within(claimsSection).getByRole('button', { name: 'Revisar Título c0' }));
        expect(goToTab).toHaveBeenCalledWith('businessClaims', { view: 'pending', status: undefined, focus: 'c0' });

        fireEvent.click(within(claimsSection).getByText('Ver todas →'));
        expect(goToTab).toHaveBeenLastCalledWith('businessClaims', { view: 'pending', status: undefined, focus: null });

        // Los urgentes van primero y en rojo.
        const regions = screen.getAllByRole('region');
        expect(regions[0]).toHaveAccessibleName('Reportes urgentes');
        expect(within(regions[0]).getByText('🚨')).toBeInTheDocument();
        expect(screen.queryByText('Todo al día. No hay nada pendiente')).not.toBeInTheDocument();
    });

    it('Seguimiento plegado con leads y checkouts', () => {
        const data = inbox();
        data.followUp.betaLeads = 6;
        data.followUp.checkoutsStarted = 2;
        setInbox(data);
        const goToTab = vi.fn();
        render(<PendingInboxTab goToTab={goToTab} enabled />);

        expect(screen.getByText('👋 6 leads beta sin local · 🛒 2 checkouts Pro sin terminar')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Ver leads →' }));
        expect(goToTab).toHaveBeenCalledWith('plans', { view: 'beta', status: undefined, focus: null });
    });

    it('Actualizar invalida todo lo de Developer y avisa de índices en construcción', () => {
        setInbox(inbox({ degraded: true, errors: ['Pagos con problema'] }));
        render(<PendingInboxTab goToTab={vi.fn()} enabled />);
        expect(screen.getByText('⚠️ Índice en construcción, orden aproximado')).toBeInTheDocument();
        expect(screen.getByText('⚠️ No se pudo cargar: Pagos con problema')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Actualizar/ }));
        expect(inboxState.invalidate).toHaveBeenCalledTimes(1);
    });

    it('sin permiso de jefe no consulta y lo explica', () => {
        setInbox(undefined);
        render(<PendingInboxTab goToTab={vi.fn()} enabled={false} />);
        expect(screen.getByText(/La bandeja necesita tus permisos de Developer/)).toBeInTheDocument();
    });

    it('mientras carga enseña un esqueleto', () => {
        setInbox(undefined, { isFetching: true });
        render(<PendingInboxTab goToTab={vi.fn()} enabled />);
        expect(screen.getByLabelText('Cargando la bandeja')).toBeInTheDocument();
    });
});
