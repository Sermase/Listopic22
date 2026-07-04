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
    writeBatch,
    type DocumentData,
    type DocumentReference,
    type QueryDocumentSnapshot,
    type QuerySnapshot
} from 'firebase/firestore';
import { db } from '../firebase';
import { useQueryClient } from '@tanstack/react-query';
import { Save, Loader, X, Smile } from 'lucide-react';
import { CriteriaBuilder, type Criterion } from './CriteriaBuilder';
import { TagEmojiPicker, splitTagEmoji, buildTagString } from './TagEmojiPicker';

type CriteriaDefinitionValue = {
    type?: string;
    label?: string;
    min?: number;
    max?: number;
    labelMin?: string;
    labelMax?: string;
    ponderable?: boolean;
    step?: number;
};

type CriteriaDefinitionMap = Record<string, CriteriaDefinitionValue>;

interface EditableListData {
    userId?: string;
    name?: string;
    description?: string;
    isPublic?: boolean;
    publicAccess?: 'reader' | 'writer';
    parentListId?: string | null;
    availableTags?: string[];
    criteriaDefinition?: CriteriaDefinitionMap;
}

const isPermissionDenied = (error: unknown): boolean => {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied');
};

interface EditListFormProps {
    listId: string;
    onSuccess: () => void;
    onCancel: () => void;
    onDeleted?: () => void;
    formId?: string;
    onSavingChange?: (saving: boolean) => void;
}

