import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment, getDoc, setDoc, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Loader2, X, MapPin as MapPinIcon, CheckCircle2, Lock, Trash2 } from 'lucide-react';
import { PlaceSearch } from './PlaceSearch';
import { PlaceService, type PlaceResult, transformToLegacyPlace } from '../services/PlaceService';
import { ListSearch } from './ListSearch';
import { queryCache, invalidateDoc } from '../lib/queryCache';

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

const REVIEW_CREATE_TOASTS = [
    'Tu veredicto ya está en la mesa.',
    'Reseña publicada: criterio fino y sin titubeos.',
    'Nuevo punto en el mapa del buen gusto.',
    'Anotado. El ranking acaba de ponerse interesante.',
] as const;

const REVIEW_EDIT_TOASTS = [
    'Cambios guardados. Ajuste de precisión aplicado.',
    'Revisión lista: tu ranking respira más orden.',
    'Actualización hecha. El criterio subió un nivel.',
    'Editado con éxito: caos bajo control.',
] as const;

const pickRandom = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

export const AddReviewForm: React.FC<AddReviewFormProps> = ({ listId, onListChange, prefillPlaceId, prefillItemName, editReviewId, lockList = false, onClose, onSuccess, suggestedListIds }) => {
    const { user } = useAuth();
    const { showToast } = useToast();

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

    // Scroll preservation — prevents the modal from jumping when leaving text inputs
    const scrollRef = useRef<HTMLDivElement>(null);
    const preserveScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        const top = el.scrollTop;
        requestAnimationFrame(() => { el.scrollTop = top; });
    };

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

            const hydrateReviewState = async (data: any, resolvedListId?: string, resolvedPath?: string) => {
                setItemName(data.itemName || '');
                setComment(data.comment || '');
                setOverallRating(data.overallRating || 5);
                if (data.scores) setCriteriaScores(data.scores);
                if (data.tags || data.userTags) setCustomTags(data.tags || data.userTags);
                if (data.photoUrl) setImagePreview(data.photoUrl);

                const effectiveListId = resolvedListId || data.listId || data.parentListId || listId || null;
                if (effectiveListId) {
                    setInternalListId(effectiveListId);
                }
                if (resolvedPath) {
                    setReviewPath(resolvedPath);
                }

                setOriginalData(JSON.stringify({
                    itemName: data.itemName || '',
                    comment: data.comment || '',
                    criteriaScores: data.scores || {},
                    customTags: data.tags || data.userTags || [],
                    imagePreview: data.photoUrl || null,
                    listId: effectiveListId
                }));

                if (!data.placeId) return;

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
                        types: legacyPlace.types || []
                    });
                } catch (_e) {
                    setSelectedPlace({
                        id: data.placeId,
                        name: data.placeName || data.itemName || 'Lugar',
                        address: data.placeAddress || '',
                        lat: data.placeLat || 0,
                        lng: data.placeLng || 0
                    });
                }
            };

            try {
                const candidateListIds = Array.from(new Set(
                    [listId, internalListId].filter((value): value is string => !!value)
                ));

                for (const candidateListId of candidateListIds) {
                    const subRef = doc(db, 'lists', candidateListId, 'reviews', editReviewId);
                    const subSnap = await getDoc(subRef);
                    if (!subSnap.exists()) continue;

                    await hydrateReviewState(
                        subSnap.data(),
                        candidateListId,
                        `lists/${candidateListId}/reviews/${editReviewId}`
                    );
                    return;
                }

                const rootRef = doc(db, 'reviews', editReviewId);
                const rootSnap = await getDoc(rootRef);
                if (!rootSnap.exists()) return;

                const rootData = rootSnap.data();
                const rootListCandidates = Array.from(new Set(
                    [rootData.listId, rootData.parentListId, listId, internalListId]
                        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
                ));

                for (const candidateListId of rootListCandidates) {
                    const subRef = doc(db, 'lists', candidateListId, 'reviews', editReviewId);
                    const subSnap = await getDoc(subRef);
                    if (!subSnap.exists()) continue;

                    await hydrateReviewState(
                        subSnap.data(),
                        candidateListId,
                        `lists/${candidateListId}/reviews/${editReviewId}`
                    );
                    return;
                }

                await hydrateReviewState(
                    rootData,
                    rootData.listId || rootData.parentListId,
                    `reviews/${editReviewId}`
                );
            } catch (e) {
                console.error("Error fetching review for edit:", e);
                setError("Error cargando la reseña para editar");
            }
        };

        if (editReviewId) {
            fetchReviewData();
        }
    }, [editReviewId, listId, internalListId]);

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

        if (itemName.trim().length > 150) {
            setError("El nombre del item no puede superar los 150 caracteres");
            return;
        }

        if (comment.length > 2000) {
            setError("La opinión no puede superar los 2000 caracteres");
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
            // Requirement: "si hacemos una reseÃ±a de ... elemento en Quiero ir, se pase automÃ¡ticamente a ya fui" (in Archives)

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
                    // Fallback: Si el backend falla o da timeout, creamos un documento básico desde el frontend para que la reseña no quede "huérfana".
                    try {
                        const placeRef = doc(db, 'places', finalPlaceId);
                        const placeSnap = await getDoc(placeRef);
                        if (!placeSnap.exists()) {
                            await setDoc(placeRef, {
                                name: selectedPlace.name,
                                name_normalized: selectedPlace.name.toLowerCase(),
                                address: finalPlaceAddress,
                                address_normalized: finalPlaceAddress.toLowerCase(),
                                location: { latitude: finalPlaceLat, longitude: finalPlaceLng },
                                coordinates: { latitude: finalPlaceLat, longitude: finalPlaceLng },
                                googlePlaceId: finalPlaceId,
                                types: selectedPlace.types || (selectedPlace.type ? [selectedPlace.type] : ['establishment']),
                                createdAt: serverTimestamp(),
                                updatedAt: serverTimestamp(),
                                followersCount: 0,
                                reviewsCount: 0,
                                averageRating: null
                            });
                            console.log("Created fallback place document directly from frontend.");
                        }
                    } catch (fallbackErr) {
                        console.error("Fallback place creation failed:", fallbackErr);
                    }
                }
            }
            const isSublist = !!listData?.parentListId;
            const finalListId = isSublist ? (listData?.parentListId || internalListId) : internalListId;
            const sublistId = isSublist ? internalListId : null;
            const visibility = listData?.visibility === 'private' ? 'private' : 'public';

            if (!finalListId) {
                setError('Selecciona una lista válida antes de guardar.');
                setLoading(false);
                return;
            }

            const userProfileSnap = await getDoc(doc(db, 'users', user.uid)).catch(() => null);
            const userProfile = userProfileSnap && userProfileSnap.exists() ? userProfileSnap.data() : null;
            const authorUsername = typeof userProfile?.username === 'string' ? userProfile.username.trim() : '';
            const authorDisplayName = typeof userProfile?.displayName === 'string'
                ? userProfile.displayName.trim()
                : (user.displayName || '').trim();
            const authorNameToPersist = authorUsername || authorDisplayName || 'Anónimo';
            const authorPhotoToPersist = userProfile?.photoUrl || user.photoURL || '';

            const reviewData = {
                // New Fields structure
                listId: finalListId,
                parentListId: isSublist ? listData.parentListId : finalListId,
                sublistId: sublistId,
                visibility,

                // Author / Ownership Fields
                userId: user.uid,
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
                // Canonical write path: lists/{listId}/reviews/{reviewId}
                const targetSubRef = doc(db, 'lists', finalListId, 'reviews', editReviewId);
                let createdAtToKeep: any = null;

                // Preserve original createdAt and clean up old location if needed.
                if (reviewPath?.startsWith('lists/')) {
                    const parts = reviewPath.split('/');
                    if (parts.length >= 4) {
                        const previousListId = parts[1];
                        const previousRef = doc(db, 'lists', previousListId, 'reviews', editReviewId);
                        const previousSnap = await getDoc(previousRef);
                        if (previousSnap.exists()) {
                            createdAtToKeep = previousSnap.data().createdAt || null;
                            if (previousListId !== finalListId) {
                                await deleteDoc(previousRef);
                            }
                        }
                    }
                } else if (reviewPath?.startsWith('reviews/')) {
                    const legacyRootRef = doc(db, 'reviews', editReviewId);
                    const legacyRootSnap = await getDoc(legacyRootRef);
                    if (legacyRootSnap.exists()) {
                        createdAtToKeep = legacyRootSnap.data().createdAt || null;
                        await deleteDoc(legacyRootRef);
                    }
                }

                const existingTargetSnap = await getDoc(targetSubRef);
                if (existingTargetSnap.exists() && !createdAtToKeep) {
                    createdAtToKeep = existingTargetSnap.data().createdAt || null;
                }

                await setDoc(targetSubRef, {
                    ...reviewData,
                    createdAt: createdAtToKeep || serverTimestamp(),
                    updatedAt: serverTimestamp()
                }, { merge: true });
            } else {
                // Create in the list subcollection (legacy/canonical path).
                await addDoc(collection(db, 'lists', finalListId, 'reviews'), {
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
                // Use allSettled so a counter update failure (e.g. no write access to parent list)
                // doesn't block the review creation success toast.
                await Promise.allSettled(updates);
            }

            queryCache.invalidate('listDetails:' + finalListId);
            queryCache.invalidate('reviews:');
            if (finalPlaceId) queryCache.invalidate('placeDetails:' + finalPlaceId);
            if (finalListId) invalidateDoc('lists', finalListId);

            showToast({
                variant: 'success',
                title: isNew ? 'Reseña publicada' : 'Cambios guardados',
                message: isNew ? pickRandom(REVIEW_CREATE_TOASTS) : pickRandom(REVIEW_EDIT_TOASTS),
            });
            onSuccess();
            onClose();

        } catch (err: any) {
            console.error("Error adding review:", err);
            setError("Error al guardar: " + err.message);
            showToast({
                variant: 'error',
                title: 'No se pudo guardar',
                message: 'Hubo un problema al guardar la reseña. Inténtalo de nuevo en unos segundos.',
            });
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

    // Rating helpers
    const getRatingEmoji = (r: number) => {
        if (r >= 9) return '🤩';
        if (r >= 7) return '😍';
        if (r >= 5) return '😊';
        if (r >= 3) return '😐';
        return '😬';
    };

    const getRatingLabel = (r: number) => {
        if (r >= 9) return 'Increíble';
        if (r >= 7) return 'Muy bueno';
        if (r >= 5) return 'Bueno';
        if (r >= 3) return 'Regular';
        return 'Mejorable';
    };

    const getSliderBg = (val: number, ponderable = true) => {
        const pct = (val / 10) * 100;
        const activeColor = ponderable ? `hsl(${val * 12}, 90%, 55%)` : '#5C7CFA';
        return `linear-gradient(to right, ${activeColor} 0%, ${activeColor} ${pct}%, rgba(55,65,81,0.35) ${pct}%, rgba(55,65,81,0.35) 100%)`;
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in">
            <div
                className="bg-[#0b1021] w-full mx-0 sm:mx-4 sm:max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden sm:rounded-2xl"
                style={{ boxShadow: '0 -8px 48px rgba(92,124,250,0.18), 0 0 0 1px rgba(255,255,255,0.06)' }}
            >
                {/* ── Header ─────────────────────────────────────── */}
                <div
                    className="relative flex items-center justify-between p-5 shrink-0 overflow-hidden"
                    style={{ background: 'linear-gradient(135deg, #151c36 0%, #111828 100%)' }}
                >
                    {/* Decorative blobs */}
                    <div className="absolute -top-8 -left-8 w-28 h-28 rounded-full opacity-25 pointer-events-none"
                        style={{ background: 'radial-gradient(circle, #5C7CFA, transparent 70%)' }} />
                    <div className="absolute -top-6 right-12 w-20 h-20 rounded-full opacity-20 pointer-events-none"
                        style={{ background: 'radial-gradient(circle, #FF715B, transparent 70%)' }} />

                    <div className="relative flex items-center gap-3">
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                            style={{ background: 'linear-gradient(135deg, #5C7CFA, #9b51e0)' }}
                        >
                            {isNew ? '✍️' : '✏️'}
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-white font-display leading-tight">
                                {isNew ? 'Nueva Reseña' : 'Editar Reseña'}
                            </h2>
                            {listData?.name && (
                                <p className="text-xs text-indigo-300/60 mt-0.5">en {listData.name}</p>
                            )}
                        </div>
                    </div>

                    <button
                        aria-label="Cerrar"
                        onClick={onClose}
                        className="relative p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all hover:scale-105 active:scale-95"
                    >
                        <X className="w-4 h-4 text-gray-400" />
                    </button>
                </div>

                {/* ── Scrollable body ────────────────────────────── */}
                <div ref={scrollRef} className="overflow-y-auto flex-1 custom-scrollbar">

                    {/* ── Sección: ¿En qué lista? ─────────────────── */}
                    <div className="px-4 pt-4">
                        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-1.5">
                                <span>📋</span> ¿En qué lista?
                            </p>
                            {(!lockList && !editReviewId) ? (
                                <ListSearch
                                    onSelect={(id) => {
                                        setInternalListId(id);
                                        if (onListChange) onListChange(id);
                                    }}
                                    selectedListId={internalListId}
                                    placeName={selectedPlace?.name || itemName}
                                    placeTypes={selectedPlace?.types}
                                    suggestedListIds={suggestedListIds}
                                />
                            ) : internalListId ? (
                                <div className="flex items-center gap-3 bg-indigo-500/10 border border-indigo-500/20 p-3 rounded-xl">
                                    <div className="p-1.5 bg-indigo-500/20 rounded-lg shrink-0">
                                        <Lock className="w-3.5 h-3.5 text-indigo-400" />
                                    </div>
                                    <span className="text-sm text-white font-semibold truncate">
                                        {listData?.name || 'Lista seleccionada'}
                                    </span>
                                </div>
                            ) : (
                                <div className="p-3 border border-dashed border-red-500/30 text-red-400 text-xs rounded-xl">
                                    Sin lista seleccionada
                                </div>
                            )}
                        </div>
                    </div>

                    <form id="review-form" onSubmit={handleSubmit} className="px-4 pb-4 pt-3 space-y-3">

                        {/* ── Sección: ¿Dónde? ────────────────────── */}
                        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                            <p className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 transition-colors duration-300 ${(selectedPlace || prefillPlaceId) ? 'text-[#3DD598]' : 'text-[#FF715B]'}`}>
                                <span>{(selectedPlace || prefillPlaceId) ? '✅' : '📍'}</span> ¿Dónde?
                            </p>
                            {prefillPlaceId ? (
                                <div className="flex items-center gap-3 bg-[#FF715B]/10 border border-[#FF715B]/20 p-3 rounded-xl">
                                    <div className="p-2 bg-[#FF715B]/20 rounded-xl shrink-0">
                                        <MapPinIcon className="w-4 h-4 text-[#FF715B]" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-white truncate">{selectedPlace?.name || 'Cargando...'}</p>
                                        <p className="text-xs text-gray-500 truncate">{selectedPlace?.address || ''}</p>
                                    </div>
                                    <Lock className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <PlaceSearch
                                        onSelect={setSelectedPlace}
                                        prefillValue={selectedPlace?.name || prefillItemName}
                                        placeholder="Busca el restaurante, bar, café... 🔍"
                                    />
                                    {selectedPlace && (
                                        <div className="flex items-center gap-2 text-xs text-[#3DD598] bg-[#3DD598]/10 border border-[#3DD598]/20 px-3 py-2 rounded-xl animate-fade-in">
                                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                            <span className="font-semibold truncate">{selectedPlace.name}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* ── Sección: ¿Qué probaste? ─────────────── */}
                        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#3DD598] flex items-center gap-1.5">
                                <span>🍽️</span> ¿Qué probaste?
                            </p>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={itemName}
                                    onChange={e => setItemName(e.target.value)}
                                    onBlur={preserveScroll}
                                    maxLength={150}
                                    placeholder="Ej: Pizza Margherita, Tacos al pastor..."
                                    disabled={!!prefillItemName}
                                    className={`w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all placeholder:text-gray-600
                                        ${prefillItemName
                                            ? 'bg-white/5 border border-white/10 cursor-not-allowed opacity-70'
                                            : 'bg-white/5 border border-white/10 focus:border-indigo-500/60 focus:bg-indigo-500/5 focus:ring-1 focus:ring-indigo-500/20'
                                        }`}
                                />
                                {prefillItemName && (
                                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
                                )}
                            </div>
                        </div>

                        {/* ── Sección: Valoración ─────────────────── */}
                        {criteriaList.length > 0 ? (
                            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-5">
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#F2C94C] flex items-center gap-1.5">
                                        <span>⭐</span> Valoración
                                    </p>
                                    {isNew && !ratingsTouched && (
                                        <span className="text-[10px] text-amber-400/60 italic animate-pulse">
                                            Mueve los sliders ↓
                                        </span>
                                    )}
                                </div>

                                {/* Overall Rating Badge */}
                                <div
                                    className="flex items-center gap-4 p-4 rounded-xl transition-all duration-500"
                                    style={{
                                        background: `linear-gradient(135deg, hsl(${overallRating * 12}, 80%, 10%) 0%, transparent 100%)`,
                                        border: `1px solid hsl(${overallRating * 12}, 70%, 25%)`
                                    }}
                                >
                                    <div
                                        className="text-5xl font-black font-display transition-all duration-300 tabular-nums"
                                        style={{ color: `hsl(${overallRating * 12}, 90%, 60%)` }}
                                    >
                                        {overallRating.toFixed(1)}
                                    </div>
                                    <div>
                                        <div className="text-2xl leading-none mb-1">{getRatingEmoji(overallRating)}</div>
                                        <div className="text-sm font-bold text-gray-200">{getRatingLabel(overallRating)}</div>
                                        <div className="text-[11px] text-gray-500 mt-0.5">Calculado automáticamente</div>
                                    </div>
                                </div>

                                {/* PONDERABLE CRITERIA */}
                                <div className="space-y-5">
                                    {ponderableCriteria.map((criterion) => {
                                        const val = criteriaScores[criterion.id] ?? 0;
                                        const color = `hsl(${val * 12}, 90%, 55%)`;
                                        return (
                                            <div key={criterion.id} className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-sm font-semibold text-gray-300">{criterion.label || criterion.id}</label>
                                                    <span
                                                        className="text-sm font-black font-display tabular-nums transition-colors duration-300"
                                                        style={{ color }}
                                                    >
                                                        {val}
                                                    </span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="10"
                                                    step={criterion.step || 0.1}
                                                    value={val}
                                                    onFocus={preserveScroll}
                                                    onChange={(e) => {
                                                        const newVal = parseFloat(e.target.value);
                                                        setCriteriaScores({ ...criteriaScores, [criterion.id]: newVal });
                                                        setRatingsTouched(true);
                                                    }}
                                                    className="custom-range-slider"
                                                    style={{ background: getSliderBg(val, true), '--thumb-color': color } as React.CSSProperties}
                                                />
                                                {(criterion.labelMin || criterion.labelMax) && (
                                                    <div className="flex justify-between gap-3">
                                                        <span className="text-[10px] text-rose-500/70 italic leading-snug">{criterion.labelMin}</span>
                                                        <span className="text-[10px] text-emerald-500/70 italic leading-snug text-right">{criterion.labelMax}</span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* NON-PONDERABLE CRITERIA */}
                                {nonPonderableCriteria.length > 0 && (
                                    <div className="border-t border-white/5 pt-5 space-y-5">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Otros detalles</p>
                                        {nonPonderableCriteria.map((criterion) => {
                                            const val = criteriaScores[criterion.id] ?? 0;
                                            return (
                                                <div key={criterion.id} className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <label className="text-sm font-semibold text-gray-300">{criterion.label || criterion.id}</label>
                                                        <span className="text-sm font-black font-display tabular-nums text-indigo-400">{val}</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="10"
                                                        step={criterion.step || 0.5}
                                                        value={val}
                                                        onFocus={preserveScroll}
                                                        onChange={(e) => {
                                                            const newVal = parseFloat(e.target.value);
                                                            setCriteriaScores({ ...criteriaScores, [criterion.id]: newVal });
                                                            setRatingsTouched(true);
                                                        }}
                                                        className="custom-range-slider"
                                                        style={{ background: getSliderBg(val, false), '--thumb-color': '#5C7CFA' } as React.CSSProperties}
                                                    />
                                                    {(criterion.labelMin || criterion.labelMax) && (
                                                        <div className="flex justify-between gap-3">
                                                            <span className="text-[10px] text-indigo-400/50 italic leading-snug">{criterion.labelMin}</span>
                                                            <span className="text-[10px] text-indigo-400/70 italic leading-snug text-right">{criterion.labelMax}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-dashed border-white/8 p-6 text-center space-y-2">
                                <div className="text-2xl">⭐</div>
                                <p className="text-gray-500 text-sm">
                                    {internalListId ? 'Cargando criterios...' : 'Selecciona una lista para ver los criterios.'}
                                </p>
                            </div>
                        )}

                        {/* ── Sección: Tu opinión ─────────────────── */}
                        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#24A3FF] flex items-center gap-1.5">
                                <span>💬</span> Tu opinión
                            </p>
                            <textarea
                                value={comment}
                                onChange={e => setComment(e.target.value)}
                                onBlur={preserveScroll}
                                maxLength={2000}
                                placeholder="¿Qué te pareció? Los detalles que hacen la diferencia..."
                                rows={3}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all placeholder:text-gray-600 resize-none"
                            />
                            {comment.length > 0 && (
                                <p className={`text-right text-[10px] ${comment.length > 1800 ? 'text-amber-500' : 'text-gray-600'}`}>{comment.length}/2000</p>
                            )}
                        </div>

                        {/* ── Sección: Foto ───────────────────────── */}
                        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#9b51e0] flex items-center gap-1.5">
                                <span>📸</span> Foto
                                <span className="normal-case font-normal tracking-normal text-gray-600 ml-1">(opcional)</span>
                            </p>
                            {imagePreview ? (
                                <div className="relative w-full h-44 rounded-xl overflow-hidden border border-white/10 group">
                                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <button
                                        type="button"
                                        onClick={() => { setImageFile(null); setImagePreview(null); }}
                                        className="absolute bottom-3 right-3 bg-red-500 hover:bg-red-400 px-3 py-1.5 rounded-lg text-white text-xs font-bold flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all active:scale-95"
                                    >
                                        <Trash2 className="w-3 h-3" /> Eliminar
                                    </button>
                                </div>
                            ) : (
                                <div
                                    className="relative w-full h-28 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-purple-500/40 hover:bg-purple-500/5 transition-all group"
                                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-purple-500/60', 'bg-purple-500/10'); }}
                                    onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-purple-500/60', 'bg-purple-500/10'); }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.classList.remove('border-purple-500/60', 'bg-purple-500/10');
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
                                    <div className="text-2xl mb-1 group-hover:scale-110 transition-transform">📷</div>
                                    <p className="text-xs font-semibold text-gray-400">Arrastra o haz clic para subir</p>
                                    <p className="text-[10px] text-gray-600 mt-0.5">JPG · PNG · WEBP</p>
                                    <input id="review-photo-upload" type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                                </div>
                            )}
                        </div>

                        {/* ── Sección: Etiquetas ──────────────────── */}
                        {listAvailableTags.length > 0 && (
                            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-[#3DD598] flex items-center gap-1.5">
                                    <span>🏷️</span> Etiquetas
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {listAvailableTags.map(tag => (
                                        <button
                                            type="button"
                                            key={tag}
                                            onClick={() => toggleTag(tag)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border active:scale-95 ${customTags.includes(tag)
                                                ? 'bg-indigo-500 border-indigo-500 text-white shadow-lg shadow-indigo-500/30 scale-[1.03]'
                                                : 'bg-white/5 border-white/10 text-gray-400 hover:border-indigo-500/40 hover:text-gray-200'
                                            }`}
                                        >
                                            {customTags.includes(tag) ? '✓ ' : ''}{tag}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-xl animate-fade-in">
                                <span className="shrink-0">⚠️</span>
                                <span>{error}</span>
                            </div>
                        )}

                    </form>
                </div>

                {/* ── Footer ─────────────────────────────────────── */}
                <div
                    className="px-4 py-3 border-t border-white/5 shrink-0"
                    style={{ background: 'linear-gradient(180deg, #0c1124 0%, #0b1021 100%)' }}
                >
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-gray-400 hover:text-white hover:bg-white/5 border border-white/5 hover:border-white/10 transition-all active:scale-95"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            form="review-form"
                            disabled={loading || !isValid || (!isNew && !isDirty)}
                            className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]
                                ${loading || !isValid || (!isNew && !isDirty)
                                    ? 'bg-white/5 border border-white/5 text-gray-500 cursor-not-allowed'
                                    : 'btn-primary'
                                }`}
                        >
                            {loading
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                                : isNew ? '✨ Publicar Reseña' : '💾 Guardar Cambios'
                            }
                        </button>
                    </div>
                    {!isValid && !loading && (
                        <p className="text-center text-[10px] text-gray-600 mt-2">
                            {(!selectedPlace && !prefillPlaceId) ? '📍 Elige un lugar · ' : ''}
                            {!itemName.trim() ? '🍽️ Añade qué probaste · ' : ''}
                            {!internalListId ? '📋 Selecciona una lista · ' : ''}
                            {isNew && !ratingsTouched ? '⭐ Ajusta los sliders' : ''}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};
