import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { getBusinessPlanFromPlace } from '../utils/businessPlan';

export interface ManagedBusinessesState {
    /** Negocios que el usuario gestiona o de los que es dueño. */
    count: number;
    /** Alguno de ellos tiene Business Pro activo. */
    hasPro: boolean;
}

const EMPTY: ManagedBusinessesState = { count: 0, hasPro: false };

/**
 * Negocios del usuario (gestor o dueño). Firestore comparte el listener entre
 * quien use la misma consulta (barra superior e inferior), así que no duplica lecturas.
 */
export function useManagedBusinesses(uid: string | null | undefined): ManagedBusinessesState {
    const [state, setState] = useState<ManagedBusinessesState & { uid: string | null }>({ ...EMPTY, uid: null });

    useEffect(() => {
        if (!uid) return;

        let managed = new Map<string, boolean>();
        let owned = new Map<string, boolean>();
        const publish = () => {
            const all = new Map([...managed, ...owned]);
            setState({ uid, count: all.size, hasPro: [...all.values()].some(Boolean) });
        };
        const toMap = (docs: { id: string; data: () => Record<string, unknown> }[]) =>
            new Map(docs.map((snap) => [snap.id, getBusinessPlanFromPlace(snap.data()).isPro]));

        const unsubscribeManaged = onSnapshot(
            query(collection(db, 'places'), where('businessManagerIds', 'array-contains', uid), limit(20)),
            (snapshot) => {
                managed = toMap(snapshot.docs);
                publish();
            },
            (error) => {
                console.warn('useManagedBusinesses: managed snapshot error', error);
                managed = new Map();
                publish();
            },
        );
        const unsubscribeOwned = onSnapshot(
            query(collection(db, 'places'), where('businessOwnerUserId', '==', uid), limit(20)),
            (snapshot) => {
                owned = toMap(snapshot.docs);
                publish();
            },
            (error) => {
                console.warn('useManagedBusinesses: owned snapshot error', error);
                owned = new Map();
                publish();
            },
        );

        return () => {
            unsubscribeManaged();
            unsubscribeOwned();
        };
    }, [uid]);

    // Al cerrar sesión o cambiar de cuenta no se arrastran los negocios de la anterior.
    return uid && state.uid === uid ? { count: state.count, hasPro: state.hasPro } : EMPTY;
}
