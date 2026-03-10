import { useEffect } from 'react';

const FIREBASE_STORAGE_HOST = 'firebasestorage.googleapis.com';
const RETRY_FLAG = 'data-storage-retry-no-token';

const shouldRetryWithoutToken = (src: string): boolean => {
    try {
        const url = new URL(src);
        return url.hostname.includes(FIREBASE_STORAGE_HOST) && url.searchParams.has('token');
    } catch {
        return false;
    }
};

const removeTokenParam = (src: string): string | null => {
    try {
        const url = new URL(src);
        url.searchParams.delete('token');
        return url.toString();
    } catch {
        return null;
    }
};

export const StorageImageRecovery: React.FC = () => {
    useEffect(() => {
        const handleImageError = (event: Event) => {
            const target = event.target;
            if (!(target instanceof HTMLImageElement)) return;

            const src = target.currentSrc || target.src;
            if (!src || target.getAttribute(RETRY_FLAG) === '1') return;
            if (!shouldRetryWithoutToken(src)) return;

            const fallbackUrl = removeTokenParam(src);
            if (!fallbackUrl || fallbackUrl === src) return;

            target.setAttribute(RETRY_FLAG, '1');
            target.src = fallbackUrl;
        };

        document.addEventListener('error', handleImageError, true);

        return () => {
            document.removeEventListener('error', handleImageError, true);
        };
    }, []);

    return null;
};
