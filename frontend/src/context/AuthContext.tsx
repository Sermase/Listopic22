import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { type User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

/** Suspensión cautelar (users/{uid}.suspension, la escribe adminSetUserSuspension). */
export interface AccountSuspension {
    reason: string;
}

export type UserTypeValue = 'jefe' | 'user' | 'business' | string;

interface AuthContextType {
    user: User | null;
    loading: boolean;
    userTypes: UserTypeValue[];
    isJefe: boolean;
    /** Versión de Términos/Privacidad aceptada (users/{uid}.legalAcceptance.version). */
    acceptedLegalVersion: string | null;
    /** true cuando ya se ha leído users/{uid} al menos una vez para esta sesión. */
    profileLoaded: boolean;
    /** Cuenta en revisión: puede leer, pero no valorar, reaccionar ni chatear. */
    suspension: AccountSuspension | null;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    userTypes: [],
    isJefe: false,
    acceptedLegalVersion: null,
    profileLoaded: false,
    suspension: null,
});

export const useAuth = () => useContext(AuthContext);

function normalizeUserTypes(raw: unknown): UserTypeValue[] {
    if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
    if (typeof raw === 'string' && raw) return [raw];
    return [];
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [userTypes, setUserTypes] = useState<UserTypeValue[]>([]);
    const [acceptedLegalVersion, setAcceptedLegalVersion] = useState<string | null>(null);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [suspension, setSuspension] = useState<AccountSuspension | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            setLoading(false);
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, []);

    // Reactive subscription to the user profile so userType (incl. 'jefe')
    // changes propagate without requiring a reload.
    useEffect(() => {
        setProfileLoaded(false);
        setAcceptedLegalVersion(null);
        setSuspension(null);
        if (!user) { setUserTypes([]); return; }
        const userRef = doc(db, 'users', user.uid);
        const unsub = onSnapshot(userRef, (snap) => {
            const data = snap.data();
            setUserTypes(normalizeUserTypes(data?.userType));
            const version = data?.legalAcceptance?.version;
            setAcceptedLegalVersion(typeof version === 'string' ? version : null);
            const active = data?.suspension?.active === true;
            setSuspension(active ? { reason: typeof data?.suspension?.reason === 'string' ? data.suspension.reason : '' } : null);
            // Las reglas miran el claim «suspended» del token: se refresca al cambiar
            // para que la suspensión (o su fin) valga ya, sin esperar a la hora.
            void user.getIdTokenResult().then((token) => {
                if ((token.claims.suspended === true) !== active) return user.getIdToken(true);
                return undefined;
            }).catch(() => undefined);
            setProfileLoaded(true);
        }, (err) => {
            console.warn('AuthContext: onSnapshot users/ failed', err);
            setUserTypes([]);
            setProfileLoaded(true);
        });
        return () => unsub();
    }, [user]);

    const isJefe = useMemo(() => userTypes.includes('jefe'), [userTypes]);

    // Antes se escribía isOnline/lastActiveAt en users/{uid} en cada cambio de
    // visibilidad de la app. Nadie podía leerlo (no se copia a publicProfiles) y
    // cada escritura disparaba triggers y reindexaba el usuario en Algolia.

    return (
        <AuthContext.Provider value={{ user, loading, userTypes, isJefe, acceptedLegalVersion, profileLoaded, suspension }}>
            {loading ? (
                <div style={{ minHeight: '100vh', background: '#0b1021', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid rgba(99,102,241,0.2)', borderTopColor: '#6366f1', animation: 'lp-spin 0.75s linear infinite' }} />
                </div>
            ) : children}
        </AuthContext.Provider>
    );
};
