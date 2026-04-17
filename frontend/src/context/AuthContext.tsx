import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { type User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { db } from '../firebase';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';

export type UserTypeValue = 'jefe' | 'user' | 'business' | string;

interface AuthContextType {
    user: User | null;
    loading: boolean;
    userTypes: UserTypeValue[];
    isJefe: boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    userTypes: [],
    isJefe: false,
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
        if (!user) { setUserTypes([]); return; }
        const userRef = doc(db, 'users', user.uid);
        const unsub = onSnapshot(userRef, (snap) => {
            setUserTypes(normalizeUserTypes(snap.data()?.userType));
        }, (err) => {
            console.warn('AuthContext: onSnapshot users/ failed', err);
            setUserTypes([]);
        });
        return () => unsub();
    }, [user]);

    const isJefe = useMemo(() => userTypes.includes('jefe'), [userTypes]);

    useEffect(() => {
        if (!user) return;

        const userRef = doc(db, 'users', user.uid);

        const setPresence = async (isOnline: boolean) => {
            try {
                await setDoc(userRef, {
                    isOnline,
                    lastActiveAt: serverTimestamp()
                }, { merge: true });
            } catch (error) {
                console.warn('Failed to update presence:', error);
            }
        };

        const handleVisibility = () => {
            void setPresence(document.visibilityState === 'visible');
        };

        void setPresence(document.visibilityState === 'visible');
        document.addEventListener('visibilitychange', handleVisibility);

        const handleBeforeUnload = () => {
            void setPresence(false);
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            void setPresence(false);
        };
    }, [user]);

    return (
        <AuthContext.Provider value={{ user, loading, userTypes, isJefe }}>
            {loading ? (
                <div style={{ minHeight: '100vh', background: '#0b1021', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid rgba(99,102,241,0.2)', borderTopColor: '#6366f1', animation: 'lp-spin 0.75s linear infinite' }} />
                </div>
            ) : children}
        </AuthContext.Provider>
    );
};
