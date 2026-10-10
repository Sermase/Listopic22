import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { BusinessPlaceAnalyticsResult, AnalyticsDailyRow, PlaceAnalyticsDaily } from '../../../services/AnalyticsService';
import type { CanonicalPlaceItem } from '../../../services/CanonicalItemService';
import type { ManagerPlaceReview, SponsoredPlacement } from '../../../services/BusinessProService';
import type { PlaceRating } from '../../../lib/placeRating';
import { SCORE_BADGE } from '../../../lib/scoreScale';

vi.mock('../../../firebase', () => ({ auth: {}, db: {}, functions: {}, storage: {} }));

const firestore = vi.hoisted(() => ({
    doc: vi.fn(() => ({})),
    getDoc: vi.fn(),
}));
vi.mock('firebase/firestore', async (importOriginal) => ({
    ...(await importOriginal<typeof import('firebase/firestore')>()),
    ...firestore,
}));

const analytics = vi.hoisted(() => ({ getBusinessPlaceAnalytics: vi.fn() }));
vi.mock('../../../services/AnalyticsService', () => analytics);

const canonical = vi.hoisted(() => ({ getCanonicalPlaceItems: vi.fn() }));
vi.mock('../../../services/CanonicalItemService', () => canonical);

const service = vi.hoisted(() => ({
    getLatestPlaceReviewsForManager: vi.fn(),
    getPlaceSponsoredPlacements: vi.fn(),
    getPlaceItemSpotlights: vi.fn(),
}));
vi.mock('../../../services/BusinessProService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../services/BusinessProService')>()),
    ...service,
}));

const showToast = vi.hoisted(() => vi.fn());
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ showToast }) }));

import { BusinessStatsSection } from './BusinessStatsSection';
import { lastDateKeys } from './statsModel';

const PLACE_ID = 'place-1';
const DAY = 86_400_000;

const emptyRow = (date: string): AnalyticsDailyRow => ({
    date,
    path: `/place/${PLACE_ID}`,
    title: '',
    pageType: 'place',
    totalViews: 0,
    uniqueSessions: 0,
    authenticatedViews: 0,
    anonymousViews: 0,
    totalShares: 0,
    shareActions: 0,
    byDevice: {},
    bySource: {},
    byShareChannel: {},
    byShareEntityType: {},
    firstViewedAtMs: null,
    lastViewedAtMs: null,
    lastSharedAtMs: null,
});

/** 60 días como los devuelve el callable; `views(index)` con 0 = el más antiguo y 59 = hoy. */
const countMap = (key: string, value: number): Record<string, number> => (value ? { [key]: value } : {});

const trafficOf = (views: (index: number) => number, shares: (index: number) => number = () => 0): BusinessPlaceAnalyticsResult => {
    const dates = lastDateKeys(60);
    const daily = dates.map((date, index): AnalyticsDailyRow => ({
        ...emptyRow(date),
        totalViews: views(index),
        uniqueSessions: Math.ceil(views(index) / 2),
        authenticatedViews: Math.floor(views(index) / 2),
        anonymousViews: Math.ceil(views(index) / 2),
        bySource: countMap('search', views(index)),
        byDevice: countMap('mobile', views(index)),
    }));
    const relatedDaily: PlaceAnalyticsDaily[] = dates.map((date, index) => ({
        date,
        reviews: 0,
        totalShares: shares(index),
        shareActions: shares(index),
        byShareChannel: countMap('whatsapp', shares(index)),
        byShareEntityType: countMap('place', shares(index)),
    }));
    return {
        placeId: PLACE_ID,
        days: 60,
        page: { path: `/place/${PLACE_ID}`, days: 60, total: emptyRow(''), daily },
        relatedDaily,
    };
};

const review = (id: string, overallRating: number, agoDays: number, patch: Partial<ManagerPlaceReview> = {}): ManagerPlaceReview => ({
    id,
    refPath: `lists/l/reviews/${id}`,
    itemId: 'croquetas',
    itemName: 'Croquetas caseras',
    authorName: 'Lucía',
    overallRating,
    comment: 'Muy ricas',
    createdAtMs: Date.now() - agoDays * DAY,
    ...patch,
});

const croquetas: CanonicalPlaceItem = {
    id: 'croquetas',
    canonicalName: 'Croquetas caseras',
    status: 'active',
    stats: { reviewCount: 12, ratingCount: 12, averageRating: 9.3, photoCount: 4 },
};
const bravas: CanonicalPlaceItem = {
    id: 'bravas',
    canonicalName: 'Patatas bravas',
    status: 'active',
    stats: { reviewCount: 5, ratingCount: 5, averageRating: 4.2, photoCount: 0 },
};

const RATING: PlaceRating = { average: 8.4, count: 23, visibleCount: 25, bots: null, critic: null };

