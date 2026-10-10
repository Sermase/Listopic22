import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { CanonicalPlaceItem } from '../../../services/CanonicalItemService';
import type { BusinessOffer, ItemSpotlight, SponsoredPlacement } from '../../../services/BusinessProService';

vi.mock('../../../firebase', () => ({ auth: {}, db: {}, functions: {}, storage: {} }));

const service = vi.hoisted(() => ({
    getBusinessOffers: vi.fn(),
    saveBusinessOffer: vi.fn(),
    deleteBusinessOffer: vi.fn(),
    getPlaceSponsoredPlacements: vi.fn(),
    getPlaceItemSpotlights: vi.fn(),
    getPlaceSpotlightCredits: vi.fn(),
    getSpotlightPricing: vi.fn(),
    requestItemSpotlight: vi.fn(),
    requestSponsoredPlacement: vi.fn(),
}));
vi.mock('../../../services/BusinessProService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../services/BusinessProService')>()),
    ...service,
}));
const getPlaceItemsHealed = vi.hoisted(() => vi.fn());
vi.mock('../items/getPlaceItemsHealed', () => ({ getPlaceItemsHealed }));
vi.mock('../../../services/BusinessBillingService', () => ({ createImpulsePackCheckoutSession: vi.fn() }));
vi.mock('../../../lib/queryCache', () => ({
    getCachedDoc: vi.fn(async () => ({ name: 'Bar Pepe', address: 'C/ Mayor 3' })),
}));
const confirmMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../../../context/ConfirmContext', () => ({ useConfirm: () => confirmMock }));
const showToast = vi.hoisted(() => vi.fn());
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ showToast }) }));
const launchConfetti = vi.hoisted(() => vi.fn());
vi.mock('../kit', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../kit')>()),
    launchConfetti,
}));

import { DEFAULT_SPOTLIGHT_PRICING } from '../../../services/BusinessProService';
import { BusinessDirtyProvider, useLeaveGuard } from '../kit';
import { BusinessSponsoredSection } from './BusinessSponsoredSection';
import { saveSpotlightDraft } from './spotlightDraft';

const PLACE_ID = 'place-1';
const DAY = 86_400_000;
const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

const offer = (id: string, patch: Partial<BusinessOffer> = {}): BusinessOffer => ({
    id,
    title: '🍻 2x1 en cañas',
    description: '',
    conditions: '',
    ctaUrl: '',
    startsAt: '',
    endsAt: '',
    status: 'active',
    ...patch,
});

const placement = (id: string, patch: Partial<SponsoredPlacement> = {}): SponsoredPlacement => ({
    id,
    placeId: PLACE_ID,
    type: 'home',
    status: 'active',
    metrics: { impressions: 0, clicks: 0 },
    createdAtMs: 1,
    ...patch,
});

const croquetas: CanonicalPlaceItem = {
    id: 'croquetas',
    canonicalName: 'Croquetas caseras',
    status: 'active',
    businessData: { group: 'Entrantes', price: '9 €', available: true },
    stats: { reviewCount: 12, averageRating: 8.4, ratingCount: 12, ratingTotal: 100, photoCount: 0 },
};
const pulpo: CanonicalPlaceItem = {
    id: 'pulpo',
    canonicalName: 'Pulpo a feira',
    status: 'active',
    businessData: { group: 'Principales', available: false },
    stats: { reviewCount: 3, averageRating: 9, ratingCount: 3, ratingTotal: 27, photoCount: 0 },
};

const LocationProbe = () => <output data-testid="search">{useLocation().search}</output>;
const currentSearch = () => new URLSearchParams(screen.getByTestId('search').textContent || '');

const renderSection = (search = '?tab=sponsored') => {
    const user = userEvent.setup();
    render(
        <MemoryRouter initialEntries={[`/businesses/${PLACE_ID}/manage${search}`]}>
            <BusinessSponsoredSection placeId={PLACE_ID} />
            <LocationProbe />
        </MemoryRouter>,
    );
    return user;
};

const DirtyProbe = () => <output data-testid="dirty">{useLeaveGuard().dirtyLabels.join(' | ')}</output>;

