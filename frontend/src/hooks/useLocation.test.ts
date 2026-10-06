import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useEffect } from 'react';
import { __resetLocationStoreForTests, useLocation } from './useLocation';

type Pending = { success: PositionCallback; error?: PositionErrorCallback | null };

// Geolocalización de mentira: las peticiones quedan pendientes hasta que el
// test responde (como en un navegador real, nunca en el acto).
const pending: Pending[] = [];
const getCurrentPosition = vi.fn((success: PositionCallback, error?: PositionErrorCallback | null, options?: PositionOptions) => {
    void options;
    pending.push({ success, error });
});

const position = (latitude: number, longitude: number) => ({
    coords: { latitude, longitude, accuracy: 10 },
    timestamp: Date.now(),
}) as unknown as GeolocationPosition;

const positionError = (code: number) => ({
    code,
    message: code === 1 ? 'User denied Geolocation' : 'Timeout expired',
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
}) as unknown as GeolocationPositionError;

const succeedAll = (latitude: number, longitude: number) => act(() => {
    pending.splice(0).forEach((request) => request.success(position(latitude, longitude)));
});

const failAll = (code: number) => act(() => {
    pending.splice(0).forEach((request) => request.error?.(positionError(code)));
});

const flush = () => act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
});

let permissionStatus: (EventTarget & { state: PermissionState }) | null = null;

const setPermissions = (state: PermissionState | null) => {
    if (state === null) {
        permissionStatus = null;
        Object.defineProperty(navigator, 'permissions', { value: undefined, configurable: true });
        return;
    }
    const status = new EventTarget() as EventTarget & { state: PermissionState };
    status.state = state;
    permissionStatus = status;
    Object.defineProperty(navigator, 'permissions', {
        value: { query: vi.fn(async () => status) },
        configurable: true,
    });
};

