import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';

/**
 * «Mis preferencias»: filtros que se aplican solos (dieta, alérgenos, movilidad,
 * mascotas) y las ayudas ⓘ. Son privados: se guardan en el navegador y, con sesión,
 * en la cuenta (users/{uid}.uxPreferences) para que sigan en otro dispositivo.
 */
export interface UxPreferences {
    glutenFree: boolean;
    vegetarian: boolean;
    vegan: boolean;
    /** Alérgenos de la UE (valores de ALLERGEN_OPTIONS) que se pliegan en La Carta. */
    allergens: string[];
    stepFree: boolean;
    accessibleRestroom: boolean;
    petFriendly: boolean;
    showHelpTips: boolean;
}

const DEFAULTS: UxPreferences = {
    glutenFree: false, vegetarian: false, vegan: false, allergens: [],
    stepFree: false, accessibleRestroom: false, petFriendly: false, showHelpTips: true,
};

const BOOL_KEYS = ['glutenFree', 'vegetarian', 'vegan', 'stepFree', 'accessibleRestroom', 'petFriendly', 'showHelpTips'] as const;
const MAX_ALLERGENS = 14;
const STORAGE_KEY = 'listopic_ux_prefs';

const readLocal = (): UxPreferences => {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        return sanitizeUxPreferences(saved);
    } catch {
        return DEFAULTS;
    }
};

export const sanitizeUxPreferences = (value: unknown): UxPreferences => {
    const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof UxPreferences, unknown>>;
    const out = { ...DEFAULTS };
    BOOL_KEYS.forEach((key) => { if (typeof v[key] === 'boolean') out[key] = v[key] as boolean; });
    if (Array.isArray(v.allergens)) {
        out.allergens = Array.from(new Set(v.allergens.filter((a): a is string => typeof a === 'string' && a.length > 0 && a.length <= 30))).slice(0, MAX_ALLERGENS);
    }
    return out;
};

interface PreferencesContextValue {
    prefs: UxPreferences;
    setPref: <K extends keyof UxPreferences>(key: K, value: UxPreferences[K]) => void;
}

const PreferencesContext = createContext<PreferencesContextValue>({ prefs: DEFAULTS, setPref: () => { } });

export const usePreferences = () => useContext(PreferencesContext);

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [prefs, setPrefs] = useState<UxPreferences>(readLocal);

    // Con sesión manda lo guardado en la cuenta.
    useEffect(() => {
        if (!user?.uid) return;
        let cancelled = false;
        getDoc(doc(db, 'users', user.uid))
            .then((snap) => {
                const remote = snap.exists() ? snap.data().uxPreferences : undefined;
                if (cancelled || !remote) return;
                const next = sanitizeUxPreferences(remote);
                setPrefs(next);
                try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* opcional */ }
            })
            .catch(() => { /* sin red: se queda lo del navegador */ });
        return () => { cancelled = true; };
    }, [user?.uid]);

    const setPref = useCallback(<K extends keyof UxPreferences>(key: K, value: UxPreferences[K]) => {
        setPrefs((prev) => {
            const next = { ...prev, [key]: value };
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* opcional */ }
            if (user?.uid) {
                setDoc(doc(db, 'users', user.uid), { uxPreferences: next }, { merge: true })
                    .catch((error) => console.error('No se pudieron guardar las preferencias:', error));
            }
            return next;
        });
    }, [user?.uid]);

    const value = useMemo(() => ({ prefs, setPref }), [prefs, setPref]);
    return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
};
