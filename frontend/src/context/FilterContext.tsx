import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

// «Cerca» de verdad: 1 km. Si hay poco, la Home amplía el radio sin tocar la elección.
export const DEFAULT_RANGE_KM = 1;
export const RANGE_STEPS_KM: number[] = [1, 2, 5, 10, 50, 100, 500];
const SESSION_RANGE_KEY = 'sessionRange';
const SESSION_RANGE_UID_KEY = 'sessionRangeUid';

// La distancia elegida se recuerda entre visitas (por usuario; '' sin sesión).
const rangeStore = {
    get: (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } },
    set: (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* opcional */ } },
    remove: (key: string) => { try { localStorage.removeItem(key); } catch { /* opcional */ } },
};

export const getNextRangeValue = (current: number | null): number | null => {
    if (current === null) {
        return RANGE_STEPS_KM[0];
    }

    const exactIndex = RANGE_STEPS_KM.indexOf(current);
    if (exactIndex >= 0) {
        return exactIndex === RANGE_STEPS_KM.length - 1 ? null : RANGE_STEPS_KM[exactIndex + 1];
    }

    const nextGreater = RANGE_STEPS_KM.find((value) => value > current);
    return nextGreater ?? null;
};

export const getExpandedRangeValue = (current: number | null): number | null => {
    if (current === null) {
        return null;
    }

    const nextGreater = RANGE_STEPS_KM.find((value) => value > current);
    return nextGreater ?? null;
};

function normalizeRangeValue(value: unknown, fallback: number | null): number | null {
    if (value === null) {
        return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    if (parsed >= 999999) {
        return null;
    }

    if (parsed <= 0) {
        return fallback;
    }

    return parsed;
}

interface FilterContextType {
    range: number | null;
    setRange: (range: number | null) => void;
    toggleRange: () => void;
    getRangeLabel: () => string;
}

const FilterContext = createContext<FilterContextType>({
    range: null,
    setRange: () => { },
    toggleRange: () => { },
    getRangeLabel: () => "Sin rango"
});

export const useFilters = () => useContext(FilterContext);

export const FilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();

    const resolveSessionRange = (uid: string | undefined): number | null | undefined => {
        const saved = rangeStore.get(SESSION_RANGE_KEY);
        if (saved === null) {
            return undefined;
        }
        if ((rangeStore.get(SESSION_RANGE_UID_KEY) ?? '') !== (uid ?? '')) {
            return undefined;
        }
        return saved === 'all' ? null : normalizeRangeValue(saved, DEFAULT_RANGE_KM);
    };

    // Con sesión y sin valor guardado, neutro hasta leer la preferencia del perfil.
    const [range, setRangeState] = useState<number | null>(() => {
        const sessionRange = resolveSessionRange(user?.uid);
        if (sessionRange !== undefined) {
            return sessionRange;
        }
        if (user) {
            return null;
        }
        return DEFAULT_RANGE_KM;
    });

    const storeRange = useCallback((value: number | null, uid: string | undefined) => {
        rangeStore.set(SESSION_RANGE_KEY, value === null ? 'all' : String(value));
        rangeStore.set(SESSION_RANGE_UID_KEY, uid ?? '');
    }, []);

    useEffect(() => {
        const uid = user?.uid;
        const sessionRange = resolveSessionRange(uid);

        if (sessionRange !== undefined) {
            setRangeState(sessionRange);
            return;
        }

        if (!uid) {
            setRangeState(DEFAULT_RANGE_KM);
            return;
        }

        // Evita enseñar el radio por defecto antes de leer la preferencia del perfil.
        setRangeState(null);

        let cancelled = false;
        const fetchUserPreferences = async () => {
            try {
                const snap = await getDoc(doc(db, 'users', uid));
                let resolvedRange = DEFAULT_RANGE_KM;
                if (snap.exists()) {
                    const data = snap.data();
                    const pref = data.defaultDistanceKm ?? data.defaultRange; // Backward compat
                    if (pref !== undefined && pref !== null) {
                        resolvedRange = normalizeRangeValue(pref, DEFAULT_RANGE_KM) ?? DEFAULT_RANGE_KM;
                    }
                }
                if (cancelled) return;
                setRangeState(resolvedRange);
                storeRange(resolvedRange, uid);
            } catch (e) {
                console.error("Error fetching user preferences:", e);
                if (cancelled) return;
                setRangeState(DEFAULT_RANGE_KM);
            }
        };

        fetchUserPreferences();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid]);

    const setRange = useCallback((newRange: number | null) => {
        setRangeState(newRange);
        storeRange(newRange, user?.uid);
    }, [user?.uid, storeRange]);

    const toggleRange = useCallback(() => {
        setRange(getNextRangeValue(range));
    }, [range, setRange]);

    const getRangeLabel = useCallback(() => {
        if (range === null) return "Sin rango";
        if (range === 0.5) return "< 500 m";
        return `< ${range} km`;
    }, [range]);

    const value = useMemo(
        () => ({ range, setRange, toggleRange, getRangeLabel }),
        [range, setRange, toggleRange, getRangeLabel]
    );

    return (
        <FilterContext.Provider value={value}>
            {children}
        </FilterContext.Provider>
    );
};
