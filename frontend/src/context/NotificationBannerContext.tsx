import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export interface BannerItem {
    type: string;
    message: string;
    link: string;
    senderPhoto?: string | null;
}

interface BannerContextValue {
    showBanner: (item: BannerItem) => void;
    current: BannerItem | null;
    dismiss: () => void;
}

const BannerContext = createContext<BannerContextValue>({
    showBanner: () => {},
    current: null,
    dismiss: () => {},
});

export const useNotificationBanner = () => useContext(BannerContext);

export const NotificationBannerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [current, setCurrent] = useState<BannerItem | null>(null);
    const queue = useRef<BannerItem[]>([]);
    const showing = useRef(false);

    const showNext = useCallback(() => {
        if (queue.current.length === 0) {
            showing.current = false;
            setCurrent(null);
            return;
        }
        const next = queue.current.shift()!;
        showing.current = true;
        setCurrent(next);
    }, []);

    const dismiss = useCallback(() => {
        showNext();
    }, [showNext]);

    const showBanner = useCallback((item: BannerItem) => {
        if (queue.current.length >= 5) return; // máximo 5 en cola
        if (!showing.current) {
            showing.current = true;
            setCurrent(item);
        } else {
            queue.current.push(item);
        }
    }, []);

    return (
        <BannerContext.Provider value={{ showBanner, current, dismiss }}>
            {children}
        </BannerContext.Provider>
    );
};
