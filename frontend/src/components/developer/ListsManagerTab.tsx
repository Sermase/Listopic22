import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, limit as firestoreLimit, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { CreateListForm } from '../CreateListForm';
import { EditListModal } from '../EditListModal';
import { Globe, Lock, Users, Eye, Edit3, ExternalLink, Plus, RefreshCw, X } from 'lucide-react';

interface ListRecord {
    id: string;
    name: string;
    description?: string;
    isPublic: boolean;
    publicAccess?: 'reader' | 'writer';
    userId: string;
    authorName?: string;
    reviewCount?: number;
    itemCount?: number;
    parentListId?: string | null;
    photoUrl?: string;
    createdAt?: any;
}

export const ListsManagerTab: React.FC = () => {
    const { user } = useAuth();
    const { showToast } = useToast();

    const [lists, setLists] = useState<ListRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingListId, setEditingListId] = useState<string | null>(null);
    const [editModalListId, setEditModalListId] = useState<string | null>(null);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [showSublists, setShowSublists] = useState(false);

    const fetchLists = async () => {
        setLoading(true);
        try {
            const q = query(
                collection(db, 'lists'),
                firestoreLimit(200)
            );
            const snap = await getDocs(q);
            let results: ListRecord[] = snap.docs.map(d => ({
                id: d.id,
                ...(d.data() as Omit<ListRecord, 'id'>)
            }));

            if (!showSublists) {
                results = results.filter(l => !l.parentListId);
            }

            // Sort by name
            results.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            setLists(results);
        } catch (err: any) {
            console.error('Error fetching lists:', err);
            showToast({ variant: 'error', title: 'Error', message: err.message });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLists();
    }, [showSublists]);

    const toggleVisibility = async (list: ListRecord) => {
        setUpdatingId(list.id);
        try {
            const newIsPublic = !list.isPublic;
            await updateDoc(doc(db, 'lists', list.id), {
                isPublic: newIsPublic,
                visibility: newIsPublic ? 'public' : 'private',
                ...(newIsPublic ? {} : { publicAccess: 'reader' })
            });
            setLists(prev => prev.map(l =>
                l.id === list.id
                    ? { ...l, isPublic: newIsPublic, publicAccess: newIsPublic ? (l.publicAccess || 'reader') : 'reader' }
                    : l
            ));
            showToast({ variant: 'success', title: 'Actualizado', message: `Lista ${newIsPublic ? 'pública' : 'privada'}` });
        } catch (err: any) {
            showToast({ variant: 'error', title: 'Error', message: err.message });
        } finally {
            setUpdatingId(null);
        }
    };

    const toggleCollaborative = async (list: ListRecord) => {
        if (!list.isPublic) {
            showToast({ variant: 'error', title: 'Atención', message: 'Primero haz la lista pública' });
            return;
        }
        setUpdatingId(list.id);
        try {
            const newAccess: 'reader' | 'writer' = list.publicAccess === 'writer' ? 'reader' : 'writer';
            await updateDoc(doc(db, 'lists', list.id), { publicAccess: newAccess });
            setLists(prev => prev.map(l =>
                l.id === list.id ? { ...l, publicAccess: newAccess } : l
            ));
            showToast({ variant: 'success', title: 'Actualizado', message: `Acceso: ${newAccess === 'writer' ? 'Colaborativa' : 'Solo lectura'}` });
        } catch (err: any) {
            showToast({ variant: 'error', title: 'Error', message: err.message });
        } finally {
            setUpdatingId(null);
        }
    };

    const handleCreateSuccess = (newListId: string) => {
        setShowCreateModal(false);
        fetchLists();
        showToast({ variant: 'success', title: 'Lista creada', message: 'La nueva lista ya está disponible.' });
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Globe className="w-6 h-6 text-[var(--lt-accent)]" /> Gestión de Listas
                </h2>
                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={showSublists}
                            onChange={e => setShowSublists(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-600 text-[var(--lt-accent)] bg-[var(--lt-bg)]"
                        />
                        Mostrar sublistas
                    </label>
                    <button
                        onClick={fetchLists}
                        className="p-2 bg-white/5 rounded-lg hover:bg-white/10 text-white"
                        title="Recargar"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                        <Plus className="w-4 h-4" /> Nueva Lista
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="text-sm text-gray-500">
                {lists.length} lista{lists.length !== 1 ? 's' : ''}{!showSublists ? ' principales' : ''}
            </div>

            {/* List Table */}
            <div className="bg-[#121624] rounded-xl border border-white/5 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Cargando...</div>
                ) : lists.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">No hay listas.</div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {/* Header row */}
                        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            <span>Lista</span>
                            <span className="text-center w-20">Visibilidad</span>
                            <span className="text-center w-24">Acceso público</span>
                            <span className="text-center w-16">Reseñas</span>
                            <span className="text-center w-20">Acciones</span>
                        </div>
                        {lists.map(list => (
                            <div key={list.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-3 items-center hover:bg-white/2 transition-colors">
                                {/* Name + meta */}
                                <div className="min-w-0">
                                    <div className="font-medium text-white text-sm truncate">{list.name || '(sin nombre)'}</div>
                                    <div className="text-xs text-gray-500 truncate">
                                        {list.authorName || list.userId?.slice(0, 8)}
                                        {list.parentListId && <span className="ml-2 text-amber-400/70">sublista</span>}
                                    </div>
                                </div>

                                {/* Visibility toggle */}
                                <div className="w-20 flex justify-center">
                                    <button
                                        onClick={() => toggleVisibility(list)}
                                        disabled={updatingId === list.id}
                                        title={list.isPublic ? 'Pública — clic para hacer privada' : 'Privada — clic para hacer pública'}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all disabled:opacity-50 ${
                                            list.isPublic
                                                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                                                : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                                        }`}
                                    >
                                        {list.isPublic ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                                        {list.isPublic ? 'Pública' : 'Privada'}
                                    </button>
                                </div>

                                {/* Collaborative toggle */}
                                <div className="w-24 flex justify-center">
                                    <button
                                        onClick={() => toggleCollaborative(list)}
                                        disabled={!list.isPublic || updatingId === list.id}
                                        title={
                                            !list.isPublic
                                                ? 'Debe ser pública para cambiar el acceso'
                                                : list.publicAccess === 'writer'
                                                    ? 'Colaborativa — clic para solo lectura'
                                                    : 'Solo lectura — clic para colaborativa'
                                        }
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all disabled:opacity-30 ${
                                            list.publicAccess === 'writer' && list.isPublic
                                                ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                                                : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                                        }`}
                                    >
                                        {list.publicAccess === 'writer' && list.isPublic
                                            ? <><Users className="w-3 h-3" /> Colaborativa</>
                                            : <><Eye className="w-3 h-3" /> Lectores</>
                                        }
                                    </button>
                                </div>

                                {/* Review count */}
                                <div className="w-16 text-center text-sm text-gray-400">
                                    {list.reviewCount ?? '—'}
                                </div>

                                {/* Actions */}
                                <div className="w-20 flex justify-center gap-2">
                                    <button
                                        onClick={() => setEditModalListId(list.id)}
                                        title="Editar lista"
                                        className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                    >
                                        <Edit3 className="w-4 h-4" />
                                    </button>
                                    <a
                                        href={`/list/${list.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Ver lista"
                                        className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Edit List Modal */}
            {editModalListId && (
                <EditListModal
                    listId={editModalListId}
                    onClose={() => setEditModalListId(null)}
                    onSaved={() => { setEditModalListId(null); fetchLists(); }}
                    onDeleted={() => { setEditModalListId(null); fetchLists(); }}
                />
            )}

            {/* Create List Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-8 px-4" onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}>
                    <div className="w-full max-w-3xl bg-[var(--lt-bg)] rounded-2xl border border-white/10 p-6 relative" onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => setShowCreateModal(false)}
                            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <h2 className="text-xl font-bold text-white mb-6">Nueva Lista</h2>
                        <CreateListForm
                            onSuccess={handleCreateSuccess}
                            onCancel={() => setShowCreateModal(false)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
