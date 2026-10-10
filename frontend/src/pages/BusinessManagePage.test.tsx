import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

// Carcasa de la gestión del negocio (spec §4): cabecera, pestañas con la URL
// como fuente de verdad, aviso de cambios sin guardar, carga y error.

const mocks = vi.hoisted(() => ({
    getDoc: vi.fn(),
    getInfo: vi.fn(),
    getVisual: vi.fn(),
    fichaProps: [] as Array<Record<string, unknown>>,
    flags: { enforced: true },
}));

vi.mock('../firebase', () => ({ auth: {}, db: {}, functions: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({
    doc: () => ({}),
    getDoc: (...args: unknown[]) => mocks.getDoc(...args),
}));
vi.mock('../config/features', () => ({
    get BUSINESS_PRO_ENFORCED() {
        return mocks.flags.enforced;
    },
    BUSINESS_PRO_CHECKOUT_ENABLED: false,
}));
vi.mock('../services/BusinessInfoService', () => ({
    getBusinessInfoForManager: (...args: unknown[]) => mocks.getInfo(...args),
}));
vi.mock('../services/BusinessProService', () => ({
    getBusinessVisual: (...args: unknown[]) => mocks.getVisual(...args),
}));
vi.mock('../services/BusinessBillingService', () => ({ createBusinessProCheckoutSession: vi.fn() }));
vi.mock('../services/PlanInterestService', () => ({ registerPlanInterest: vi.fn(), describePlanInterestResult: () => '' }));

// Las pestañas tienen sus propios tests: aquí solo importa cuál se monta.
vi.mock('../components/business/BusinessProSections', () => ({
    BusinessVisualSection: (props: { onSaved?: (data: { heroImageUrl: string }) => void }) => (
        <div data-testid="tab-visual">
            <button type="button" onClick={() => props.onSaved?.({ heroImageUrl: 'https://img/new-hero.jpg' })}>publicar portada</button>
        </div>
    ),
    BusinessItemsSection: (props: { placeName?: string; placeTypes?: string[] }) => (
        <div data-testid="tab-items">{props.placeName} · {props.placeTypes?.join(',')}</div>
    ),
    BusinessSponsoredSection: () => <div data-testid="tab-sponsored" />,
    BusinessStatsSection: () => <div data-testid="tab-stats" />,
}));
vi.mock('../components/business/info', async () => {
    const React = await import('react');
    const { useReportDirty } = await import('../components/business/kit');
    const { useSearchParams } = await import('react-router-dom');
    const BusinessInfoTab = (props: { onGoToTab?: (tab: 'items') => void } & Record<string, unknown>) => {
        mocks.fichaProps.push(props);
        const [dirty, setDirty] = React.useState(false);
        const [, setSearchParams] = useSearchParams();
        useReportDirty('ficha', dirty, '🐾 Mascotas', () => setDirty(false));
        return (
            <div data-testid="tab-ficha">
                <button type="button" onClick={() => setDirty(true)}>ensuciar</button>
                <button type="button" onClick={() => props.onGoToTab?.('items')}>ir a la carta</button>
                {/* Un enlace que solo cambia ?tab= (sin pasar por la página). */}
                <button type="button" onClick={() => setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('tab', 'items'); return next; })}>
                    enlace a la carta
                </button>
            </div>
        );
    };
    return {
        BusinessInfoTab,
        fichaPlaceInfoFromDoc: (data: Record<string, unknown> | null | undefined) => ({ name: data?.name }),
    };
});

import { ToastProvider } from '../context/ToastContext';
import { ConfirmProvider } from '../context/ConfirmContext';
import { BusinessManagePage } from './BusinessManagePage';

const INFO = { sections: {} };
const FREE_PLACE = { name: 'Casa Pepe', address: 'C/ Mayor 3, Valencia', types: ['restaurant', 'bar'], mainImageUrl: 'https://img/main.jpg' };
const PRO_PLACE = {
    ...FREE_PLACE,
    businessProActive: true,
    businessPlanSource: 'trial',
    businessPlanExpiresAt: { toDate: () => new Date(2099, 10, 12) },
};

const placeSnap = (data: Record<string, unknown>) => ({ exists: () => true, data: () => data });

const LocationProbe = () => <span data-testid="search">{useLocation().search}</span>;
const search = () => new URLSearchParams(screen.getByTestId('search').textContent || '');