describe('BusinessSponsoredSection', () => {
    beforeEach(() => {
        sessionStorage.clear();
        localStorage.clear();
        Object.values(service).forEach((fn) => fn.mockReset());
        getPlaceItemsHealed.mockReset().mockResolvedValue([croquetas, pulpo]);
        service.getBusinessOffers.mockResolvedValue([]);
        service.getPlaceSponsoredPlacements.mockResolvedValue([]);
        service.getPlaceItemSpotlights.mockResolvedValue([]);
        service.getPlaceSpotlightCredits.mockResolvedValue(340);
        service.getSpotlightPricing.mockResolvedValue(DEFAULT_SPOTLIGHT_PRICING);
        confirmMock.mockReset().mockResolvedValue(true);
        showToast.mockReset();
        launchConfetti.mockReset();
    });

    it('reports a half-written placement request as unsaved (leaving the tab asks first)', async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter initialEntries={[`/businesses/${PLACE_ID}/manage?tab=sponsored&sub=campanas`]}>
                <BusinessDirtyProvider>
                    <BusinessSponsoredSection placeId={PLACE_ID} />
                    <DirtyProbe />
                </BusinessDirtyProvider>
            </MemoryRouter>,
        );
        const message = await screen.findByLabelText(/Mensaje corto/);
        expect(screen.getByTestId('dirty').textContent).toBe('');
        await user.type(message, 'Ven a probar');
        await waitFor(() => expect(screen.getByTestId('dirty')).toHaveTextContent('🗺️ tu solicitud de portada o mapa'));
        await user.clear(message);
        await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe(''));
    });

    it('first visit with nothing created asks what to do and writes ?sub=', async () => {
        const user = renderSection();
        const picker = await screen.findByRole('radiogroup', { name: '¿Qué te apetece hacer hoy?' });
        expect(screen.getByText('⚡ 340')).toBeInTheDocument();
        await user.click(within(picker).getByRole('radio', { name: /Lanzar una promo/ }));
        expect(currentSearch().get('sub')).toBe('ofertas');
        expect(currentSearch().get('tab')).toBe('sponsored');
        expect(await screen.findByText('Aún no tienes ofertas')).toBeInTheDocument();
    });

    it('S2/S5: a failing offers load only breaks the offers panel', async () => {
        service.getBusinessOffers.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([offer('o1')]);
        service.getPlaceSponsoredPlacements.mockResolvedValue([placement('p1')]);
        const user = renderSection('?tab=sponsored&sub=ofertas');
        expect(await screen.findByText('No hemos podido cargar tus ofertas')).toBeInTheDocument();
        expect(screen.getByText('⚡ 340')).toBeInTheDocument();
        expect(screen.getByText('1 campaña en marcha')).toBeInTheDocument();
        expect(screen.queryByText(/ofertas en vivo|oferta en vivo/)).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Reintentar' }));
        expect(await screen.findByRole('article', { name: 'Oferta 2x1 en cañas' })).toBeInTheDocument();
        expect(screen.getByText('1 oferta en vivo')).toBeInTheDocument();
    });

    it('S3: shows the real status of each offer', async () => {
        service.getBusinessOffers.mockResolvedValue([
            offer('a', { title: 'A en vivo' }),
            offer('b', { title: 'B caducada', endsAt: isoDay(-2) }),
            offer('c', { title: 'C programada', startsAt: isoDay(3) }),
            offer('d', { title: 'D borrador', status: 'draft' }),
        ]);
        renderSection('?sub=ofertas');
        const card = async (name: string) => screen.findByRole('article', { name: `Oferta ${name}` });
        expect(within(await card('A en vivo')).getByText('En vivo')).toBeInTheDocument();
        expect(within(await card('B caducada')).getByText('Caducada')).toBeInTheDocument();
        expect(within(await card('C programada')).getByText('Programada')).toBeInTheDocument();
        expect(within(await card('D borrador')).getByText('Borrador')).toBeInTheDocument();
        expect(screen.getByText('4/20 ofertas')).toBeInTheDocument();
    });

    it('S4: creating from a template saves the cleaned offer and lists what the server stored', async () => {
        service.getBusinessOffers.mockResolvedValue([offer('z', { title: 'Zumo gratis' })]);
        service.saveBusinessOffer.mockImplementation(async (_placeId: string, data: BusinessOffer) => ({
            offerId: 'new-1',
            data: { ...data, ctaUrl: 'https://tuweb.com/' },
        }));
        const user = renderSection('?sub=ofertas');
        await user.click(await screen.findByRole('button', { name: 'Nueva oferta' }));
        const dialog = await screen.findByRole('dialog');
        await user.click(within(dialog).getByRole('radio', { name: 'Happy hour' }));
        expect(within(dialog).getByRole('textbox', { name: /Título/ })).toHaveValue('⏰ Happy hour de 18 a 20 h');
        await user.click(within(dialog).getByRole('button', { name: /No acumulable/ }));
        await user.type(within(dialog).getByRole('textbox', { name: /Enlace/ }), 'tuweb.com');
        await user.click(within(dialog).getByRole('button', { name: '🎁 Crear oferta' }));

        expect(service.saveBusinessOffer).toHaveBeenCalledWith(PLACE_ID, {
            title: '⏰ Happy hour de 18 a 20 h',
            description: '',
            conditions: 'No acumulable',
            ctaUrl: 'tuweb.com',
            startsAt: '',
            endsAt: '',
            status: 'active',
        }, undefined);
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        // Ordenadas por título, como las devuelve getBusinessOffers.
        const titles = screen.getAllByRole('article').map((node) => node.getAttribute('aria-label'));
        expect(titles).toEqual(['Oferta Happy hour de 18 a 20 h', 'Oferta Zumo gratis']);
        expect(screen.getByRole('article', { name: 'Oferta Happy hour de 18 a 20 h' })).toHaveTextContent('En vivo');
        expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '🎁 ¡Oferta creada!' }));
        expect(launchConfetti).toHaveBeenCalled();
    });

    it('the publish switch saves the whole offer with the new status', async () => {
        const stored = offer('o1', { description: 'Toda la tarde', conditions: 'Solo en barra' });
        service.getBusinessOffers.mockResolvedValue([stored]);
        service.saveBusinessOffer.mockImplementation(async (_placeId: string, data: BusinessOffer, id: string) => ({ offerId: id, data }));
        const user = renderSection('?sub=ofertas');
        const card = await screen.findByRole('article', { name: 'Oferta 2x1 en cañas' });
        await user.click(within(card).getByRole('switch', { name: 'Publicada' }));
        expect(service.saveBusinessOffer).toHaveBeenCalledWith(PLACE_ID, {
            title: '🍻 2x1 en cañas',
            description: 'Toda la tarde',
            conditions: 'Solo en barra',
            ctaUrl: '',
            startsAt: '',
            endsAt: '',
            status: 'draft',
        }, 'o1');
        expect(await within(card).findByText('Borrador')).toBeInTheDocument();
    });

    it('S11: deleting asks with useConfirm, never window.confirm', async () => {
        service.getBusinessOffers.mockResolvedValue([offer('o1')]);
        service.deleteBusinessOffer.mockResolvedValue(undefined);
        const nativeConfirm = vi.spyOn(window, 'confirm');
        const user = renderSection('?sub=ofertas');
        await user.click(await screen.findByRole('button', { name: 'Acciones de la oferta 2x1 en cañas' }));
        await user.click(screen.getByRole('menuitem', { name: '🗑️ Eliminar' }));
        expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ title: '¿Eliminar la oferta?', destructive: true }));
        expect(nativeConfirm).not.toHaveBeenCalled();
        await waitFor(() => expect(service.deleteBusinessOffer).toHaveBeenCalledWith(PLACE_ID, 'o1'));
        expect(await screen.findByText('Aún no tienes ofertas')).toBeInTheDocument();
        nativeConfirm.mockRestore();
    });

    it('?sub=plato&item= preselects the dish, blocks unavailable dishes and launches the spotlight', async () => {
        service.requestItemSpotlight.mockResolvedValue({ spotlightId: 'sp-1', impulses: 70, creditsUsed: 70, billedImpulses: 0, totalPriceEur: 0 });
        service.getPlaceItemSpotlights
            .mockResolvedValueOnce([])
            .mockResolvedValue([{
                id: 'sp-1', placeId: PLACE_ID, itemId: 'croquetas', itemName: 'Croquetas caseras', linkedListIds: [],
                itemAverageRating: 8.4, itemReviewCount: 12, center: null, radiusKm: 2, units: 1, days: 7, impulses: 70,
                status: 'requested', itemInactive: false, metrics: { impressions: 0, clicks: 0 }, createdAtMs: 5,
            } satisfies ItemSpotlight]);
        const user = renderSection('?tab=sponsored&sub=plato&item=croquetas');

        const dish = await screen.findByRole('button', { name: /Croquetas caseras/ });
        expect(dish).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: /Pulpo a feira/ })).toBeDisabled();

        await user.click(screen.getByRole('button', { name: 'Siguiente →' }));
        expect(screen.getByRole('slider', { name: 'Radio' })).toHaveValue('2');
        await user.click(screen.getByRole('button', { name: 'Siguiente →' }));
        expect(screen.getByText(/10 tramos/)).toBeInTheDocument();
        expect(screen.getAllByText('⚡ 70').length).toBeGreaterThan(0);
        expect(screen.getByText(/te quedan/)).toHaveTextContent('Tienes ⚡ 340 → te quedan ⚡ 270');

        await user.click(screen.getByRole('button', { name: /Lanzar plato estrella/ }));
        expect(service.requestItemSpotlight).toHaveBeenCalledWith({ placeId: PLACE_ID, itemId: 'croquetas', radiusKm: 2, days: 7, intensity: 1 });
        await waitFor(() => expect(currentSearch().get('sub')).toBe('resultados'));
        expect(currentSearch().get('item')).toBeNull();
        expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '🎉 ¡Enviado!' }));
        expect(launchConfetti).toHaveBeenCalled();
        const card = await screen.findByRole('heading', { name: 'Croquetas caseras' });
        expect(card.closest('li')).toHaveClass('ring-2');
    });

    it('a dish marked unavailable in ?item= is not selected', async () => {
        renderSection('?sub=plato&item=pulpo');
        expect(await screen.findByText(/está como no disponible en tu carta/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Siguiente →' })).toBeDisabled();
    });

    it('Stripe return opens Plato estrella on step ③ with the saved plan and cleans the URL', async () => {
        saveSpotlightDraft(PLACE_ID, { itemId: 'croquetas', radiusKm: 1, days: 3, intensity: 2, balanceBefore: 340 });
        renderSection('?tab=sponsored&impulsos=ok');
        expect(await screen.findByText('Confirmando tu pago con Stripe…')).toBeInTheDocument();
        await waitFor(() => expect(currentSearch().get('impulsos')).toBeNull());
        expect(currentSearch().get('sub')).toBe('plato');
        expect(currentSearch().get('tab')).toBe('sponsored');
        expect(screen.getByRole('button', { name: /Lanzar/, current: 'step' })).toBeInTheDocument();
        expect(await screen.findByText(/5 tramos/)).toBeInTheDocument();
        expect(screen.getAllByText('⚡ 30').length).toBeGreaterThan(0);
    });

    it('S6/S7: results show es-ES metrics for ended campaigns too', async () => {
        service.getPlaceSponsoredPlacements.mockResolvedValue([
            placement('p1', { status: 'ended', type: 'search', headline: 'Terraza abierta', startsAt: '2026-10-05', endsAt: '2026-10-12', metrics: { impressions: 1240, clicks: 56 }, adminNotes: 'Buen trabajo' }),
            placement('p2', { status: 'requested', createdAtMs: 9 }),
        ]);
        const user = renderSection('?sub=resultados');
        const ended = (await screen.findByRole('heading', { name: 'Mapa' })).closest('li') as HTMLElement;
        expect(within(ended).getByText('1.240')).toBeInTheDocument();
        expect(within(ended).getByText('4,5 %')).toBeInTheDocument();
        expect(within(ended).getByText(/5 oct → 12 oct/)).toBeInTheDocument();
        expect(within(ended).getByText(/Buen trabajo/)).toBeInTheDocument();
        await user.click(screen.getByRole('radio', { name: /En revisión · 1/ }));
        expect(screen.queryByRole('heading', { name: 'Mapa' })).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Portada' })).toBeInTheDocument();
    });

    it('#274: results tell the owner when a campaign is paused because the dish left the menu', async () => {
        service.getPlaceItemSpotlights.mockResolvedValue([{
            id: 'sp-9', placeId: PLACE_ID, itemId: 'bravas', itemName: 'Bravas', linkedListIds: [],
            itemAverageRating: null, itemReviewCount: 0, center: null, radiusKm: 1, units: 1, days: 7, impulses: 35,
            status: 'active', itemInactive: true, metrics: { impressions: 10, clicks: 1 }, createdAtMs: 3,
        } satisfies ItemSpotlight]);
        renderSection('?sub=resultados');
        expect(await screen.findByText('Este plato ya no está en tu carta: la campaña está en pausa hasta que el equipo la revise.')).toBeInTheDocument();
    });

    it('sends a map placement request with a headline idea and jumps to results', async () => {
        service.requestSponsoredPlacement.mockResolvedValue({ placementId: 'pl-9' });
        const user = renderSection('?sub=campanas');
        await user.click(await screen.findByRole('radio', { name: /En el mapa/ }));
        await user.click(screen.getByRole('button', { name: /Terraza abierta/ }));
        expect(await screen.findByText('0/5 solicitudes abiertas')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '📣 Enviar solicitud' }));
        expect(service.requestSponsoredPlacement).toHaveBeenCalledWith({
            placeId: PLACE_ID, type: 'search', headline: '☀️ Terraza abierta', startsAt: undefined, endsAt: undefined,
        });
        await waitFor(() => expect(currentSearch().get('sub')).toBe('resultados'));
        expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '📬 ¡Solicitud enviada!' }));
    });
});