export const EditListForm: React.FC<EditListFormProps> = ({ listId, onSuccess, onCancel, onDeleted, formId, onSavingChange }) => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
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
    const [tagIcon, setTagIcon] = useState('');
    const [showTagEmojiPicker, setShowTagEmojiPicker] = useState(false);
    const [editingTag, setEditingTag] = useState<string | null>(null);
    const [editingTagLabel, setEditingTagLabel] = useState('');
    const [editingTagIcon, setEditingTagIcon] = useState('');
    const [showEditEmojiPicker, setShowEditEmojiPicker] = useState(false);
    const [tagRenames, setTagRenames] = useState<Map<string, string>>(new Map());
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

                const data = docSnap.data() as EditableListData;

                // Permission check: jefe can edit any list; for sublists owner can edit
                const isOwner = user && data.userId === user.uid;
                if (!isJefe && !isOwner) {
                    alert('No tienes permiso para editar esta lista');
                    onCancel();
                    return;
                }

                setName(data.name || '');
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
                            const parentData = parentSnap.data() as EditableListData;
                            if (parentData.availableTags) setInheritedTags(parentData.availableTags);
                            if (parentData.criteriaDefinition) setInheritedCriteriaIds(Object.keys(parentData.criteriaDefinition));
                        }
                    } catch (err) {
                        console.warn('Failed to fetch parent list', err);
                    }
                }

                if (data.criteriaDefinition) {
                    const loadedCriteria: Criterion[] = [];
                    Object.entries(data.criteriaDefinition).forEach(([key, val]) => {
                        if (val.type === 'slider') {
                            loadedCriteria.push({
                                id: key,
                                label: val.label || key,
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
    }, [listId, loadingProfile, isJefe, onCancel, user]);

    const addTag = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && tagInput.trim()) {
            e.preventDefault();
            const val = buildTagString(tagIcon, tagInput);
            if (val && !customTags.includes(val)) setCustomTags([...customTags, val]);
            setTagInput('');
            setTagIcon('');
        }
    };

    const commitAddTag = () => {
        const val = buildTagString(tagIcon, tagInput);
        if (val && !customTags.includes(val)) setCustomTags([...customTags, val]);
        setTagInput('');
        setTagIcon('');
    };

    const removeTag = (tag: string) => {
        if (inheritedTags.includes(tag)) return;
        setCustomTags(customTags.filter(t => t !== tag));
        setTagRenames(prev => { const m = new Map(prev); m.delete(tag); return m; });
    };

    const startEditTag = (tag: string) => {
        if (inheritedTags.includes(tag)) return;
        const { icon, label } = splitTagEmoji(tag);
        setEditingTag(tag);
        setEditingTagIcon(icon);
        setEditingTagLabel(label);
    };

    const commitTagEdit = () => {
        if (!editingTag) return;
        const newVal = buildTagString(editingTagIcon, editingTagLabel);
        if (newVal && newVal !== editingTag && !customTags.includes(newVal)) {
            setCustomTags(customTags.map(t => t === editingTag ? newVal : t));
            setTagRenames(prev => {
                const m = new Map(prev);
                const originalKey = [...m.entries()].find(([, v]) => v === editingTag)?.[0] ?? editingTag;
                m.set(originalKey, newVal);
                return m;
            });
        }
        setEditingTag(null);
        setEditingTagLabel('');
        setEditingTagIcon('');
        setShowEditEmojiPicker(false);
    };

    const cancelTagEdit = () => {
        setEditingTag(null);
        setEditingTagLabel('');
        setEditingTagIcon('');
        setShowEditEmojiPicker(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        onSavingChange?.(true);

        // Flush any tag text pending in the input
        let finalTags = customTags;
        if (tagInput.trim() && !customTags.includes(tagInput.trim())) {
            finalTags = [...customTags, tagInput.trim()];
            setCustomTags(finalTags);
            setTagInput('');
        }

        try {
            const docRef = doc(db, 'lists', listId);
            const newVisibility = isPublic ? 'public' : 'private';

            const criteriaDefinitionMap: CriteriaDefinitionMap = {};
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
                availableTags: finalTags
            });

            // Propagate tag renames to reviews
            if (tagRenames.size > 0) {
                const renameEntries = Array.from(tagRenames.entries());
                const safeQuery = async (load: () => Promise<QuerySnapshot<DocumentData>>) => {
                    try { return await load(); } catch { return null; }
                };

                const reviewSnapshots = await Promise.all([
                    safeQuery(() => getDocs(collection(db, 'lists', listId, 'reviews'))),
                    ...(parentListId ? [
                        safeQuery(() => getDocs(query(collection(db, 'lists', parentListId, 'reviews'), where('sublistId', '==', listId))))
                    ] : [])
                ]);

                const reviewDocs = new Map<string, QueryDocumentSnapshot<DocumentData>>();
                reviewSnapshots.forEach(snap => {
                    if (!snap) return;
                    snap.docs.forEach((d) => reviewDocs.set(d.ref.path, d));
                });

                const toUpdate: { ref: DocumentReference<DocumentData>; newTags: string[] }[] = [];
                reviewDocs.forEach((d) => {
                    const data = d.data();
                    const currentTags: string[] = data.tags || data.userTags || [];
                    const updated = [...currentTags];
                    let changed = false;
                    renameEntries.forEach(([oldTag, newTag]) => {
                        const idx = updated.indexOf(oldTag);
                        if (idx !== -1) { updated[idx] = newTag; changed = true; }
                    });
                    if (changed) toUpdate.push({ ref: d.ref, newTags: updated });
                });

                for (let i = 0; i < toUpdate.length; i += 450) {
                    const batch = writeBatch(db);
                    toUpdate.slice(i, i + 450).forEach(({ ref, newTags }) =>
                        batch.update(ref, { tags: newTags })
                    );
                    await batch.commit();
                }
            }

            // Sync visibility to reviews
            const safeGetDocs = async (load: () => Promise<QuerySnapshot<DocumentData>>) => {
                try { return await load(); } catch (e: unknown) {
                    if (!isPermissionDenied(e)) console.warn('Failed to query reviews', e);
                    return null;
                }
            };

            const snapshots = parentListId
                ? await Promise.all([
                    safeGetDocs(() => getDocs(query(collection(db, 'lists', parentListId, 'reviews'), where('sublistId', '==', listId)))),
                    safeGetDocs(() => getDocs(collection(db, 'lists', listId, 'reviews')))
                ])
                : [await safeGetDocs(() => getDocs(collection(db, 'lists', listId, 'reviews')))];

            const reviewDocs = new Map<string, QueryDocumentSnapshot<DocumentData>>();
            snapshots.forEach(snap => {
                if (!snap) return;
                snap.docs.forEach((d) => reviewDocs.set(d.ref.path, d));
            });

            const toUpdate = Array.from(reviewDocs.values()).filter((d) => d.data().visibility !== newVisibility);
            for (let i = 0; i < toUpdate.length; i += 450) {
                const batch = writeBatch(db);
                toUpdate.slice(i, i + 450).forEach((d) => batch.update(d.ref, { visibility: newVisibility }));
                await batch.commit();
            }

            queryClient.invalidateQueries({ queryKey: ['listDetails', listId] });
            queryClient.invalidateQueries({ queryKey: ['lists'] });
            queryClient.invalidateQueries({ queryKey: ['doc', 'lists', listId] });
            onSuccess();
        } catch (error) {
            console.error('Error updating list:', error);
            alert('Error al guardar cambios');
        } finally {
            setSaving(false);
            onSavingChange?.(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('¿Eliminar esta lista permanentemente? Esta acción no se puede deshacer.')) return;
        setSaving(true);
        try {
            await deleteDoc(doc(db, 'lists', listId));
            queryClient.invalidateQueries({ queryKey: ['listDetails', listId] });
            queryClient.invalidateQueries({ queryKey: ['lists'] });
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
                <Loader className="w-8 h-8 text-[var(--lt-accent)] animate-spin" />
            </div>
        );
    }

    return (
        <form id={formId} onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-[var(--lt-card-strong)] p-6 rounded-xl border border-white/10 shadow-xl space-y-6">
                {/* Name */}
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Nombre de la Lista</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--lt-accent-border)] transition-all"
                        required
                    />
                </div>

                {/* Description */}
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Descripción</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--lt-accent-border)] transition-all min-h-[100px]"
                    />
                </div>

                {/* Visibility */}
                <div className="flex items-center gap-3 p-4 bg-[var(--lt-bg)] rounded-lg border border-white/5">
                    <input
                        type="checkbox"
                        id={`isPublic-${listId}`}
                        checked={isPublic}
                        onChange={(e) => setIsPublic(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-600 text-[var(--lt-accent)] focus:ring-[var(--lt-accent)] bg-[var(--lt-card-strong)]"
                    />
                    <label htmlFor={`isPublic-${listId}`} className="text-sm cursor-pointer">
                        <span className="block font-medium text-white">Lista Pública</span>
                        <span className="block text-xs text-gray-500">Visible en el perfil y en búsqueda global.</span>
                    </label>
                </div>

                {/* Public Access */}
                {isPublic && (
                    <div className="bg-[var(--lt-bg)] p-4 rounded-xl border border-white/5 space-y-3">
                        <label className="block text-sm font-medium text-gray-400">Permisos Públicos</label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="radio" name={`publicAccess-${listId}`} value="reader" checked={publicAccess === 'reader'} onChange={() => setPublicAccess('reader')}
                                className="w-4 h-4 text-[var(--lt-accent)] focus:ring-[var(--lt-accent)] bg-[var(--lt-bg)] border-gray-600" />
                            <div>
                                <span className="block text-sm font-medium text-white">Solo Lectura</span>
                                <span className="block text-xs text-gray-500">Los visitantes pueden ver pero solo editores añaden reseñas.</span>
                            </div>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="radio" name={`publicAccess-${listId}`} value="writer" checked={publicAccess === 'writer'} onChange={() => setPublicAccess('writer')}
                                className="w-4 h-4 text-[var(--lt-accent)] focus:ring-[var(--lt-accent)] bg-[var(--lt-bg)] border-gray-600" />
                            <div>
                                <span className="block text-sm font-medium text-white">Colaborativa (Escritura)</span>
                                <span className="block text-xs text-gray-500">Cualquier usuario puede añadir reseñas.</span>
                            </div>
                        </label>
                    </div>
                )}
            </div>

            {/* Criteria & Tags */}
            <div className="bg-[var(--lt-card-strong)] p-6 rounded-xl border border-white/10 shadow-xl space-y-8">
                <CriteriaBuilder criteria={criteria} onChange={setCriteria} lockedIds={inheritedCriteriaIds} />

                <div className="border-t border-white/5 pt-6" />

                <div>
                    <h3 className="text-lg font-bold text-white mb-2">Etiquetas</h3>
                    <p className="text-sm text-gray-400 mb-3">Define qué etiquetas estarán disponibles para clasificar las reseñas.</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                        {customTags.map(tag => {
                            const isLocked = inheritedTags.includes(tag);
                            const { icon, label } = splitTagEmoji(tag);
                            if (editingTag === tag) {
                                return (
                                    <span key={tag} className="relative flex items-center gap-1 bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] rounded-full px-2 py-0.5">
                                        <button
                                            type="button"
                                            onClick={() => setShowEditEmojiPicker(p => !p)}
                                            className="text-base w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors shrink-0"
                                            aria-label="Elegir icono"
                                        >
                                            {editingTagIcon || <Smile className="w-3.5 h-3.5 text-gray-400" />}
                                        </button>
                                        {showEditEmojiPicker && (
                                            <TagEmojiPicker
                                                onSelect={e => { setEditingTagIcon(e); setShowEditEmojiPicker(false); }}
                                                onClose={() => setShowEditEmojiPicker(false)}
                                            />
                                        )}
                                        <input
                                            autoFocus
                                            type="text"
                                            value={editingTagLabel}
                                            onChange={e => setEditingTagLabel(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') { e.preventDefault(); commitTagEdit(); }
                                                if (e.key === 'Escape') cancelTagEdit();
                                            }}
                                            onBlur={commitTagEdit}
                                            className="bg-transparent text-white text-sm outline-none w-24"
                                        />
                                    </span>
                                );
                            }
                            return (
                                <span key={tag} className={`px-3 py-1 rounded-full text-sm flex items-center gap-1.5 ${isLocked ? 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] border border-[var(--lt-accent-border)]' : 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]'}`}>
                                    <button
                                        type="button"
                                        onClick={() => startEditTag(tag)}
                                        disabled={isLocked}
                                        className="flex items-center gap-1.5 disabled:cursor-default"
                                        aria-label={`Editar etiqueta ${tag}`}
                                    >
                                        {icon && <span>{icon}</span>}
                                        <span>{label || tag}</span>
                                    </button>
                                    {!isLocked && (
                                        <button type="button" aria-label={`Eliminar etiqueta ${tag}`} onClick={() => removeTag(tag)} className="hover:text-white"><X className="w-3 h-3" /></button>
                                    )}
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

            {/* Delete (siempre visible en el contenido) */}
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

            {/* Actions inline (solo cuando no hay formId externo) */}
            {!formId && (
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
            )}
        </form>
    );
};
