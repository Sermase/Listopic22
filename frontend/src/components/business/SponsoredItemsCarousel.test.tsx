import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ItemSpotlight } from '../../services/BusinessProService';

const spotlight: ItemSpotlight = {
    id: 'spot-1',
    placeId: 'ChIJc7hBUzEvQg0R_skP3Lbqgrc',
    placeName: 'Bar Sermase',
    itemId: 'croqueta-prueba-1',
    itemName: 'Croqueta, la original',
    linkedListIds: ['croquetas'],
    itemAverageRating: 7,
    itemReviewCount: 1,
    center: { lat: 40.4, lng: -3.7 },
    radiusKm: 1,
    units: 1,
    status: 'active',
    metrics: {} as ItemSpotlight['metrics'],
    createdAtMs: 0,
};

const getActiveItemSpotlights = vi.fn(async () => [spotlight]);
vi.mock('../../services/BusinessProService', () => ({
    getActiveItemSpotlights: () => getActiveItemSpotlights(),
    recordSponsoredEvent: vi.fn(async () => undefined),
    weightedSampleSpotlights: (candidates: ItemSpotlight[], count: number) => candidates.slice(0, count),
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ isJefe: false }) }));

import { SponsoredItemsCarousel } from './SponsoredItemsCarousel';
import { __resetLocationStoreForTests, useLocation } from '../../hooks/useLocation';

type Pending = { success: PositionCallback; error?: PositionErrorCallback | null };
const pending: Pending[] = [];
const getCurrentPosition = vi.fn((success: PositionCallback, error?: PositionErrorCallback | null) => {
    pending.push({ success, error });
});

const succeedAll = (latitude: number, longitude: number) => act(() => {
    pending.splice(0).forEach((request) => request.success({
        coords: { latitude, longitude, accuracy: 10 },
        timestamp: Date.now(),
    } as unknown as GeolocationPosition));
});

const denyAll = () => act(() => {
    pending.splice(0).forEach((request) => request.error?.({
        code: 1,
        message: 'User denied Geolocation',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
    } as unknown as GeolocationPositionError));
});

const renderCarousel = (listId?: string) => render(
    <MemoryRouter>
        <SponsoredItemsCarousel listId={listId} />
    </MemoryRouter>,
);

const CHIP = 'Activa tu ubicación para ver platos destacados cerca';

describe('SponsoredItemsCarousel', () => {
    beforeEach(() => {
        sessionStorage.clear();
        pending.length = 0;
        getCurrentPosition.mockClear();
        getActiveItemSpotlights.mockClear();
        Object.defineProperty(navigator, 'geolocation', {
            value: { getCurrentPosition },
            configurable: true,
        });
        __resetLocationStoreForTests();
    });

    it('si no ubica al montar y otra pantalla ubica después, aparece el plato patrocinado', async () => {
        renderCarousel();
        denyAll();
        // Sin ubicación no se valida el radio: solo el aviso para activarla.
        expect(await screen.findByText(CHIP)).toBeTruthy();
        expect(screen.queryByText('Patrocinado')).toBeNull();

        // Otra instancia (p. ej. el chip de distancia de Inicio) consigue la ubicación.
        const home = renderHook(() => useLocation());
        act(() => {
            void home.result.current.requestLocation();
        });
        succeedAll(40.4005, -3.7005);

        expect((await screen.findAllByText('Patrocinado')).length).toBeGreaterThan(0);
        expect(screen.getByText('Croqueta, la original')).toBeTruthy();
        expect(screen.queryByText(CHIP)).toBeNull();
    });

    it('el aviso pide la ubicación y muestra el plato al conseguirla', async () => {
        renderCarousel();
        denyAll();
        fireEvent.click(await screen.findByText(CHIP));
        expect(getCurrentPosition).toHaveBeenCalledTimes(2);
        expect(screen.getByText('Buscando tu ubicación…')).toBeTruthy();

        succeedAll(40.4, -3.7);
        expect((await screen.findAllByText('Patrocinado')).length).toBeGreaterThan(0);
    });

    it('si se vuelve a denegar lo dice sin insistir', async () => {
        renderCarousel();
        denyAll();
        fireEvent.click(await screen.findByText(CHIP));
        denyAll();
        expect(await screen.findByText('No hemos podido ubicarte. Revisa el permiso de ubicación.')).toBeTruthy();
        expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    });

    it('no muestra el aviso si no hay campañas que puedan salir aquí', async () => {
        renderCarousel('otra-lista');
        denyAll();
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(getActiveItemSpotlights).toHaveBeenCalled();
        expect(screen.queryByText(CHIP)).toBeNull();
    });

    it('fuera del radio no muestra nada', async () => {
        renderCarousel();
        succeedAll(41.39, 2.17);
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(screen.queryByText('Patrocinado')).toBeNull();
        expect(screen.queryByText(CHIP)).toBeNull();
    });
});
