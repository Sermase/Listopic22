import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { db } from '../firebase';
import { useAuth } from './AuthContext';

export type ThemeId = 'dark' | 'light' | 'warm' | 'cool';

export interface ThemeMeta {
    id: ThemeId;
    label: string;
    mood: string;
    description: string;
    preview: {
        bg: string;
        card: string;
        accent: string;
        accent2: string;
        text: string;
    };
    statusBarStyle: 'light' | 'dark';
}

export const THEMES: ThemeMeta[] = [
    {
        id: 'dark',
        label: 'Oscuro',
        mood: 'Índigo · Púrpura',
        description: 'El tema por defecto: moderno, con presencia nocturna.',
        preview: { bg: '#0b1021', card: '#151b2e', accent: '#6366f1', accent2: '#a855f7', text: '#f8fafc' },
        statusBarStyle: 'dark',   // Style.Dark = iconos blancos sobre fondo oscuro
    },
    {
        id: 'light',
        label: 'Claro',
        mood: 'Crema · Índigo',
        description: 'Fondo crema cálido para uso diurno prolongado.',
        preview: { bg: '#faf8f4', card: '#ffffff', accent: '#5b4cf5', accent2: '#a855f7', text: '#1a1625' },
        statusBarStyle: 'light',  // Style.Light = iconos negros sobre fondo claro
    },
    {
        id: 'warm',
        label: 'Cálido',
        mood: 'Terracota · Ámbar',
        description: 'Chocolate oscuro con acentos naranja quemado. Gastronómico.',
        preview: { bg: '#1a0f0c', card: '#2a1812', accent: '#f97316', accent2: '#dc2626', text: '#fff8f0' },
        statusBarStyle: 'dark',   // Style.Dark = iconos blancos sobre fondo oscuro
    },
    {
        id: 'cool',
        label: 'Fresco',
        mood: 'Teal · Menta',
        description: 'Verde azulado oscuro, fresco y contemporáneo.',
        preview: { bg: '#031a20', card: '#0c2a32', accent: '#14b8a6', accent2: '#06b6d4', text: '#ecfeff' },
        statusBarStyle: 'dark',   // Style.Dark = iconos blancos sobre fondo oscuro
    },
];

const THEME_CLASS: Record<ThemeId, string> = {
    dark: 'theme-dark',
    light: 'theme-light',
    warm: 'theme-warm',
    cool: 'theme-cool',
};

const LS_KEY = 'listopic-theme';
const VALID_IDS = new Set<ThemeId>(['dark', 'light', 'warm', 'cool']);

function sanitizeTheme(value: unknown): ThemeId | null {
    if (typeof value !== 'string') return null;
    return VALID_IDS.has(value as ThemeId) ? (value as ThemeId) : null;
}

function readInitialTheme(): ThemeId {
    if (typeof window === 'undefined') return 'dark';
    try {
        const stored = localStorage.getItem(LS_KEY);
        const sanitized = sanitizeTheme(stored);
        if (sanitized) return sanitized;
    } catch {
        // localStorage can throw in private mode / sandboxed iframes
    }
    return 'dark';
}

function applyThemeClass(theme: ThemeId): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    (Object.values(THEME_CLASS) as string[]).forEach((cls) => root.classList.remove(cls));
    root.classList.add(THEME_CLASS[theme]);
    root.setAttribute('data-theme', theme);
    const meta = THEMES.find((t) => t.id === theme);
    if (meta) {
        const metaTag = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
        if (metaTag) metaTag.setAttribute('content', meta.preview.bg);
    }
    if (Capacitor.isNativePlatform()) {
        const style = meta?.statusBarStyle === 'dark' ? Style.Dark : Style.Light;
        StatusBar.setBackgroundColor({ color: '#00000000' }).catch(() => { /* noop */ });
        StatusBar.setStyle({ style }).catch(() => { /* noop */ });
    }
}

interface ThemeContextType {
    theme: ThemeId;
    setTheme: (theme: ThemeId) => Promise<void>;
    themes: ThemeMeta[];
}

const ThemeContext = createContext<ThemeContextType>({
    theme: 'dark',
    setTheme: async () => { /* noop default */ },
    themes: THEMES,
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [theme, setThemeState] = useState<ThemeId>(() => readInitialTheme());
    // Tracks whether the next Firestore snapshot reflects a write we just issued
    // locally — avoids a round-trip that could flip the class back while we wait.
    const lastWriteRef = useRef<ThemeId | null>(null);

    // Apply class to <html> whenever theme changes
    useEffect(() => {
        applyThemeClass(theme);
        try {
            localStorage.setItem(LS_KEY, theme);
        } catch {
            // ignore (private mode, etc.)
        }
    }, [theme]);

    // Subscribe to user's Firestore preference. Keeps theme in sync across devices.
    useEffect(() => {
        if (!user) return;
        const ref = doc(db, 'users', user.uid);
        const unsub = onSnapshot(
            ref,
            (snap) => {
                const remote = sanitizeTheme(snap.data()?.themePreference);
                if (!remote) return;
                if (lastWriteRef.current === remote) {
                    lastWriteRef.current = null;
                    return;
                }
                setThemeState((current) => (current === remote ? current : remote));
            },
            () => { /* ignore read errors */ },
        );
        return () => unsub();
    }, [user]);

    const setTheme = useCallback(
        async (next: ThemeId) => {
            if (!VALID_IDS.has(next)) return;
            setThemeState(next);
            if (user) {
                lastWriteRef.current = next;
                try {
                    await setDoc(doc(db, 'users', user.uid), { themePreference: next }, { merge: true });
                } catch (err) {
                    console.warn('ThemeContext: failed to persist theme to Firestore', err);
                }
            }
        },
        [user],
    );

    const value = useMemo<ThemeContextType>(
        () => ({ theme, setTheme, themes: THEMES }),
        [theme, setTheme],
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
