import React, { useState, useEffect, useMemo } from 'react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Loader2, X, Image as ImageIcon } from 'lucide-react';
import { PlaceSearch } from './PlaceSearch';
import { PlaceService, type PlaceResult, transformToLegacyPlace } from '../services/PlaceService';

interface AddReviewFormProps {
    listId: string;
    prefillPlaceId?: string;
    prefillItemName?: string;
    editReviewId?: string;
    onClose: () => void;
    onSuccess: () => void;
}

export const AddReviewForm: React.FC<AddReviewFormProps> = ({ listId, prefillPlaceId, prefillItemName, editReviewId, onClose, onSuccess }) => {
    const { user } = useAuth();

    // Core Data
    const [itemName, setItemName] = useState(prefillItemName || '');
    const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);

    const [comment, setComment] = useState('');
    const [overallRating, setOverallRating] = useState(5);
    const [criteriaScores, setCriteriaScores] = useState<Record<string, number>>({});
    const [criteriaDefinition, setCriteriaDefinition] = useState<Record<string, any>>({});

    // Extras
    const [_imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [customTags, setCustomTags] = useState<string[]>([]);
    const [listAvailableTags, setListAvailableTags] = useState<string[]>([]);

    const [initLoading, setInitLoading] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [listData, setListData] = useState<any>(null); // Store full list data for lineage
    const [reviewPath, setReviewPath] = useState<string | null>(null);

    // UX States
    const [ratingsTouched, setRatingsTouched] = useState(false);
    const [originalData, setOriginalData] = useState<string>(''); // JSON string for deep comparison

    // Validation Logic
    const isNew = !editReviewId;

    const isValid = useMemo(() => {
        // 1. Name is required
        if (!itemName.trim()) return false;

        // 2. Place is required
        // If prefillPlaceId exists, it's valid. If editing, we assume place is valid unless cleared? 
        // But for new reviews, selectedPlace is needed.
        // Correction: On Edit, selectedPlace might be null if we failed to fetch details, but we have data.placeId?
        // Let's rely on selectedPlace being set during load.
        if (!selectedPlace && !prefillPlaceId && !editReviewId) return false;

        // 3. Ratings Touched (Only for NEW reviews)
        if (isNew && !ratingsTouched) return false;

        return true;
    }, [itemName, selectedPlace, prefillPlaceId, editReviewId, ratingsTouched, isNew]);

    const isDirty = useMemo(() => {
        if (isNew) return true; // Always dirty if new (until saved)

        const currentData = JSON.stringify({
            itemName,
            comment,
            criteriaScores,
            customTags,
            imagePreview // crude check for photo change
        });

        return currentData !== originalData;
    }, [isNew, itemName, comment, criteriaScores, customTags, imagePreview, originalData]);


    // Fetch Review Data for Editing
    useEffect(() => {
        const fetchReviewData = async () => {
            if (!editReviewId || !listId) return;
            try {
                // Determine collection path. Assuming 'lists/{listId}/reviews/{reviewId}' or global 'reviews'?
                // The addDoc below writes to 'reviews' collection (root).
                const reviewRef = doc(db, 'reviews', editReviewId);
                const snap = await getDoc(reviewRef);

                if (snap.exists()) {
                    const data = snap.data();
                    setReviewPath(`reviews/${editReviewId}`); // Set path when found in root

                    setItemName(data.itemName || '');
                    setComment(data.comment || '');
                    setOverallRating(data.overallRating || 5);
                    if (data.scores) setCriteriaScores(data.scores);
                    if (data.tags || data.userTags) setCustomTags(data.tags || data.userTags);
                    if (data.photoUrl) setImagePreview(data.photoUrl);

                    // Capture Original Data for Dirty Check
                    setOriginalData(JSON.stringify({
                        itemName: data.itemName || '',
                        comment: data.comment || '',
                        criteriaScores: data.scores || {},
                        customTags: data.tags || data.userTags || [],
                        imagePreview: data.photoUrl || null
                    }));

                    if (data.placeId) {
                        try {
                            // Fetch fresh details from Place Service (Google/OSM) to ensure we have the REAL place name/address
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
                                lng: legacyPlace.coordinates.longitude
                            });
                        } catch (e) {
                            console.warn("Could not refresh place details on edit, using stored data", e);
                            // Fallback to stored data
                            setSelectedPlace({
                                id: data.placeId,
                                name: data.placeName || data.itemName || 'Lugar',
                                address: data.placeAddress || '',
                                lat: data.placeLat || 0,
                                lng: data.placeLng || 0
                            });
                        }
                    }
                } else {
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
                        if (data.placeId) {
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
                                    lng: legacyPlace.coordinates.longitude
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
                    } else {
                        console.warn("Review not found for editing in root or subcollection");
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
                    // Try to get from 'places' collection first (fastest/cheapest)
                    const placeRef = doc(db, 'places', prefillPlaceId);
                    const snap = await getDoc(placeRef);

                    if (snap.exists()) {
                        const data = snap.data();
                        setSelectedPlace({
                            id: data.id || data.googlePlaceId || prefillPlaceId,
                            name: data.name,
                            address: data.address,
                            lat: data.location?.latitude || data.lat || 0,
                            lng: data.location?.longitude || data.lng || 0
                        });
                    } else {
                        // Fallback: Use simple ID structure if doc missing. 
                        // Note: If we really wanted to be robust, we'd call PlaceService here too, 
                        // but usually GroupPage implies we have the place in DB.
                        setSelectedPlace({
                            id: prefillPlaceId,
                            name: 'Lugar Seleccionado', // Placeholder until real data
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

    // Recalculate Overall Rating when scores change
    useEffect(() => {
        if (Object.keys(criteriaScores).length === 0) return;

        let total = 0;
        let count = 0;

        Object.keys(criteriaScores).forEach((key) => {
            const def = criteriaDefinition[key];
            const val = criteriaScores[key];
            // Match legacy logic: check ponderable flag (default true)
            if (def && def.ponderable !== false) {
                total += val;
                count++;
            }
        });

        if (count > 0) {
            const avg = total / count;
            setOverallRating(parseFloat(avg.toFixed(1))); // 1 decimal place like legacy
        }
    }, [criteriaScores, criteriaDefinition]);

    // Fetch List Metadata
    useEffect(() => {
        const fetchListMetadata = async () => {
            // ... existing fetch list metadata code ...
            if (!listId) {
                setInitLoading(false);
                return;
            }
            try {
                const docRef = doc(db, 'lists', listId);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const data = snap.data();
                    setListData(data);

                    // Prefill item name with list name if empty ONLY if not editing
                    if (data.name && !itemName && !prefillItemName && !editReviewId) {
                        setItemName(data.name);
                    }

                    if (data.criteriaDefinition) {
                        let defMap: Record<string, any> = {};
                        let scores: Record<string, number> = {};

                        // Handle Legacy Array vs New Record
                        if (Array.isArray(data.criteriaDefinition)) {
                            data.criteriaDefinition.forEach((c: any) => {
                                defMap[c.id] = { ...c, min: 0, max: 10, step: 0.5 }; // Default legacy
                                scores[c.id] = 5;
                            });
                        } else {
                            defMap = data.criteriaDefinition;
                            Object.keys(defMap).forEach(k => {
                                const min = defMap[k].min ?? 0;
                                const max = defMap[k].max ?? 10;
                                // Default score to middle
                                scores[k] = (min + max) / 2;
                            });
                        }
                        setCriteriaDefinition(defMap);
                        // Only set default scores if we are NOT editing (or if edit data didn't have scores)
                        if (!editReviewId) {
                            setCriteriaScores(scores);
                        }
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
    }, [listId, editReviewId]); // Added editReviewId dependency to prevent overwriting fetched review data

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
        if (!user || !listId) return;

        if (!itemName.trim()) {
            setError("El nombre del item es obligatorio");
            return;
        }

        // Require Place? Maybe optional, but better if required for "Google Maps" feeling
        if (!selectedPlace && !prefillPlaceId && !editReviewId) {
            setError("Por favor selecciona un lugar (Restaurante, etc.)");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // For editing, we reuse existing place details if selectedPlace didn't change
            // const placeId = selectedPlace?.id || ... (Removed unused var)
            const placeName = selectedPlace?.name || 'Lugar Desconocido';
            const photoUrl = imagePreview || ''; // Mock upload

            // 1a. Ensure Place Exists in "places" collection (Legacy Schema)
            // We transform FIRST to get the correct ID (e.g. 'osm_123' or 'google_abc')
            let finalPlaceId = prefillPlaceId || 'unknown';
            let finalPlaceAddress = '';
            let finalPlaceLat = 0;
            let finalPlaceLng = 0;

            if (selectedPlace) {
                let detailedData = null;
                try {
                    // Try to fetch detailed data from Backend
                    detailedData = await PlaceService.getDetails(selectedPlace.id);
                } catch (e: any) {
                    // Ignore CORS/Network errors gracefully
                    console.warn("Could not fetch details (CORS/Network?), using basic info:", e.message);
                }

                try {
                    const legacyPlace = transformToLegacyPlace(selectedPlace, detailedData);

                    // Use the ID generated by the strictly legacy transformer
                    finalPlaceId = legacyPlace.googlePlaceId;
                    finalPlaceAddress = legacyPlace.address;
                    finalPlaceLat = legacyPlace.coordinates.latitude;
                    finalPlaceLng = legacyPlace.coordinates.longitude;

                    // Attempt to sync with 'places' collection, but don't block review if it fails (security rules)
                    const placeRef = doc(db, 'places', finalPlaceId);
                    try {
                        const placeSnap = await getDoc(placeRef);
                        if (!placeSnap.exists()) {
                            await setDoc(placeRef, legacyPlace);
                        }
                    } catch (placeWriteErr) {
                        console.warn("Permission denied or error writing to 'places', proceeding with review only:", placeWriteErr);
                        // Start: We can still link the ID, but maybe we shouldn't if we aren't sure it exists?
                        // Actually, strict legacy links rely on placeId. If the place doesn't exist in 'places', 
                        // the app should still work via the review's embedded placeName/Address.
                        // So we KEEP finalPlaceId.
                    }
                } catch (placeErr) {
                    console.warn("Could not cache Place details:", placeErr);
                }
            }


            // SCHEMA CHANGE: User wants listId to ALWAYS be the Main List.
            const isSublist = !!listData?.parentListId;
            const finalListId = isSublist ? listData.parentListId : listId;
            const sublistId = isSublist ? listId : null;

            // Determine Visibility
            // Default to 'public'. If list is explicitly private, mark review as private.
            const visibility = listData?.visibility === 'private' ? 'private' : 'public';

            // 1. Add/Update Review
            const reviewData = {
                listId: finalListId,
                sublistId: sublistId,
                visibility, // Persist visibility on review for easier filtering

                userId: user.uid,
                authorName: user.displayName || 'Anónimo',
                authorPhoto: user.photoURL || '',
                itemName: itemName.trim(),
                comment: comment.trim(),
                overallRating,
                scores: criteriaScores,
                criteriaDefinition,
                tags: customTags,
                photoUrl,
                updatedAt: serverTimestamp(), // Always update timestamp

                // Strict Legacy Links
                placeId: finalPlaceId,
                placeName: selectedPlace?.name || placeName,
                placeAddress: finalPlaceAddress,
                placeLat: finalPlaceLat,
                placeLng: finalPlaceLng,

                // Extended Legacy Search Fields (Optional but helpful for search)
                placeCity: selectedPlace ? (transformToLegacyPlace(selectedPlace).city) : '',
            };

            if (editReviewId) {
                // UPDATE
                // Use the stored path OR fallback to root if for some reason null
                const reviewRef = doc(db, reviewPath || `reviews/${editReviewId}`);
                await updateDoc(reviewRef, reviewData as any);
            } else {
                await addDoc(collection(db, 'reviews'), {
                    ...reviewData,
                    createdAt: serverTimestamp()
                });
            }

            // 2. Update Counters (Lists, User, Place)
            // Only increment if NEW review. If editing, counts don't change (usually).
            if (!editReviewId) {
                const updates = [];

                // A. Main List
                if (finalListId) {
                    const mainListRef = doc(db, 'lists', finalListId);
                    updates.push(updateDoc(mainListRef, {
                        itemCount: increment(1),
                        reviewCount: increment(1),
                        updatedAt: serverTimestamp()
                    }));
                }

                // B. Sublist (if applicable)
                if (sublistId && sublistId !== finalListId) {
                    const sublistRef = doc(db, 'lists', sublistId);
                    updates.push(updateDoc(sublistRef, {
                        itemCount: increment(1),
                        reviewCount: increment(1),
                        updatedAt: serverTimestamp()
                    }));
                }

                // C. User Counters
                const userRef = doc(db, 'users', user.uid);
                updates.push(updateDoc(userRef, {
                    reviewsCount: increment(1)
                }));

                // D. Place Counters
                if (finalPlaceId) {
                    const placeRef = doc(db, 'places', finalPlaceId);
                    // Ensure update doesn't fail if doc creation was somehow slow (though we awaited it)
                    // Wrap this in try/catch too, as increment might fail if place doc doesn't exist or permissions deny
                    updates.push(
                        updateDoc(placeRef, { reviewsCount: increment(1) }).catch(e => console.warn("Failed to increment place count", e))
                    );
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

    if (initLoading) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center sm:p-4 bg-[#151b2e] sm:bg-black/80 sm:backdrop-blur-sm animate-fade-in">
            <div className="bg-[#151b2e] w-full h-full sm:h-auto sm:max-h-[85vh] sm:rounded-2xl sm:max-w-lg sm:border sm:border-white/10 sm:shadow-2xl relative overflow-hidden flex flex-col">

                {/* Header */}
                <div className="shrink-0 p-4 border-b border-white/5 flex justify-between items-center bg-[#0b1021]/50 safe-area-top">
                    <h2 className="text-lg font-bold text-white">{editReviewId ? 'Editar Reseña' : 'Añadir Reseña'}</h2>
                    <button onClick={onClose} className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors hidden sm:block">
                        <X className="w-5 h-5" />
                    </button>
                    {/* Mobile Cancel (Top Left or Right?) - Let's stick to X or just Cancel in Footer? User asked for Cancel in Footer. */}
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pb-24 sm:pb-6">
                    {error && (
                        <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-200 p-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <form id="review-form" onSubmit={handleSubmit} className="space-y-6">

                        {/* 0. Place Search */}
                        {!prefillPlaceId && (
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

                        {/* 1. Item Name */}
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-400 mb-1 tracking-wider">¿Qué probaste? <span className="text-red-400">*</span></label>
                            <input
                                type="text"
                                value={itemName}
                                onChange={e => setItemName(e.target.value)}
                                placeholder="Ej: Pizza Margarita"
                                disabled={!!prefillItemName}
                                className={`w-full bg-[#0b1021] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors ${prefillItemName ? 'opacity-70 cursor-not-allowed' : ''}`}
                            />
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

                        {/* 4. Detailed Criteria - Enhanced Sliders "Heart of Review" */}
                        {Object.keys(criteriaScores).length > 0 && (
                            <div className="bg-white/5 p-5 rounded-2xl border border-white/5 space-y-8">
                                <h3 className="text-base font-bold text-gray-200 flex items-center gap-2 mb-4">
                                    <ListIcon className="w-5 h-5 text-indigo-400" />
                                    Valoración Detallada <span className="text-red-400">*</span>
                                </h3>

                                {Object.keys(criteriaScores).map((key) => {
                                    const def = criteriaDefinition[key];
                                    const val = criteriaScores[key];
                                    const min = def.min ?? 0;
                                    const max = def.max ?? 10;
                                    const step = 0.1;

                                    // Metric Calculation
                                    const percentage = ((val - min) / (max - min)) * 100;

                                    // Helper to Interpolate Colors for Thumb
                                    const getThumbColor = (pct: number) => {
                                        // Colors: Red (#ef4444), Yellow (#eab308), Green (#22c55e)
                                        const r1 = 239, g1 = 68, b1 = 68;    // Red
                                        const r2 = 234, g2 = 179, b2 = 8;    // Yellow
                                        const r3 = 34, g3 = 197, b3 = 94;    // Green

                                        let r, g, b;
                                        if (pct < 50) {
                                            // Red -> Yellow
                                            const t = pct / 50;
                                            r = Math.round(r1 + (r2 - r1) * t);
                                            g = Math.round(g1 + (g2 - g1) * t);
                                            b = Math.round(b1 + (b2 - b1) * t);
                                        } else {
                                            // Yellow -> Green
                                            const t = (pct - 50) / 50;
                                            r = Math.round(r2 + (r3 - r2) * t);
                                            g = Math.round(g2 + (g3 - g2) * t);
                                            b = Math.round(b2 + (b3 - b2) * t);
                                        }
                                        return `rgb(${r}, ${g}, ${b})`;
                                    };

                                    const thumbColor = getThumbColor(percentage);

                                    // Text classes
                                    let textClass = "text-yellow-400";
                                    let borderClass = "border-yellow-500/30";
                                    if (percentage <= 30) { textClass = "text-red-400"; borderClass = "border-red-500/30"; }
                                    else if (percentage >= 85) { textClass = "text-blue-400"; borderClass = "border-blue-500/30"; } // Blue for excellence
                                    else if (percentage >= 70) { textClass = "text-green-400"; borderClass = "border-green-500/30"; }

                                    return (
                                        <div key={key} className="bg-[#0b1021]/50 p-4 rounded-xl border border-white/5">
                                            {/* Header: Title + Big Value */}
                                            <div className="flex justify-between items-center mb-4">
                                                <span className="text-lg font-bold text-gray-100">{def?.label || key}</span>
                                                <div className={`flex items-center justify-center w-16 h-12 rounded-xl bg-white/5 border ${borderClass} `}>
                                                    <span className={`text-xl font-bold font-mono ${textClass}`}>{val.toFixed(1)}</span>
                                                </div>
                                            </div>

                                            {/* Interactive Slider Area */}
                                            <div className="relative h-12 flex items-center">
                                                <input
                                                    type="range"
                                                    min={min}
                                                    max={max}
                                                    step={step}
                                                    value={val}
                                                    onChange={(e) => {
                                                        const newVal = parseFloat(e.target.value);
                                                        setCriteriaScores(prev => ({ ...prev, [key]: newVal }));
                                                        setRatingsTouched(true);
                                                    }}
                                                    className="custom-range-slider"
                                                    style={{
                                                        backgroundSize: `${percentage}% 100%`,
                                                        // Gradient including Blue at the end
                                                        backgroundImage: `linear-gradient(90deg, #ef4444 0%, #eab308 50%, #22c55e 80%, #3b82f6 100%)`,
                                                        backgroundColor: 'rgba(255,255,255,0.1)',
                                                        backgroundRepeat: 'no-repeat',
                                                        '--thumb-color': thumbColor // Pass dynamic color to CSS
                                                    } as React.CSSProperties}
                                                />
                                            </div>

                                            {/* Min / Max Labels - More visible */}
                                            <div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-gray-500 mt-1 px-1">
                                                <span>{def.labelMin || min}</span>
                                                <span>{def.labelMax || max}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* 2. Photo Upload - Enhanced limit to camera/gallery */}
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-400 mb-2 tracking-wider">Foto</label>
                            <div className="flex items-center gap-4">
                                {imagePreview ? (
                                    <div className="relative h-24 w-24 rounded-lg overflow-hidden border border-white/10">
                                        <img src={imagePreview} className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => { setImagePreview(null); setImageFile(null); }}
                                            className="absolute top-1 right-1 bg-black/60 rounded-full p-1 text-white hover:bg-red-500"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ) : (
                                    <label className="h-24 w-24 border-2 border-dashed border-white/10 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors text-gray-500 hover:text-indigo-400">
                                        <ImageIcon className="w-6 h-6 mb-1" />
                                        <span className="text-[10px]">Cámara/Galería</span>
                                        {/* capture="environment" prefers rear camera on mobile */}
                                        <input type="file" accept="image/*" capture="environment" onChange={handleImageChange} className="hidden" />
                                    </label>
                                )}
                                <div className="text-xs text-gray-500 flex-1">
                                    <p>Sube una foto de tu experiencia.</p>
                                    <p>Ayuda a otros a visualizarlo.</p>
                                </div>
                            </div>
                        </div>

                        {/* 5. Tags - Restricted & Clean */}
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-400 mb-2 tracking-wider">Etiquetas</label>

                            <div className="text-xs text-gray-500 mb-3">
                                Selecciona las etiquetas que mejor describan tu experiencia.
                            </div>

                            {/* Available Tags - Selection Only */}
                            {listAvailableTags.length > 0 ? (
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {listAvailableTags.map(tag => (
                                        <button
                                            key={tag}
                                            type="button"
                                            onClick={() => toggleTag(tag)}
                                            className={`px-4 py-2 text-sm rounded-full border transition-all duration-200 ${customTags.includes(tag)
                                                ? 'bg-indigo-500 border-indigo-500 text-white font-medium shadow-lg shadow-indigo-500/20'
                                                : 'bg-[#0b1021] border-white/10 text-gray-400 hover:border-white/30 hover:bg-white/5'
                                                }`}
                                        >
                                            {/* No '#' prefix as requested */}
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-sm text-gray-500 italic">No hay etiquetas disponibles para esta lista.</div>
                            )}

                            {/* REMOVED Custom Tag Input as requested */}

                            {/* Previously selected custom tags */}
                            {customTags.filter(t => !listAvailableTags.includes(t)).length > 0 && (
                                <div className="mt-4 border-t border-white/5 pt-4">
                                    <span className="text-xs text-gray-500 block mb-2">Otras etiquetas (Legacy):</span>
                                    <div className="flex flex-wrap gap-2">
                                        {customTags.filter(t => !listAvailableTags.includes(t)).map(tag => (
                                            <button
                                                key={tag}
                                                type="button"
                                                onClick={() => toggleTag(tag)}
                                                className="px-3 py-1 text-xs rounded-full bg-white/5 border border-white/10 text-gray-400 hover:bg-red-500/20 hover:border-red-500 transition-colors group"
                                            >
                                                {tag} <X className="inline w-3 h-3 ml-1 group-hover:text-red-400" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>



                        {/* 6. Comment */}
                        <div>
                            <textarea
                                value={comment}
                                onChange={e => setComment(e.target.value)}
                                placeholder="Cuéntanos más detalles..."
                                rows={3}
                                className="w-full bg-[#0b1021] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 resize-none text-sm"
                            />
                        </div>

                    </form>
                </div>

                {/* Footer (Fixed Actions) */}
                <div className="shrink-0 p-4 border-t border-white/5 bg-[#0b1021]/80 backdrop-blur-md safe-area-bottom flex gap-3 z-20">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-3 bg-[#1e2538] hover:bg-[#2a3449] text-white font-bold rounded-xl transition-colors ring-1 ring-white/10"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            if (loading) return;
                            // Programmatically submit form
                            handleSubmit(e as any);
                        }}
                        disabled={loading || !isValid || (editReviewId ? !isDirty : false)}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 ring-1 ring-white/10"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (editReviewId ? "Guardar Cambios" : "Publicar Reseña")}
                    </button>
                </div>
            </div >
        </div >
    );
};

// Simple Icon helpers
const ListIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
    </svg>
);

const MapPinIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);
