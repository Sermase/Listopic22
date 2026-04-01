import React, { useState } from 'react';
import { db } from '../../firebase';
import {
    collection, query, where, getDocs, doc, updateDoc,
    limit as firestoreLimit, orderBy, getDoc
} from 'firebase/firestore';
import { Search, X, Bot, Award, User, RefreshCw, Shield, ChevronDown, ChevronUp, Loader2, Star } from 'lucide-react';
import { propagateAuthorFieldsToReviews } from '../../services/UserProfileService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ManagedUser {
    uid: string;
    displayName?: string;
    username?: string;
    email?: string;
    photoUrl?: string;
    userType?: string | string[];
    reviewsCount?: number;
    averageRating?: number;
    level?: number;
    xp?: number;
    badges?: any[];
    bio?: string;
    location?: string;
    followersCount?: number;
    followingCount?: number;
    createdAt?: any;
}

const USER_ROLES = ['bot', 'critico'] as const;
type UserRole = typeof USER_ROLES[number];

const ROLE_META: Record<UserRole, { label: string; icon: React.ReactNode; color: string }> = {
    bot: {
        label: 'Bot',
        icon: <Bot className="w-3.5 h-3.5" />,
        color: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300',
    },
    critico: {
        label: 'Crítico',
        icon: <Star className="w-3.5 h-3.5" />,
        color: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
    },
};

// ─── User Modal ────────────────────────────────────────────────────────────────

interface UserModalProps {
    user: ManagedUser;
    onClose: () => void;
    onSaved: (updated: ManagedUser) => void;
    availableBadges: any[];
}

