/**
 * Texto amable para un error de una callable de Business Pro:
 *
 *   } catch (err) {
 *     const copy = businessErrorCopy(err);
 *     setError(copy.message);               // en la StickySaveBar o junto al control
 *     if (copy.action === 'reload') ...;     // ofrece «Recargar»
 *   }
 *
 * `aborted` (alguien cambió los datos, versión distinta) → recargar;
 * `resource-exhausted` (límite diario); `permission-denied` (sin Pro);
 * lo demás usa el mensaje del servidor o un genérico.
 */

export type BusinessErrorAction = 'reload';

export interface BusinessErrorCopy {
    /** Código sin el prefijo 'functions/' ('aborted', 'internal'…), o '' si no hay. */
    code: string;
    message: string;
    action?: BusinessErrorAction;
}

export const DEFAULT_ERROR_COPY = '😕 No se pudo guardar.';

/** Mensajes que Firebase pone por defecto y no dicen nada a la gente. */
const GENERIC_MESSAGES = new Set(['internal', 'unknown', 'error', 'failed-precondition', 'invalid-argument', 'not-found', 'unavailable']);

export const getErrorCode = (err: unknown): string => {
    if (!err || typeof err !== 'object') return '';
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code.replace(/^functions\//, '') : '';
};

const getServerMessage = (err: unknown, code: string): string => {
    if (!err || typeof err !== 'object') return '';
    const message = (err as { message?: unknown }).message;
    if (typeof message !== 'string') return '';
    const text = message.trim();
    if (!text || text === code || GENERIC_MESSAGES.has(text.toLowerCase())) return '';
    // Los errores de red/SDK traen textos técnicos en inglés: no se enseñan.
    if (/^(firebase|functions)\b|^\w+error\b|network|fetch|timeout|ECONN/i.test(text)) return '';
    return text;
};

export const businessErrorCopy = (err: unknown, fallback: string = DEFAULT_ERROR_COPY): BusinessErrorCopy => {
    const code = getErrorCode(err);
    switch (code) {
        case 'aborted':
            return { code, message: '🔄 Alguien cambió estos datos.', action: 'reload' };
        case 'resource-exhausted':
            return { code, message: '⏳ Has hecho muchos cambios hoy; vuelve a intentarlo mañana.' };
        case 'permission-denied':
            return { code, message: '🔒 Necesitas Business Pro activo para esto.' };
        case 'unavailable':
        case 'deadline-exceeded':
            return { code, message: '📡 No hay conexión con el servidor. Inténtalo de nuevo en un momento.' };
        default:
            return { code, message: getServerMessage(err, code) || fallback };
    }
};
