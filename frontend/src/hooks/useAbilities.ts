import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAppConfig } from '../context/AppConfigContext';
import { useAuth } from '../context/AuthContext';
import { useOptionalGamification } from '../context/GamificationContext';
import {
    abilityAllowed,
    sanitizeAbilityPrefs,
    unlockedFilterCount,
    type AbilityId,
    type AbilityPrefs,
} from '../lib/abilities';

// Medallas apagadas en Developer: una lectura por sesión, compartida por toda la app.
let inactiveCache: Promise<Set<string>> | null = null;
let inactiveValue: Set<string> = new Set();
const listeners = new Set<(value: Set<string>) => void>();

const fetchInactive = (): Promise<Set<string>> => Promise.resolve()
    .then(() => getDocs(query(collection(db, 'badges'), where('active', '==', false))))
    .then((snap) => new Set(snap.docs.map((d) => d.id)))
    .catch(() => new Set<string>());

export function refreshInactiveBadges(): Promise<Set<string>> {
    inactiveCache = fetchInactive().then((value) => {
        inactiveValue = value;
        listeners.forEach((fn) => fn(value));
        return value;
    });
    return inactiveCache;
}

export function useInactiveBadges(): Set<string> {
    const [value, setValue] = useState<Set<string>>(inactiveValue);
    useEffect(() => {
        listeners.add(setValue);
        if (!inactiveCache) void refreshInactiveBadges();
        else void inactiveCache.then(setValue);
        return () => { listeners.delete(setValue); };
    }, []);
    return value;
}

/** Comprueba una habilidad para unas medallas cualesquiera (p. ej. las del perfil que miras). */
export function useAbilityGate() {
    const config = useAppConfig();
    const inactiveBadges = useInactiveBadges();
    return useCallback(
        (id: AbilityId, badges: readonly string[] | undefined, isJefe = false) =>
            abilityAllowed(id, badges, { abilitiesConfig: config.abilities, inactiveBadges }, isJefe),
        [config.abilities, inactiveBadges],
    );
}

const NO_BADGES: string[] = [];
const NO_PREFS: AbilityPrefs = {};

/** Mis habilidades, mis preferencias y cómo guardarlas. */
export function useMyAbilities() {
    const gate = useAbilityGate();
    const { user, isJefe } = useAuth();
    const gamification = useOptionalGamification();
    const earnedBadgeIds = gamification?.earnedBadgeIds ?? NO_BADGES;
    const photosCount = gamification?.photosCount ?? 0;
    const abilityPrefs = gamification?.abilityPrefs ?? NO_PREFS;

    const has = useCallback((id: AbilityId) => Boolean(user) && gate(id, earnedBadgeIds, isJefe), [gate, earnedBadgeIds, isJefe, user]);
    const filtersUnlocked = has('photoFilters') ? unlockedFilterCount(photosCount, isJefe) : 0;

    const savePrefs = useCallback(async (patch: Partial<AbilityPrefs>) => {
        if (!user) return;
        const next: Record<string, unknown> = { ...abilityPrefs, ...patch };
        Object.keys(next).forEach((key) => {
            if (next[key] === undefined || next[key] === '') delete next[key];
        });
        await updateDoc(doc(db, 'users', user.uid), { abilityPrefs: sanitizeAbilityPrefs(next) });
    }, [abilityPrefs, user]);

    return useMemo(() => ({ has, filtersUnlocked, photosCount, prefs: abilityPrefs, savePrefs, isJefe }),
        [has, filtersUnlocked, photosCount, abilityPrefs, savePrefs, isJefe]);
}
