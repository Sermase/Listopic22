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

    // Initialize from session storage if available, otherwise null (will be updated by user profile)
    const [range, setRangeState] = useState<number | null>(() => {
        const saved = sessionStorage.getItem('sessionRange');
        return saved ? Number(saved) : null;
    });

    const [hasLoadedProfile, setHasLoadedProfile] = useState(false);

    // Fetch user preference on load
    useEffect(() => {
        if (!user) {
            // If logout, maybe reset? Or keep session? keeping session is usually fine.
            return;
        }

        const fetchUserPreferences = async () => {
            try {
                // Only override if session storage is empty OR we effectively want profile to be the "start" default
                // The requirement: "rango predeterminado cuando se inicia una sesión ... sea ese"
                // If I have sessionStorage, it means I ALREADY changed it or it persisted from a reload.
                // So session storage takes precedence if it exists.
                // BUT, if this is the FIRST load and sessionStorage is empty, use profile.

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
