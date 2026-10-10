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

const { confirmMock, setBusinessPlanMock, setUserPlanMock, grantCreditsMock } = vi.hoisted(() => ({
    confirmMock: vi.fn(),
    setBusinessPlanMock: vi.fn(),
    setUserPlanMock: vi.fn(),
    grantCreditsMock: vi.fn(),
}));

vi.mock('../../firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/firestore', async () => (await import('../../test/firestoreMock')).firestoreMock);
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => confirmMock }));
vi.mock('../../services/PlanAdminService', () => ({
    adminSetBusinessPlan: setBusinessPlanMock,
    adminSetUserPlan: setUserPlanMock,
}));
vi.mock('../../services/BusinessProService', () => ({ adminGrantSpotlightCredits: grantCreditsMock }));

import { PlansManagerTab } from './PlansManagerTab';
import { formatDate } from '../../utils/adminTime';
import type { DeveloperTabProps } from './developerTabs';

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const TRIAL_EXPIRES = NOW + 8 * DAY;

let places: Record<string, Record<string, unknown>>;
let navigateMock: ReturnType<typeof vi.fn<DeveloperTabProps['onNavigate']>>;

const placeDocs = (ids: string[]) => mockSnap(ids.filter((id) => places[id]).map((id) => mockDoc(id, places[id])));

const renderTab = (props: Partial<DeveloperTabProps> = {}) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <MemoryRouter>
            <QueryClientProvider client={client}>
                <PlansManagerTab onNavigate={navigateMock} {...props} />
            </QueryClientProvider>
        </MemoryRouter>,
    );
};

beforeEach(() => {
    resetFirestoreMock();
    navigateMock = vi.fn<DeveloperTabProps['onNavigate']>();
    confirmMock.mockReset().mockResolvedValue(true);
    setBusinessPlanMock.mockReset().mockResolvedValue({ ok: true, active: true, source: 'trial', expiresAt: new Date(NOW + 40 * DAY).toISOString() });
    setUserPlanMock.mockReset().mockResolvedValue({ ok: true, active: true, source: 'manual', expiresAt: null });
    grantCreditsMock.mockReset().mockResolvedValue({ balance: 70 });
    places = {
        'p-trial': {
            name: 'Bar Pepe',
            businessVerified: true,
            businessProActive: true,
            businessPlanSource: 'trial',
            businessPlanGrantedBy: 'beta',
            businessPlanNotes: 'Beta gratuita',
            businessPlanUpdatedAt: ts(NOW - 2 * DAY),
            businessPlanExpiresAt: ts(TRIAL_EXPIRES),
            spotlightCredits: 120,
        },
        'p-late': {
            name: 'Café Sol',
            businessVerified: true,
            businessProActive: true,
            businessPlanSource: 'stripe',
            businessBillingStatus: 'past_due',
            businessBillingUpdatedAt: ts(NOW - 4 * DAY),
            stripeSubscriptionId: 'sub_late',
        },
        'p-manual': {
            name: 'Asador Manolo',
            businessVerified: true,
            businessProActive: true,
            businessPlanSource: 'manual',
            businessPlanGrantedBy: 'u-ana',
            businessPlanNotes: 'Cortesía',
        },
        'p-stripe-nosub': {
            name: 'Taberna Sin Sub',
            businessVerified: true,
            businessProActive: true,
            businessPlanSource: 'stripe',
            businessBillingStatus: 'active',
        },
        'p-free': { name: 'Mesón Libre', businessVerified: true },
        'p-lejano': { name: 'Mesón Lejano', businessVerified: false },
    };
    firestoreMock.getDocs.mockImplementation(async (q: MockQuery) => {
        if (q.path === 'places') {
            if (whereOf(q, 'businessPlanExpiresAt')) return placeDocs(['p-trial']);
            const billing = whereOf(q, 'businessBillingStatus');
            if (billing?.op === 'in') return placeDocs(['p-late']);
            if (billing) return mockSnap([]);
            if (whereOf(q, 'businessProActive')) return placeDocs(['p-trial', 'p-late', 'p-manual', 'p-stripe-nosub']);
            if (whereOf(q, 'businessVerified')) return placeDocs(['p-trial', 'p-free']);
            if (whereOf(q, 'name')) return placeDocs(['p-lejano', 'p-free']);
        }
        if (q.path === 'planInterest') {
            return mockSnap([
                mockDoc('business_pro_place_p-trial', { plan: 'business_pro', billing: 'yearly', placeId: 'p-trial', placeName: 'Bar Pepe', userId: 'u-juan', clicks: 2, lastAt: ts(NOW - DAY), trialGrantedAt: ts(NOW - 80 * DAY), trialExpiresAt: ts(TRIAL_EXPIRES) }),
                mockDoc('business_pro_user_u-eva', { plan: 'business_pro', billing: 'monthly', placeId: null, userId: 'u-eva', lastAt: ts(NOW - 2 * DAY) }),
            ]);
        }
        return mockSnap([]);
    });
    firestoreMock.getDoc.mockImplementation(async (ref: { path: string; id: string }) => {
        const [collectionName, id] = ref.path.split('/');
        if (collectionName === 'places' && places[id]) return mockDoc(id, places[id]);
        if (collectionName === 'users') return mockDoc(id, { displayName: id === 'u-ana' ? 'Ana' : 'Juan' });
        return missingDoc(id);
    });
    firestoreMock.getCountFromServer.mockImplementation(async (q: MockQuery) => {
        if (q.path === 'places' && whereOf(q, 'businessPlanSource')) return countSnap(7);
        if (q.path === 'places' && whereOf(q, 'businessPlanGrantedBy')) return countSnap(4);
        if (q.path === 'places' && whereOf(q, 'businessProActive')) return countSnap(4);
        return countSnap(2);
    });
});

