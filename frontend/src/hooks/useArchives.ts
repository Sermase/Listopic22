import { useState, useEffect, useCallback } from 'react';
import { collection, doc, getDocs, getDoc, setDoc, deleteDoc, query, orderBy, serverTimestamp, writeBatch, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

export interface ArchiveEntity {
    id: string;
    name: string;
    description?: string;
    createdAt: any;
    itemCount: number;
    // For UI ease, we might want to preview images, but that's complex to maintain.
}

export interface SavedItemEntity {
    id: string; // Composite ID usually: `${type}_${itemId}` or just auto-id
    itemId: string;
    placeId?: string; // Critical for navigation
    type: 'place' | 'review' | 'group' | 'list';
    name: string;
    photoUrl?: string; // Snapshot for display
    savedAt: any;
    subtitle?: string; // e.g., Place name for a review
    route: string; // Pre-calculated route to navigate to
}

export const useArchives = () => {
    const { user } = useAuth();
    const [archives, setArchives] = useState<ArchiveEntity[]>([]);
    const [loading, setLoading] = useState(false);

    // Fetch user's archives
    const fetchArchives = useCallback(async () => {
        if (!user) return;
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
        } catch (error) {
            console.error("Error fetching archives:", error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    // Create a new archive
    const createArchive = async (name: string) => {
        if (!user) return null;
        try {
            const newRef = doc(collection(db, 'users', user.uid, 'archives'));
            await setDoc(newRef, {
                name,
                createdAt: serverTimestamp(),
                itemCount: 0
            });
            await fetchArchives(); // Refresh
            return newRef.id;
        } catch (error) {
            console.error("Error creating archive:", error);
            throw error;
        }
    };

    // Check if item is saved in any archive (returns list of archive IDs)
    const checkItemSavedStatus = async (itemId: string) => {
        if (!user) return [];
        // This is tricky in Firestore subcollections. 
        // We'd need to query ALL archives' subcollections, which is expensive (collectionGroup query restricted by user path issue).
        // ALTERNATIVE: Simplify. A separate root collection `saved_items` per user or just query archives if count is low.
        // DESIGN CHOICE: iterate archives for now. User won't have 100 archives.

        const savedArchiveIds: string[] = [];

        // Parallel check (Optimization: Could denormalize "saved_in" array on client if we tracked it differently)
        // For MVP: We check against the `archives` state if populated, or fetch logic.
        // Actually, to make "isSaved" efficient, usually we have a `users/{uid}/saved_refs/{itemId}` document.
        // Let's implement that pattern for global "Is Saved?" checks.

        // However, the prompt implies "Membership in specific folder".
        // Let's iterate `archives` and check `archives/{id}/items/{itemId}` exists.

        // Improved Approach: `collectionGroup(db, 'items')` with `where('itemId', '==', itemId)` AND filter client side by parent path?
        // No, `users/{uid}/archives/{aid}/items`.

        // Let's stick to simple Iteration for now, assuming < 10 archives.
        await Promise.all(archives.map(async (arch) => {
            const docRef = doc(db, 'users', user.uid, 'archives', arch.id, 'items', itemId);
            const snap = await getDoc(docRef);
            if (snap.exists()) savedArchiveIds.push(arch.id);
        }));

        return savedArchiveIds;
    };

    // Toggle Item in Archive
    const toggleItemInArchive = async (archiveId: string, item: SavedItemEntity, isAdding: boolean) => {
        if (!user) return;

        const itemRef = doc(db, 'users', user.uid, 'archives', archiveId, 'items', item.itemId); // Use itemId as docId to ensure uniqueness per archive
        const archiveRef = doc(db, 'users', user.uid, 'archives', archiveId);

        try {
            if (isAdding) {
                await setDoc(itemRef, { ...item, savedAt: serverTimestamp() });
                // Increment counter (naive)
                // In production use Cloud Functions
            } else {
                await deleteDoc(itemRef);
            }
        } catch (e) {
            console.error("Error toggling item:", e);
        }
    };

    return {
        archives,
        loading,
        fetchArchives,
        createArchive,
        checkItemSavedStatus,
        toggleItemInArchive
    };
};
