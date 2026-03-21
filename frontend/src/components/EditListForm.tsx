import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUserProfile } from '../hooks/useUserProfile';
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
import { queryCache, invalidateDoc } from '../lib/queryCache';
import { Save, Loader, X } from 'lucide-react';
import { CriteriaBuilder, type Criterion } from './CriteriaBuilder';

interface EditListFormProps {
    listId: string;
    onSuccess: () => void;
    onCancel: () => void;
    onDeleted?: () => void; // called after deletion; if not provided, same as onSuccess
}

export const EditListForm: React.FC<EditListFormProps> = ({ listId, onSuccess, onCancel, onDeleted }) => {
    const { user } = useAuth();
    const { profile, loading: loadingProfile } = useUserProfile(user?.uid);

    const isJefe = Boolean(profile && (
        (Array.isArray(profile.userType) && profile.userType.includes('jefe')) ||
        profile.userType === 'jefe'
    ));

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isPublic, setIsPublic] = useState(true);
    const [publicAccess, setPublicAccess] = useState<'reader' | 'writer'>('reader');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [parentListId, setParentListId] = useState<string | null>(null);

    const [criteria, setCriteria] = useState<Criterion[]>([]);
    const [customTags, setCustomTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [inheritedCriteriaIds, setInheritedCriteriaIds] = useState<string[]>([]);
    const [inheritedTags, setInheritedTags] = useState<string[]>([]);

    useEffect(() => {
        if (loadingProfile) return; // wait for profile before checking permissions
        const fetchList = async () => {
            try {
                const docRef = doc(db, 'lists', listId);
                const docSnap = await getDoc(docRef);

                if (!docSnap.exists()) {
                    alert('Lista no encontrada');
                    onCancel();
                    return;
                }

                const data = docSnap.data();

                // Permission check: jefe can edit any list; for sublists owner can edit
                const isOwner = user && data.userId === user.uid;
                if (!isJefe && !isOwner) {
                    alert('No tienes permiso para editar esta lista');
                    onCancel();
                    return;
                }

                setName(data.name);
                setDescription(data.description || '');
                setIsPublic(data.isPublic !== false);
                setPublicAccess(data.publicAccess || 'reader');
                const pListId = data.parentListId || null;
                setParentListId(pListId);
                setCustomTags(data.availableTags || []);

                if (pListId) {
                    try {
                        const parentSnap = await getDoc(doc(db, 'lists', pListId));
                        if (parentSnap.exists()) {
                            const parentData = parentSnap.data();
                            if (parentData.availableTags) setInheritedTags(parentData.availableTags);
                            if (parentData.criteriaDefinition) setInheritedCriteriaIds(Object.keys(parentData.criteriaDefinition));
                        }
                    } catch (err) {
                        console.warn('Failed to fetch parent list', err);
                    }
                }

                if (data.criteriaDefinition) {
                    const loadedCriteria: Criterion[] = [];
                    Object.entries(data.criteriaDefinition).forEach(([key, val]: [string, any]) => {
                        if (val.type === 'slider') {
                            loadedCriteria.push({
                                id: key,
                                label: val.label,
                                minLabel: val.labelMin || 'Malo',
                                maxLabel: val.labelMax || 'Excelente',
                                isPonderable: val.ponderable !== false,
                                step: val.step ?? 0.5
                            });
                        }
                    });
                    setCriteria(loadedCriteria);
                }
            } catch (error) {
                console.error('Error fetching list:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchList();
    }, [listId, loadingProfile, isJefe]);

    const addTag = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && tagInput.trim()) {
            e.preventDefault();
            const val = tagInput.trim();
            if (!customTags.includes(val)) setCustomTags([...customTags, val]);
            setTagInput('');
        }
    };

    const removeTag = (tag: string) => {
        if (inheritedTags.includes(tag)) return;
        setCustomTags(customTags.filter(t => t !== tag));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            const docRef = doc(db, 'lists', listId);
            const newVisibility = isPublic ? 'public' : 'private';

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

            await updateDoc(docRef, {
                name,
                description,
                isPublic,
                publicAccess: isPublic ? publicAccess : 'reader',
                visibility: newVisibility,
                criteriaDefinition: criteriaDefinitionMap,
                availableTags: customTags
            });

            // Sync visibility to reviews
            const safeGetDocs = async (load: () => Promise<any>) => {
                try { return await load(); } catch (e: any) {
                    if (e?.code !== 'permission-denied') console.warn('Failed to query reviews', e);
                    return null;
                }
            };

            const snapshots = parentListId
                ? await Promise.all([
                    safeGetDocs(() => getDocs(query(collection(db, 'lists', parentListId, 'reviews'), where('sublistId', '==', listId)))),
                    safeGetDocs(() => getDocs(query(collection(db, 'reviews'), where('sublistId', '==', listId)))),
                    safeGetDocs(() => getDocs(query(collection(db, 'reviews'), where('listId', '==', listId)))),
                    safeGetDocs(() => getDocs(collection(db, 'lists', listId, 'reviews')))
                ])
                : await Promise.all([
                    safeGetDocs(() => getDocs(collection(db, 'lists', listId, 'reviews'))),
                    safeGetDocs(() => getDocs(query(collection(db, 'reviews'), where('listId', '==', listId)))),
                    safeGetDocs(() => getDocs(query(collection(db, 'reviews'), where('parentListId', '==', listId))))
                ]);

            const reviewDocs = new Map<string, any>();
            snapshots.forEach(snap => {
                if (!snap) return;
                snap.docs.forEach((d: any) => reviewDocs.set(d.ref.path, d));
            });

            const toUpdate = Array.from(reviewDocs.values()).filter((d: any) => d.data().visibility !== newVisibility);
            for (let i = 0; i < toUpdate.length; i += 450) {
                const batch = writeBatch(db);
                toUpdate.slice(i, i + 450).forEach((d: any) => batch.update(d.ref, { visibility: newVisibility }));
                await batch.commit();
            }

            queryCache.invalidate('listDetails:' + listId);
            queryCache.invalidate('lists:');
            invalidateDoc('lists', listId);
            onSuccess();
        } catch (error) {
            console.error('Error updating list:', error);
            alert('Error al guardar cambios');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('¿Eliminar esta lista permanentemente? Esta acción no se puede deshacer.')) return;
        setSaving(true);
        try {
            await deleteDoc(doc(db, 'lists', listId));
            queryCache.invalidate('listDetails:' + listId);
            queryCache.invalidate('lists:');
            (onDeleted || onSuccess)();
        } catch (error) {
            console.error('Error deleting list:', error);
            alert('Error al eliminar la lista');
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <Loader className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-[#151b2e] p-6 rounded-xl border border-white/10 shadow-xl space-y-6">
                {/* Name */}
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Nombre de la Lista</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-[#0b1021] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-all"
                        required
                    />
                </div>

                {/* Description */}
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Descripción</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full bg-[#0b1021] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-all min-h-[100px]"
                    />
                </div>

                {/* Visibility */}
                <div className="flex items-center gap-3 p-4 bg-[#0b1021] rounded-lg border border-white/5">
                    <input
                        type="checkbox"
                        id={`isPublic-${listId}`}
                        checked={isPublic}
                        onChange={(e) => setIsPublic(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-600 text-indigo-600 focus:ring-indigo-500 bg-[#151b2e]"
                    />
                    <label htmlFor={`isPublic-${listId}`} className="text-sm cursor-pointer">
                        <span className="block font-medium text-white">Lista Pública</span>
                        <span className="block text-xs text-gray-500">Visible en el perfil y en búsqueda global.</span>
                    </label>
                </div>

                {/* Public Access */}
                {isPublic && (
                    <div className="bg-[#0b1021] p-4 rounded-xl border border-white/5 space-y-3">
                        <label className="block text-sm font-medium text-gray-400">Permisos Públicos</label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="radio" name={`publicAccess-${listId}`} value="reader" checked={publicAccess === 'reader'} onChange={() => setPublicAccess('reader')}
                                className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 bg-[#0b1021] border-gray-600" />
                            <div>
                                <span className="block text-sm font-medium text-white">Solo Lectura</span>
                                <span className="block text-xs text-gray-500">Los visitantes pueden ver pero solo editores añaden reseñas.</span>
                            </div>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="radio" name={`publicAccess-${listId}`} value="writer" checked={publicAccess === 'writer'} onChange={() => setPublicAccess('writer')}
                                className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 bg-[#0b1021] border-gray-600" />
                            <div>
                                <span className="block text-sm font-medium text-white">Colaborativa (Escritura)</span>
                                <span className="block text-xs text-gray-500">Cualquier usuario puede añadir reseñas.</span>
                            </div>
                        </label>
                    </div>
                )}
            </div>

            {/* Criteria & Tags */}
            <div className="bg-[#151b2e] p-6 rounded-xl border border-white/10 shadow-xl space-y-8">
                <CriteriaBuilder criteria={criteria} onChange={setCriteria} lockedIds={inheritedCriteriaIds} />

                <div className="border-t border-white/5 pt-6" />

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

            {/* Actions */}
            <div className="flex gap-4">
                <button type="button" onClick={onCancel} className="btn-glass flex-1 py-4 text-base">
                    Cancelar
                </button>
                <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {saving ? <Loader className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
            </div>

            {/* Delete */}
            <div className="pt-4 border-t border-white/5 text-center">
                <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving}
                    className="text-red-400 text-sm hover:underline hover:text-red-300 transition-colors disabled:opacity-50"
                >
                    Eliminar lista permanentemente
                </button>
            </div>
        </form>
    );
};
