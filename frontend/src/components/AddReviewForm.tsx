import React, { useState, useEffect, useMemo } from 'react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment, getDoc, setDoc, query, where, getDocs, deleteDoc, deleteField } from 'firebase/firestore';
import { db, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../context/AuthContext';
import { Loader2, X, Image as ImageIcon, MapPin as MapPinIcon, Lock, Trash2 } from 'lucide-react';
import { PlaceSearch } from './PlaceSearch';
import { PlaceService, type PlaceResult, transformToLegacyPlace } from '../services/PlaceService';
import { ListSearch } from './ListSearch';

interface AddReviewFormProps {
    listId: string | null;
    onListChange?: (id: string) => void;
    prefillPlaceId?: string;
    prefillItemName?: string;
    editReviewId?: string;
    lockList?: boolean;
    onClose: () => void;
    onSuccess: () => void;
    suggestedListIds?: string[]; // IDs of lists where this place is already present
}

export const AddReviewForm: React.FC<AddReviewFormProps> = ({ listId, onListChange, prefillPlaceId, prefillItemName, editReviewId, lockList = false, onClose, onSuccess, suggestedListIds }) => {
    const { user } = useAuth();

    // Core Data
    // Core Data
    const [itemName, setItemName] = useState(prefillItemName || '');
    const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);

    const [comment, setComment] = useState('');
    const [overallRating, setOverallRating] = useState(5);

    // Changed: Store full definition list to preserve ORDER
    const [criteriaList, setCriteriaList] = useState<any[]>([]);
    const [criteriaScores, setCriteriaScores] = useState<Record<string, number>>({});

    // Extras
    const [_imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [customTags, setCustomTags] = useState<string[]>([]);
    const [listAvailableTags, setListAvailableTags] = useState<string[]>([]);

    const [initLoading, setInitLoading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [listData, setListData] = useState<any>(null); // Store full list data for lineage
    const [reviewPath, setReviewPath] = useState<string | null>(null);

    const [internalListId, setInternalListId] = useState<string | null>(listId);

    // UX States
    const [ratingsTouched, setRatingsTouched] = useState(false);
    const [originalData, setOriginalData] = useState<string>(''); // JSON string for deep comparison

    // Update internalListId if prop changes
    useEffect(() => {
        if (listId) setInternalListId(listId);
    }, [listId]);

    // Validation Logic
    const isNew = !editReviewId;

    const isValid = useMemo(() => {
        // 1. Place is required
        if (!selectedPlace) return false;

        // 2. Name is required
        if (!itemName.trim()) return false;

        // 3. List is required (use internal state)
        if (!internalListId) return false;

        // 4. Ratings Touched (Only for NEW reviews)
        // If editing, we assume valid unless cleared (which isn't possible here easily)
        if (isNew && !ratingsTouched) return false;

        return true;
    }, [selectedPlace, itemName, internalListId, ratingsTouched, isNew]);

    const isDirty = useMemo(() => {
        if (isNew) return true; // Always dirty if new (until saved)
        const currentData = JSON.stringify({
            itemName,
            comment,
            criteriaScores,
            customTags,
            imagePreview, // crude check for photo change
            listId: internalListId // Include listId in comparison structure
        });

        return currentData !== originalData;
    }, [isNew, itemName, comment, criteriaScores, customTags, imagePreview, originalData, internalListId]);

    // Fetch Review Data for Editing
    useEffect(() => {
        const fetchReviewData = async () => {
            if (!editReviewId) return;
            // If listId is missing, we can try to fetch globally, but we prefer context.

            try {
                // Determine collection path. Assuming 'lists/{listId}/reviews/{reviewId}' or global 'reviews'?
                // The addDoc gets written to 'reviews' (global) now in recent iterations, but let's check.
                const reviewRef = doc(db, 'reviews', editReviewId);
                const snap = await getDoc(reviewRef);

                if (snap.exists()) {
                    const data = snap.data();
                    setReviewPath(`reviews/${editReviewId}`);

                    setItemName(data.itemName || '');
                    setComment(data.comment || '');
                    setOverallRating(data.overallRating || 5);
                    if (data.scores) setCriteriaScores(data.scores);
                    if (data.tags || data.userTags) setCustomTags(data.tags || data.userTags);
                    if (data.photoUrl) setImagePreview(data.photoUrl);

                    // Fixed: Always prefer stored listId from review data if creating/editing
                    if (data.listId) {
                        setInternalListId(data.listId);
                    } else if (listId) {
                        setInternalListId(listId);
                    }

                    // Capture Original Data for Dirty Check
                    setOriginalData(JSON.stringify({
                        itemName: data.itemName || '',
                        comment: data.comment || '',
                        criteriaScores: data.scores || {},
                        customTags: data.tags || data.userTags || [],
                        imagePreview: data.photoUrl || null,
                        listId: data.listId // Match structure
                    }));

                    if (data.placeId) {
                        // Fetch fresh details from Place Service
                        try {
                            const details = await PlaceService.getDetails(data.placeId);
                            const legacyPlace = transformToLegacyPlace({
                                id: data.placeId,
                                name: data.placeName || data.itemName || 'Lugar',
                                address: data.placeAddress || '',
                                lat: data.placeLat || 0,
                                lng: data.placeLng || 0
                            } as any, details);

                            setSelectedPlace({
                                id: legacyPlace.googlePlaceId || data.placeId,
                                name: legacyPlace.name,
                                address: legacyPlace.address,
                                lat: legacyPlace.coordinates.latitude,
                                lng: legacyPlace.coordinates.longitude,
                                types: legacyPlace.types || [] // Hydrate types if available
                            });
                        } catch (e) {
                            // Fallback
                            setSelectedPlace({
                                id: data.placeId,
                                name: data.placeName || data.itemName || 'Lugar',
                                address: data.placeAddress || '',
                                lat: data.placeLat || 0,
                                lng: data.placeLng || 0
                            });
                        }
                    }
                } else if (listId) {
                    // Fallback to subcollection (Legacy)
                    const subRef = doc(db, 'lists', listId, 'reviews', editReviewId);
                    const subSnap = await getDoc(subRef);

                    if (subSnap.exists()) {
                        setReviewPath(`lists/${listId}/reviews/${editReviewId}`);
                        const data = subSnap.data();
                        setItemName(data.itemName || '');
                        setComment(data.comment || '');
                        setOverallRating(data.overallRating || 5);
                        if (data.scores) setCriteriaScores(data.scores);
                        if (data.tags || data.userTags) setCustomTags(data.tags || data.userTags);
                        if (data.photoUrl) setImagePreview(data.photoUrl);
                        if (data.listId) setInternalListId(data.listId);

                        if (data.placeId) {
                            setSelectedPlace({
                                id: data.placeId,
                                name: data.placeName || 'Lugar',
                                address: data.placeAddress || '',
                                lat: data.placeLat || 0,
                                lng: data.placeLng || 0
                            });
                        }
                    }
                }
            } catch (e) {
                console.error("Error fetching review for edit:", e);
                setError("Error cargando la reseña para editar");
            }
        };

        if (editReviewId) {
            fetchReviewData();
        }
    }, [editReviewId, listId]);

    // Hydrate Place from PREFILL (Group Page Context)
    useEffect(() => {
        const hydratePrefillPlace = async () => {
            if (prefillPlaceId && !editReviewId && !selectedPlace) {
                try {
                    const placeRef = doc(db, 'places', prefillPlaceId);
                    const snap = await getDoc(placeRef);

                    if (snap.exists()) {
                        const data = snap.data();
                        setSelectedPlace({
                            id: data.id || data.googlePlaceId || prefillPlaceId,
                            name: data.name,
                            address: data.address,
                            lat: data.location?.latitude || data.lat || 0,
                            lng: data.location?.longitude || data.lng || 0,
                            types: data.types || []
                        });
                    } else {
                        setSelectedPlace({
                            id: prefillPlaceId,
                            name: 'Lugar Seleccionado',
                            address: '',
                            lat: 0,
                            lng: 0
                        });
                    }
                } catch (e) {
                    console.warn("Error hydrating prefill place", e);
                }
            }
        };
        hydratePrefillPlace();
    }, [prefillPlaceId, editReviewId]);

    // Recalculate Overall Rating
    useEffect(() => {
        if (criteriaList.length === 0 || Object.keys(criteriaScores).length === 0) return;

        let total = 0;
        let count = 0;

        criteriaList.forEach((c) => {
            const val = criteriaScores[c.id];
            // Only ponderable items count towards the global rating
            if (c.ponderable !== false && val !== undefined) {
                total += val;
                count++;
            }
        });

        if (count > 0) {
            const avg = total / count;
            setOverallRating(parseFloat(avg.toFixed(1)));
        }
    }, [criteriaScores, criteriaList]);

    // Fetch List Metadata
    useEffect(() => {
        const fetchListMetadata = async () => {
            // If editing, we rely on internalListId rather than prop listId primarily
            const targetListId = internalListId || listId;

            if (!targetListId) {
                setListData(null);
                setInitLoading(false);
                return;
            }
            try {
                const docRef = doc(db, 'lists', targetListId);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const data = snap.data();
                    setListData(data);

                    if (data.name && !itemName && !prefillItemName && !editReviewId) {
                        setItemName(data.name);
                    }

                    if (data.criteriaDefinition) {
                        let cList: any[] = [];
                        let scores: Record<string, number> = {};

                        // Logic: Convert whatever is in DB to an ordered Array
                        if (Array.isArray(data.criteriaDefinition)) {
                            cList = data.criteriaDefinition.map((c: any) => ({
                                ...c,
                                min: 0,
                                max: 10,
                                step: c.step || 0.1,
                                ponderable: c.isPonderable !== false // normalize to boolean (default true)
                            }));
                        } else {
                            // Legacy MAP support: NO guaranteed order, just keys
                            cList = Object.keys(data.criteriaDefinition).map(k => {
                                const def = data.criteriaDefinition[k];
                                return {
                                    id: k,
                                    label: def.label || k,
                                    min: def.min ?? 0,
                                    max: def.max ?? 10,
                                    step: def.step ?? 0.1,
                                    ponderable: def.ponderable !== false,
                                    ...def
                                };
                            });
                        }

                        // Initialize scores if NEW
                        if (!editReviewId) {
                            cList.forEach(c => {
                                scores[c.id] = 5; // Default score
                            });
                            setCriteriaScores(scores);
                        }
                        setCriteriaList(cList);
                    }

                    if (data.availableTags && Array.isArray(data.availableTags)) {
                        setListAvailableTags(data.availableTags);
                    }
                }
            } catch (e) {
                console.error("Error fetching list definition", e);
            } finally {
                setInitLoading(false);
            }
        };
        fetchListMetadata();
    }, [internalListId, listId, editReviewId]); // Re-run if list changes

    // Handlers
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const toggleTag = (tag: string) => {
        if (customTags.includes(tag)) {
            setCustomTags(customTags.filter(t => t !== tag));
        } else {
            setCustomTags([...customTags, tag]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !listId) {
            // START AUTOMATION LOGIC: If no list selected, or even if selected, check for automation
            // If listId IS present, we respect it. But we must also check if we are fulfilling a "Quiero ir" item.
        }
        if (!user) return; // Safety

        if (!itemName.trim()) {
            setError("El nombre del item es obligatorio");
            return;
        }

        if (!selectedPlace && !prefillPlaceId && !editReviewId) {
            setError("Por favor selecciona un lugar (Restaurante, etc.)");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // --- AUTOMATION: "Quiero ir" -> "Ya fui" (ARCHIVES) ---
            // Requirement: "si hacemos una reseña de ... elemento en Quiero ir, se pase automáticamente a ya fui" (in Archives)

            // 1. Ensure "Ya fui" archive exists
            let yaFuiArchiveId: string | null = null;
            let quieroIrArchiveId: string | null = null;

            try {
                // Determine user archive IDs
                const qArchives = query(collection(db, 'users', user.uid, 'archives'));
                const snapArchives = await getDocs(qArchives);

                snapArchives.forEach(doc => {
                    const data = doc.data();
                    if (data.name === 'Ya fui') yaFuiArchiveId = doc.id;
                    if (data.name === 'Quiero ir') quieroIrArchiveId = doc.id;
                });

                // Auto-create "Ya fui" if missing
                if (!yaFuiArchiveId) {
                    const newRef = await addDoc(collection(db, 'users', user.uid, 'archives'), {
                        name: 'Ya fui',
                        createdAt: serverTimestamp(),
                        itemCount: 0
                    });
                    yaFuiArchiveId = newRef.id;
                }
                // Auto-create "Quiero ir" if missing (for consistency)
                if (!quieroIrArchiveId) {
                    const newRef = await addDoc(collection(db, 'users', user.uid, 'archives'), {
                        name: 'Quiero ir',
                        createdAt: serverTimestamp(),
                        itemCount: 0
                    });
                    quieroIrArchiveId = newRef.id;
                }

                // 2. Check if the current place is in "Quiero ir"
                // Place ID is critical here.
                let finalPlaceId = selectedPlace?.id || prefillPlaceId || 'unknown';
                if (selectedPlace) finalPlaceId = selectedPlace.id; // Correct preference

                if (quieroIrArchiveId && finalPlaceId !== 'unknown') {
                    // Check items subcollection
                    const qItem = query(collection(db, 'users', user.uid, 'archives', quieroIrArchiveId, 'items'), where('placeId', '==', finalPlaceId));
                    const snapItem = await getDocs(qItem);

                    if (!snapItem.empty) {
                        console.log("Found in 'Quiero ir' archive. Moving to 'Ya fui'...");
                        // Move logic:
                        // A. Delete from Quiero ir
                        await deleteDoc(snapItem.docs[0].ref);
                        await updateDoc(doc(db, 'users', user.uid, 'archives', quieroIrArchiveId!), { itemCount: increment(-1) });

                        // B. Add to Ya fui (As a Place Item)
                        const placeName = selectedPlace?.name || prefillItemName || 'Lugar';
                        const subtitle = selectedPlace?.address || '';
                        const photo = imagePreview || '';

                        // We use the Place ID as the doc ID in the new archive for uniqueness
                        await setDoc(doc(db, 'users', user.uid, 'archives', yaFuiArchiveId!, 'items', finalPlaceId), {
                            itemId: finalPlaceId,
                            placeId: finalPlaceId,
                            type: 'place',
                            name: placeName,
                            subtitle: subtitle,
                            photoUrl: photo,
                            savedAt: serverTimestamp(),
                            route: `/place/${finalPlaceId}`
                        });
                        await updateDoc(doc(db, 'users', user.uid, 'archives', yaFuiArchiveId!), { itemCount: increment(1) });
                    }
                }

            } catch (autoErr) {
                console.error("Archive automation error:", autoErr);
                // Non-blocking
            }

            // --- END AUTOMATION ---



            const placeName = selectedPlace?.name || 'Lugar Desconocido';
            const photoUrl = imagePreview || ''; // Mock

            // New logic: Only use the selected/synced place for ID and address.
            // DO NOT create a new place document here. PlaceService handles that.
            let finalPlaceId = selectedPlace?.id || prefillPlaceId || 'unknown';
            let finalPlaceAddress = selectedPlace?.address || '';
            let finalPlaceLat = selectedPlace?.lat || 0;
            let finalPlaceLng = selectedPlace?.lng || 0;
            let finalPhotoUrl = ''; // Declared here

            if (selectedPlace) {
                // Transform Place Data
                finalPlaceId = selectedPlace.id;
                finalPlaceAddress = selectedPlace.address || '';
                finalPlaceLat = selectedPlace.lat || 0;
                finalPlaceLng = selectedPlace.lng || 0;

                // Handle Image Upload
                finalPhotoUrl = photoUrl;
                if (_imageFile) {
                    try {
                        const fileExt = _imageFile.name.split('.').pop();
                        const fileName = `${user.uid}_${Date.now()}.${fileExt}`;
                        const storageRef = ref(storage, `reviews/${user.uid}/${fileName}`);

                        console.log("Uploading review image...", fileName);
                        const snapshot = await uploadBytes(storageRef, _imageFile);
                        finalPhotoUrl = await getDownloadURL(snapshot.ref);
                        console.log("Upload success:", finalPhotoUrl);
                    } catch (uploadErr) {
                        console.error("Upload failed", uploadErr);
                        setError("Error al subir la imagen. Intenta de nuevo.");
                        setLoading(false);
                        return;
                    }
                } else if (imagePreview && imagePreview.startsWith('http')) {
                    // Keep existing info if it was already a URL (edit mode)
                    finalPhotoUrl = imagePreview;
                } else {
                    finalPhotoUrl = '';
                }

                try {
                    console.log(`Ensuring place ${finalPlaceId} exists via backend...`);
                    const idToken = await user.getIdToken();
                    const syncedPlace = await PlaceService.ensurePlaceSyncedWithBackend(finalPlaceId, idToken);

                    if (syncedPlace) {
                        console.log("Place synced successfully:", syncedPlace.name);
                        // Update local snapshot vars with the authoritative data from backend
                        finalPlaceAddress = syncedPlace.address || syncedPlace.formatted_address || finalPlaceAddress;

                        // Use location (object) or coordinates (object) or fallback to lat/lng if available
                        if (syncedPlace.location && typeof syncedPlace.location === 'object') {
                            finalPlaceLat = syncedPlace.location.latitude;
                            finalPlaceLng = syncedPlace.location.longitude;
                        } else if (syncedPlace.coordinates && typeof syncedPlace.coordinates === 'object') {
                            finalPlaceLat = syncedPlace.coordinates.latitude;
                            finalPlaceLng = syncedPlace.coordinates.longitude;
                        }
                    }
                } catch (placeErr) {
                    console.error("Failed to sync place with backend via new logic:", placeErr);
                }
            }



            const listDataLocal = listData || {}; // might need to refetch if we switched listId? 
            // If we relied on listId prop, it's fine.

            const isSublist = !!listData?.parentListId;
            const finalListId = isSublist ? listData.parentListId : internalListId; // Use internalListId to respect selection
            const sublistId = isSublist ? internalListId : null;
            const visibility = listData?.visibility === 'private' ? 'private' : 'public';

            const userProfileSnap = await getDoc(doc(db, 'users', user.uid)).catch(() => null);
            const userProfile = userProfileSnap && userProfileSnap.exists() ? userProfileSnap.data() : null;
            const authorUsername = typeof userProfile?.username === 'string' ? userProfile.username.trim() : '';
            const authorDisplayName = typeof userProfile?.displayName === 'string'
                ? userProfile.displayName.trim()
                : (user.displayName || '').trim();
            const authorNameToPersist = authorUsername || authorDisplayName || 'An�nimo';
            const authorPhotoToPersist = userProfile?.photoUrl || user.photoURL || '';

            const reviewData = {
                // New Fields structure
                listId: finalListId,
                parentListId: isSublist ? listData.parentListId : finalListId,
                sublistId: sublistId,
                visibility,

                // Author / Ownership Fields
                userId: user.uid,
                authorId: user.uid,
                authorUid: user.uid,
                ownerId: user.uid,
                creatorId: user.uid,
                authorName: authorNameToPersist,
                authorPhoto: authorPhotoToPersist,

                // Item details
                itemName: itemName.trim(),
                itemNameLower: itemName.trim().toLowerCase(),
                comment: comment.trim(),
                overallRating,
                scores: criteriaScores,

                // User input / Tags / Interactions
                tags: customTags,
                userTags: customTags,
                reactionCounts: { like: 0, dislike: 0 },
                photoUrl: finalPhotoUrl,
                updatedAt: serverTimestamp(),

                // Location Details
                placeId: finalPlaceId,
                placeName: selectedPlace?.name || placeName,
                placeAddress: finalPlaceAddress,
                placeLat: finalPlaceLat,
                placeLng: finalPlaceLng,
            };

            if (editReviewId) {
                // Update
                const reviewRef = doc(db, reviewPath || `reviews/${editReviewId}`);
                await updateDoc(reviewRef, {
                    ...reviewData,
                    criteriaDefinition: deleteField(),
                    updatedAt: serverTimestamp() // force update timestamp
                });
            } else {
                // Create
                await addDoc(collection(db, 'reviews'), {
                    ...reviewData,
                    createdAt: serverTimestamp()
                });
            }

            // Update Counters (Simplified for readability, assuming existing logic was correct just messy)
            if (!editReviewId) {
                const updates = [];
                if (finalListId) {
                    updates.push(updateDoc(doc(db, 'lists', finalListId), {
                        itemCount: increment(1),
                        reviewCount: increment(1),
                        updatedAt: serverTimestamp()
                    }));
                }
                if (sublistId && sublistId !== finalListId) {
                    updates.push(updateDoc(doc(db, 'lists', sublistId), {
                        itemCount: increment(1),
                        reviewCount: increment(1),
                        updatedAt: serverTimestamp()
                    }));
                }
                await Promise.all(updates);
            }

            onSuccess();
            onClose();

        } catch (err: any) {
            console.error("Error adding review:", err);
            setError("Error al guardar: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    if (initLoading && isNew) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            </div>
        );
    }

    // Split Criteria for Display
    const ponderableCriteria = criteriaList.filter(c => c.ponderable !== false);
    const nonPonderableCriteria = criteriaList.filter(c => c.ponderable === false);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in md:p-4">
            <div className="bg-[#0b1021] w-full h-full md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden border-none md:border border-white/10">

                {/* Header */}
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#151b2e]">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        {isNew ? 'Nueva Reseña' : 'Editar Reseña'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 custom-scrollbar relative">
                    {/* List Selector Picker */}
                    <div className="p-6 pb-0 space-y-2">
                        {/* CHANGED: Logic for locking list if editing - use internalListId state properly */}
                        {(!lockList && !editReviewId) ? (
                            <>
                                <label className="block text-xs font-bold uppercase text-gray-400 tracking-wider">Guardar en Lista <span className="text-red-400">*</span></label>
                                <ListSearch
                                    onSelect={(id) => {
                                        setInternalListId(id);
                                        if (onListChange) onListChange(id);
                                    }}
                                    selectedListId={internalListId}
                                    placeName={selectedPlace?.name || itemName} // Use place name or item name for smart search
                                    placeTypes={selectedPlace?.types} // Smart search by type
                                    suggestedListIds={suggestedListIds}
                                />
                            </>
                        ) : internalListId ? (
                            <div className="bg-[#151b2e] border border-white/10 p-3 rounded-lg flex justify-between items-center">
                                <span className="text-sm text-gray-300">
                                    Guardando en: <span className="text-indigo-400 font-bold">{listData?.name || 'Lista'}</span>
                                </span>
                                <Lock className="w-4 h-4 text-gray-500" />
                            </div>
                        ) : (
                            <div className="p-2 border border-dashed border-red-500/30 text-red-400 text-xs rounded">
                                Error: No hay lista seleccionada
                            </div>
                        )}
                    </div>

                    <form id="review-form" onSubmit={handleSubmit} className="space-y-6 p-6">

                        {/* 0. Place Search (Locked if Prefilled) */}
                        {prefillPlaceId ? (
                            <div className="space-y-2">
                                <label className="block text-xs font-bold uppercase text-gray-400 tracking-wider">Lugar <span className="text-red-400">*</span></label>
                                <div className="bg-[#1e2538] border border-white/10 rounded-xl p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                                            <MapPinIcon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="font-bold text-white text-sm">{selectedPlace?.name || 'Cargando lugar...'}</div>
                                            <div className="text-xs text-gray-500">{selectedPlace?.address || 'Dirección no disponible'}</div>
                                        </div>
                                    </div>
                                    <div className="text-gray-500" title="Lugar fijo">
                                        <Lock className="w-4 h-4" />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <label className="block text-xs font-bold uppercase text-gray-400 tracking-wider">Lugar <span className="text-red-400">*</span></label>
                                <PlaceSearch
                                    onSelect={setSelectedPlace}
                                    prefillValue={selectedPlace?.name || prefillItemName}
                                    placeholder="Buscar en el mapa (ej. Starbucks)..."
                                />
                                {selectedPlace && (
                                    <div className="text-sm text-green-400 bg-green-400/10 p-2 rounded border border-green-400/20 flex items-center gap-2">
                                        <MapPinIcon className="w-3 h-3" />
                                        Seleccionado: {selectedPlace.name}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 1. Item Name (Locked if Prefilled) */}
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-400 mb-1 tracking-wider">¿Qué probaste? <span className="text-red-400">*</span></label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={itemName}
                                    onChange={e => setItemName(e.target.value)}
                                    placeholder="Ej: Pizza Margarita"
                                    disabled={!!prefillItemName}
                                    className={`w-full bg-[#0b1021] border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors ${prefillItemName
                                        ? 'border-indigo-500/30 text-gray-300 cursor-not-allowed bg-[#151b2e]'
                                        : 'border-white/10'
                                        }`}
                                />
                                {prefillItemName && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-400" title="Nombre fijo">
                                        <Lock className="w-4 h-4" />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 3. Overall Rating (Read Only / Auto) */}
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-400 mb-2 tracking-wider">Nota Global</label>
                            <div className="flex items-center gap-4 bg-[#151b2e] p-4 rounded-xl border border-white/5">
                                <div className={`text-4xl font-bold ${overallRating >= 7 ? 'text-green-400' : overallRating >= 5 ? 'text-yellow-400' : 'text-red-400'}`}>
                                    {overallRating}
                                </div>
                                <div className="text-xs text-gray-500">
                                    Esta nota se calcula automáticamente basándose en tus puntuaciones.
                                </div>
                            </div>
                        </div>

                        {/* 4. Detailed Criteria */}
                        {criteriaList.length > 0 ? (
                            <div className="bg-white/5 p-5 rounded-2xl border border-white/5 space-y-6">
                                <h3 className="text-base font-bold text-gray-200 flex items-center gap-2 mb-2">
                                    Valoración Detallada <span className="text-red-400">*</span>
                                </h3>

                                {/* PONDERABLE CRITERIA */}
                                <div className="space-y-6">
                                    {ponderableCriteria.map((criterion) => (
                                        <div key={criterion.id}>
                                            <div className="flex justify-between mb-2">
                                                <label className="text-sm text-gray-300 font-medium">{criterion.label || criterion.id}</label>
                                                <span
                                                    className="text-sm font-bold transition-colors duration-300"
                                                    style={{ color: `hsl(${criteriaScores[criterion.id] * 12}, 90%, 50%)` }}
                                                >
                                                    {criteriaScores[criterion.id]}
                                                </span>
                                            </div>
                                            <div className="relative w-full h-6 flex items-center">
                                                {/* Track Background & Fill */}
                                                <div className="absolute left-0 right-0 h-2 bg-gray-700/50 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full transition-all duration-300 rounded-full"
                                                        style={{
                                                            width: `${(criteriaScores[criterion.id] / 10) * 100}%`,
                                                            background: `hsl(${criteriaScores[criterion.id] * 12}, 90%, 50%)`,
                                                            boxShadow: `0 0 10px hsl(${criteriaScores[criterion.id] * 12}, 90%, 50%, 0.5)`
                                                        }}
                                                    />
                                                </div>

                                                {/* Interactive Input */}
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="10"
                                                    step={criterion.step || 0.1}
                                                    value={criteriaScores[criterion.id] || 0}
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value);
                                                        const newScores = { ...criteriaScores, [criterion.id]: val };
                                                        setCriteriaScores(newScores);
                                                        setRatingsTouched(true);
                                                    }}
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* NON-PONDERABLE CRITERIA (Separate Section) */}
                                {nonPonderableCriteria.length > 0 && (
                                    <>
                                        <div className="border-t border-white/10 pt-4 mt-6">
                                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Otros Detalles</h4>
                                            <div className="space-y-6">
                                                {nonPonderableCriteria.map((criterion) => (
                                                    <div key={criterion.id}>
                                                        <div className="flex justify-between mb-2">
                                                            <label className="text-sm text-gray-300 font-medium">{criterion.label || criterion.id}</label>
                                                            <span className="text-sm font-bold text-indigo-400">
                                                                {criteriaScores[criterion.id]}
                                                            </span>
                                                        </div>
                                                        <div className="relative w-full h-6 flex items-center">
                                                            {/* Track Background & Fill (Neutral Color) */}
                                                            <div className="absolute left-0 right-0 h-2 bg-gray-700/50 rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full transition-all duration-300 rounded-full bg-indigo-500/50"
                                                                    style={{
                                                                        width: `${(criteriaScores[criterion.id] / 10) * 100}%`
                                                                    }}
                                                                />
                                                            </div>

                                                            {/* Interactive Input with Fixed Step 0.5 */}
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="10"
                                                                step={0.5} // Enforce 0.5 step for non-ponderable
                                                                value={criteriaScores[criterion.id] || 0}
                                                                onChange={(e) => {
                                                                    const val = parseFloat(e.target.value);
                                                                    const newScores = { ...criteriaScores, [criterion.id]: val };
                                                                    setCriteriaScores(newScores);
                                                                    setRatingsTouched(true);
                                                                }}
                                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="p-8 border border-dashed border-white/10 rounded-xl text-center">
                                <p className="text-gray-400 text-sm">
                                    {listId ? 'Cargando criterios...' : 'Selecciona una lista para ver los criterios de valoración.'}
                                </p>
                            </div>
                        )}

                        {/* 5. Comment */}
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-400 mb-1 tracking-wider">Tu opinión</label>
                            <textarea
                                value={comment}
                                onChange={e => setComment(e.target.value)}
                                placeholder="¿Qué te pareció?"
                                rows={4}
                                className="w-full bg-[#0b1021] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                            />
                        </div>

                        {/* 6. Photo */}
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-400 mb-2 tracking-wider">Foto</label>

                            {imagePreview ? (
                                <div className="relative w-full h-48 rounded-xl overflow-hidden border border-white/10 group">
                                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setImageFile(null);
                                            setImagePreview(null);
                                        }}
                                        className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <div className="bg-red-500/80 p-2 rounded-full text-white">
                                            <Trash2 className="w-6 h-6" />
                                        </div>
                                    </button>
                                </div>
                            ) : (
                                <div
                                    className="w-full h-48 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all group"
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.classList.add('border-indigo-500', 'bg-indigo-500/10');
                                    }}
                                    onDragLeave={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.classList.remove('border-indigo-500', 'bg-indigo-500/10');
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.classList.remove('border-indigo-500', 'bg-indigo-500/10');
                                        const file = e.dataTransfer.files?.[0];
                                        if (file && file.type.startsWith('image/')) {
                                            setImageFile(file);
                                            const reader = new FileReader();
                                            reader.onloadend = () => setImagePreview(reader.result as string);
                                            reader.readAsDataURL(file);
                                        }
                                    }}
                                    onClick={() => document.getElementById('review-photo-upload')?.click()}
                                >
                                    <div className="bg-white/5 p-4 rounded-full mb-3 group-hover:scale-110 transition-transform">
                                        <ImageIcon className="w-8 h-8 text-indigo-400" />
                                    </div>
                                    <p className="text-sm font-bold text-gray-300">Arrastra tu foto o haz clic</p>
                                    <p className="text-xs text-gray-500 mt-1">Soporta JPG, PNG, WEBP</p>
                                    <input
                                        id="review-photo-upload"
                                        type="file"
                                        className="hidden"
                                        accept="image/*"
                                        onChange={handleImageChange}
                                    />
                                </div>
                            )}
                        </div>

                        {/* 7. Tags */}
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-400 mb-2 tracking-wider">Etiquetas</label>
                            <div className="flex flex-wrap gap-2">
                                {listAvailableTags.map(tag => (
                                    <button
                                        type="button"
                                        key={tag}
                                        onClick={() => toggleTag(tag)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${customTags.includes(tag)
                                            ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                                            : 'bg-[#1e2538] text-gray-400 hover:bg-white/5'
                                            }`}
                                    >
                                        {tag}
                                    </button>
                                ))}
                                {listAvailableTags.length === 0 && (
                                    <p className="text-gray-500 text-xs italic">No hay etiquetas definidas en esta lista.</p>
                                )}
                            </div>
                        </div>

                    </form>
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-white/10 bg-[#151b2e] flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-gray-400 hover:text-white font-medium transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        form="review-form"
                        disabled={loading || !isValid || (!isNew && !isDirty)}
                        className={`px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition-all ${loading || !isValid || (!isNew && !isDirty)
                            ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:scale-105'
                            }`}
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isNew ? 'Publicar Reseña' : 'Guardar Cambios'}
                    </button>
                </div>
            </div >
        </div >
    );
};
