import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const DEFAULT_RANGE_KM = 5;
export const RANGE_STEPS_KM: number[] = [1, 2, 5, 10, 50, 100, 500];
const SESSION_RANGE_KEY = 'sessionRange';
const SESSION_RANGE_UID_KEY = 'sessionRangeUid';

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
        const saved = sessionStorage.getItem(SESSION_RANGE_KEY);
        if (saved === null) {
            return undefined;
        }

        const savedUid = sessionStorage.getItem(SESSION_RANGE_UID_KEY);
        if (uid) {
            if (!savedUid || savedUid !== uid) {
                sessionStorage.removeItem(SESSION_RANGE_KEY);
                sessionStorage.removeItem(SESSION_RANGE_UID_KEY);
                return undefined;
            }
        }

        return normalizeRangeValue(saved, DEFAULT_RANGE_KM);
    };

    // If user exists and no session value, keep it neutral until profile preference is fetched.
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

    useEffect(() => {
        const uid = user?.uid;
        const sessionRange = resolveSessionRange(uid);

        if (!uid) {
            sessionStorage.removeItem(SESSION_RANGE_KEY);
            sessionStorage.removeItem(SESSION_RANGE_UID_KEY);
            setRangeState(DEFAULT_RANGE_KM);
            return;
        }

        if (sessionRange !== undefined) {
            setRangeState(sessionRange);
            return;
        }

        // Avoid showing 5km before loading persisted profile preference.
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
                sessionStorage.setItem(SESSION_RANGE_KEY, String(resolvedRange));
                sessionStorage.setItem(SESSION_RANGE_UID_KEY, uid);
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
    }, [user?.uid]);

    const setRange = (newRange: number | null) => {
        setRangeState(newRange);
        if (newRange !== null) {
            sessionStorage.setItem(SESSION_RANGE_KEY, String(newRange));
            if (user?.uid) {
                sessionStorage.setItem(SESSION_RANGE_UID_KEY, user.uid);
            }
        } else {
            sessionStorage.removeItem(SESSION_RANGE_KEY);
            sessionStorage.removeItem(SESSION_RANGE_UID_KEY);
        }
    };

    const toggleRange = () => {
        setRange(getNextRangeValue(range));
    };

    const getRangeLabel = () => {
        if (range === null) return "Sin rango";
        if (range === 0.5) return "< 500 m";
        return `< ${range} km`;
    };

    return (
        <FilterContext.Provider value={{ range, setRange, toggleRange, getRangeLabel }}>
            {children}
        </FilterContext.Provider>
    );
};