afterEach(() => {
    cleanup();
});

const findRow = (placeId: string) => waitFor(() => {
    const element = document.getElementById(`plan-place-${placeId}`);
    expect(element).not.toBeNull();
    return element as HTMLElement;
});

const drawer = () => screen.getByRole('dialog');

const getDocsPaths = () => firestoreMock.getDocs.mock.calls.map(([q]) => (q as MockQuery).path);

describe('PlansManagerTab', () => {
    it('abre en «Atención» con lo que caduca, los pagos con problema y los segmentos con contador', async () => {
        renderTab();
        const row = await findRow('p-trial');
        expect(within(row).getByText(`Pro · Prueba (beta) · hasta ${formatDate(TRIAL_EXPIRES)}`)).toBeInTheDocument();
        expect(within(row).getByText(/Caduca el/)).toBeInTheDocument();
        expect(within(row).getByRole('button', { name: '⏩ Extender' })).toBeInTheDocument();
        expect(within(row).getByRole('button', { name: '♾️ Pasar a indefinido' })).toBeInTheDocument();
        expect(within(row).getByText('“Beta gratuita”')).toBeInTheDocument();

        const late = await findRow('p-late');
        expect(within(late).getByText(/Stripe: pago atrasado desde el/)).toBeInTheDocument();
        expect(screen.getByText('✨ No hay checkouts a medias.')).toBeInTheDocument();

        const attentionTab = screen.getByRole('tab', { name: /Atención/ });
        expect(attentionTab).toHaveTextContent('2');
        await waitFor(() => expect(screen.getByRole('tab', { name: /Pro activos/ })).toHaveTextContent('4'));

        // La beta no se carga hasta abrir su segmento.
        expect(getDocsPaths()).not.toContain('planInterest');

        fireEvent.click(screen.getByRole('tab', { name: /Pro activos/ }));
        expect(navigateMock).toHaveBeenCalledWith({ view: 'pro', status: '', focus: null });
    });

    it('«⏩ Extender» abre el panel con la nota actual y cuenta desde la caducidad', async () => {
        renderTab();
        const row = await findRow('p-trial');
        fireEvent.click(within(row).getByRole('button', { name: '⏩ Extender' }));

        const panel = drawer();
        expect(within(panel).getByRole('heading', { name: /Bar Pepe/ })).toBeInTheDocument();
        expect(within(panel).getByRole('combobox')).toHaveValue('1m');
        // De vuelta a su tarjeta en Gestor negocios (equipo y solicitud de origen).
        expect(within(panel).getByRole('link', { name: '🏢 Gestor negocios →' }))
            .toHaveAttribute('href', '/developer?tab=businessManagers&focus=p-trial');
        const note = within(panel).getByPlaceholderText('Prueba interna, cortesía, prensa...');
        expect(note).toHaveValue('Beta gratuita');

        fireEvent.click(within(panel).getByRole('button', { name: '⏩ Guardar nueva fecha' }));

        await waitFor(() => expect(setBusinessPlanMock).toHaveBeenCalledTimes(1));
        expect(confirmMock.mock.calls[0][0].message).toContain('Nota: “Beta gratuita”.');
        const input = setBusinessPlanMock.mock.calls[0][0];
        const expected = new Date(TRIAL_EXPIRES);
        expected.setMonth(expected.getMonth() + 1);
        expect(input).toMatchObject({ placeId: 'p-trial', active: true, notes: 'Beta gratuita' });
        expect(new Date(input.expiresAt).getTime()).toBe(expected.getTime());

        expect(await within(panel).findByText(/Business Pro activo en Bar Pepe hasta el/)).toBeInTheDocument();
        await waitFor(() => expect(within(document.getElementById('plan-place-p-trial') as HTMLElement).getByRole('status')).toHaveTextContent('Business Pro activo'));
    });

    it('al quitar Pro se manda la nota actual para no perderla', async () => {
        renderTab({ view: 'pro' });
        const row = await findRow('p-manual');
        fireEvent.click(within(row).getByRole('button', { name: '⚙️ Gestionar' }));
        const panel = drawer();
        fireEvent.click(within(panel).getByRole('button', { name: '🚫 Quitar Pro' }));

        await waitFor(() => expect(setBusinessPlanMock).toHaveBeenCalledWith({ placeId: 'p-manual', active: false, notes: 'Cortesía' }));
        expect(confirmMock.mock.calls[0][0]).toMatchObject({ title: '🚫 ¿Quitar Business Pro a Asador Manolo?', destructive: true });
        expect(confirmMock.mock.calls[0][0].message).toContain('“Cortesía”');
    });

    it('«lo gestiona Stripe» solo con stripeSubscriptionId (como el backend)', async () => {
        renderTab({ view: 'pro' });
        fireEvent.click(within(await findRow('p-late')).getByRole('button', { name: '⚙️ Gestionar' }));
        expect(within(drawer()).getByText(/Lo gestiona Stripe/)).toBeInTheDocument();
        expect(within(drawer()).queryByRole('button', { name: '🚫 Quitar Pro' })).toBeNull();
        fireEvent.click(within(drawer()).getByRole('button', { name: 'Cerrar' }));

        fireEvent.click(within(await findRow('p-stripe-nosub')).getByRole('button', { name: '⚙️ Gestionar' }));
        expect(within(drawer()).queryByText(/Lo gestiona Stripe/)).toBeNull();
        expect(within(drawer()).getByRole('button', { name: '🚫 Quitar Pro' })).toBeEnabled();
    });

    it('impulsos: confirma la cantidad exacta y el signo y habla de saldo total', async () => {
        renderTab();
        fireEvent.click(within(await findRow('p-trial')).getByRole('button', { name: '⚙️ Gestionar' }));
        const panel = drawer();
        fireEvent.change(within(panel).getByPlaceholderText('100 o -50'), { target: { value: '-50' } });
        fireEvent.click(within(panel).getByRole('button', { name: '➖ Retirar 50 impulsos' }));

        await waitFor(() => expect(grantCreditsMock).toHaveBeenCalledWith('p-trial', -50, undefined));
        expect(confirmMock.mock.calls[0][0]).toMatchObject({
            title: '➖ ¿Retirar 50 impulsos a Bar Pepe?',
            message: 'Saldo total ahora: 120 impulsos. Después: 70 impulsos.',
            destructive: true,
        });
        expect(await within(panel).findByText('⚡ Hecho. Saldo total de Bar Pepe: 70 impulsos (regalados y comprados).')).toBeInTheDocument();
    });

    it('no hace nada si se cancela la confirmación', async () => {
        confirmMock.mockResolvedValue(false);
        renderTab();
        fireEvent.click(within(await findRow('p-trial')).getByRole('button', { name: '⚙️ Gestionar' }));
        const panel = drawer();
        fireEvent.change(within(panel).getByPlaceholderText('100 o -50'), { target: { value: '100' } });
        fireEvent.click(within(panel).getByRole('button', { name: '🎁 Regalar 100 impulsos' }));
        await waitFor(() => expect(confirmMock).toHaveBeenCalled());
        expect(grantCreditsMock).not.toHaveBeenCalled();
    });

    it('busca locales fuera de lo cargado (prefijo de nombre) y deja gestionarlos', async () => {
        renderTab({ view: 'verified' });
        await findRow('p-free');
        expect(document.getElementById('plan-place-p-trial')).toBeNull();

        fireEvent.change(screen.getByPlaceholderText('Nombre, dirección o id del local'), { target: { value: 'Mesón' } });
        const lejano = await findRow('p-lejano');
        expect(within(lejano).getByText('❔ Sin verificar')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: '🔎 En el servidor' })).toBeInTheDocument();
        fireEvent.click(within(lejano).getByRole('button', { name: '⚙️ Gestionar' }));
        expect(within(drawer()).getByRole('button', { name: '✨ Activar Pro' })).toBeInTheDocument();
    });

    it('el foco fija arriba un local que no está en la lista', async () => {
        renderTab({ view: 'attention', focusId: 'p-manual' });
        expect(await screen.findByRole('heading', { name: '📌 Local enlazado' })).toBeInTheDocument();
        const row = await findRow('p-manual');
        expect(row.className).toContain('ring-1');
    });

    it('Beta: carga solo al abrir el segmento y cuenta las pruebas en los locales', async () => {
        renderTab({ view: 'beta' });
        expect(await screen.findByText('Business Pro en prueba ahora')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText('7')).toBeInTheDocument());
        expect(screen.getByText('4 de la beta · 2 pruebas de la beta concedidas en total')).toBeInTheDocument();
        const link = await screen.findByRole('link', { name: 'Bar Pepe' });
        expect(link).toHaveAttribute('href', '/place/p-trial');
        expect(screen.getByText('👋 Sin local verificado')).toBeInTheDocument();
        expect(getDocsPaths()).toContain('planInterest');

        fireEvent.click(screen.getAllByRole('button', { name: '⚙️ Plan' })[0]);
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
        expect(within(drawer()).getByRole('heading', { name: /Bar Pepe/ })).toBeInTheDocument();
    });

    it('Premium usuarios: lista completa y el filtro de estado va a la URL en Historial', async () => {
        firestoreMock.getDocs.mockImplementation(async (q: MockQuery) => {
            if (q.path === 'users') {
                return mockSnap([
                    mockDoc('u-1', { username: 'ana', premium: { active: true, source: 'manual', grantedBy: 'u-ana', notes: 'Equipo' } }),
                    mockDoc('u-2', { username: 'leo', premium: { active: true, source: 'trial', grantedBy: 'beta', expiresAt: ts(NOW + 5 * DAY) } }),
                ]);
            }
            return mockSnap([]);
        });
        const { unmount } = renderTab({ view: 'premium' });
        expect(await screen.findByText('@ana')).toBeInTheDocument();
        expect(screen.getByText('@leo')).toBeInTheDocument();
        expect(screen.getByText(`Premium · Prueba (beta) · hasta ${formatDate(NOW + 5 * DAY)}`)).toBeInTheDocument();
        const premiumQuery = firestoreMock.getDocs.mock.calls.map(([q]) => q as MockQuery).find((q) => q.path === 'users') as MockQuery;
        expect(whereOf(premiumQuery, 'premium.active')).toMatchObject({ op: '==', value: true });
        unmount();

        renderTab({ view: 'history', status: 'impulses' });
        expect(await screen.findByText('🗂️ Todavía no hay cambios de este tipo.')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: '💶 Compras de impulsos' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Premium/ }));
        expect(navigateMock).toHaveBeenCalledWith({ status: 'premium', focus: null });
    });
});
