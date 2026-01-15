import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export interface AppConfig {
    logoType: 'default' | 'image';
    logoUrl?: string; // For 'image' type
    faviconType: 'default' | 'image';
    faviconUrl?: string;
    appName: string;
    appDescription: string;
    keywords: string;
}

const defaultConfig: AppConfig = {
    logoType: 'default',
    faviconType: 'default',
    appName: 'Listopic',
    appDescription: 'Comparte y descubre listas de tus lugares favoritos.',
    keywords: 'listas, lugares, recomendaciones, social, mapas'
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
                    faviconType: data.faviconType === 'image' ? 'image' : 'default'
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