const UserModal: React.FC<UserModalProps> = ({ user, onClose, onSaved, availableBadges }) => {
    const currentTypes: string[] = Array.isArray(user.userType) ? user.userType : (user.userType ? [user.userType] : []);
    const [roles, setRoles] = useState<string[]>(currentTypes.filter(r => USER_ROLES.includes(r as UserRole)));
    const [badges, setBadges] = useState<string[]>(
        Array.isArray(user.badges)
            ? user.badges.map((b: any) => (typeof b === 'string' ? b : b?.id ?? '')).filter(Boolean)
            : []
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [badgesOpen, setBadgesOpen] = useState(false);

    const toggleRole = (role: UserRole) => {
        setRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
    };

    const toggleBadge = (badgeId: string) => {
        setBadges(prev => prev.includes(badgeId) ? prev.filter(b => b !== badgeId) : [...prev, badgeId]);
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            const ref = doc(db, 'users', user.uid);
            // Keep non-editable types (basico, jefe, admin...) and merge with new roles
            const nonEditableTypes = currentTypes.filter(r => !USER_ROLES.includes(r as UserRole));
            const newUserType = [...new Set([...nonEditableTypes, ...roles])];
            await updateDoc(ref, {
                userType: newUserType,
                badges: badges,
            });
            propagateAuthorFieldsToReviews(user.uid, { authorUserType: newUserType });
            onSaved({ ...user, userType: newUserType, badges: badges });
        } catch (e: any) {
            setError(e.message || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    const avgRating = user.averageRating ?? 0;
    const ratingColor = avgRating >= 8.5 ? 'text-emerald-400' : avgRating >= 7 ? 'text-amber-400' : 'text-blue-400';

    return (
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4 py-8">
            <div className="w-full max-w-lg bg-[#151b2e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-5 border-b border-white/10 flex items-center gap-4">
                    {user.photoUrl ? (
                        <img src={user.photoUrl} alt={user.displayName} className="w-14 h-14 rounded-full object-cover ring-2 ring-white/10" />
                    ) : (
                        <div className="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xl font-bold">
                            {(user.displayName || user.username || '?')[0].toUpperCase()}
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <h3 className="text-white font-bold text-lg truncate">{user.displayName || 'Sin nombre'}</h3>
                        <p className="text-gray-400 text-sm">@{user.username || '—'}</p>
                        <p className="text-gray-600 text-xs truncate">{user.email}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 p-5 space-y-6">
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white/5 rounded-xl p-3 text-center">
                            <p className="text-gray-400 text-[10px] uppercase font-bold mb-1">Reseñas</p>
                            <p className="text-white font-bold text-lg">{user.reviewsCount ?? 0}</p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-3 text-center">
                            <p className="text-gray-400 text-[10px] uppercase font-bold mb-1">Media</p>
                            <p className={`font-bold text-lg ${ratingColor}`}>{avgRating > 0 ? avgRating.toFixed(1) : '—'}</p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-3 text-center">
                            <p className="text-gray-400 text-[10px] uppercase font-bold mb-1">Nivel</p>
                            <p className="text-white font-bold text-lg">{user.level ?? 1}</p>
                        </div>
                    </div>

                    {user.bio && (
                        <div>
                            <p className="text-gray-500 text-xs uppercase font-bold mb-1">Bio</p>
                            <p className="text-gray-300 text-sm">{user.bio}</p>
                        </div>
                    )}

                    {/* Roles */}
                    <div>
                        <p className="text-gray-400 text-xs uppercase font-bold mb-3 flex items-center gap-2">
                            <Shield className="w-3.5 h-3.5" /> Tipos de usuario
                        </p>
                        <div className="flex gap-2 flex-wrap">
                            {USER_ROLES.map(role => {
                                const meta = ROLE_META[role];
                                const active = roles.includes(role);
                                return (
                                    <button
                                        key={role}
                                        onClick={() => toggleRole(role)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-bold transition-all ${
                                            active ? meta.color : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-300'
                                        }`}
                                    >
                                        {meta.icon} {meta.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Badges */}
                    <div>
                        <button
                            onClick={() => setBadgesOpen(v => !v)}
                            className="w-full flex items-center justify-between text-gray-400 text-xs uppercase font-bold mb-2 hover:text-white transition-colors"
                        >
                            <span className="flex items-center gap-2"><Award className="w-3.5 h-3.5" /> Medallas ({badges.length})</span>
                            {badgesOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        {badgesOpen && (
                            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                                {availableBadges.map((badge: any) => {
                                    const active = badges.includes(badge.id);
                                    return (
                                        <button
                                            key={badge.id}
                                            onClick={() => toggleBadge(badge.id)}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all ${
                                                active
                                                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-200'
                                                    : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'
                                            }`}
                                        >
                                            <span className="text-lg">{badge.icon}</span>
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold truncate">{badge.name}</p>
                                                <p className="text-[10px] text-gray-500 truncate">{badge.descriptionPublic || badge.description}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                                {availableBadges.length === 0 && (
                                    <p className="text-gray-600 text-sm col-span-2 text-center py-4">No hay medallas disponibles</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {error && (
                    <div className="mx-5 mb-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-300">
                        {error}
                    </div>
                )}

                <div className="p-5 border-t border-white/10 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-bold transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export const UsersManagerTab: React.FC = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
    const [availableBadges, setAvailableBadges] = useState<any[]>([]);

    const searchUsers = async () => {
        if (!searchQuery.trim()) return;
        setLoading(true);
        try {
            const term = searchQuery.trim().toLowerCase();
            const results: ManagedUser[] = [];
            const seen = new Set<string>();

            const addResults = (docs: any[]) => {
                docs.forEach(d => {
                    if (!seen.has(d.id)) {
                        seen.add(d.id);
                        results.push({ uid: d.id, ...d.data() });
                    }
                });
            };

            // Search by username
            const q1 = query(collection(db, 'users'), where('usernameLower', '>=', term), where('usernameLower', '<=', term + '\uf8ff'), firestoreLimit(10));
            const s1 = await getDocs(q1);
            addResults(s1.docs);

            // Search by email
            const q2 = query(collection(db, 'users'), where('email', '>=', term), where('email', '<=', term + '\uf8ff'), firestoreLimit(10));
            const s2 = await getDocs(q2);
            addResults(s2.docs);

            // Fallback: load recent users and filter by displayName client-side
            if (results.length < 5) {
                const q3 = query(collection(db, 'users'), orderBy('reviewsCount', 'desc'), firestoreLimit(50));
                const s3 = await getDocs(q3);
                s3.docs.forEach(d => {
                    if (!seen.has(d.id)) {
                        const data = d.data() as any;
                        const dn = (data.displayName || '').toLowerCase();
                        const un = (data.username || '').toLowerCase();
                        if (dn.includes(term) || un.includes(term)) {
                            seen.add(d.id);
                            results.push({ uid: d.id, ...data });
                        }
                    }
                });
            }

            setUsers(results);

            // Also load available badges
            const badgeSnap = await getDocs(collection(db, 'badges'));
            setAvailableBadges(badgeSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const loadAll = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'users'), orderBy('reviewsCount', 'desc'), firestoreLimit(50));
            const snap = await getDocs(q);
            setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as ManagedUser)));
            const badgeSnap = await getDocs(collection(db, 'badges'));
            setAvailableBadges(badgeSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSaved = (updated: ManagedUser) => {
        setUsers(prev => prev.map(u => u.uid === updated.uid ? updated : u));
        setSelectedUser(null);
    };

    const getRoleChips = (u: ManagedUser) => {
        const types = Array.isArray(u.userType) ? u.userType : (u.userType ? [u.userType] : []);
        return types.filter((r): r is UserRole => USER_ROLES.includes(r as UserRole));
    };

    const avgColor = (r?: number) => {
        if (!r) return 'text-gray-500';
        if (r >= 8.5) return 'text-emerald-400';
        if (r >= 7) return 'text-amber-400';
        return 'text-blue-400';
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-bold text-white mb-1">Gestión de Usuarios</h2>
                <p className="text-gray-400 text-sm">Busca usuarios, gestiona sus tipos y medallas.</p>
            </div>

            {/* Search bar */}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && searchUsers()}
                        placeholder="Buscar por username, email o nombre..."
                        className="w-full bg-[#0b1021] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                    />
                </div>
                <button
                    onClick={searchUsers}
                    disabled={loading}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-60"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
                </button>
                <button
                    onClick={loadAll}
                    disabled={loading}
                    className="px-3 py-2.5 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl border border-white/10 transition-colors disabled:opacity-60"
                    title="Cargar top 50 por reseñas"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {/* Table */}
            {users.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-white/5 border-b border-white/10 text-gray-400 text-xs uppercase font-bold">
                                <th className="px-4 py-3 text-left">Usuario</th>
                                <th className="px-4 py-3 text-right">Reseñas</th>
                                <th className="px-4 py-3 text-right">Media</th>
                                <th className="px-4 py-3 text-right">Nivel</th>
                                <th className="px-4 py-3 text-left">Tipos</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr
                                    key={u.uid}
                                    onClick={() => setSelectedUser(u)}
                                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                                >
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            {u.photoUrl ? (
                                                <img src={u.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                                                    {(u.displayName || u.username || '?')[0].toUpperCase()}
                                                </div>
                                            )}
                                            <div>
                                                <p className="text-white font-medium">{u.displayName || '—'}</p>
                                                <p className="text-gray-500 text-[11px]">@{u.username || '—'}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right text-white font-medium">{u.reviewsCount ?? 0}</td>
                                    <td className={`px-4 py-3 text-right font-bold ${avgColor(u.averageRating)}`}>
                                        {u.averageRating ? u.averageRating.toFixed(1) : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-300">{u.level ?? 1}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-1 flex-wrap">
                                            {getRoleChips(u).map(role => (
                                                <span key={role} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${ROLE_META[role].color}`}>
                                                    {ROLE_META[role].icon} {ROLE_META[role].label}
                                                </span>
                                            ))}
                                            {getRoleChips(u).length === 0 && (
                                                <span className="text-gray-600 text-[10px]">Normal</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {!loading && users.length === 0 && (
                <div className="text-center py-16 text-gray-600">
                    <User className="w-8 h-8 mx-auto mb-3 opacity-40" />
                    <p className="font-bold text-gray-500">Busca un usuario para empezar</p>
                    <p className="text-xs mt-1">o carga los 50 con más reseñas con el botón de refresco</p>
                </div>
            )}

            {selectedUser && (
                <UserModal
                    user={selectedUser}
                    onClose={() => setSelectedUser(null)}
                    onSaved={handleSaved}
                    availableBadges={availableBadges}
                />
            )}
        </div>
    );
};
