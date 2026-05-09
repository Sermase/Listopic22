import React, { useEffect, useMemo, useState } from 'react';
import {
    collection,
    doc,
    documentId,
    getDoc,
    getDocs,
    limit,
    query,
    where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Building2, Crown, ExternalLink, Loader2, RefreshCw, Search, ShieldCheck, UserMinus, UserPlus, X } from 'lucide-react';
import { db, functions } from '../../firebase';

interface BusinessPlace {
    id: string;
    name?: string;
    address?: string;
    mainImageUrl?: string;
    userPhotoUrl?: string;
    businessVerified?: boolean;
    businessOwnerUserId?: string;
    businessManagerIds?: string[];
    businessClaimId?: string;
}

interface ManagedUser {
    id: string;
    username?: string;
    displayName?: string;
    email?: string;
    photoUrl?: string;
}

const asString = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const chunk = <T,>(items: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
};

const userLabel = (user?: ManagedUser): string => {
    if (!user) return 'Usuario';
    return user.username ? `@${user.username}` : user.displayName || user.email || user.id;
};

const userSubtitle = (user?: ManagedUser): string => {
    if (!user) return '';
    return [user.displayName && user.displayName !== user.username ? user.displayName : '', user.email, user.id]
        .filter(Boolean)
        .join(' / ');
};

const updateBusinessTeamMember = httpsCallable(functions, 'updateBusinessTeamMember');

