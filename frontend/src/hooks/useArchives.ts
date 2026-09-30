import { useState, useCallback } from 'react';
import { collection, doc, getDocs, getDoc, setDoc, deleteDoc, query, orderBy, serverTimestamp, updateDoc, increment, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

export interface ArchiveEntity {
    id: string;
    name: string;
    description?: string;
    createdAt: unknown;
    itemCount: number;
    emoji?: string;
    color?: string;
}

export interface SavedItemEntity {
    id: string; // Composite ID usually: `${type}_${itemId}` or just auto-id
    itemId: string;
    placeId?: string; // Critical for navigation
    type: 'place' | 'review' | 'group' | 'list';
    name: string;
    photoUrl?: string; // Snapshot for display
    savedAt: unknown;
    subtitle?: string; // e.g., Place name for a review
    route: string; // Pre-calculated route to navigate to
    lat?: number;
    lng?: number;
}

export const useArchives = () => {
    const { user } = useAuth();
    const [archives, setArchives] = useState<ArchiveEntity[]>([]);
    const [loading, setLoading] = useState(false);

    // Fetch user's archives. Devuelve la lista para que quien la necesite al
    // momento (p. ej. para saber dónde está guardado algo) no dependa del
    // estado de React, que aún no se ha actualizado.
    const fetchArchives = useCallback(async (): Promise<ArchiveEntity[]> => {
        if (!user) return [];
        setLoading(true);
        try {
            const q = query(collection(db, 'users', user.uid, 'archives'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as ArchiveEntity[];

            // If no archives exist, create a default "Guardados"
            if (data.length === 0) {
                const defaultRef = doc(collection(db, 'users', user.uid, 'archives'));
                await setDoc(defaultRef, {
                    name: "Guardados",
                    description: "Elementos guardados por defecto",
                    createdAt: serverTimestamp(),
                    itemCount: 0
                });
                data.push({ id: defaultRef.id, name: "Guardados", createdAt: new Date(), itemCount: 0 });
            }

            setArchives(data);
            return data;
        } catch (error) {
            console.error("Error fetching archives:", error);
            return [];
        } finally {
            setLoading(false);
        }
    }, [user]);

    // Create a new archive
    const createArchive = async (name: string, emoji?: string, color?: string) => {
        if (!user) return null;
        try {
            const newRef = doc(collection(db, 'users', user.uid, 'archives'));
            const data: any = {
                name,
                createdAt: serverTimestamp(),
                itemCount: 0
            };
            if (emoji) data.emoji = emoji;
            if (color) data.color = color;
            await setDoc(newRef, data);
            await fetchArchives(); // Refresh
            return newRef.id;
        } catch (error) {
            console.error("Error creating archive:", error);
            throw error;
        }
    };

    // Update an archive
    const updateArchive = async (archiveId: string, updates: Partial<ArchiveEntity>) => {
        if (!user) return;
        try {
            await updateDoc(doc(db, 'users', user.uid, 'archives', archiveId), {
                ...updates
            });
            await fetchArchives();
        } catch (error) {
            console.error("Error updating archive:", error);
            throw error;
        }
    };

    // Delete an archive
    const deleteArchive = async (archiveId: string) => {
        if (!user) return;
        try {
            await deleteDoc(doc(db, 'users', user.uid, 'archives', archiveId));
            // Note: This leaves subcollection items orphaned in Firestore unless we use a Cloud Function to clean them up.
            // For now, this is acceptable for the MVP or we can strictly delete items if we had them loaded.
            // Client-side cleanup of subcollections is expensive.
            await fetchArchives(); // Refresh
        } catch (error) {
            console.error("Error deleting archive:", error);
            throw error;
        }
    };

    // Colecciones en las que está guardado un elemento (ids). Acepta la lista
    // de colecciones recién leída para no usar un estado desactualizado.
    const checkItemSavedStatus = async (itemId: string, archiveList: ArchiveEntity[] = archives) => {
        if (!user || !itemId) return [];
        const results = await Promise.all(archiveList.map(async (arch) => {
            const snap = await getDoc(doc(db, 'users', user.uid, 'archives', arch.id, 'items', itemId));
            return snap.exists() ? arch.id : null;
        }));
        return results.filter((id): id is string => id !== null);
    };

    // Añade o quita un elemento de una colección. El contador solo cambia si el
    // elemento cambia de estado (guardar dos veces no suma dos). Los errores se
    // propagan para que la interfaz pueda avisar.
    const toggleItemInArchive = async (archiveId: string, item: SavedItemEntity, isAdding: boolean) => {
        if (!user) return;

        const itemRef = doc(db, 'users', user.uid, 'archives', archiveId, 'items', item.itemId);
        const archiveRef = doc(db, 'users', user.uid, 'archives', archiveId);
        // Firestore rechaza campos undefined: se quitan antes de escribir.
        const payload = Object.fromEntries(
            Object.entries({ ...item, savedAt: serverTimestamp() }).filter(([, value]) => value !== undefined)
        );

        await runTransaction(db, async (tx) => {
            const existing = await tx.get(itemRef);
            if (isAdding) {
                tx.set(itemRef, payload);
                if (!existing.exists()) tx.update(archiveRef, { itemCount: increment(1) });
            } else if (existing.exists()) {
                tx.delete(itemRef);
                tx.update(archiveRef, { itemCount: increment(-1) });
            }
        });
    };

    return {
        archives,
        loading,
        fetchArchives,
        createArchive,
        updateArchive,
        deleteArchive,
        checkItemSavedStatus,
        toggleItemInArchive
    };
};
