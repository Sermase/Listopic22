import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DeveloperTabProps, GoToTab } from '../components/developer/developerTabs';

const state = vi.hoisted(() => ({
    jefeStatus: 'ready' as string,
    countsEnabled: [] as boolean[],
    tabProps: {} as Record<string, unknown>,
}));

vi.mock('../firebase', () => ({ db: {}, functions: {}, storage: {} }));
vi.mock('firebase/firestore', async () => ({
    ...(await import('../test/firestoreMock')).firestoreMock,
    getDocFromServer: vi.fn(),
    setDoc: vi.fn(),
    deleteDoc: vi.fn(),
    onSnapshot: vi.fn(() => () => undefined),
}));
vi.mock('firebase/functions', () => ({ getFunctions: vi.fn(), httpsCallable: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'jefe1' }, isJefe: true, loading: false }) }));
vi.mock('../hooks/useJefeClaim', () => ({ useJefeClaim: () => ({ status: state.jefeStatus, error: null }) }));
vi.mock('../hooks/useUserProfile', () => ({ useUserProfile: () => ({ profile: null, loading: false }) }));
vi.mock('../services/PlaceService', () => ({ PlaceService: {} }));
vi.mock('../config/badgePresets', () => ({ BADGE_PRESET_PACKS: [] }));
vi.mock('../lib/queryCache', () => ({ invalidateDoc: vi.fn() }));
vi.mock('../hooks/useDeveloperInbox', () => ({
    useDeveloperPendingCounts: (enabled: boolean) => {
        state.countsEnabled.push(enabled);
        return {
            data: enabled ? {
                toReview: 5,
                badges: {
                    pending: { review: 5, attention: 2 },
                    reports: { review: 1, attention: 0 },
                    businessClaims: { review: 4, attention: 0 },
                    plans: { review: 0, attention: 2 },
                    proProposals: { review: 0, attention: 0 },
                },
            } : undefined,
        };
    },
}));

const tabStub = (name: string) => (props: DeveloperTabProps) => {
    state.tabProps[name] = props;
    return (
        <div data-testid={`tab-${name}`}>
            <button type="button" onClick={() => props.onNavigate({ view: 'resolved', status: 'approved' })}>nav-{name}</button>
            <button type="button" onClick={() => props.onNavigate({ focus: null })}>unfocus-{name}</button>
        </div>
    );
};

vi.mock('../components/developer/PendingInboxTab', () => ({
    PendingInboxTab: ({ goToTab, enabled }: { goToTab: GoToTab; enabled: boolean }) => (
        <div data-testid="tab-pending" data-enabled={String(enabled)}>
            <button type="button" onClick={() => goToTab('proProposals', { view: 'inbox', focus: 'p1' })}>go-pro</button>
        </div>
    ),
}));
vi.mock('../components/developer/ReportsTab', () => ({ ReportsTab: tabStub('reports') }));
vi.mock('../components/developer/BusinessClaimsManagerTab', () => ({ BusinessClaimsManagerTab: tabStub('businessClaims') }));
vi.mock('../components/developer/ProProposalsTab', () => ({ ProProposalsTab: tabStub('proProposals') }));
vi.mock('../components/developer/PlansManagerTab', () => ({ PlansManagerTab: tabStub('plans') }));
vi.mock('../components/developer/BusinessManagersTab', () => ({ BusinessManagersTab: tabStub('businessManagers') }));

import { DeveloperPage } from './DeveloperPage';

const LocationProbe: React.FC = () => {
    const location = useLocation();
    return <output data-testid="location">{location.search}</output>;
};

const renderPage = (entry = '/developer') => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={[entry]}>
                <DeveloperPage />
                <LocationProbe />
            </MemoryRouter>
        </QueryClientProvider>,
    );
};

const search = () => screen.getByTestId('location').textContent;

beforeEach(() => {
    state.jefeStatus = 'ready';
    state.countsEnabled = [];
    state.tabProps = {};
});

describe('DeveloperPage', () => {
    it('sin ?tab= abre la bandeja Pendientes, con contadores en la barra lateral', async () => {
        renderPage();
        expect(await screen.findByTestId('tab-pending')).toHaveAttribute('data-enabled', 'true');
        expect(screen.getByRole('button', { name: /Solicitudes negocio.*4 por revisar/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Planes.*2 piden atención/ })).toBeInTheDocument();
        expect(state.countsEnabled.every(Boolean)).toBe(true);
    });

    it('espera al claim de jefe para contar', async () => {
        state.jefeStatus = 'error';
        renderPage();
        expect(await screen.findByTestId('tab-pending')).toHaveAttribute('data-enabled', 'false');
        expect(state.countsEnabled.length).toBeGreaterThan(0);
        expect(state.countsEnabled.some(Boolean)).toBe(false);
    });

    it('el enlace del email (?tab=businessClaims&claimId=) llega como focusId', async () => {
        renderPage('/developer?tab=businessClaims&claimId=u1_p1');
        await screen.findByTestId('tab-businessClaims');
        expect(state.tabProps.businessClaims).toMatchObject({ focusId: 'u1_p1', view: null, status: null });
    });

    it('?tab=reports (notificación new_report) abre Reportes y onNavigate escribe en la URL', async () => {
        renderPage('/developer?tab=reports&focus=r1');
        await screen.findByTestId('tab-reports');
        expect(state.tabProps.reports).toMatchObject({ focusId: 'r1' });
        fireEvent.click(screen.getByText('nav-reports'));
        expect(search()).toBe('?tab=reports&focus=r1&view=resolved&status=approved');
        expect(state.tabProps.reports).toMatchObject({ focusId: 'r1', view: 'resolved', status: 'approved' });
        fireEvent.click(screen.getByText('unfocus-reports'));
        expect(search()).toBe('?tab=reports&view=resolved&status=approved');
    });

    it('la barra lateral y goToTab cambian de pestaña descartando los parámetros de la anterior', async () => {
        renderPage('/developer?tab=reports&view=resolved&focus=r1');
        await screen.findByTestId('tab-reports');
        fireEvent.click(screen.getByRole('button', { name: /^Pendientes/ }));
        await screen.findByTestId('tab-pending');
        expect(search()).toBe('?tab=pending');

        await act(async () => {
            fireEvent.click(screen.getByText('go-pro'));
        });
        await screen.findByTestId('tab-proProposals');
        expect(search()).toBe('?tab=proProposals&view=inbox&focus=p1');
        expect(state.tabProps.proProposals).toMatchObject({ view: 'inbox', focusId: 'p1' });
    });

    it('una pestaña desconocida cae en Pendientes', async () => {
        renderPage('/developer?tab=console2');
        expect(await screen.findByTestId('tab-pending')).toBeInTheDocument();
    });
});
