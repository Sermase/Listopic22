/**
 * Utilidades de la portada que tocan el navegador: comprobar que un enlace es
 * una imagen, traer una foto ya subida para reencuadrarla y textos de error de
 * la subida. Aparte para poder simularlas en los tests.
 */
import { getErrorCode } from '../kit/errors';

/** ¿Carga este enlace como imagen? (timeout: no se queda «comprobando» para siempre). */
export const probeImage = (url: string, timeoutMs = 10000): Promise<boolean> => new Promise((resolve) => {
    if (typeof Image === 'undefined') {
        resolve(false);
        return;
    }
    const image = new Image();
    let settled = false;
    const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
        resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    image.onload = () => finish(image.naturalWidth > 0);
    image.onerror = () => finish(false);
    image.src = url;
});

/**
 * Trae una foto publicada como File para recortarla otra vez. Puede fallar
 * (CORS de otros dominios): entonces toca volver a subirla.
 */
export const fetchImageFile = async (url: string): Promise<File> => {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('not-an-image');
    return new File([blob], 'portada.jpg', { type: blob.type });
};

/** Texto amable para un error de subida a Storage. */
export const uploadErrorCopy = (error: unknown): string => {
    const code = getErrorCode(error);
    if (code === 'unauthenticated') return '🔒 Inicia sesión otra vez para subir tu portada.';
    if (code === 'storage/unauthorized' || code === 'permission-denied') {
        return '🔒 No tienes permiso para subir fotos ahora. Sal, vuelve a entrar e inténtalo.';
    }
    if (code === 'storage/retry-limit-exceeded' || code === 'storage/canceled' || code === 'storage/unknown') {
        return '📡 La subida se cortó. Revisa tu conexión e inténtalo de nuevo.';
    }
    if (code === 'storage/quota-exceeded') return '⏳ Ahora mismo no hay sitio para más fotos. Inténtalo más tarde.';
    return '😕 No se pudo subir la foto. Inténtalo de nuevo.';
};

/** Fotos de más de 10 MB no las acepta Storage (storage.rules). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
