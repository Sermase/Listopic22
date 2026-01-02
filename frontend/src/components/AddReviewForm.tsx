import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Loader2, X, Image as ImageIcon, Tag } from 'lucide-react';
import { PlaceSearch } from './PlaceSearch';
import { PlaceService, type PlaceResult, transformToLegacyPlace } from '../services/PlaceService';

interface AddReviewFormProps {
    listId: string;
    prefillPlaceId?: string;
    prefillItemName?: string;
    onClose: () => void;
    onSuccess: () => void;
}

export const AddReviewForm: React.FC<AddReviewFormProps> = ({ listId, prefillPlaceId, prefillItemName, onClose, onSuccess }) => {
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
    const [tagInput, setTagInput] = useState('');
    const [listAvailableTags, setListAvailableTags] = useState<string[]>([]);

    const [initLoading, setInitLoading] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch List Metadata
    useEffect(() => {
        const fetchListMetadata = async () => {
            if (!listId) return;
            try {
                const docRef = doc(db, 'lists', listId);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const data = snap.data();

                    // Prefill item name with list name if empty
                    if (data.name && !itemName && !prefillItemName) {
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
                        setCriteriaScores(scores);
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
    }, [listId]);

    // Auto-calculate Overall Rating whenever scores change
    useEffect(() => {
        if (!criteriaDefinition || Object.keys(criteriaScores).length === 0) return;

        let totalNormalized = 0;
        let count = 0;

        Object.keys(criteriaScores).forEach(key => {
            const def = criteriaDefinition[key];
            // Only count ponderable criteria
            if (def && def.ponderable !== false) {
                const score = criteriaScores[key];
                const min = def.min ?? 0;
                const max = def.max ?? 10;
                // Normalize to 0-10 scale for overall rating if range differs
                // Formula: ((score - min) / (max - min)) * 10
                let normalized = score;
                if (max !== min) {
                    normalized = ((score - min) / (max - min)) * 10;
                }

                totalNormalized += normalized;
                count++;
            }
        });

        if (count > 0) {
            setOverallRating(parseFloat((totalNormalized / count).toFixed(2))); // 2 decimals
        } else {
            // Fallback for non-ponderable only lists? Just 0 or avg unweighted?
            // If no ponderable items, we leave overall as is or 0? 
            // Let's set 0 or keep last valid. Setting 0 feels safer for new reviews.
            setOverallRating(0);
        }
    }, [criteriaScores, criteriaDefinition]);

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

    const addCustomTag = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && tagInput.trim()) {
            e.preventDefault();
            const tag = tagInput.trim();
            if (!customTags.includes(tag)) {
                setCustomTags([...customTags, tag]);
            }
            setTagInput('');
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
        if (!selectedPlace && !prefillPlaceId) {
            setError("Por favor selecciona un lugar (Restaurante, etc.)");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const placeId = selectedPlace?.id || prefillPlaceId || 'unknown';
            const placeName = selectedPlace?.name || 'Lugar Desconocido';
            const photoUrl = imagePreview || ''; // Mock upload

            // 1a. Ensure Place Exists in "places" collection (Legacy Schema)
            if (selectedPlace) {
                try {
                    const legacyPlace = transformToLegacyPlace(selectedPlace);
                    // We use OSM ID as document ID to avoid dupes (using 'placeId' var from scope)
                    const placeRef = doc(db, 'places', placeId);

                    // Check existence before writing to avoid overwriting or permission issues if we can't read
                    const placeSnap = await getDoc(placeRef);
                    if (!placeSnap.exists()) {
                        await setDoc(placeRef, legacyPlace);
                    }
                } catch (placeErr) {
                    console.warn("Could not cache Place details (Permissions?):", placeErr);
                }
            }

            // 1. Add Review
            const reviewData = {
                listId,
                userId: user.uid,
                authorName: user.displayName || 'Anónimo',
                authorPhoto: user.photoURL || '',
                itemName: itemName.trim(),
                comment: comment.trim(),
                overallRating,
                scores: criteriaScores,
                criteriaDefinition, // Save snapshot
                tags: customTags,
                photoUrl,
                createdAt: serverTimestamp(),
                placeId,
                placeName,
                placeAddress: selectedPlace?.address || '',
                placeLat: selectedPlace?.lat || 0,
                placeLng: selectedPlace?.lng || 0
            };

            await addDoc(collection(db, 'reviews'), reviewData);

            // 2. Update List Counter
            const listRef = doc(db, 'lists', listId);
            await updateDoc(listRef, {
                itemCount: increment(1),
                reviewCount: increment(1)
            });

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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#151b2e] rounded-2xl w-full max-w-lg border border-white/10 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#0b1021]/50">
                    <h2 className="text-lg font-bold text-white">Añadir Reseña</h2>
                    <button onClick={onClose} className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar">
                    {error && (
                        <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-200 p-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">

                        {/* 0. Place Search */}
                        {!prefillPlaceId && (
                            <div className="space-y-2">
                                <label className="block text-xs font-bold uppercase text-gray-400 tracking-wider">Lugar</label>
                                <PlaceSearch
                                    onSelect={setSelectedPlace}
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
                            <label className="block text-xs font-bold uppercase text-gray-400 mb-1 tracking-wider">¿Qué probaste?</label>
                            <input
                                type="text"
                                value={itemName}
                                onChange={e => setItemName(e.target.value)}
                                placeholder="Ej: Pizza Margarita"
                                disabled={!!prefillItemName}
                                className={`w-full bg-[#0b1021] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors ${prefillItemName ? 'opacity-70 cursor-not-allowed' : ''}`}
                            />
                        </div>

                        {/* 2. Photo Upload */}
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
                                        <span className="text-[10px]">Subir</span>
                                        <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                                    </label>
                                )}
                                <div className="text-xs text-gray-500 flex-1">
                                    <p>Sube una foto de tu experiencia.</p>
                                    <p>Ayuda a otros a visualizarlo.</p>
                                </div>
                            </div>
                        </div>

                        {/* 3. Overall Rating (Read Only / Auto) */}
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-400 mb-2 tracking-wider">Nota Global (Calculada)</label>
                            <div className="flex items-center gap-4 bg-[#151b2e] p-4 rounded-xl border border-white/5">
                                <div className={`text-4xl font-bold ${overallRating >= 7 ? 'text-green-400' : overallRating >= 5 ? 'text-yellow-400' : 'text-red-400'}`}>
                                    {overallRating}
                                </div>
                                <div className="text-xs text-gray-500">
                                    Esta nota se calcula automáticamente basándose en tus puntuaciones y la configuración de la lista.
                                </div>
                            </div>
                        </div>

                        {/* 4. Detailed Criteria */}
                        {Object.keys(criteriaScores).length > 0 && (
                            <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-6">
                                <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                                    <ListIcon className="w-4 h-4" /> Detalles
                                </h3>
                                {Object.keys(criteriaScores).map((key) => {
                                    const def = criteriaDefinition[key];
                                    const val = criteriaScores[key];
                                    const min = def.min ?? 0;
                                    const max = def.max ?? 10;
                                    const step = def.step ?? 0.5;

                                    return (
                                        <div key={key}>
                                            <div className="flex justify-between items-end mb-2">
                                                <span className="text-sm font-medium text-gray-200">{def?.label || key}</span>
                                                <span className="text-indigo-400 font-bold font-mono text-lg">{val}</span>
                                            </div>

                                            <input
                                                type="range"
                                                min={min}
                                                max={max}
                                                step={step}
                                                value={val}
                                                onChange={(e) => setCriteriaScores(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))}
                                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                            />

                                            <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                                                <span>{def.labelMin || min}</span>
                                                <span>{def.labelMax || max}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* 5. Tags */}
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-400 mb-2 tracking-wider">Etiquetas</label>

                            {/* Available Tags */}
                            {listAvailableTags.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {listAvailableTags.map(tag => (
                                        <button
                                            key={tag}
                                            type="button"
                                            onClick={() => toggleTag(tag)}
                                            className={`px-3 py-1 text-xs rounded-full border transition-all ${customTags.includes(tag)
                                                ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                                                : 'bg-[#0b1021] border-white/10 text-gray-400 hover:border-white/30'
                                                }`}
                                        >
                                            #{tag}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Custom Tag Input */}
                            <div className="relative">
                                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input
                                    type="text"
                                    value={tagInput}
                                    onChange={e => setTagInput(e.target.value)}
                                    onKeyDown={addCustomTag}
                                    placeholder="Añadir etiqueta personalizada (Enter)..."
                                    className="w-full bg-[#0b1021] border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                                />
                            </div>

                            {/* Selected Custom Tags (that are not in default list) display ?? 
                                Actually, customTags state holds ALL selected tags. 
                                We might want to show the ones we just added if they are not prohibited. 
                                For now, let's just show all selected tags as pills if we want, OR just rely on the toggle state above for defaults 
                                and maybe a separate list for pure customs? 
                                User asked for "predefined tags selectable, yes or no. not fixed". 
                                Meaning I can add MORE. 
                                Let's list the selected tags that are NOT in listAvailableTags separately or just trust the array checks.
                            */}
                            {customTags.filter(t => !listAvailableTags.includes(t)).length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3 p-3 bg-white/5 rounded-lg border border-white/5">
                                    <span className="text-xs text-gray-500 w-full mb-1">Personalizadas:</span>
                                    {customTags.filter(t => !listAvailableTags.includes(t)).map(tag => (
                                        <button
                                            key={tag}
                                            type="button"
                                            onClick={() => toggleTag(tag)}
                                            className="px-3 py-1 text-xs rounded-full bg-purple-500/20 border border-purple-500 text-purple-300 hover:bg-red-500/20 hover:border-red-500 transition-colors group"
                                        >
                                            #{tag} <X className="inline w-3 h-3 ml-1 group-hover:text-red-400" />
                                        </button>
                                    ))}
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

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 ring-1 ring-white/10"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Publicar Reseña"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
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
