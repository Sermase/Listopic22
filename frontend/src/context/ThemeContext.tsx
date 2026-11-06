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
import { useAppConfig, useAppConfigLoading } from './AppConfigContext';
import { fireSurprise } from '../lib/surprises';
import { claimThemeBadges } from '../services/SurpriseService';
import { THEME_PERKS, type ThemePerk } from '../lib/themeCharacters';

export type ThemeId = 'dark' | 'light' | 'warm' | 'cool' | 'neon' | 'graphite' | 'sunset' | 'lagoon' | 'abuela';

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
    /** Tema secreto: solo sale en la lista al desbloquearlo (medalla «Bien comido»). */
    secret?: boolean;
    /** Escalera de temas: la medalla que lo desbloquea (functions/modules/lib/theme-badges.js). */
    unlock?: { badge: string; medal: string; icon: string; hint: string };
}

export const THEMES: ThemeMeta[] = [
    {
        id: 'dark',
        label: 'Medianoche',
        mood: 'Estrellas · Luna',
        description: 'El de siempre: cielo de medianoche con estrellas finas y halo de luna.',
        preview: { bg: '#0d1431', card: '#18203f', accent: '#6366f1', accent2: '#a855f7', text: '#f8fafc' },
        statusBarStyle: 'dark',   // Style.Dark = iconos blancos sobre fondo oscuro
    },
    {
        id: 'light',
        label: 'Mediodía',
        mood: 'Sol · Cielo',
        description: 'La pareja de Medianoche: luz de mediodía, sol arriba y cielo en el menú.',
        preview: { bg: '#faf8f4', card: '#ffffff', accent: '#5b4cf5', accent2: '#a855f7', text: '#1a1625' },
        statusBarStyle: 'light',  // Style.Light = iconos negros sobre fondo claro
    },
    {
        id: 'warm',
        label: 'Cálido',
        mood: 'Brasa · Ladrillo',
        description: 'Asador y horno de leña: ascuas abajo, chispas y ladrillo en el menú.',
        preview: { bg: '#3a1c13', card: '#4a2418', accent: '#f97316', accent2: '#ef4444', text: '#fff4ea' },
        statusBarStyle: 'dark',   // Style.Dark = iconos blancos sobre fondo oscuro
        unlock: { badge: 'TEMA_CALIDO', medal: 'Primer bocado', icon: '🔥', hint: 'Haz tu primera valoración.' },
    },
    {
        id: 'cool',
        label: 'Fresco',
        mood: 'Heladería · Menta',
        description: 'Claro y fresco: menta, fresa y toldo a rayas, como una heladería.',
        preview: { bg: '#effaf5', card: '#ffffff', accent: '#0c8a78', accent2: '#e23d68', text: '#0f3d36' },
        statusBarStyle: 'light',
        unlock: { badge: 'TEMA_FRESCO', medal: 'Aire fresco', icon: '🌿', hint: 'Valora en 3 sitios distintos.' },
    },
    {
        id: 'neon',
        label: 'Neón',
        mood: 'Letrero · Horizonte',
        description: 'Bar de neón: rótulos que brillan y un horizonte con rejilla al fondo.',
        preview: { bg: '#170a28', card: '#25123a', accent: '#ec4899', accent2: '#22d3ee', text: '#fdf4ff' },
        statusBarStyle: 'dark',
        unlock: { badge: 'TEMA_NEON', medal: 'Noche de ciudad', icon: '💜', hint: 'Haz 10 valoraciones después de las 21 h.' },
    },
    {
        id: 'graphite',
        label: 'Pizarra',
        mood: 'Tiza · Madera',
        description: 'La pizarra del menú del día: títulos a tiza y marco de madera.',
        preview: { bg: '#26332e', card: '#2f3e38', accent: '#65a30d', accent2: '#fde047', text: '#f3f6ef' },
        statusBarStyle: 'dark',
        unlock: { badge: 'TEMA_GRAFITO', medal: 'Ojo de lince', icon: '🖤', hint: 'Haz 25 valoraciones con foto.' },
    },
    {
        id: 'sunset',
        label: 'Atardecer',
        mood: 'Malva · Coral',
        description: 'Ni de noche ni de día: malva templado con coral y naranja.',
        preview: { bg: '#4a2b52', card: '#5e3767', accent: '#ff7a59', accent2: '#f43f5e', text: '#fff7f0' },
        statusBarStyle: 'dark',
        unlock: { badge: 'TEMA_ATARDECER', medal: 'Hora dorada', icon: '🌇', hint: 'Haz 20 valoraciones entre las 18 y las 22 h, en 8 días distintos.' },
    },
    {
        id: 'lagoon',
        label: 'Laguna',
        mood: 'Turquesa · Rosa',
        description: 'Turquesa de agua tropical con rosa y mango.',
        preview: { bg: '#1d5566', card: '#26697b', accent: '#f472b6', accent2: '#fb923c', text: '#f2fffd' },
        statusBarStyle: 'dark',
        unlock: { badge: 'TEMA_LAGUNA', medal: 'Culo inquieto', icon: '🏝️', hint: 'Valora en 40 sitios distintos.' },
    },
    {
        id: 'abuela',
        label: 'Abuela',
        mood: 'Mantel · Huerta',
        description: 'Casa de pueblo: pared encalada, mantel de cuadros y la huerta a mano. «¿Has comido?».',
        preview: { bg: '#fdf8ec', card: '#fffdf6', accent: '#c0202c', accent2: '#3f7a2a', text: '#3a2a1c' },
        statusBarStyle: 'light',
        secret: true,
        unlock: { badge: 'BIEN_COMIDO', medal: 'Bien comido', icon: '👵', hint: 'Haz 3 valoraciones en un mismo domingo.' },
    },
];

