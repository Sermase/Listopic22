const DEFAULT_PUBLIC_ORIGIN = 'https://listopic.es';

const normalizeOrigin = (value: string | undefined): string => {
    const candidate = (value || DEFAULT_PUBLIC_ORIGIN).trim().replace(/\/+$/, '');
    try {
        return new URL(candidate).origin;
    } catch {
        return DEFAULT_PUBLIC_ORIGIN;
    }
};

export const PUBLIC_ORIGIN = normalizeOrigin(import.meta.env.VITE_PUBLIC_ORIGIN);

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

export const isLocalAppOrigin = (origin: string): boolean => {
    try {
        const parsed = new URL(origin);
        return LOCAL_HOSTS.has(parsed.hostname);
    } catch {
        return false;
    }
};

export const buildPublicUrl = (pathOrUrl: string | undefined, fallbackPath = '/'): string => {
    const rawValue = (pathOrUrl || fallbackPath).trim() || fallbackPath;
    const baseOrigin = typeof window !== 'undefined' ? window.location.origin : PUBLIC_ORIGIN;

    try {
        const parsed = new URL(rawValue, baseOrigin);
        if (isLocalAppOrigin(parsed.origin) || parsed.origin === baseOrigin || parsed.origin === PUBLIC_ORIGIN) {
            return `${PUBLIC_ORIGIN}${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
        return parsed.toString();
    } catch {
        const normalizedPath = rawValue.startsWith('/') ? rawValue : `/${rawValue}`;
        return `${PUBLIC_ORIGIN}${normalizedPath}`;
    }
};

export const buildPublicRouteUrl = (route: string): string => buildPublicUrl(route);

export const getLocalRouteFromUrl = (rawUrl: string | undefined): string | undefined => {
    if (!rawUrl) return undefined;
    try {
        const baseOrigin = typeof window !== 'undefined' ? window.location.origin : PUBLIC_ORIGIN;
        const parsed = new URL(rawUrl, baseOrigin);
        if (parsed.origin === PUBLIC_ORIGIN || parsed.origin === baseOrigin || isLocalAppOrigin(parsed.origin)) {
            return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
    } catch {
        return undefined;
    }
    return undefined;
};