const placement = (patch: Partial<SponsoredPlacement> = {}): SponsoredPlacement => ({
    id: 'p1',
    placeId: PLACE_ID,
    type: 'home',
    status: 'active',
    metrics: { impressions: 200, clicks: 9 },
    createdAtMs: 1,
    ...patch,
});

const LocationProbe = () => {
    const location = useLocation();
    return <output data-testid="search">{location.search}</output>;
};

const renderStats = (props: Partial<React.ComponentProps<typeof BusinessStatsSection>> = {}) => render(
    <MemoryRouter initialEntries={['/businesses/place-1/manage?tab=stats']}>
        <BusinessStatsSection placeId={PLACE_ID} rating={RATING} {...props} />
        <LocationProbe />
    </MemoryRouter>,
);

const card = (title: RegExp) => screen.getByRole('region', { name: title });

beforeEach(() => {
    vi.clearAllMocks();
    analytics.getBusinessPlaceAnalytics.mockResolvedValue(trafficOf((index) => (index >= 30 ? 3 : 1), (index) => (index === 59 ? 2 : 0)));
    // Unas valoraciones con nota baja: la media hecha aquí sería 3, nunca la que se enseña.
    service.getLatestPlaceReviewsForManager.mockResolvedValue({
        reviews: [review('r1', 2, 1), review('r2', 4, 3, { authorName: 'Pablo', itemName: 'Patatas bravas', comment: '' })],
        newestFirst: true,
        capped: false,
    });
    canonical.getCanonicalPlaceItems.mockResolvedValue([croquetas, bravas]);
    service.getPlaceSponsoredPlacements.mockResolvedValue([]);
    service.getPlaceItemSpotlights.mockResolvedValue([]);
});

