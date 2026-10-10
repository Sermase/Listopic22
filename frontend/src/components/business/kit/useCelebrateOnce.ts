/**
 * Confeti una sola vez por hito, por negocio y por navegador:
 *
 *   useCelebrateOnce(`ficha:${placeId}`, loaded && percent === 100, () =>
 *     showToast({ variant: 'success', title: '🏆 ¡Ficha completa!', message: '…' }));
 *
 * Se dispara la primera vez que `condition` es true y la clave no está en
 * localStorage. Con «reducir movimiento» no hay confeti, pero el hito se marca
 * y `onCelebrate` (p. ej. el toast) se llama igual. Sin almacenamiento
 * disponible se recuerda solo durante la sesión. Pasa `condition` solo con los
 * datos ya cargados.
 */
import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from './motion';

const STORAGE_PREFIX = 'listopic_celebrated:';
const sessionCelebrated = new Set<string>();

const alreadyCelebrated = (key: string): boolean => {
    if (sessionCelebrated.has(key)) return true;
    try {
        return localStorage.getItem(STORAGE_PREFIX + key) !== null;
    } catch {
        return false;
    }
};

const markCelebrated = (key: string) => {
    sessionCelebrated.add(key);
    try {
        localStorage.setItem(STORAGE_PREFIX + key, new Date().toISOString());
    } catch {
        // Sin almacenamiento: queda recordado en esta sesión.
    }
};

export const launchConfetti = () => {
    if (prefersReducedMotion()) return;
    // Misma llamada que LevelUpModal.
    import('canvas-confetti').then((confetti) => {
        confetti.default({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 },
            colors: ['#FFD700', '#FFA500', '#FF8C00', '#FF4500'],
        });
    }).catch(() => {
        // El confeti es decorativo: si no carga, no pasa nada.
    });
};

export function useCelebrateOnce(key: string, condition: boolean, onCelebrate?: () => void): void {
    const onCelebrateRef = useRef(onCelebrate);
    useEffect(() => {
        onCelebrateRef.current = onCelebrate;
    }, [onCelebrate]);

    useEffect(() => {
        if (!condition || !key || alreadyCelebrated(key)) return;
        markCelebrated(key);
        launchConfetti();
        onCelebrateRef.current?.();
    }, [key, condition]);
}