const renderPage = (url = '/businesses/P1/manage') => render(
    <MemoryRouter initialEntries={[url]}>
        <ToastProvider>
            <ConfirmProvider>
                <Routes>
                    <Route path="/businesses/:placeId/manage" element={<><BusinessManagePage /><LocationProbe /></>} />
                    <Route path="/businesses" element={<p>Lista de negocios</p>} />
                    <Route path="/place/:placeId" element={<p>Ficha pública</p>} />
                </Routes>
            </ConfirmProvider>
        </ToastProvider>
    </MemoryRouter>,
);

const tab = (name: string | RegExp) => screen.getByRole('tab', { name });
const lastFichaProps = () => mocks.fichaProps[mocks.fichaProps.length - 1];

describe('BusinessManagePage', () => {
    beforeEach(() => {
        mocks.flags.enforced = true;
        mocks.fichaProps.length = 0;
        mocks.getDoc.mockReset().mockResolvedValue(placeSnap(FREE_PLACE));
        mocks.getInfo.mockReset().mockResolvedValue(INFO);
        mocks.getVisual.mockReset().mockResolvedValue({ heroImageUrl: '' });
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('mientras carga deja ver las pestañas y esqueletos; luego la cabecera y la Ficha', async () => {
        let resolveInfo: (value: unknown) => void = () => undefined;
        mocks.getInfo.mockReturnValue(new Promise((resolve) => { resolveInfo = resolve; }));
        renderPage();

        const tablist = screen.getByRole('tablist', { name: 'Gestión del negocio' });
        expect(within(tablist).getAllByRole('tab').map((node) => node.textContent)).toEqual(['📝Ficha', '🎨Imagen', '📖Carta', '📣Promos', '📊Estadísticas']);
        expect(tab('Ficha')).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('status')).toHaveTextContent('Cargando la gestión del negocio');
        expect(screen.queryByTestId('tab-ficha')).not.toBeInTheDocument();

        await act(async () => resolveInfo(INFO));

        expect(screen.getByRole('heading', { level: 1, name: 'Casa Pepe' })).toBeInTheDocument();
        expect(screen.getByText('C/ Mayor 3, Valencia')).toBeInTheDocument();
        expect(screen.getByText('Verificado')).toBeInTheDocument();
        expect(screen.getByText('Plan gratuito')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Ver mi ficha/ })).toHaveAttribute('href', '/place/P1');
        expect(screen.getByText('Lo que guardes aquí se muestra en lugar de lo que dice Google.')).toBeInTheDocument();
        expect(screen.getByTestId('tab-ficha')).toBeInTheDocument();
        expect(lastFichaProps()).toMatchObject({ placeId: 'P1', initialInfo: INFO, place: { name: 'Casa Pepe' } });
    });

    it('sin Pro y con el capado activo, las pestañas Pro llevan 🔒 y abren su propio aviso', async () => {
        renderPage();
        await screen.findByTestId('tab-ficha');

        expect(tab('Ficha')).toBeInTheDocument();
        for (const name of ['Imagen', 'Carta', 'Promos', 'Estadísticas']) {
            expect(tab(new RegExp(`${name}.*Requiere Business Pro`))).toBeInTheDocument();
        }
        expect(screen.getByRole('button', { name: /Probar Business Pro/ })).toBeInTheDocument();

        fireEvent.click(tab(/Imagen/));
        await waitFor(() => expect(search().get('tab')).toBe('visual'));
        expect(await screen.findByRole('heading', { name: 'Tu escaparate es de Business Pro' })).toBeInTheDocument();
        expect(screen.getByText('Tu portada, tu color y tu frase')).toBeInTheDocument();
        expect(screen.queryByTestId('tab-visual')).not.toBeInTheDocument();
    });

    it('el botón «Probar Business Pro» abre el aviso en un modal, sin navegar', async () => {
        renderPage();
        await screen.findByTestId('tab-ficha');

        fireEvent.click(screen.getByRole('button', { name: /Probar Business Pro/ }));
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByRole('heading', { name: 'Haz que tu local destaque' })).toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: /Pruébalo gratis 90 días/ })).toBeInTheDocument();
        expect(screen.getByTestId('tab-ficha')).toBeInTheDocument();
    });

    it('con Pro: chip «Business Pro» con el periodo, portada de Business Pro y sin candados', async () => {
        mocks.getDoc.mockResolvedValue(placeSnap(PRO_PLACE));
        mocks.getVisual.mockResolvedValue({ heroImageUrl: 'https://img/hero.jpg' });
        const { container } = renderPage();
        await screen.findByTestId('tab-ficha');

        expect(screen.getByText('Business Pro')).toBeInTheDocument();
        expect(screen.getByText('Periodo de prueba hasta 12/11/2099')).toBeInTheDocument();
        expect(screen.queryByText('Plan gratuito')).not.toBeInTheDocument();
        expect(screen.queryByText(/Requiere Business Pro/)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Probar Business Pro/ })).not.toBeInTheDocument();
        await waitFor(() => expect(container.querySelector('header img')).toHaveAttribute('src', 'https://img/hero.jpg'));

        fireEvent.click(tab('Imagen'));
        expect(await screen.findByTestId('tab-visual')).toBeInTheDocument();
        fireEvent.click(tab('Carta'));
        expect(await screen.findByTestId('tab-items')).toHaveTextContent('Casa Pepe · restaurant,bar');
    });

    it('en modo pruebas (sin capado) no hay candados, ni botón de prueba, ni portada Pro', async () => {
        mocks.flags.enforced = false;
        const { container } = renderPage('/businesses/P1/manage?tab=stats');
        expect(await screen.findByTestId('tab-stats')).toBeInTheDocument();
        expect(screen.queryByText(/Requiere Business Pro/)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Probar Business Pro/ })).not.toBeInTheDocument();
        expect(container.querySelector('header img')).toHaveAttribute('src', 'https://img/main.jpg');
        expect(mocks.getVisual).not.toHaveBeenCalled();
    });

    it('la URL manda: abre ?tab= y al cambiar conserva los demás parámetros (y quita ?sub= fuera de Promos)', async () => {
        mocks.getDoc.mockResolvedValue(placeSnap(PRO_PLACE));
        renderPage('/businesses/P1/manage?tab=sponsored&sub=ofertas&impulsos=ok&item=I1');
        expect(await screen.findByTestId('tab-sponsored')).toBeInTheDocument();
        expect(tab('Promos')).toHaveAttribute('aria-selected', 'true');

        fireEvent.click(tab('Carta'));
        await screen.findByTestId('tab-items');
        await waitFor(() => expect(search().get('tab')).toBe('items'));
        const params = search();
        expect(params.has('sub')).toBe(false);
        expect(params.get('impulsos')).toBe('ok');
        expect(params.get('item')).toBe('I1');
    });

    it('un ?tab= desconocido abre la Ficha', async () => {
        renderPage('/businesses/P1/manage?tab=nope');
        expect(await screen.findByTestId('tab-ficha')).toBeInTheDocument();
        expect(tab(/Ficha/)).toHaveAttribute('aria-selected', 'true');
    });

    it('pregunta antes de cambiar de pestaña si hay cambios sin guardar', async () => {
        mocks.getDoc.mockResolvedValue(placeSnap(PRO_PLACE));
        renderPage();
        await screen.findByTestId('tab-ficha');
        fireEvent.click(screen.getByRole('button', { name: 'ensuciar' }));

        fireEvent.click(tab('Imagen'));
        const dialog = await screen.findByRole('alertdialog');
        expect(dialog).toHaveTextContent('¿Salir sin guardar?');
        expect(dialog).toHaveTextContent('Perderás los cambios en 🐾 Mascotas.');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Seguir editando' }));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
        expect(screen.getByTestId('tab-ficha')).toBeInTheDocument();
        expect(search().get('tab')).toBeNull();

        fireEvent.click(tab('Imagen'));
        fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Salir' }));
        expect(await screen.findByTestId('tab-visual')).toBeInTheDocument();
        // La URL se actualiza justo después (React Router la cambia en una transición).
        await waitFor(() => expect(search().get('tab')).toBe('visual'));
    });

    it('si la URL cambia de ?tab= tras cargar, la pestaña la sigue pasando por el aviso de cambios sin guardar', async () => {
        mocks.getDoc.mockResolvedValue(placeSnap(PRO_PLACE));
        renderPage('/businesses/P1/manage?section=pets');
        await screen.findByTestId('tab-ficha');
        fireEvent.click(screen.getByRole('button', { name: 'ensuciar' }));

        fireEvent.click(screen.getByRole('button', { name: 'enlace a la carta' }));
        const dialog = await screen.findByRole('alertdialog');
        expect(dialog).toHaveTextContent('Perderás los cambios en 🐾 Mascotas.');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Seguir editando' }));
        // Se queda en la Ficha y la URL vuelve a la de la Ficha.
        await waitFor(() => expect(search().get('tab')).toBeNull());
        expect(search().get('section')).toBe('pets');
        expect(screen.getByTestId('tab-ficha')).toBeInTheDocument();
        expect(tab('Ficha')).toHaveAttribute('aria-selected', 'true');

        fireEvent.click(screen.getByRole('button', { name: 'enlace a la carta' }));
        fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Salir' }));
        expect(await screen.findByTestId('tab-items')).toBeInTheDocument();
        expect(tab('Carta')).toHaveAttribute('aria-selected', 'true');
        await waitFor(() => expect(search().has('section')).toBe(false));
        expect(search().get('tab')).toBe('items');
    });

    it('sin cambios pendientes, un ?tab= nuevo en la URL cambia de pestaña sin preguntar', async () => {
        mocks.getDoc.mockResolvedValue(placeSnap(PRO_PLACE));
        renderPage();
        await screen.findByTestId('tab-ficha');
        fireEvent.click(screen.getByRole('button', { name: 'enlace a la carta' }));
        expect(await screen.findByTestId('tab-items')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('al publicar una portada nueva en 🎨 Imagen, la miniatura de la cabecera se actualiza', async () => {
        mocks.getDoc.mockResolvedValue(placeSnap(PRO_PLACE));
        const { container } = renderPage('/businesses/P1/manage?tab=visual');
        await screen.findByTestId('tab-visual');
        await waitFor(() => expect(container.querySelector('header img')).toHaveAttribute('src', 'https://img/main.jpg'));
        fireEvent.click(screen.getByRole('button', { name: 'publicar portada' }));
        expect(container.querySelector('header img')).toHaveAttribute('src', 'https://img/new-hero.jpg');
    });

    it('«Ver mi ficha» también pregunta si hay cambios sin guardar', async () => {
        renderPage();
        await screen.findByTestId('tab-ficha');
        fireEvent.click(screen.getByRole('button', { name: 'ensuciar' }));

        fireEvent.click(screen.getByRole('link', { name: /Ver mi ficha/ }));
        fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Salir' }));
        expect(await screen.findByText('Ficha pública')).toBeInTheDocument();
    });

    it('la Ficha recibe lo ya cargado solo la primera vez; su atajo a la Carta quita ?section=', async () => {
        mocks.getDoc.mockResolvedValue(placeSnap(PRO_PLACE));
        renderPage('/businesses/P1/manage?section=pets');
        await screen.findByTestId('tab-ficha');
        expect(lastFichaProps().initialInfo).toBe(INFO);

        fireEvent.click(screen.getByRole('button', { name: 'ir a la carta' }));
        await screen.findByTestId('tab-items');
        await waitFor(() => expect(search().get('tab')).toBe('items'));
        expect(search().has('section')).toBe(false);

        fireEvent.click(tab('Ficha'));
        await screen.findByTestId('tab-ficha');
        // Al volver, la Ficha pide datos frescos en vez de reutilizar los de la primera carga.
        expect(lastFichaProps().initialInfo).toBeNull();
    });

    it('si falla la carga no enseña formularios y deja reintentar', async () => {
        mocks.getInfo.mockRejectedValueOnce(Object.assign(new Error('nope'), { code: 'permission-denied' }));
        renderPage();

        expect(await screen.findByRole('heading', { name: 'No pudimos abrir la gestión de este negocio' })).toBeInTheDocument();
        expect(screen.getByText('Comprueba que sigues siendo gestor o inténtalo de nuevo.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Mis negocios/ })).toHaveAttribute('href', '/businesses');
        expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
        expect(screen.queryByTestId('tab-ficha')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
        expect(await screen.findByTestId('tab-ficha')).toBeInTheDocument();
        expect(mocks.getInfo).toHaveBeenCalledTimes(2);
    });

    it('al volver de Stripe con ?checkout= avisa con un toast y limpia la URL', async () => {
        renderPage('/businesses/P1/manage?checkout=cancelled');
        expect(await screen.findByText('Pago cancelado')).toBeInTheDocument();
        expect(screen.getByText('No se ha cobrado nada.')).toBeInTheDocument();
        await waitFor(() => expect(search().has('checkout')).toBe(false));
    });
});
