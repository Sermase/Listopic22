import React, { useState, useEffect, useMemo } from 'react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Loader2, X, Image as ImageIcon, MapPin as MapPinIcon, Lock } from 'lucide-react';
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
}

export const AddReviewForm: React.FC<AddReviewFormProps> = ({ listId, onListChange, prefillPlaceId, prefillItemName, editReviewId, lockList = false, onClose, onSuccess }) => {
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

    const [initLoading, setInitLoading] = useState(false);
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
        // 1. Place is required
        if (!selectedPlace) return false;

        // 2. Name is required
        if (!itemName.trim()) return false;

        // 3. List is required
        if (!listId) return false;

        // 4. Ratings Touched (Only for NEW reviews)
        if (isNew && !ratingsTouched) return false;

        return true;
    }, [selectedPlace, itemName, listId, ratingsTouched, isNew]);

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

                    // Capture Original Data for Dirty Check
                    setOriginalData(JSON.stringify({
                        itemName: data.itemName || '',
                        comment: data.comment || '',
                        criteriaScores: data.scores || {},
                        customTags: data.tags || data.userTags || [],
                        imagePreview: data.photoUrl || null
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
        if (Object.keys(criteriaScores).length === 0) return;

        let total = 0;
        let count = 0;

        Object.keys(criteriaScores).forEach((key) => {
            const def = criteriaDefinition[key];
            const val = criteriaScores[key];
            if (def && def.ponderable !== false) {
                total += val;
                count++;
            }
        });

        if (count > 0) {
            const avg = total / count;
            setOverallRating(parseFloat(avg.toFixed(1)));
        }
    }, [criteriaScores, criteriaDefinition]);

    // Fetch List Metadata
    useEffect(() => {
        const fetchListMetadata = async () => {
            if (!listId) {
                setListData(null);
                setInitLoading(false);
                return;
            }
            try {
                const docRef = doc(db, 'lists', listId);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const data = snap.data();
                    setListData(data);

                    if (data.name && !itemName && !prefillItemName && !editReviewId) {
                        setItemName(data.name);
                    }

                    if (data.criteriaDefinition) {
                        let defMap: Record<string, any> = {};
                        let scores: Record<string, number> = {};

                        if (Array.isArray(data.criteriaDefinition)) {
                            data.criteriaDefinition.forEach((c: any) => {
                                defMap[c.id] = { ...c, min: 0, max: 10, step: 0.5 };
                                scores[c.id] = 5;
                            });
                        } else {
                            defMap = data.criteriaDefinition;
                            Object.keys(defMap).forEach(k => {
                                const min = defMap[k].min ?? 0;
                                const max = defMap[k].max ?? 10;
                                scores[k] = (min + max) / 2;
                            });
                        }
                        setCriteriaDefinition(defMap);
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
    }, [listId, editReviewId]);

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
        if (!user || !listId) return;

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
            const placeName = selectedPlace?.name || 'Lugar Desconocido';
            const photoUrl = imagePreview || ''; // Mock

            let finalPlaceId = prefillPlaceId || 'unknown';
            let finalPlaceAddress = '';
            let finalPlaceLat = 0;
            let finalPlaceLng = 0;

            if (selectedPlace) {
                // Transform Place Data
                finalPlaceId = selectedPlace.id; // Or mapping if needed
                // Simplifying: assume 'selectedPlace.id' is what we want.
                // The legacy code used transformToLegacyPlace here excessively, let's keep it simple if possible,
                // or replicate if strict adherence is needed.
                // Replicating basic assignment:
                finalPlaceId = selectedPlace.id;
                finalPlaceAddress = selectedPlace.address || '';
                finalPlaceLat = selectedPlace.lat || 0;
                finalPlaceLng = selectedPlace.lng || 0;
            }

            const isSublist = !!listData?.parentListId;
            const finalListId = isSublist ? listData.parentListId : listId;
            const sublistId = isSublist ? listId : null;
            const visibility = listData?.visibility === 'private' ? 'private' : 'public';

            const reviewData = {
                listId: finalListId,
                sublistId: sublistId,
                visibility,
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
                updatedAt: serverTimestamp(),
                placeId: finalPlaceId,
                placeName: selectedPlace?.name || placeName,
                placeAddress: finalPlaceAddress,
                placeLat: finalPlaceLat,
                placeLng: finalPlaceLng,
            };

            if (editReviewId) {
                // Update
                const reviewRef = doc(db, reviewPath || `reviews/${editReviewId}`);
                await updateDoc(reviewRef, reviewData as any);
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
                        {(!lockList && !editReviewId) ? (
                            <>
                                <label className="block text-xs font-bold uppercase text-gray-400 tracking-wider">Guardar en Lista <span className="text-red-400">*</span></label>
                                <ListSearch
                                    onSelect={(id) => onListChange && onListChange(id)}
                                    selectedListId={listId}
                                    placeName={selectedPlace?.name || itemName} // Use place name or item name for smart search
                                    placeTypes={selectedPlace?.types} // Smart search by type
                                />
                            </>
                        ) : listId ? (
                            <div className="bg-[#151b2e] border border-white/10 p-3 rounded-lg flex justify-between items-center">
                                <span className="text-sm text-gray-300">
                                    Guardando en: <span className="text-indigo-400 font-bold">{listData?.name || 'Lista'}</span>
                                </span>
                                <Lock className="w-4 h-4 text-gray-500" />
                            </div>
                        ) : null}
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
                        {Object.keys(criteriaScores).length > 0 ? (
                            <div className="bg-white/5 p-5 rounded-2xl border border-white/5 space-y-8">
                                <h3 className="text-base font-bold text-gray-200 flex items-center gap-2 mb-4">
                                    Valoración Detallada <span className="text-red-400">*</span>
                                </h3>
                                {Object.keys(criteriaScores).map(key => (
                                    <div key={key}>
                                        <div className="flex justify-between mb-2">
                                            <label className="text-sm text-gray-300 font-medium">{key}</label>
                                            <span
                                                className="text-sm font-bold transition-colors duration-300"
                                                style={{ color: `hsl(${criteriaScores[key] * 12}, 90%, 50%)` }}
                                            >
                                                {criteriaScores[key]}
                                            </span>
                                        </div>
                                        <div className="relative w-full h-6 flex items-center">
                                            {/* Track Background & Fill */}
                                            <div className="absolute left-0 right-0 h-2 bg-gray-700/50 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full transition-all duration-300 rounded-full"
                                                    style={{
                                                        width: `${(criteriaScores[key] / 10) * 100}%`,
                                                        background: `hsl(${criteriaScores[key] * 12}, 90%, 50%)`,
                                                        boxShadow: `0 0 10px hsl(${criteriaScores[key] * 12}, 90%, 50%, 0.5)`
                                                    }}
                                                />
                                            </div>

                                            {/* Interactive Input with Custom Thumb */}
                                            <input
                                                type="range"
                                                min="0"
                                                max="10"
                                                step="0.5"
                                                value={criteriaScores[key]}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    const newScores = { ...criteriaScores, [key]: val };
                                                    setCriteriaScores(newScores);
                                                    setRatingsTouched(true);
                                                }}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-indigo-500"
                                                style={{ opacity: 1, background: 'transparent', WebkitAppearance: 'none' }}
                                            />
                                        </div>
                                    </div>
                                ))}
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
                            <div className="flex items-center gap-4">
                                {imagePreview ? (
                                    <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-white/10 group">
                                        <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setImageFile(null);
                                                setImagePreview(null);
                                            }}
                                            className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X className="w-6 h-6 text-white" />
                                        </button>
                                    </div>
                                ) : (
                                    <label className="w-24 h-24 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-lg cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-colors">
                                        <ImageIcon className="w-6 h-6 text-gray-500 mb-1" />
                                        <span className="text-[10px] text-gray-500 uppercase">Subir</span>
                                        <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                                    </label>
                                )}
                            </div>
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
                        disabled={loading || !isValid}
                        className={`px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition-all ${loading || !isValid
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
