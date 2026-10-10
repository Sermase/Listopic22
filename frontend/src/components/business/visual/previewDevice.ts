/** Dispositivos de la vista previa de 🎨 Imagen. */
export type PreviewDevice = 'mobile' | 'desktop';

/**
 * Tamaño real que se simula (la cabecera pública mide clamp(360px, 42vh, 520px)).
 * ShowcaseHero usa las mismas alturas en sus clases (h-[360px], h-[440px]).
 */
export const DEVICE_SIZE: Record<PreviewDevice, { width: number; height: number }> = {
    mobile: { width: 375, height: 360 },
    desktop: { width: 1024, height: 440 },
};
