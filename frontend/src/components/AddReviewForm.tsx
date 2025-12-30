import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Loader2, X, Star } from 'lucide-react';

interface AddReviewFormProps {
    listId: string; // Required for saving
    prefillPlaceId?: string; // Optional: If coming from PlacePage
    prefillItemName?: string; // Optional: If coming from Dish
    onClose: () => void;
    onSuccess: () => void;
}

export const AddReviewForm: React.FC<AddReviewFormProps> = ({ listId, prefillPlaceId, prefillItemName, onClose, onSuccess }) => {
    const { user } = useAuth();
    const [itemName, setItemName] = useState(prefillItemName || '');
    const [comment, setComment] = useState('');
    const [overallRating, setOverallRating] = useState(5);
    const [criteriaScores, setCriteriaScores] = useState<Record<string, number>>({});
    const [criteriaDefinition, setCriteriaDefinition] = useState<Record<string, any>>({});

    // Loading States
    const [initLoading, setInitLoading] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch List Metadata to get Criteria Definition
    useEffect(() => {
        const fetchListMetadata = async () => {
            if (!listId) return;
            try {
                const docRef = doc(db, 'lists', listId);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.criteriaDefinition) {
                        setCriteriaDefinition(data.criteriaDefinition);
                        // Initialize scores with default (e.g., 5) -> Actually 0 or 5? Let's say 5 for UX.
                        const initialScores: Record<string, number> = {};
                        Object.keys(data.criteriaDefinition).forEach(k => {
                            initialScores[k] = 5;
                        });
                        setCriteriaScores(initialScores);
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !listId) return;

        if (!itemName.trim()) {
            setError("El nombre del item es obligatorio");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // 1. Add Review
            const reviewData = {
                listId,
                userId: user.uid,
                authorName: user.displayName || 'Anónimo',
                authorPhoto: user.photoURL || '',
                itemName: itemName.trim(),
                comment: comment.trim(),
                overallRating,
                scores: criteriaScores, // Save detailed scores
                criteriaDefinition, // Save snapshot of definition used
                createdAt: serverTimestamp(),
                placeId: prefillPlaceId || '', // Use prefill if available
                // We'd ideally fetch place info if prefillPlaceId is set to populate placeName/address etc.
                // For MVP, we proceed.
            };

            await addDoc(collection(db, 'reviews'), reviewData);

            // 2. Update List Counter
            const listRef = doc(db, 'lists', listId);
            await updateDoc(listRef, {
                itemCount: increment(1)
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

    if (initLoading) return null; // Or spinner

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#151b2e] rounded-2xl w-full max-w-lg border border-white/10 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#0b1021]/50">
                    <h2 className="text-lg font-bold text-white">Añadir Reseña</h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                    >
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
                        {/* 1. Item Name */}
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-400 mb-1 tracking-wider">¿Qué estás reseñando?</label>
                            <input
                                type="text"
                                value={itemName}
                                onChange={e => setItemName(e.target.value)}
                                placeholder="Ej: Pizza Margarita"
                                disabled={!!prefillItemName} // Lock if prefilled
                                className={`w-full bg-[#0b1021] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors ${prefillItemName ? 'opacity-70 cursor-not-allowed' : ''}`}
                            />
                        </div>

                        {/* 2. Overall Rating */}
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-400 mb-2 tracking-wider">Nota Global</label>
                            <div className="flex justify-between items-center bg-[#0b1021] p-2 rounded-xl border border-white/5">
                                <div className="flex gap-1">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                                        <button
                                            key={num}
                                            type="button"
                                            onClick={() => setOverallRating(num)}
                                            className={`w-8 h-10 rounded-md text-sm font-bold transition-all flex items-center justify-center flex-col
                                                ${overallRating >= num ? 'text-indigo-400' : 'text-gray-700 hover:text-gray-500'}`}
                                        >
                                            <span className="text-[10px] mb-1">•</span>
                                        </button>
                                    ))}
                                </div>
                                <div className="text-2xl font-bold text-white px-4 border-l border-white/10">{overallRating}</div>
                            </div>
                            <input
                                type="range"
                                min="1" max="10"
                                value={overallRating}
                                onChange={(e) => setOverallRating(parseInt(e.target.value))}
                                className="w-full mt-2 h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                        </div>

                        {/* 3. Detailed Criteria (If available) */}
                        {Object.keys(criteriaDefinition).length > 0 && (
                            <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-4">
                                <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                                    <ListIcon className="w-4 h-4" /> Detalles
                                </h3>
                                {Object.entries(criteriaDefinition).map(([key, def]) => (
                                    <div key={key}>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="text-gray-400">{def.label}</span>
                                            <span className="text-white font-mono">{criteriaScores[key]}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="1"
                                            max="10"
                                            step="0.5"
                                            value={criteriaScores[key]}
                                            onChange={(e) => setCriteriaScores(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))}
                                            className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* 4. Comment */}
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-400 mb-1 tracking-wider">Tu Opinión</label>
                            <textarea
                                value={comment}
                                onChange={e => setComment(e.target.value)}
                                placeholder="Cuéntanos más detalles..."
                                rows={4}
                                className="w-full bg-[#0b1021] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 resize-none"
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

// Simple Icon helper for missing import
const ListIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
    </svg>
);