const THEME_CLASS: Record<ThemeId, string> = {
    dark: 'theme-dark',
    light: 'theme-light',
    warm: 'theme-warm',
    // Encima del claro, como la Abuela.
    cool: 'theme-light theme-cool',
    neon: 'theme-neon',
    graphite: 'theme-graphite',
    sunset: 'theme-sunset',
    lagoon: 'theme-lagoon',
    // Encima del claro: hereda sus arreglos de contraste.
    abuela: 'theme-light theme-abuela',
};

const LS_KEY = 'listopic-theme';
const NO_BADGES: ReadonlySet<string> = new Set();
const VALID_IDS = new Set<ThemeId>(['dark', 'light', 'warm', 'cool', 'neon', 'graphite', 'sunset', 'lagoon', 'abuela']);

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
    (Object.values(THEME_CLASS) as string[]).forEach((cls) => root.classList.remove(...cls.split(' ')));
    root.classList.add(...THEME_CLASS[theme].split(' '));
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
    /** El siguiente tema de la escalera que aún no tienes (con su pista), o null. */
    nextLocked: ThemeMeta | null;
    /** Si el tema tiene ya su gracia (Medianoche y Mediodía la ganan con su medalla). */
    graceUnlocked: (id: ThemeId) => boolean;
}

const ThemeContext = createContext<ThemeContextType>({
    theme: 'dark',
    setTheme: async () => { /* noop default */ },
    themes: THEMES,
    nextLocked: null,
    graceUnlocked: () => false,
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, isJefe, profileLoaded } = useAuth();
    const config = useAppConfig();
    const configLoading = useAppConfigLoading();
    const ladder = config.surprises?.themeLadder !== false;
    const [badges, setBadges] = useState<ReadonlySet<string>>(() => new Set());
    // De quién son las medallas cargadas (null = sin sesión): evita juzgar con las de otra cuenta.
    const [badgesFor, setBadgesFor] = useState<string | null | undefined>(undefined);
    const seenBadgesRef = useRef<ReadonlySet<string> | null>(null);
    const [theme, setThemeState] = useState<ThemeId>(() => readInitialTheme());
    // Tracks whether the next Firestore snapshot reflects a write we just issued
    // locally — avoids a round-trip that could flip the class back while we wait.
    const lastWriteRef = useRef<ThemeId | null>(null);

    // Subscribe to user's Firestore preference. Keeps theme in sync across devices.
    useEffect(() => {
        seenBadgesRef.current = null;
        if (!user) return;
        const ref = doc(db, 'users', user.uid);
        const unsub = onSnapshot(
            ref,
            (snap) => {
                const list = snap.data()?.badges;
                const next = new Set<string>(Array.isArray(list) ? list : []);
                const seen = seenBadgesRef.current;
                if (seen) {
                    // Medalla de tema recién ganada (la de la Abuela ya la avisa su sorpresa).
                    THEMES.filter((t) => t.unlock && !t.secret && next.has(t.unlock.badge) && !seen.has(t.unlock.badge))
                        .forEach((t, i) => window.setTimeout(() => fireSurprise({
                            kind: 'bubble',
                            emoji: t.unlock!.icon,
                            text: `Medalla «${t.unlock!.medal}»: tema ${t.label} desbloqueado. Pruébalo en Preferencias → Tema.`,
                            haptic: 'success',
                        }), i * 1200));
                    // Medalla que da la gracia de Medianoche o Mediodía.
                    (Object.values(THEME_PERKS) as ThemePerk[]).filter((p) => next.has(p.badge) && !seen.has(p.badge))
                        .forEach((p, i) => window.setTimeout(() => fireSurprise({
                            kind: 'bubble',
                            emoji: p.icon,
                            text: `Medalla «${p.medal}». ${p.what}`,
                            haptic: 'success',
                        }), 600 + i * 1200));
                }
                seenBadgesRef.current = next;
                setBadges(next);
                setBadgesFor(user.uid);
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

    // Una vez al día, al abrir: las medallas de temas que ya se cumplen (p. ej. con valoraciones de antes).
    useEffect(() => {
        if (!user || !ladder || configLoading) return;
        const key = `listopic_theme_badges_${user.uid}`;
        const today = new Date().toISOString().slice(0, 10);
        try {
            if (localStorage.getItem(key) === today) return;
            localStorage.setItem(key, today);
        } catch { /* sin localStorage: se pide igual */ }
        void claimThemeBadges();
    }, [user, ladder, configLoading]);

    // Escalera de temas: cada medalla abre un tema. Apagada desde Developer, todos libres salvo la Abuela.
    const mine = user && badgesFor === user.uid ? badges : NO_BADGES;
    const isUnlocked = useCallback(
        (t: ThemeMeta) => !t.unlock || isJefe || mine.has(t.unlock.badge) || (!ladder && !t.secret),
        [isJefe, mine, ladder],
    );
    const themes = useMemo(() => THEMES.filter(isUnlocked), [isUnlocked]);
    const graceUnlocked = useCallback((id: ThemeId) => {
        const perk = THEME_PERKS[id];
        return !perk || isJefe || mine.has(perk.badge) || !ladder;
    }, [isJefe, mine, ladder]);
    const nextLocked = useMemo(
        () => (ladder ? THEMES.find((t) => t.unlock && !isUnlocked(t)) ?? null : null),
        [ladder, isUnlocked],
    );

    // Sin la medalla no hay tema: vuelta al Oscuro (cuando ya se sabe qué medallas tiene).
    // Se elige igual (y vuelve solo si se gana la medalla), pero no se pinta.
    const ready = (!user || (badgesFor === user.uid && profileLoaded)) && !configLoading;
    const current = THEMES.find((t) => t.id === theme);
    const shown: ThemeId = ready && current && !isUnlocked(current) ? 'dark' : theme;

    // Apply class to <html> whenever the shown theme changes
    useEffect(() => {
        applyThemeClass(shown);
        try {
            localStorage.setItem(LS_KEY, shown);
        } catch {
            // ignore (private mode, etc.)
        }
    }, [shown]);

    const value = useMemo<ThemeContextType>(
        () => ({ theme: shown, setTheme, themes, nextLocked, graceUnlocked }),
        [shown, setTheme, themes, nextLocked, graceUnlocked],
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