describe('useLocation (ubicación compartida)', () => {
    beforeEach(() => {
        sessionStorage.clear();
        pending.length = 0;
        getCurrentPosition.mockClear();
        Object.defineProperty(navigator, 'geolocation', {
            value: { getCurrentPosition },
            configurable: true,
        });
        setPermissions(null);
        __resetLocationStoreForTests();
    });

    afterEach(() => {
        __resetLocationStoreForTests();
    });

    it('si falla al montar y otro componente se ubica después, todos reciben la ubicación', async () => {
        const home = renderHook(() => useLocation());
        const carousel = renderHook(() => useLocation());
        expect(getCurrentPosition).toHaveBeenCalledTimes(1);

        failAll(1);
        expect(carousel.result.current.location).toBeNull();
        expect(carousel.result.current.loading).toBe(false);
        expect(carousel.result.current.error).toBe('User denied Geolocation');

        act(() => {
            void home.result.current.requestLocation();
        });
        expect(carousel.result.current.loading).toBe(true);
        succeedAll(40.4, -3.7);

        expect(home.result.current.location).toEqual({ latitude: 40.4, longitude: -3.7 });
        expect(carousel.result.current.location).toEqual({ latitude: 40.4, longitude: -3.7 });
        expect(carousel.result.current.error).toBeNull();
        expect(carousel.result.current.calculateDistance(40.4, -3.7)).toBe(0);
        expect(JSON.parse(sessionStorage.getItem('listopic_location') || 'null')).toEqual({ latitude: 40.4, longitude: -3.7 });
    });

    it('varios componentes montados a la vez hacen una sola petición', () => {
        const hooks = Array.from({ length: 5 }, () => renderHook(() => useLocation()));
        expect(getCurrentPosition).toHaveBeenCalledTimes(1);
        expect(getCurrentPosition.mock.calls[0][2]).toEqual({ timeout: 20000, maximumAge: 300000 });

        succeedAll(41.39, 2.17);
        const first = hooks[0].result.current.location;
        expect(first).toEqual({ latitude: 41.39, longitude: 2.17 });
        hooks.forEach((hook) => expect(hook.result.current.location).toBe(first));

        // Con ubicación ya conocida, montar otro componente no vuelve a pedirla.
        const late = renderHook(() => useLocation());
        expect(late.result.current.location).toBe(first);
        expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    });

    it('usa la ubicación guardada en la sesión sin pedirla otra vez', () => {
        sessionStorage.setItem('listopic_location', JSON.stringify({ latitude: 37.38, longitude: -5.98 }));
        __resetLocationStoreForTests();
        const { result } = renderHook(() => useLocation());
        expect(result.current.location).toEqual({ latitude: 37.38, longitude: -5.98 });
        expect(result.current.loading).toBe(false);
        expect(getCurrentPosition).not.toHaveBeenCalled();
    });

    it('un efecto con requestLocation en sus dependencias no entra en bucle mientras se deniega', async () => {
        const { result, rerender } = renderHook(() => {
            const geo = useLocation();
            const { location, requestLocation } = geo;
            useEffect(() => {
                if (!location) void requestLocation();
            }, [location, requestLocation]);
            return geo;
        });
        const firstRequest = result.current.requestLocation;

        for (let i = 0; i < 5; i += 1) {
            failAll(1);
            await flush();
            rerender();
        }

        expect(getCurrentPosition.mock.calls.length).toBeLessThanOrEqual(1);
        expect(result.current.requestLocation).toBe(firstRequest);
        expect(result.current.loading).toBe(false);
    });

    it('tras un «no» no vuelve a preguntar al montar otra pantalla, pero sí si se pide a mano', () => {
        renderHook(() => useLocation());
        failAll(1);
        expect(getCurrentPosition).toHaveBeenCalledTimes(1);

        const other = renderHook(() => useLocation());
        expect(getCurrentPosition).toHaveBeenCalledTimes(1);

        act(() => {
            void other.result.current.requestLocation();
        });
        expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    });

    it('requestLocation devuelve la posición o null, y se une a la petición en curso', async () => {
        const { result } = renderHook(() => useLocation());
        let first: Promise<unknown> = Promise.resolve();
        let second: Promise<unknown> = Promise.resolve();
        act(() => {
            first = result.current.requestLocation();
            second = result.current.requestLocation();
        });
        expect(getCurrentPosition).toHaveBeenCalledTimes(1);
        succeedAll(40, -3);
        await expect(first).resolves.toEqual({ latitude: 40, longitude: -3 });
        await expect(second).resolves.toEqual({ latitude: 40, longitude: -3 });

        let failed: Promise<unknown> = Promise.resolve();
        act(() => {
            failed = result.current.requestLocation();
        });
        failAll(3);
        await expect(failed).resolves.toBeNull();
        // Un fallo posterior no borra la ubicación que ya había.
        expect(result.current.location).toEqual({ latitude: 40, longitude: -3 });
    });

    it('reintenta al conceder el permiso o al volver a la pestaña, y no re-pregunta tras un «no»', async () => {
        setPermissions('prompt');
        const visible = () => act(() => {
            Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));
        });

        const { result } = renderHook(() => useLocation());
        await flush();
        failAll(1);
        expect(getCurrentPosition).toHaveBeenCalledTimes(1);

        // Denegado y el permiso sigue sin conceder: volver a la pestaña no pregunta.
        visible();
        await flush();
        expect(getCurrentPosition).toHaveBeenCalledTimes(1);

        // El usuario lo concede en los ajustes del navegador.
        act(() => {
            permissionStatus!.state = 'granted';
            permissionStatus!.dispatchEvent(new Event('change'));
        });
        expect(getCurrentPosition).toHaveBeenCalledTimes(2);

        // Esta vez caduca (no es un «no»): al volver a la pestaña se reintenta.
        failAll(3);
        visible();
        await flush();
        expect(getCurrentPosition).toHaveBeenCalledTimes(3);
        succeedAll(43.26, -2.93);
        expect(result.current.location).toEqual({ latitude: 43.26, longitude: -2.93 });

        // Con ubicación no se vuelve a pedir.
        visible();
        await flush();
        expect(getCurrentPosition).toHaveBeenCalledTimes(3);
    });

    it('si el navegador nunca responde, libera la petición y acepta la respuesta tardía', async () => {
        vi.useFakeTimers();
        try {
            const { result } = renderHook(() => useLocation());
            let waiting: Promise<unknown> = Promise.resolve();
            act(() => {
                waiting = result.current.requestLocation();
            });
            expect(getCurrentPosition).toHaveBeenCalledTimes(1);
            const stuck = pending.splice(0);

            act(() => {
                vi.advanceTimersByTime(30000);
            });
            await expect(waiting).resolves.toBeNull();
            expect(result.current.loading).toBe(false);

            // Se puede volver a pedir…
            act(() => {
                void result.current.requestLocation();
            });
            expect(getCurrentPosition).toHaveBeenCalledTimes(2);

            // …y si la primera contesta por fin, la posición vale igual.
            act(() => {
                stuck[0].success(position(39.47, -0.38));
            });
            expect(result.current.location).toEqual({ latitude: 39.47, longitude: -0.38 });
        } finally {
            vi.useRealTimers();
        }
    });

    it('si el aviso de permiso se cierra sin contestar, no vuelve a preguntar solo al volver a la pestaña', async () => {
        setPermissions('prompt');
        vi.useFakeTimers();
        try {
            const { result } = renderHook(() => useLocation());
            await act(() => vi.advanceTimersByTimeAsync(1));
            expect(getCurrentPosition).toHaveBeenCalledTimes(1);
            pending.splice(0); // el navegador no contesta nunca

            await act(() => vi.advanceTimersByTimeAsync(30000));
            expect(result.current.loading).toBe(false);

            act(() => {
                Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
                document.dispatchEvent(new Event('visibilitychange'));
            });
            await act(() => vi.advanceTimersByTimeAsync(1));
            expect(getCurrentPosition).toHaveBeenCalledTimes(1);

            // Pedirla a mano sí vuelve a preguntar.
            act(() => {
                void result.current.requestLocation();
            });
            expect(getCurrentPosition).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('sin geolocalización en el navegador avisa y no queda cargando', () => {
        Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
        __resetLocationStoreForTests();
        const { result } = renderHook(() => useLocation());
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBe('Geolocalización no soportada por el navegador');
    });
});