describe('BusinessStatsSection', () => {
    it('enseña la nota PÚBLICA del sitio y no una media de las reseñas leídas (T2, T7)', async () => {
        renderStats();
        const rating = await screen.findByText('de 23 valoraciones públicas');
        const ratingTile = rating.closest('article')!;
        expect(within(ratingTile).getByText('8.4')).toBeInTheDocument();
        expect(within(ratingTile).getByText('Muy bueno')).toBeInTheDocument();
        expect(screen.queryByText(/Nota media/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Elementos en carta/)).not.toBeInTheDocument();
    });

    it('sin nota pública lo dice, sin inventar un número', async () => {
        renderStats({ rating: { ...RATING, average: null, count: 0 } });
        expect(await screen.findByText('Sin nota pública todavía')).toBeInTheDocument();
    });

    it('sin la nota de la página, la lee del lugar', async () => {
        firestore.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ averageRating: 7.5, publicHumanReviewsCount: 4 }) });
        renderStats({ rating: undefined });
        expect(await screen.findByText('de 4 valoraciones públicas')).toBeInTheDocument();
        expect(screen.getByText('7.5')).toBeInTheDocument();
    });

    it('si falla la analítica: error con Reintentar y nunca 0; lo demás sigue (T4)', async () => {
        analytics.getBusinessPlaceAnalytics.mockRejectedValueOnce(new Error('boom'));
        renderStats();
        const visits = card(/¿Cuánta gente te ve\?/);
        expect(await within(visits).findByText('No hemos podido cargar las visitas de tu ficha')).toBeInTheDocument();
        expect(within(card(/¿Cómo te encuentran\?/)).getByRole('alert')).toBeInTheDocument();
        // Las valoraciones sí salen.
        expect(await within(card(/¿Qué opinan de ti\?/)).findByText('Lucía')).toBeInTheDocument();
        // Las cifras de visitas no se pintan como 0.
        const visitsTile = screen.getByRole('heading', { name: 'Visitas a tu ficha' }).closest('article')!;
        expect(within(visitsTile).getByText('No se pudo cargar')).toBeInTheDocument();
        expect(within(visitsTile).queryByText('0')).not.toBeInTheDocument();

        await userEvent.click(within(visits).getByRole('button', { name: /Reintentar/ }));
        await waitFor(() => expect(within(card(/¿Cuánta gente te ve\?/)).queryByRole('alert')).not.toBeInTheDocument());
        expect(analytics.getBusinessPlaceAnalytics).toHaveBeenCalledTimes(2);
        expect(analytics.getBusinessPlaceAnalytics).toHaveBeenLastCalledWith(PLACE_ID, 60);
    });

    it('cambia entre 7 y 30 días y compara con el periodo anterior', async () => {
        renderStats();
        const visitsTile = (await screen.findByRole('heading', { name: 'Visitas a tu ficha' })).closest('article')!;
        // 30 días: 30 × 3 = 90 frente a 30 × 1 = 30.
        await within(visitsTile).findByText('90');
        expect(within(visitsTile).getByText('200 % vs. periodo anterior')).toBeInTheDocument();
        expect(screen.getByText('Comparado con los 30 días anteriores')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('tab', { name: /7 días/ }));
        expect(within(visitsTile).getByText('21')).toBeInTheDocument();
        expect(within(visitsTile).getByText('Igual que el periodo anterior')).toBeInTheDocument();
        expect(screen.getByText('Comparado con los 7 días anteriores')).toBeInTheDocument();
        // 7 columnas, cada una a toda la altura para que la barra tenga tamaño (T1).
        const columns = within(screen.getByRole('group', { name: /Visitas por día/ })).getAllByRole('button');
        expect(columns).toHaveLength(7);
        columns.forEach((column) => expect(column).toHaveClass('h-full'));
        expect(columns[6].querySelector('span')).toHaveStyle({ height: '100%' });
    });

    it('tocar una columna dice el día; las sesiones son «visitas distintas» (T8)', async () => {
        renderStats();
        const visits = card(/¿Cuánta gente te ve\?/);
        const group = await within(visits).findByRole('group', { name: /Visitas por día/ });
        const columns = within(group).getAllByRole('button');
        expect(columns).toHaveLength(30);
        await userEvent.click(columns[29]);
        expect(columns[29]).toHaveAttribute('aria-pressed', 'true');
        expect(within(visits).getByText(/^Hoy · .* · 3 visitas · 2 compartidos$/)).toBeInTheDocument();
        expect(within(visits).getByText(/visitas distintas/)).toBeInTheDocument();
        expect(screen.queryByText(/Sesiones únicas/)).not.toBeInTheDocument();

        await userEvent.click(within(visits).getByRole('button', { name: /Ver números/ }));
        expect(within(visits).getByRole('table')).toBeInTheDocument();
    });

    it('la nota de cada plato usa su color de tramo (T5) y «Mejorar su ficha» lleva a la Carta', async () => {
        const onGoToTab = vi.fn();
        renderStats({ onGoToTab });
        const top = card(/Tus estrellas de la carta/);
        const podium = await within(top).findByRole('list', { name: 'Podio' });
        const chip = within(podium).getByText('9.3');
        expect(chip).toHaveStyle({ backgroundColor: SCORE_BADGE.top.bg });
        await userEvent.click(within(top).getByRole('button', { name: /Mejorar su ficha: Patatas bravas/ }));
        expect(onGoToTab).toHaveBeenCalledWith('items');
    });

    it('titular de «días tranquilos» lleva a Promos', async () => {
        analytics.getBusinessPlaceAnalytics.mockResolvedValue(trafficOf((index) => (index >= 30 ? 1 : 3)));
        const onGoToTab = vi.fn();
        renderStats({ onGoToTab });
        await userEvent.click(await screen.findByRole('button', { name: /Días tranquilos/ }));
        expect(onGoToTab).toHaveBeenCalledWith('sponsored');
    });

    it('sin onGoToTab cambia ?tab= él mismo', async () => {
        renderStats();
        const promos = await screen.findByRole('complementary', { name: 'Campañas' });
        await userEvent.click(within(promos).getByRole('button', { name: 'Ir a Promos' }));
        expect(screen.getByTestId('search').textContent).toContain('tab=sponsored');
    });

    it('con campañas enseña vistas, clics y % de clics', async () => {
        service.getPlaceSponsoredPlacements.mockResolvedValue([placement()]);
        renderStats();
        const campaigns = card(/¿Funcionan tus campañas\?/);
        expect(await within(campaigns).findByText('4,5 %', { selector: 'dd' })).toBeInTheDocument();
        expect(within(campaigns).getByText('200', { selector: 'dd' })).toBeInTheDocument();
        expect(within(campaigns).getByText('Portada')).toBeInTheDocument();
    });

    it('sin visitas: estado vacío con Ver mi ficha y Dar un impulso', async () => {
        analytics.getBusinessPlaceAnalytics.mockResolvedValue(trafficOf(() => 0));
        canonical.getCanonicalPlaceItems.mockResolvedValue([]);
        renderStats();
        const visits = card(/¿Cuánta gente te ve\?/);
        expect(await within(visits).findByText('Tu ficha aún no ha tenido visitas en estos días.')).toBeInTheDocument();
        expect(within(visits).getByRole('link', { name: /Ver mi ficha/ })).toHaveAttribute('href', `/place/${PLACE_ID}`);
        expect(await screen.findByText(/Estamos empezando a recoger datos/)).toBeInTheDocument();
    });

    it('«Actualizar» relee todo sin volver a «cargando»', async () => {
        renderStats();
        await screen.findByText('Lucía');
        await userEvent.click(screen.getByRole('button', { name: 'Actualizar estadísticas' }));
        await waitFor(() => expect(analytics.getBusinessPlaceAnalytics).toHaveBeenCalledTimes(2));
        expect(service.getLatestPlaceReviewsForManager).toHaveBeenCalledTimes(2);
        expect(screen.getByText('Lucía')).toBeInTheDocument();
        expect(showToast).not.toHaveBeenCalled();
    });
});