export const BusinessManagersTab: React.FC = () => {
    const [places, setPlaces] = useState<BusinessPlace[]>([]);
    const [usersById, setUsersById] = useState<Record<string, ManagedUser>>({});
    const [loading, setLoading] = useState(false);
    const [updatingPlaceId, setUpdatingPlaceId] = useState<string | null>(null);
    const [placeSearch, setPlaceSearch] = useState('');
    const [userSearch, setUserSearch] = useState('');
    const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
    const [searchingUser, setSearchingUser] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const loadUsers = async (ids: string[]) => {
        const missingIds = unique(ids).filter((id) => !usersById[id]);
        if (missingIds.length === 0) return;

        const loaded: Record<string, ManagedUser> = {};
        for (const idsChunk of chunk(missingIds, 10)) {
            const snap = await getDocs(query(
                collection(db, 'users'),
                where(documentId(), 'in', idsChunk),
                limit(idsChunk.length),
            ));
            snap.docs.forEach((userDoc) => {
                const data = userDoc.data() as Record<string, unknown>;
                loaded[userDoc.id] = {
                    id: userDoc.id,
                    username: asString(data.username),
                    displayName: asString(data.displayName) || asString(data.name),
                    email: asString(data.email),
                    photoUrl: asString(data.photoUrl),
                };
            });
        }

        setUsersById((prev) => ({ ...prev, ...loaded }));
    };

    const loadPlaces = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const snap = await getDocs(query(
                collection(db, 'places'),
                where('businessVerified', '==', true),
                limit(150),
            ));
            const rows = snap.docs.map((placeDoc) => {
                const data = placeDoc.data() as Record<string, unknown>;
                return {
                    id: placeDoc.id,
                    name: asString(data.name),
                    address: asString(data.address),
                    mainImageUrl: asString(data.mainImageUrl),
                    userPhotoUrl: asString(data.userPhotoUrl),
                    businessVerified: data.businessVerified === true,
                    businessOwnerUserId: asString(data.businessOwnerUserId),
                    businessManagerIds: Array.isArray(data.businessManagerIds)
                        ? data.businessManagerIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
                        : [],
                    businessClaimId: asString(data.businessClaimId),
                } satisfies BusinessPlace;
            });

            setPlaces(rows);
            await loadUsers(rows.flatMap((place) => [
                ...(place.businessManagerIds || []),
                place.businessOwnerUserId || '',
            ]));
        } catch (error) {
            console.error('BusinessManagersTab: failed loading businesses', error);
            setMessage({ type: 'error', text: 'No se pudieron cargar los negocios.' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadPlaces();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const visiblePlaces = useMemo(() => {
        const term = placeSearch.trim().toLowerCase();
        if (!term) return places;
        return places.filter((place) => [
            place.id,
            place.name || '',
            place.address || '',
            place.businessOwnerUserId || '',
            ...(place.businessManagerIds || []),
        ].some((value) => value.toLowerCase().includes(term)));
    }, [placeSearch, places]);

    const searchUser = async () => {
        const term = userSearch.trim();
        if (!term) return;

        setSearchingUser(true);
        setSelectedUser(null);
        setMessage(null);

        try {
            const candidates: ManagedUser[] = [];

            const directSnap = await getDoc(doc(db, 'users', term)).catch(() => null);
            if (directSnap?.exists()) {
                const data = directSnap.data() as Record<string, unknown>;
                candidates.push({
                    id: directSnap.id,
                    username: asString(data.username),
                    displayName: asString(data.displayName) || asString(data.name),
                    email: asString(data.email),
                    photoUrl: asString(data.photoUrl),
                });
            }

            const normalized = term.toLowerCase().replace(/^@/, '');
            const queries = [
                query(collection(db, 'users'), where('usernameLower', '==', normalized), limit(1)),
                query(collection(db, 'users'), where('emailLowerCase', '==', normalized), limit(1)),
                query(collection(db, 'users'), where('email', '==', term), limit(1)),
            ];

            for (const userQuery of queries) {
                const snap = await getDocs(userQuery).catch(() => null);
                snap?.docs.forEach((userDoc) => {
                    if (candidates.some((candidate) => candidate.id === userDoc.id)) return;
                    const data = userDoc.data() as Record<string, unknown>;
                    candidates.push({
                        id: userDoc.id,
                        username: asString(data.username),
                        displayName: asString(data.displayName) || asString(data.name),
                        email: asString(data.email),
                        photoUrl: asString(data.photoUrl),
                    });
                });
            }

            if (candidates.length === 0) {
                setMessage({ type: 'error', text: 'No se encontró ningún usuario con ese uid, username o email.' });
                return;
            }

            const selected = candidates[0];
            setSelectedUser(selected);
            setUsersById((prev) => ({ ...prev, [selected.id]: selected }));
        } finally {
            setSearchingUser(false);
        }
    };

    const patchPlaceLocally = (placeId: string, patch: Partial<BusinessPlace>) => {
        setPlaces((prev) => prev.map((place) => place.id === placeId ? { ...place, ...patch } : place));
    };

    const addManager = async (place: BusinessPlace, makeOwner = false) => {
        if (!selectedUser) {
            setMessage({ type: 'error', text: 'Busca y selecciona primero un usuario.' });
            return;
        }

        setUpdatingPlaceId(place.id);
        setMessage(null);
        try {
            await updateBusinessTeamMember({
                placeId: place.id,
                action: 'add',
                userSearch: selectedUser.id,
                makeOwner,
            });
            patchPlaceLocally(place.id, {
                businessVerified: true,
                businessOwnerUserId: makeOwner ? selectedUser.id : place.businessOwnerUserId,
                businessManagerIds: unique([...(place.businessManagerIds || []), selectedUser.id]),
            });
            setMessage({ type: 'success', text: `${userLabel(selectedUser)} asignado a ${place.name || place.id}.` });
        } catch (error) {
            console.error('BusinessManagersTab: add manager failed', error);
            setMessage({ type: 'error', text: 'No se pudo asignar el usuario.' });
        } finally {
            setUpdatingPlaceId(null);
        }
    };

    const removeManager = async (place: BusinessPlace, userId: string) => {
        if (!window.confirm('¿Quitar este usuario de la gestión del negocio?')) return;

        setUpdatingPlaceId(place.id);
        setMessage(null);
        try {
            const nextManagers = (place.businessManagerIds || []).filter((id) => id !== userId);
            const wasOwner = place.businessOwnerUserId === userId;
            await updateBusinessTeamMember({
                placeId: place.id,
                action: 'remove',
                targetUserId: userId,
            });
            patchPlaceLocally(place.id, {
                businessManagerIds: nextManagers,
                businessOwnerUserId: wasOwner ? '' : place.businessOwnerUserId,
            });
            setMessage({ type: 'success', text: 'Usuario eliminado del negocio.' });
        } catch (error) {
            console.error('BusinessManagersTab: remove manager failed', error);
            setMessage({ type: 'error', text: 'No se pudo quitar el usuario.' });
        } finally {
            setUpdatingPlaceId(null);
        }
    };

    const setOwner = async (place: BusinessPlace, userId: string) => {
        setUpdatingPlaceId(place.id);
        setMessage(null);
        try {
            await updateBusinessTeamMember({
                placeId: place.id,
                action: 'add',
                userSearch: userId,
                makeOwner: true,
            });
            patchPlaceLocally(place.id, {
                businessOwnerUserId: userId,
                businessVerified: true,
                businessManagerIds: unique([...(place.businessManagerIds || []), userId]),
            });
            setMessage({ type: 'success', text: 'Propietario actualizado.' });
        } catch (error) {
            console.error('BusinessManagersTab: set owner failed', error);
            setMessage({ type: 'error', text: 'No se pudo cambiar el propietario.' });
        } finally {
            setUpdatingPlaceId(null);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-5">
            <div className="rounded-xl border border-white/10 bg-[var(--lt-card-strong)] p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Building2 className="w-6 h-6 text-emerald-300" />
                            Gestor de negocios
                        </h2>
                        <p className="mt-1 max-w-2xl text-sm text-gray-400">
                            Administra los lugares reclamados y los usuarios que pueden gestionarlos desde el apartado Mis negocios.
                        </p>
                    </div>
                    <button
                        onClick={loadPlaces}
                        disabled={loading}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Actualizar
                    </button>
                </div>

                <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_1.2fr]">
                    <label className="block">
                        <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Filtrar negocios</span>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                            <input
                                value={placeSearch}
                                onChange={(event) => setPlaceSearch(event.target.value)}
                                className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-10 pr-3 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                                placeholder="Nombre, placeId, dirección, gestor..."
                            />
                        </div>
                    </label>

                    <div>
                        <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Usuario a asignar</span>
                        <div className="flex gap-2">
                            <input
                                value={userSearch}
                                onChange={(event) => setUserSearch(event.target.value)}
                                onKeyDown={(event) => { if (event.key === 'Enter') void searchUser(); }}
                                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                                placeholder="uid, @username o email"
                            />
                            <button
                                type="button"
                                onClick={searchUser}
                                disabled={searchingUser || !userSearch.trim()}
                                className="rounded-xl bg-[var(--lt-accent)] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                            >
                                {searchingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
                            </button>
                        </div>
                        {selectedUser && (
                            <div className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                                <ShieldCheck className="h-4 w-4" />
                                <span className="font-bold">{userLabel(selectedUser)}</span>
                                <span className="min-w-0 truncate text-emerald-200/70">{userSubtitle(selectedUser)}</span>
                                <button type="button" onClick={() => setSelectedUser(null)} className="ml-auto text-emerald-200/70 hover:text-white">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {message && (
                    <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                        message.type === 'success'
                            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                            : 'border-red-500/25 bg-red-500/10 text-red-200'
                    }`}>
                        {message.text}
                    </div>
                )}
            </div>

            {loading ? (
                <div className="rounded-xl border border-white/10 bg-[var(--lt-card-strong)] p-8 text-center text-sm text-gray-400">
                    <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-[var(--lt-accent)]" />
                    Cargando negocios...
                </div>
            ) : visiblePlaces.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-[var(--lt-card-strong)] p-8 text-center text-sm text-gray-400">
                    No hay negocios verificados que coincidan.
                </div>
            ) : (
                <div className="space-y-4">
                    {visiblePlaces.map((place) => {
                        const managers = unique([...(place.businessManagerIds || []), place.businessOwnerUserId || '']);
                        const photoUrl = place.userPhotoUrl || place.mainImageUrl || '';
                        return (
                            <div key={place.id} className="rounded-xl border border-white/10 bg-[var(--lt-card-strong)] p-5">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                                    <div className="h-24 w-full shrink-0 overflow-hidden rounded-xl bg-white/5 lg:w-36">
                                        {photoUrl ? (
                                            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-emerald-300">
                                                <Building2 className="h-8 w-8" />
                                            </div>
                                        )}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="min-w-0">
                                                <h3 className="truncate text-lg font-black text-white">{place.name || 'Negocio'}</h3>
                                                <p className="mt-1 break-all font-mono text-xs text-gray-500">{place.id}</p>
                                                {place.address && <p className="mt-1 text-xs text-gray-400">{place.address}</p>}
                                            </div>
                                            <a
                                                href={`/place/${place.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15"
                                            >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                                Lugar
                                            </a>
                                        </div>

                                        <div className="mt-4 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => addManager(place)}
                                                disabled={!selectedUser || updatingPlaceId === place.id}
                                                className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50"
                                            >
                                                <UserPlus className="h-3.5 w-3.5" />
                                                Añadir gestor
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => addManager(place, true)}
                                                disabled={!selectedUser || updatingPlaceId === place.id}
                                                className="inline-flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/15 disabled:opacity-50"
                                            >
                                                <Crown className="h-3.5 w-3.5" />
                                                Añadir como propietario
                                            </button>
                                        </div>

                                        <div className="mt-4 space-y-2">
                                            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Usuarios asignados</p>
                                            {managers.length === 0 ? (
                                                <p className="rounded-lg border border-dashed border-white/10 bg-black/15 px-3 py-2 text-xs text-gray-500">
                                                    No hay gestores asignados.
                                                </p>
                                            ) : (
                                                managers.map((managerId) => {
                                                    const manager = usersById[managerId];
                                                    const isOwner = place.businessOwnerUserId === managerId;
                                                    return (
                                                        <div key={managerId} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-3 sm:flex-row sm:items-center">
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="font-bold text-white">{userLabel(manager)}</span>
                                                                    {isOwner && (
                                                                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-200">
                                                                            <Crown className="h-3 w-3" />
                                                                            Propietario
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="truncate text-xs text-gray-500">{userSubtitle(manager) || managerId}</p>
                                                            </div>
                                                            <div className="flex shrink-0 gap-2">
                                                                {!isOwner && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setOwner(place, managerId)}
                                                                        disabled={updatingPlaceId === place.id}
                                                                        className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-200 disabled:opacity-50"
                                                                    >
                                                                        Hacer propietario
                                                                    </button>
                                                                )}
                                                                {!isOwner && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeManager(place, managerId)}
                                                                        disabled={updatingPlaceId === place.id}
                                                                        className="inline-flex items-center gap-1 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-200 disabled:opacity-50"
                                                                    >
                                                                        <UserMinus className="h-3.5 w-3.5" />
                                                                        Quitar
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
