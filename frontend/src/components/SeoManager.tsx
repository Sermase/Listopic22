import { useEffect } from 'react';
import { useAppConfig } from '../context/AppConfigContext';

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

        // --- FAVICON ---
        const effectiveFaviconUrl = config.faviconType === 'image' && config.faviconUrl
            ? config.faviconUrl
            : '/default_favicon.svg';

        updateFavicon(effectiveFaviconUrl);

    }, [config]);

    return null; // Renders nothing visibly
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
    // Force browser refresh of icon by changing type if needed or just href
    link.href = url;
};
