import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { collection, addDoc, serverTimestamp, getDocs, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { useQueryClient } from '@tanstack/react-query';
import { Save, Loader, Image as ImageIcon, X, Smile } from 'lucide-react';
import { TagEmojiPicker, splitTagEmoji, buildTagString } from './TagEmojiPicker';
import { CriteriaBuilder, type Criterion } from './CriteriaBuilder';
import { type ListEntity } from '../hooks/useLists';

interface CreateListFormProps {
    parentListId?: string; // If creating a sublist
    parentListName?: string; // Name of parent list for display
    parentListImage?: string; // Image of parent list for display
    parentCriteria?: Record<string, any>; // Criteria from parent list
    parentTags?: string[]; // Tags from parent list
    initialData?: Partial<ListEntity>; // For editing in the future
    onSuccess: (newListId: string) => void;
    onCancel: () => void;
}

export const CreateListForm: React.FC<CreateListFormProps> = ({ parentListId, parentListName, parentListImage, parentCriteria, parentTags, initialData, onSuccess, onCancel }) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const queryClient = useQueryClient();

    // State
    const [name, setName] = useState(initialData?.name || '');
    const [description, setDescription] = useState(initialData?.description || '');
    const [isPublic, setIsPublic] = useState(initialData?.isPublic ?? true);
    const [publicAccess, setPublicAccess] = useState<'reader' | 'writer'>(initialData?.publicAccess || 'reader');
    // We construct the categoryId if needed, but for now let's just use empty or what's passed
    // NOTE: In the original page, categoryId helps prefill tags/criteria.
    const [categoryId, setCategoryId] = useState('');
    const [categories, setCategories] = useState<any[]>([]);

    // Image
    const [imagePreview, setImagePreview] = useState<string | null>(initialData?.photoUrl || initialData?.mainImageUrl || null);

    // Advanced
    // Advanced
    const [criteria, setCriteria] = useState<Criterion[]>(() => {
        if (parentCriteria) {
            // Convert parent map to array
            const inherited: Criterion[] = [];
            Object.entries(parentCriteria).forEach(([key, val]: [string, any]) => {
                if (val.type === 'slider') {
                    inherited.push({
                        id: key,
                        label: val.label,
                        minLabel: val.labelMin,
                        maxLabel: val.labelMax,
                        isPonderable: val.ponderable !== false,
                        step: val.step ?? 0.5
                    });
                }
            });
            return inherited;
        }
        return [
            { id: 'calidad', label: 'Calidad General', minLabel: 'Malo', maxLabel: 'Excelente', isPonderable: true }
        ];
    });

    // Calculate locked IDs
    const lockedCriteriaIds = React.useMemo(() => {
        return parentCriteria ? Object.keys(parentCriteria) : [];
    }, [parentCriteria]);

    const [customTags, setCustomTags] = useState<string[]>(initialData?.availableTags || []);
    const [tagIcon, setTagIcon] = useState('');
    const [showTagEmojiPicker, setShowTagEmojiPicker] = useState(false);
    const [fixedTags, setFixedTags] = useState<string[]>(parentTags || initialData?.fixedTags || []);
    const [tagInput, setTagInput] = useState('');

    const [loading, setLoading] = useState(false);

    // Fetch Categories
    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const snapshot = await getDocs(collection(db, 'categories'));
                if (!snapshot.empty) {
                    setCategories(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
                }
            } catch (e) {
                console.error("Error fetching categories", e);
            }
        };
        fetchCategories();
    }, []);

    // Handle Category Selection -> Prefill defaults
    useEffect(() => {
        if (!categoryId) return;
        const selectedCat = categories.find(c => c.id === categoryId);
        if (selectedCat) {
            // 1. Prefill Tags as pre-selected but removable
            if (selectedCat['fixed-tags'] && Array.isArray(selectedCat['fixed-tags'])) {
                const catTags: string[] = (selectedCat['fixed-tags'] as string[]).filter(t => !fixedTags.includes(t));
                setCustomTags(prev => {
                    // Category tags first, preserve any extra tags the user already added
                    const userExtras = prev.filter(t => !catTags.includes(t));
                    return [...catTags, ...userExtras];
                });
            }

            // 2. Prefill Criteria
            if (selectedCat.defaultCriteria) {
                const newCriteria: Criterion[] = [];
                Object.entries(selectedCat.defaultCriteria).forEach(([key, val]: [string, any]) => {
                    // Skip 'like'/'dislike' non-slider keys if present
                    if (val.type === 'slider') {
                        newCriteria.push({
                            id: key,
                            label: val.label,
                            minLabel: val.labelMin || 'Mina',
                            maxLabel: val.labelMax || 'Max',
                            isPonderable: val.ponderable !== false // default true
                        });
                    }
                });
                if (newCriteria.length > 0) {
                    setCriteria(newCriteria);
                }
            }
        }
    }, [categoryId, categories]);

    // Image Handlers
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    // Tag Handlers
    const addTag = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && tagInput.trim()) {
            e.preventDefault();
            const val = buildTagString(tagIcon, tagInput);
            if (val && !customTags.includes(val) && !fixedTags.includes(val)) {
                setCustomTags([...customTags, val]);
            }
            setTagInput('');
            setTagIcon('');
        }
    };

    const commitAddTag = () => {
        const val = buildTagString(tagIcon, tagInput);
        if (val && !customTags.includes(val) && !fixedTags.includes(val)) {
            setCustomTags([...customTags, val]);
        }
        setTagInput('');
        setTagIcon('');
    };

    const removeTag = (tag: string) => {
        setCustomTags(customTags.filter(t => t !== tag));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setLoading(true);

        try {
            const finalPhotoUrl = imagePreview || '';

            // Transform criteria array back to Map/Object for DB
            const criteriaDefinitionMap: Record<string, any> = {};
            criteria.forEach(c => {
                criteriaDefinitionMap[c.id] = {
                    type: 'slider',
                    label: c.label,
                    min: 0,
                    max: 10,
                    step: c.step ?? 0.5,
                    labelMin: c.minLabel,
                    labelMax: c.maxLabel,
                    ponderable: c.isPonderable
                };
            });

            const finalListTags = [...fixedTags, ...customTags];

            // Legacy Structure Match
            const newListData = {
                name,
                description,
                categoryId, // "comida_hmm" etc
                userId: user.uid,
                isPublic,
                publicAccess: isPublic ? publicAccess : 'reader', // Reset to reader if private just in case
                parentListId: parentListId || null,

                // Fields expected by new UI / legacy UI
                authorName: user.displayName || 'Anónimo',
                mainImageUrl: finalPhotoUrl, // Legacy name "mainImageUrl", new might use "photoUrl" - let's save both or align
                photoUrl: finalPhotoUrl,

                criteriaDefinition: criteriaDefinitionMap,
                availableTags: finalListTags, // Combined tags
                fixedTags: fixedTags,

                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),

                // Counters
                itemCount: 0,
                groupedItemsCount: 0,
                viewCount: 0,
                likes: 0,
                followersCount: 0,
                commentsCount: 0,
                reviewCount: 0,
                averageRating: 0, // Initial average

                // New fields for schema alignment
                criteriaAverages: {},
                criteriaAveragesUpdatedAt: serverTimestamp(),
                reactions: {},
            };

            const docRef = await addDoc(collection(db, 'lists'), newListData);

            // Update User's listsCount
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
                listsCount: increment(1)
            }).catch(e => console.warn("Could not increment user list count", e));

            queryClient.invalidateQueries({ queryKey: ['lists'] });
            showToast({
                variant: 'success',
                title: parentListId ? 'Sublista creada' : 'Lista creada',
                message: parentListId
                    ? 'Tu sublista ya está lista para recibir comparaciones finas.'
                    : 'Lista publicada. El orden acaba de ganar otra batalla.',
            });
            onSuccess(docRef.id);
        } catch (error) {
            console.error("Error creating list:", error);
            showToast({
                variant: 'error',
                title: 'No se pudo crear la lista',
                message: 'No conseguimos guardar la lista. Prueba otra vez en un momento.',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            {parentListId && parentListName ? (
                <div className="flex items-center gap-4 mb-2">
                    <div className="w-12 h-12 rounded-lg overflow-hidden border border-white/10 shrink-0">
                        {parentListImage ? (
                            <img src={parentListImage} className="w-full h-full object-cover opacity-80" alt={parentListName} />
                        ) : (
                            <div className="w-full h-full bg-[var(--lt-accent-soft)] flex items-center justify-center text-[var(--lt-accent)] font-bold text-xs">
                                {parentListName[0]}
                            </div>
                        )}
                    </div>
                    <div>
                        <h2 className="text-xl font-bold font-display text-white">Nueva Sublista</h2>
                        <p className="text-gray-400 text-sm">Basada en <span className="text-[var(--lt-accent)]">{parentListName}</span></p>
                    </div>
                </div>
            ) : null}

            <div className="glass-card p-6 space-y-6">
                {!parentListId && <h2 className="text-xl font-bold text-white mb-4">Información Básica</h2>}

                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Nombre de la Lista</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--lt-accent-border)]"
                        placeholder={parentListId ? "Ej: Sushi (Sublista)" : "Ej: Mejores Ramen de Madrid"}
                        required
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Categoría</label>
                    <select
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                        className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--lt-accent-border)]"
                        required={!parentListId} // Maybe optional for sublists? But let's keep it required for consistency
                    >
                        <option value="">Selecciona una categoría</option>
                        {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Descripción</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--lt-accent-border)] min-h-[100px]"
                        placeholder="¿De qué trata esta lista?"
                    />
                </div>

                {/* Image Upload */}
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Portada de la Lista</label>
                    <div className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center hover:bg-white/5 transition-colors relative group">
                        {imagePreview ? (
                            <div className="relative h-48 w-full rounded-lg overflow-hidden">
                                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                <button
                                    type="button"
                                    aria-label="Eliminar imagen"
                                    onClick={() => { setImagePreview(null); }}
                                    className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-red-500 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageChange}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <ImageIcon className="w-12 h-12 text-gray-600 mx-auto mb-3 group-hover:text-[var(--lt-accent)] transition-colors" />
                                <p className="text-gray-400 text-sm">Arrastra una imagen o haz clic para subir</p>
                                <p className="text-gray-600 text-xs mt-1">PNG, JPG hasta 5MB</p>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Criteria & Tags */}
            <div className="glass-card p-6 space-y-8">
                {/* Criteria Builder Component */}
                <CriteriaBuilder criteria={criteria} onChange={setCriteria} lockedIds={lockedCriteriaIds} />

                <div className="border-t border-white/5 pt-6"></div>

                {/* Tags */}
                <div>
                    <h3 className="text-lg font-bold text-white mb-2">Etiquetas (Tags)</h3>
                    <p className="text-sm text-gray-400 mb-4">
                        Ayuda a otros a filtrar tu lista.
                        {categoryId && categories.find(c => c.id === categoryId)?.['fixed-tags']?.length > 0 && (
                            <span className="text-[var(--lt-accent)] ml-1">Se han preseleccionado las etiquetas sugeridas de la categoría — puedes quitarlas o añadir más.</span>
                        )}
                    </p>

                    <div className="flex flex-wrap gap-2 mb-3">
                        {fixedTags.map(tag => (
                            <span key={`fixed-${tag}`} className="bg-gray-700/50 text-gray-300 px-3 py-1 rounded-full text-sm flex items-center gap-1 border border-white/5 cursor-not-allowed">
                                {tag}
                            </span>
                        ))}
                        {customTags.map(tag => {
                            const { icon, label } = splitTagEmoji(tag);
                            return (
                                <span key={tag} className="bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] px-3 py-1 rounded-full text-sm flex items-center gap-1.5">
                                    {icon && <span>{icon}</span>}
                                    <span>{label || tag}</span>
                                    <button type="button" aria-label={`Eliminar etiqueta ${tag}`} onClick={() => removeTag(tag)} className="hover:text-white"><X className="w-3 h-3" /></button>
                                </span>
                            );
                        })}
                    </div>

                    <div className="relative flex gap-2">
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowTagEmojiPicker(p => !p)}
                                className="h-full px-3 bg-[var(--lt-bg)] border border-white/10 rounded-lg text-lg hover:bg-white/5 transition-colors flex items-center"
                                aria-label="Elegir icono para el tag"
                            >
                                {tagIcon || <Smile className="w-4 h-4 text-gray-500" />}
                            </button>
                            {showTagEmojiPicker && (
                                <TagEmojiPicker
                                    onSelect={e => { setTagIcon(e); setShowTagEmojiPicker(false); }}
                                    onClose={() => setShowTagEmojiPicker(false)}
                                />
                            )}
                        </div>
                        <input
                            type="text"
                            value={tagInput}
                            onChange={e => setTagInput(e.target.value)}
                            onKeyDown={addTag}
                            placeholder="Nombre del tag y Enter para añadir..."
                            className="flex-1 bg-[var(--lt-bg)] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--lt-accent-border)]"
                        />
                        {tagInput.trim() && (
                            <button
                                type="button"
                                onClick={commitAddTag}
                                className="px-4 py-3 bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] rounded-lg text-white text-sm font-bold transition-colors"
                            >
                                Añadir
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Visibility */}
            <div className="glass-card p-4 flex items-center gap-3">
                <input
                    type="checkbox"
                    id="isPublic"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-600 text-[var(--lt-accent)] focus:ring-[var(--lt-accent)] bg-[var(--lt-bg)]"
                />
                <label htmlFor="isPublic" className="text-sm cursor-pointer">
                    <span className="block font-medium text-white">Lista Pública</span>
                    <span className="block text-xs text-gray-500">Visible en tu perfil y resultados de búsqueda.</span>
                </label>
            </div>

            {/* Public Access Level */}
            {isPublic && (
                <div className="glass-card p-4 animate-fade-in">
                    <label className="block text-sm font-medium text-gray-400 mb-3">Permisos Públicos</label>
                    <div className="space-y-3">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="radio"
                                name="publicAccess"
                                value="reader"
                                checked={publicAccess === 'reader'}
                                onChange={() => setPublicAccess('reader')}
                                className="w-4 h-4 text-[var(--lt-accent)] focus:ring-[var(--lt-accent)] bg-[var(--lt-bg)] border-gray-600"
                            />
                            <div>
                                <span className="block text-sm font-medium text-white">Solo Lectura</span>
                                <span className="block text-xs text-gray-500">Los visitantes pueden ver la lista pero solo tú (y editores) pueden añadir reseñas.</span>
                            </div>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="radio"
                                name="publicAccess"
                                value="writer"
                                checked={publicAccess === 'writer'}
                                onChange={() => setPublicAccess('writer')}
                                className="w-4 h-4 text-[var(--lt-accent)] focus:ring-[var(--lt-accent)] bg-[var(--lt-bg)] border-gray-600"
                            />
                            <div>
                                <span className="block text-sm font-medium text-white">Colaborativa (Escritura)</span>
                                <span className="block text-xs text-gray-500">Cualquier usuario puede añadir sus propias reseñas a esta lista.</span>
                            </div>
                        </label>
                    </div>
                </div>
            )}

            <div className="flex gap-4">
                <button
                    type="button"
                    onClick={onCancel}
                    className="btn-glass flex-1 py-4 text-base"
                >
                    Cancelar
                </button>
                <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary w-full flex-1 py-4 text-base disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {loading ? <Loader className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {loading ? 'Guardando...' : parentListId ? 'Crear Sublista' : 'Guardar Lista'}
                </button>
            </div>
        </form>
    );
};
