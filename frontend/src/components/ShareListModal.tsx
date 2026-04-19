import React, { useState, useEffect } from 'react';
import { X, Search, UserPlus, Check, Shield, Trash2, Users, Edit3, Eye } from 'lucide-react';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

interface ShareListModalProps {
    isOpen: boolean;
    onClose: () => void;
    listId: string;
    listName: string;
    currentGuests?: string[]; // Readers
    currentEditors?: string[]; // Writers
    ownerId: string;
    onUpdate?: () => void; // Optional: Refresh list data in parent if needed, but we handle UI locally
}

export const ShareListModal: React.FC<ShareListModalProps> = ({
    isOpen,
    onClose,
    listId,
    listName,
    currentGuests = [],
    currentEditors = [],
    ownerId,
    onUpdate
}) => {
    const { user } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Role Selection for new users
    const [selectedRole, setSelectedRole] = useState<'reader' | 'writer'>('reader');

    // Internal state — stores UIDs
    const [readers, setReaders] = useState<string[]>(currentGuests);
    const [writers, setWriters] = useState<string[]>(currentEditors);
    // Resolved display names: uid → username/displayName
    const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});

    // Sync props to state when modal opens and resolve UIDs to display names
    useEffect(() => {
        if (isOpen) {
            setReaders(currentGuests || []);
            setWriters(currentEditors || []);
            setSearchTerm('');
            setSearchResults([]);

            const allUids = [...(currentGuests || []), ...(currentEditors || [])].filter(Boolean);
            if (!allUids.length) return;
            (async () => {
                const map: Record<string, string> = {};
                await Promise.all(allUids.map(async (uid) => {
                    try {
                        const snap = await getDoc(doc(db, 'users', uid));
                        if (snap.exists()) {
                            const d = snap.data();
                            map[uid] = d.username || d.displayName || uid;
                        } else {
                            map[uid] = uid;
                        }
                    } catch {
                        map[uid] = uid;
                    }
                }));
                setResolvedNames(map);
            })();
        }
    }, [isOpen, currentGuests, currentEditors]);

    // Search Users
    const handleSearch = async () => {
        if (!searchTerm.trim()) return;
        setIsSearching(true);
        try {
            const rawTerm = searchTerm.trim();
            // Firestore is case sensitive. We will try:
            // 1. As typed
            // 2. Lowercase
            // 3. Capitalized (first letter upper, rest lower) - Common for names

            const termsToTry = new Set<string>();
            termsToTry.add(rawTerm);
            termsToTry.add(rawTerm.toLowerCase());
            termsToTry.add(rawTerm.charAt(0).toUpperCase() + rawTerm.slice(1).toLowerCase());

            if (rawTerm.includes('@')) {
                // It's likely an email, simple matching
                const usersRef = collection(db, 'users');
                const qEmail = query(usersRef, where('email', '==', rawTerm));
                const snapEmail = await getDocs(qEmail);
                const results = snapEmail.docs.map(d => ({ id: d.id, ...d.data() }));

                // Filter
                const filtered = results.filter((u: any) => u.id !== user?.uid && u.id !== ownerId);
                setSearchResults(filtered);
                return;
            }

            const usersRef = collection(db, 'users');
            const promises = Array.from(termsToTry).map(async (t) => {
                const q = query(usersRef, where('username', '>=', t), where('username', '<=', t + '\uf8ff'));
                return getDocs(q);
            });

            const snapshots = await Promise.all(promises);
            let combinedResults: any[] = [];
            const seenIds = new Set<string>();

            snapshots.forEach(snap => {
                snap.docs.forEach(doc => {
                    if (!seenIds.has(doc.id)) {
                        seenIds.add(doc.id);
                        combinedResults.push({ id: doc.id, ...doc.data() });
                    }
                });
            });

            // Exclude self and owner
            combinedResults = combinedResults.filter((u: any) => u.id !== user?.uid && u.id !== ownerId);
            setSearchResults(combinedResults);

        } catch (error) {
            console.error("Error searching users:", error);
        } finally {
            setIsSearching(false);
        }
    };

    // uid: Firebase Auth UID, displayName: username for display
    const handleAddUser = async (uid: string, displayName: string) => {
        try {
            if (selectedRole === 'writer') {
                await updateDoc(doc(db, 'lists', listId), {
                    editors: arrayUnion(uid),
                    guests: arrayRemove(uid)
                });
                setWriters(prev => [...prev, uid]);
                setReaders(prev => prev.filter(g => g !== uid));
            } else {
                await updateDoc(doc(db, 'lists', listId), {
                    guests: arrayUnion(uid),
                    editors: arrayRemove(uid)
                });
                setReaders(prev => [...prev, uid]);
                setWriters(prev => prev.filter(e => e !== uid));
            }
            setResolvedNames(prev => ({ ...prev, [uid]: displayName }));
        } catch (error) {
            console.error("Error adding user:", error);
            alert("Error al añadir usuario");
        }
    };

    const handleRemoveUser = async (userIdentifier: string, fromRole: 'reader' | 'writer') => {
        try {
            if (fromRole === 'writer') {
                await updateDoc(doc(db, 'lists', listId), {
                    editors: arrayRemove(userIdentifier)
                });
                setWriters(writers.filter(w => w !== userIdentifier));
            } else {
                await updateDoc(doc(db, 'lists', listId), {
                    guests: arrayRemove(userIdentifier)
                });
                setReaders(readers.filter(r => r !== userIdentifier));
            }
        } catch (error) {
            console.error("Error removing user:", error);
            alert("Error al eliminar usuario");
        }
    };

    if (!isOpen) return null;
    if (user?.uid !== ownerId) return null; // Only owner can share

    // Helper to check status
    const getUserStatus = (identifier: string) => {
        if (writers.includes(identifier)) return 'writer';
        if (readers.includes(identifier)) return 'reader';
        return null;
    };

    const allGuests = [...new Set([...writers, ...readers])]; // Unique identifiers

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-[var(--lt-card-strong)] w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[var(--lt-bg)]/50">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Users className="w-5 h-5 text-[var(--lt-accent)]" />
                            Compartir Lista
                        </h2>
                        <p className="text-xs text-gray-500 truncate max-w-[300px]">{listName}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto custom-scrollbar">

                    {/* Access Level Info */}
                    <div className="mb-6 bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] rounded-lg p-3">
                        <div className="flex gap-3">
                            <Shield className="w-5 h-5 text-[var(--lt-accent)] shrink-0 mt-0.5" />
                            <div>
                                <h4 className="text-sm font-bold text-[var(--lt-accent)]">Roles de Acceso</h4>
                                <ul className="text-xs text-[var(--lt-accent)]/70 mt-1 list-disc list-inside space-y-1">
                                    <li><strong>Lector:</strong> Puede ver la lista (si es privada).</li>
                                    <li><strong>Escritor:</strong> Puede ver y <u>añadir reseñas</u>.</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="mb-8">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Añadir Personas</label>
                        <div className="flex gap-2 mb-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    placeholder="Buscar por nombre de usuario..."
                                    className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-[var(--lt-accent-border)]"
                                />
                            </div>

                            {/* Role Selector for Search */}
                            <div className="flex bg-[var(--lt-bg)] border border-white/10 rounded-lg p-0.5 shrink-0 h-10 items-center">
                                <button
                                    onClick={() => setSelectedRole('reader')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${selectedRole === 'reader' ? 'bg-[var(--lt-accent)] text-white' : 'text-gray-400 hover:text-white'} `}
                                    title="Añadir como Lector"
                                >
                                    <Eye className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setSelectedRole('writer')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${selectedRole === 'writer' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'} `}
                                    title="Añadir como Escritor"
                                >
                                    <Edit3 className="w-4 h-4" />
                                </button>
                            </div>

                            <button
                                onClick={handleSearch}
                                disabled={isSearching}
                                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-sm font-medium transition-colors"
                            >
                                {isSearching ? '...' : 'Buscar'}
                            </button>
                        </div>

                        <div className="text-xs text-gray-500 mb-2">
                            Añadiendo como: <span className={`font-bold ${selectedRole === 'writer' ? 'text-[var(--lt-accent-2)]' : 'text-[var(--lt-accent)]'} `}>{selectedRole === 'writer' ? 'Escritor' : 'Lector'}</span>
                        </div>

                        {/* Search Results */}
                        {searchResults.length > 0 && (
                            <div className="mt-2 bg-[var(--lt-bg)] border border-white/5 rounded-lg overflow-hidden">
                                {searchResults.map(u => {
                                    const status = getUserStatus(u.id);

                                    return (
                                        <div key={u.id} className="p-3 flex items-center justify-between hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gray-700 overflow-hidden">
                                                    {u.photoURL ? <img src={u.photoURL} alt={u.username} className="w-full h-full object-cover" /> : null}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-white">{u.displayName || u.username}</p>
                                                    <p className="text-xs text-gray-500">@{u.username}</p>
                                                </div>
                                            </div>

                                            {status ? (
                                                <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${status === 'writer' ? 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent-2)]' : 'bg-green-500/20 text-green-400'} `}>
                                                    <Check className="w-3 h-3" /> {status === 'writer' ? 'Escritor' : 'Lector'}
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() => handleAddUser(u.id, u.username || u.displayName || u.id)}
                                                    className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${selectedRole === 'writer' ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] text-white'} `}
                                                >
                                                    <UserPlus className="w-3 h-3" /> Añadir
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Current Guests */}
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                            Usuarios con Acceso ({allGuests.length})
                        </label>

                        {allGuests.length === 0 ? (
                            <div className="text-center py-8 border border-dashed border-white/10 rounded-lg">
                                <p className="text-gray-500 text-sm">No hay usuarios añadidos.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {allGuests.map((identifier, idx) => {
                                    const role = getUserStatus(identifier) || 'reader';
                                    return (
                                        <div key={idx} className="bg-[var(--lt-bg)] border border-white/5 rounded-lg p-3 flex items-center justify-between group">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${role === 'writer' ? 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent-2)]' : 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]'} `}>
                                                    {(resolvedNames[identifier] || identifier)[0]?.toUpperCase()}
                                                </div>
                                                <div>
                                                    <span className="text-sm text-gray-300 block">{resolvedNames[identifier] || identifier}</span>
                                                    <span className={`text-[10px] uppercase font-bold ${role === 'writer' ? 'text-[var(--lt-accent-2)]' : 'text-[var(--lt-accent)]'} `}>{role === 'writer' ? 'Escritor' : 'Lector'}</span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleRemoveUser(identifier, role)}
                                                className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                title="Eliminar acceso"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
};
