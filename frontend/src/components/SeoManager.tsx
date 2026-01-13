import { useEffect } from 'react';
import { useAppConfig } from '../context/AppConfigContext';

export const SeoManager: React.FC = () => {
    const config = useAppConfig();

    useEffect(() => {
        // Update Title
        document.title = config.appName || 'Listopic';

        // Update Meta Description
        let metaDescription = document.querySelector('meta[name="description"]');
        if (!metaDescription) {
            metaDescription = document.createElement('meta');
            metaDescription.setAttribute('name', 'description');
            document.head.appendChild(metaDescription);
        }
        metaDescription.setAttribute('content', config.appDescription || '');

        // Update Keywords
        let metaKeywords = document.querySelector('meta[name="keywords"]');
        if (!metaKeywords) {
            metaKeywords = document.createElement('meta');
            metaKeywords.setAttribute('name', 'keywords');
            document.head.appendChild(metaKeywords);
        }
        metaKeywords.setAttribute('content', config.keywords || '');

        // Update Favicon
        if (config.faviconUrl) {
            let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.head.appendChild(link);
            }
            link.href = config.faviconUrl;
        }

    }, [config]);

    return null; // Renders nothing visibly
};
