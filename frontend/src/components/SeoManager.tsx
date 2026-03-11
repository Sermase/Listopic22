import { useEffect } from 'react';
import { type AppConfig, useAppConfig } from '../context/AppConfigContext';

const DEFAULT_FAVICON_URL = '/default_favicon.svg';
const DEFAULT_APPLE_TOUCH_ICON_URL = '/apple-touch-icon.png';
const DEFAULT_MANIFEST_ICONS = [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
];

export const SeoManager: React.FC = () => {
    const config = useAppConfig();

    useEffect(() => {
        // --- BASIC METADATA ---
        document.title = config.appName || 'Listopic';

        // Update Meta Description
        updateMeta('description', config.appDescription || '');
        updateMeta('keywords', config.keywords || '');

        // --- OPEN GRAPH (SOCIAL) ---
        updateMetaProperty('og:title', config.appName || 'Listopic');
        updateMetaProperty('og:description', config.appDescription || 'Comparte y descubre listas de tus lugares favoritos.');
        updateMetaProperty('og:site_name', config.appName || 'Listopic');
        updateMetaProperty('og:type', 'website');

        // Logic for Social Image: Prioritize specific social image if we had one, otherwise Favicon or Logo
        // User requested: "images that appear there [Marca & SEO]... effectively be used"
        // We will use the Logo if available (usually larger/better for social), otherwise Favicon
        const socialImage = config.logoUrl || config.faviconUrl;
        if (socialImage) {
            updateMetaProperty('og:image', socialImage);
        }

        const brandingAssets = resolveBrandingAssets(config);

        updateFavicon(brandingAssets.faviconUrl);
        updateAppleTouchIcon(brandingAssets.appleTouchIconUrl);
        updateManifest({
            id: '/',
            name: config.appName || 'Listopic',
            short_name: config.appName || 'Listopic',
            description: config.appDescription || 'Comparte y descubre listas de tus lugares favoritos.',
            lang: 'es-ES',
            start_url: '/',
            scope: '/',
            display: 'standalone',
            background_color: '#0b1021',
            theme_color: '#0b1021',
            icons: brandingAssets.manifestIcons,
        });

    }, [config]);

    return null; // Renders nothing visibly
};

const resolveBrandingAssets = (config: AppConfig) => {
    const effectiveCustomIconUrl = (config.faviconType === 'image' && config.faviconUrl)
        ? config.faviconUrl
        : ((config.logoType === 'image' && config.logoUrl) ? config.logoUrl : null);

    if (!effectiveCustomIconUrl) {
        return {
            faviconUrl: DEFAULT_FAVICON_URL,
            appleTouchIconUrl: DEFAULT_APPLE_TOUCH_ICON_URL,
            manifestIcons: DEFAULT_MANIFEST_ICONS,
        };
    }

    const manifestIconType = guessImageMimeType(effectiveCustomIconUrl);

    return {
        faviconUrl: effectiveCustomIconUrl,
        appleTouchIconUrl: effectiveCustomIconUrl,
        manifestIcons: [
            { src: effectiveCustomIconUrl, sizes: '192x192', type: manifestIconType },
            { src: effectiveCustomIconUrl, sizes: '512x512', type: manifestIconType },
        ],
    };
};

// --- HELPER FUNCTIONS ---

const updateMeta = (name: string, content: string) => {
    let element = document.querySelector(`meta[name="${name}"]`);
    if (!element) {
        element = document.createElement('meta');
        element.setAttribute('name', name);
        document.head.appendChild(element);
    }
    element.setAttribute('content', content);
};

const updateMetaProperty = (property: string, content: string) => {
    let element = document.querySelector(`meta[property="${property}"]`);
    if (!element) {
        element = document.createElement('meta');
        element.setAttribute('property', property);
        document.head.appendChild(element);
    }
    element.setAttribute('content', content);
};

const updateFavicon = (url: string) => {
    let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    link.href = url;
};

const updateAppleTouchIcon = (url: string) => {
    let link: HTMLLinkElement | null = document.querySelector("link[rel='apple-touch-icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'apple-touch-icon';
        document.head.appendChild(link);
    }
    link.href = url;
};

const updateManifest = (manifestContent: Record<string, unknown>) => {
    let link: HTMLLinkElement | null = document.querySelector("link[rel='manifest']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'manifest';
        document.head.appendChild(link);
    }

    const previousBlobUrl = link.dataset.dynamicManifestUrl;
    if (previousBlobUrl) {
        URL.revokeObjectURL(previousBlobUrl);
    }

    const manifestBlob = new Blob([JSON.stringify(normalizeManifestUrls(manifestContent))], {
        type: 'application/manifest+json',
    });
    const manifestUrl = URL.createObjectURL(manifestBlob);
    link.href = manifestUrl;
    link.dataset.dynamicManifestUrl = manifestUrl;
};

const normalizeManifestUrls = (manifestContent: Record<string, unknown>) => {
    const normalizedManifest: Record<string, unknown> = { ...manifestContent };

    if (typeof normalizedManifest.start_url === 'string') {
        normalizedManifest.start_url = toAbsoluteUrl(normalizedManifest.start_url);
    }

    if (typeof normalizedManifest.scope === 'string') {
        normalizedManifest.scope = toAbsoluteUrl(normalizedManifest.scope);
    }

    if (typeof normalizedManifest.id === 'string') {
        normalizedManifest.id = toAbsoluteUrl(normalizedManifest.id);
    }

    if (Array.isArray(normalizedManifest.icons)) {
        normalizedManifest.icons = normalizedManifest.icons
            .filter((icon): icon is Record<string, unknown> => typeof icon === 'object' && icon !== null)
            .map((icon) => ({
                ...icon,
                src: typeof icon.src === 'string' ? toAbsoluteUrl(icon.src) : icon.src,
            }));
    }

    return normalizedManifest;
};

const toAbsoluteUrl = (url: string): string => {
    try {
        return new URL(url, window.location.origin).toString();
    } catch {
        return url;
    }
};

const guessImageMimeType = (url: string): string => {
    const normalizedUrl = url.toLowerCase();
    if (normalizedUrl.includes('.svg')) return 'image/svg+xml';
    if (normalizedUrl.includes('.webp')) return 'image/webp';
    if (normalizedUrl.includes('.jpg') || normalizedUrl.includes('.jpeg')) return 'image/jpeg';
    return 'image/png';
};
