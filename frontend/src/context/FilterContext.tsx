import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

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

    // Initialize from session storage if available, otherwise default to 2km (per user request)
    const [range, setRangeState] = useState<number | null>(() => {
        const saved = sessionStorage.getItem('sessionRange');
        return saved ? Number(saved) : 2; // Default 2km if new session
    });

    const [hasLoadedProfile, setHasLoadedProfile] = useState(false);

    // Fetch user preference on load
    useEffect(() => {
        if (!user) {
            // User logged out: Clear session storage to ensure fresh start next time
            sessionStorage.removeItem('sessionRange');
            setRangeState(null); // Reset internal state
            return;
        }

        const fetchUserPreferences = async () => {
            try {
                // If we already have a session value, we respect it (persistence during session).
                // Unless the user explicitly wants to reset on every reload? 
                // For now, we assume reloading the page is "continuing the session".
                if (sessionStorage.getItem('sessionRange')) {
                    setHasLoadedProfile(true);
                    return;
                }

                const snap = await getDoc(doc(db, 'users', user.uid));
                if (snap.exists()) {
                    const data = snap.data();
                    const pref = data.defaultDistanceKm ?? data.defaultRange; // Backward compat
                    if (pref !== undefined) {
                        // If pref is 999999 or very large, treat as null (infinite)
                        if (pref >= 999999) {
                            setRangeState(null);
                        } else {
                            setRangeState(pref);
                        }
                    } else {
                        // No profile preference found -> default 2km
                        setRangeState(2);
                    }
                }
            } catch (e) {
                console.error("Error fetching user preferences:", e);
            } finally {
                setHasLoadedProfile(true);
            }
        };

        fetchUserPreferences();
    }, [user]);

    const setRange = (newRange: number | null) => {
        setRangeState(newRange);
        if (newRange !== null) {
            sessionStorage.setItem('sessionRange', String(newRange));
        } else {
            sessionStorage.removeItem('sessionRange');
        }
    };

    const toggleRange = () => {
        let next: number | null = null;
        if (range === null) next = 1;
        else if (range === 1) next = 2;
        else if (range === 2) next = 5;
        else if (range === 5) next = 10;
        else if (range === 10) next = 50;
        else if (range === 50) next = 100;
        else if (range === 100) next = 500;
        else if (range === 500) next = null;
        else next = null;

        setRange(next);
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
