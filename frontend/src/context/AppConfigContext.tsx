import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export interface AppConfig {
    logoType: 'default' | 'image';
    logoUrl?: string;
    logoUrlDark?: string;
    logoUrlLight?: string;
    logoUrlWarm?: string;
    logoUrlCool?: string;
    faviconType: 'default' | 'image';
    faviconUrl?: string;
    appName: string;
    appDescription: string;
    keywords: string;
    showRandomChoiceButton: boolean;
    showProfileFavoriteBadge: boolean;
    homeReviewsMonths: number; // 0 = sin límite de tiempo, >0 = meses hacia atrás
}

const defaultConfig: AppConfig = {
    logoType: 'default',
    faviconType: 'default',
    appName: 'Listopic',
    appDescription: 'Comparte y descubre listas de tus lugares favoritos.',
    keywords: 'listas, lugares, recomendaciones, social, mapas',
    showRandomChoiceButton: true,
    showProfileFavoriteBadge: true,
    homeReviewsMonths: 12,
};

const AppConfigContext = createContext<AppConfig>(defaultConfig);

export const AppConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [config, setConfig] = useState<AppConfig>(defaultConfig);

    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'config', 'app'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setConfig({
                    ...defaultConfig, // Fallback defaults
                    ...data,
                    // Ensure valid types if needed
                    logoType: data.logoType === 'image' ? 'image' : 'default',
                    faviconType: data.faviconType === 'image' ? 'image' : 'default',
                    showRandomChoiceButton: typeof data.showRandomChoiceButton === 'boolean'
                        ? data.showRandomChoiceButton
                        : defaultConfig.showRandomChoiceButton,
                    showProfileFavoriteBadge: typeof data.showProfileFavoriteBadge === 'boolean'
                        ? data.showProfileFavoriteBadge
                        : defaultConfig.showProfileFavoriteBadge,
                    homeReviewsMonths: typeof data.homeReviewsMonths === 'number'
                        ? data.homeReviewsMonths
                        : defaultConfig.homeReviewsMonths,
                } as AppConfig);
            }
        }, (error) => {
            console.error("Error fetching app config:", error);
        });

        return () => unsubscribe();
    }, []);

    return (
        <AppConfigContext.Provider value={config}>
            {children}
        </AppConfigContext.Provider>
    );
};

export const useAppConfig = () => useContext(AppConfigContext);
