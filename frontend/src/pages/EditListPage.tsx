import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    doc,
    getDoc,
    updateDoc,
    deleteDoc,
    collection,
    query,
    where,
    getDocs,
    writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import { ArrowLeft, Save, Loader, X } from 'lucide-react';
import { CriteriaBuilder, type Criterion } from '../components/CriteriaBuilder';

export const EditListPage: React.FC = () => {
    const { listId } = useParams<{ listId: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isPublic, setIsPublic] = useState(true);
    const [publicAccess, setPublicAccess] = useState<'reader' | 'writer'>('reader');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [parentListId, setParentListId] = useState<string | null>(null);

    // Advanced State
    const [criteria, setCriteria] = useState<Criterion[]>([]);
    const [customTags, setCustomTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');

    // Inheritance Locks
    const [inheritedCriteriaIds, setInheritedCriteriaIds] = useState<string[]>([]);
    const [inheritedTags, setInheritedTags] = useState<string[]>([]);

    useEffect(() => {
        const fetchList = async () => {
            if (!listId) return;
            try {
                const docRef = doc(db, 'lists', listId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (user && data.userId !== user.uid) {
                        alert("No tienes permiso para editar esta lista");
                        navigate('/');
                        return;
                    }
                    setName(data.name);
                    setDescription(data.description || '');
                    setIsPublic(data.isPublic !== false); // Default true
                    setPublicAccess(data.publicAccess || 'reader');
                    const pListId = data.parentListId || null;
                    setParentListId(pListId);

                    // Load Tags
                    const loadedTags = data.availableTags || [];
                    setCustomTags(loadedTags);

                    // Fetch Parent List for Inheritance info
                    if (pListId) {
                        try {
                            const parentSnap = await getDoc(doc(db, 'lists', pListId));
                            if (parentSnap.exists()) {
                                const parentData = parentSnap.data();
                                // Identify Locked Tags
                                if (parentData.availableTags) {
                                    setInheritedTags(parentData.availableTags);
                                }
                                // Identify Locked Criteria
                                if (parentData.criteriaDefinition) {
                                    setInheritedCriteriaIds(Object.keys(parentData.criteriaDefinition));
                                }
                            }
                        } catch (err) {
                            console.warn("Failed to fetch parent list", err);
                        }
                    }

                    // Load Criteria
                    if (data.criteriaDefinition) {
                        const loadedCriteria: Criterion[] = [];
                        Object.entries(data.criteriaDefinition).forEach(([key, val]: [string, any]) => {
                            if (val.type === 'slider') {
                                loadedCriteria.push({
                                    id: key,
                                    label: val.label,
                                    minLabel: val.labelMin || 'Malo',
                                    maxLabel: val.labelMax || 'Excelente',
                                    isPonderable: val.ponderable !== false
                                });
                            }
                        });
                        setCriteria(loadedCriteria);
                    }
                } else {
                    alert("Lista no encontrada");
                    navigate('/');
                }
            } catch (error) {
                console.error("Error fetching list:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchList();
    }, [listId, user, navigate]);

    // HANDLERS
    const addTag = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && tagInput.trim()) {
            e.preventDefault();
            const val = tagInput.trim();
            if (!customTags.includes(val)) {
                setCustomTags([...customTags, val]);
            }
            setTagInput('');
        }
    };
    const removeTag = (tag: string) => {
        if (inheritedTags.includes(tag)) return; // Prevent removing inherited tags
        setCustomTags(customTags.filter(t => t !== tag));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!listId) return;
        setSaving(true);

        try {
            const docRef = doc(db, 'lists', listId);

            // 1. Update List Document
            // Sync `isPublic` (legacy) with `visibility` (new)
            const newVisibility = isPublic ? 'public' : 'private';

            // Prepare Criteria Map
            const criteriaDefinitionMap: Record<string, any> = {};
            criteria.forEach(c => {
                criteriaDefinitionMap[c.id] = {
                    type: 'slider',
                    label: c.label,
                    min: 0,
                    max: 10,
                    step: 0.5,
                    labelMin: c.minLabel,
                    labelMax: c.maxLabel,
                    ponderable: c.isPonderable
                };
            });

            await updateDoc(docRef, {
                name,
                description,
                isPublic,
                publicAccess: isPublic ? publicAccess : 'reader',
                visibility: newVisibility,
                criteriaDefinition: criteriaDefinitionMap,
                availableTags: customTags // Overwrite all tags
            });

            // 2. Batch Update Reviews
            // Changing visibility requires updating all reviews for this list/sublist
            // Query all reviews where listId == listId (for main lists) OR sublistId == listId (for sublists)
            // But strict schema says reviews have `listId` as parent. 
            // If this is a sublist, reviews have `sublistId` == this ID.
            // If this is a main list, reviews have `listId` == this ID AND `sublistId` == null (technically).

            // Simplest safe approach:
            // Find all reviews where sublistId == listId (if sublist) OR listId == listId (if main list, but be careful not to touch sublist reviews if we only want to change main list visibility?)
            // Actually, if a MAIN list becomes private, all its reviews should be private.
            // If a SUBLIST becomes private, only its reviews should be private.

            // Strategy: query reviews targeting this list context.
            // Since we know if we are a sublist (parentListId exists), we can target precisely.

            let q;
            if (parentListId) {
                // We are a sublist
                q = query(collection(db, 'reviews'), where('sublistId', '==', listId));
            } else {
                // We are a main list
                // If main list changes visibility, typically we want to update its direct reviews.
                // However, sublist reviews might have their own visibility. 
                // For now, let's assume we update all reviews where listId == listId.
                q = query(collection(db, 'reviews'), where('listId', '==', listId));
            }

            const snap = await getDocs(q);
            const batch = writeBatch(db);
            let count = 0;

            snap.docs.forEach(doc => {
                // Only update if visibility is different to save writes? 
                // Or just overwrite to be safe.
                if (doc.data().visibility !== newVisibility) {
                    batch.update(doc.ref, { visibility: newVisibility });
                    count++;
                }
            });

            if (count > 0) {
                await batch.commit();
                console.log(`Updated visibility for ${count} reviews`);
            }

            navigate(`/list/${listId}`);
        } catch (error) {
            console.error("Error updating list:", error);
            alert("Error al guardar cambios");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!listId) return;

        const confirmDelete = window.confirm(
            "¿Estás seguro de que quieres eliminar esta lista permanentemente? Esta acción no se puede deshacer."
        );

        if (!confirmDelete) return;

        setSaving(true);
        try {
            // Delete the list document
            await deleteDoc(doc(db, 'lists', listId));

            // Note: Ideally we should also delete all reviews in a batch or cloud function,
            // but for now we just delete the list entry.
            // Reviews might become orphaned or handle nicely if we filter by existing lists.

            if (parentListId) {
                navigate(`/list/${parentListId}`);
            } else {
                navigate('/');
            }
        } catch (error) {
            console.error("Error deleting list:", error);
            alert("Error al eliminar la lista");
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0b1021] pt-32 flex justify-center">
                <Loader className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0b1021] text-gray-100 pt-24 pb-20 px-4">
            <div className="max-w-2xl mx-auto">
                <button onClick={() => navigate(-1)} className="flex items-center text-gray-400 hover:text-white mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Cancelar
                </button>

                <h1 className="text-3xl font-bold font-display text-white mb-8">Editar Lista</h1>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="bg-[#151b2e] p-6 rounded-xl border border-white/10 shadow-xl">
                        {/* Name */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-400 mb-2">Nombre de la Lista</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-[#0b1021] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-gray-600"
                                required
                            />
                        </div>

                        {/* Description */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-400 mb-2">Descripción</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full bg-[#0b1021] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-gray-600 min-h-[120px]"
                            />
                        </div>

                        {/* Visibility */}
                        <div className="flex items-center gap-3 p-4 bg-[#0b1021] rounded-lg border border-white/5">
                            <input
                                type="checkbox"
                                id="isPublic"
                                checked={isPublic}
                                onChange={(e) => setIsPublic(e.target.checked)}
                                className="w-5 h-5 rounded border-gray-600 text-indigo-600 focus:ring-indigo-500 bg-[#151b2e]"
                            />
                            <label htmlFor="isPublic" className="text-sm">
                                <span className="block font-medium text-white">Lista Pública</span>
                                <span className="block text-xs text-gray-500">Muestra esta lista en tu perfil y en la búsqueda global.</span>
                            </label>
                        </div>

                        {/* Public Access Level */}
                        {isPublic && (
                            <div className="bg-[#151b2e] p-4 rounded-xl border border-white/10 animate-fade-in mt-4">
                                <label className="block text-sm font-medium text-gray-400 mb-3">Permisos Públicos</label>
                                <div className="space-y-3">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="publicAccess"
                                            value="reader"
                                            checked={publicAccess === 'reader'}
                                            onChange={() => setPublicAccess('reader')}
                                            className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 bg-[#0b1021] border-gray-600"
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
                                            className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 bg-[#0b1021] border-gray-600"
                                        />
                                        <div>
                                            <span className="block text-sm font-medium text-white">Colaborativa (Escritura)</span>
                                            <span className="block text-xs text-gray-500">Cualquier usuario puede añadir sus propias reseñas a esta lista.</span>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        )}

                        <div className="bg-[#151b2e] p-6 rounded-xl border border-white/10 shadow-xl space-y-8">
                            <CriteriaBuilder criteria={criteria} onChange={setCriteria} lockedIds={inheritedCriteriaIds} />

                            <div className="border-t border-white/5 pt-6"></div>

                            <div>
                                <h3 className="text-lg font-bold text-white mb-2">Etiquetas</h3>
                                <p className="text-sm text-gray-400 mb-3">Define qué etiquetas estarán disponibles para clasificar las reseñas.</p>

                                <div className="flex flex-wrap gap-2 mb-3">
                                    {customTags.map(tag => {
                                        const isLocked = inheritedTags.includes(tag);
                                        return (
                                            <span key={tag} className={`px-3 py-1 rounded-full text-sm flex items-center gap-1 ${isLocked ? 'bg-indigo-900/40 text-indigo-300 border border-indigo-500/30' : 'bg-indigo-500/20 text-indigo-300'}`}>
                                                #{tag}
                                                {!isLocked && (
                                                    <button type="button" onClick={() => removeTag(tag)} className="hover:text-white"><X className="w-3 h-3" /></button>
                                                )}
                                            </span>
                                        );
                                    })}
                                </div>
                                <input
                                    type="text"
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyDown={addTag}
                                    placeholder="Escribe y presiona Enter para añadir tag..."
                                    className="w-full bg-[#0b1021] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {saving ? <Loader className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        {saving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>

                    {/* Delete button */}
                    <div className="pt-8 border-t border-white/5 text-center">
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={saving}
                            className="text-red-400 text-sm hover:underline hover:text-red-300 transition-colors disabled:opacity-50"
                        >
                            Eliminar Lista de forma permanente
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

