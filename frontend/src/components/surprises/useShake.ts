import { useEffect, useRef } from 'react';

type MotionWithPermission = typeof DeviceMotionEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

const motionApi = (): MotionWithPermission | null =>
    (typeof window !== 'undefined' && 'DeviceMotionEvent' in window ? (window.DeviceMotionEvent as MotionWithPermission) : null);

/** En iPhone hay que pedir permiso (con un toque) para leer el movimiento. */
export const shakeNeedsPermission = (): boolean => typeof motionApi()?.requestPermission === 'function';

export async function requestShakePermission(): Promise<boolean> {
    const api = motionApi();
    if (!api?.requestPermission) return Boolean(api);
    try {
        return (await api.requestPermission()) === 'granted';
    } catch {
        return false;
    }
}

const THRESHOLD = 22; // m/s² de cambio brusco
const HITS = 3;
const WINDOW_MS = 900;
const COOLDOWN_MS = 5000;

/** Llama a `onShake` al agitar el móvil (tres sacudidas fuertes seguidas). */
export function useShake(enabled: boolean, onShake: () => void): void {
    const cb = useRef(onShake);
    useEffect(() => { cb.current = onShake; }, [onShake]);

    useEffect(() => {
        if (!enabled || !motionApi()) return;
        let last: { x: number; y: number; z: number } | null = null;
        let hits: number[] = [];
        let quietUntil = 0;
        const onMotion = (e: DeviceMotionEvent) => {
            const a = e.accelerationIncludingGravity;
            if (!a || a.x === null || a.y === null || a.z === null) return;
            const now = Date.now();
            const cur = { x: a.x, y: a.y, z: a.z };
            if (last) {
                const delta = Math.abs(cur.x - last.x) + Math.abs(cur.y - last.y) + Math.abs(cur.z - last.z);
                if (delta > THRESHOLD && now > quietUntil) {
                    hits = [...hits.filter((t) => now - t < WINDOW_MS), now];
                    if (hits.length >= HITS) {
                        hits = [];
                        quietUntil = now + COOLDOWN_MS;
                        cb.current();
                    }
                }
            }
            last = cur;
        };
        window.addEventListener('devicemotion', onMotion);
        return () => window.removeEventListener('devicemotion', onMotion);
    }, [enabled]);
}
