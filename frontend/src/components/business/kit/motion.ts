/**
 * ¿Ha pedido el sistema reducir el movimiento? Sin confeti ni destellos si es así.
 *
 *   if (!prefersReducedMotion()) flash();
 */
export const prefersReducedMotion = (): boolean => {
    try {
        return typeof window !== 'undefined'
            && typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
};
