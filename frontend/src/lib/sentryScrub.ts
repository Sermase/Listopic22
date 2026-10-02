// Limpieza de lo que se envía a Sentry: ni usuario, ni IP, ni correos, ni
// tokens en las URL. Funciones puras para poder probarlas sin el SDK.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SENSITIVE_PARAM = /token|code|key|secret|password|auth|email|session/i;

export function scrubText(text: string): string {
    return text.replace(EMAIL, '[correo]');
}

/** Quita los valores de parámetros sensibles (oobCode, apiKey, token…) de una URL. */
export function scrubUrl(url: string): string {
    const q = url.indexOf('?');
    if (q < 0) return scrubText(url);
    const hash = url.indexOf('#', q);
    const query = url.slice(q + 1, hash < 0 ? undefined : hash);
    const cleaned = query
        .split('&')
        .map((pair) => {
            const eq = pair.indexOf('=');
            const name = eq < 0 ? pair : pair.slice(0, eq);
            return eq >= 0 && SENSITIVE_PARAM.test(decodeURIComponent(name)) ? `${name}=[filtrado]` : pair;
        })
        .join('&');
    return scrubText(`${url.slice(0, q)}?${cleaned}${hash < 0 ? '' : url.slice(hash)}`);
}

interface ScrubbableEvent {
    user?: unknown;
    message?: string;
    request?: { url?: string; cookies?: unknown; headers?: Record<string, string>; query_string?: unknown };
    exception?: { values?: Array<{ value?: string }> };
    breadcrumbs?: ScrubbableBreadcrumb[];
}

interface ScrubbableBreadcrumb {
    message?: string;
    data?: Record<string, unknown>;
}

export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(crumb: T): T {
    if (crumb.message) crumb.message = scrubText(crumb.message);
    if (crumb.data) {
        for (const key of ['url', 'from', 'to']) {
            const value = crumb.data[key];
            if (typeof value === 'string') crumb.data[key] = scrubUrl(value);
        }
    }
    return crumb;
}

export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
    delete event.user;
    if (event.message) event.message = scrubText(event.message);
    if (event.request) {
        delete event.request.cookies;
        delete event.request.query_string;
        if (event.request.url) event.request.url = scrubUrl(event.request.url);
        if (event.request.headers) {
            const userAgent = event.request.headers['User-Agent'];
            event.request.headers = userAgent ? { 'User-Agent': userAgent } : {};
        }
    }
    for (const value of event.exception?.values ?? []) {
        if (value.value) value.value = scrubText(value.value);
    }
    event.breadcrumbs?.forEach(scrubBreadcrumb);
    return event;
}
