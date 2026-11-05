import { Capacitor } from '@capacitor/core';

/** Igual que slugify de functions/modules/lib/seo-rankings.js: si cambia uno, cambia el otro. */
export const rankingSlug = (value: string): string => String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Las páginas /mejores las sirve el servidor (no son rutas de la app): en la
 * web se abre con recarga y en la app nativa en el navegador.
 */
export const openRankingsPage = (path = '/mejores'): void => {
    if (Capacitor.isNativePlatform()) {
        window.open(`https://listopic.es${path}`, '_blank', 'noopener noreferrer');
    } else {
        window.location.href = path;
    }
};
