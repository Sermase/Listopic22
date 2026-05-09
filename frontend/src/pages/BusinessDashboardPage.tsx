import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Building2, ExternalLink, Loader2, MapPin, Settings } from 'lucide-react';
import { db, functions } from '../firebase';
import { useAuth } from '../context/AuthContext';

interface ManagedBusinessPlace {
    id: string;
    name?: string;
    address?: string;
    mainImageUrl?: string;
    userPhotoUrl?: string;
    reviewsCount?: number;
    averageRating?: number;
    businessVerified?: boolean;
    businessOwnerUserId?: string;
}

interface BusinessTeamUser {
    id: string;
    username?: string;
    displayName?: string;
    email?: string;
}

interface BusinessTeam {
    ownerUserId: string;
    managerIds: string[];
    users: BusinessTeamUser[];
}

const toNumber = (value: unknown): number | undefined => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};

export const BusinessDashboardPage: React.FC = () => {
    const { user } = useAuth();
    const [places, setPlaces] = useState<ManagedBusinessPlace[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expandedPlaceId, setExpandedPlaceId] = useState<string | null>(null);
    const [teamsByPlace, setTeamsByPlace] = useState<Record<string, BusinessTeam>>({});
    const [teamLoadingByPlace, setTeamLoadingByPlace] = useState<Record<string, boolean>>({});
    const [teamSearchByPlace, setTeamSearchByPlace] = useState<Record<string, string>>({});
    const [teamMessage, setTeamMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        if (!user?.uid) return;

        let cancelled = false;
        const loadBusinesses = async () => {
            setLoading(true);
            setError('');
            try {
                const [managedSnap, ownedSnap] = await Promise.all([
                    getDocs(query(
                        collection(db, 'places'),
                        where('businessManagerIds', 'array-contains', user.uid),
                        limit(50),
                    )),
                    getDocs(query(
                        collection(db, 'places'),
                        where('businessOwnerUserId', '==', user.uid),
                        limit(50),
                    )),
                ]);
                if (cancelled) return;

                const rowsById = new Map<string, ManagedBusinessPlace>();
                [...managedSnap.docs, ...ownedSnap.docs].forEach((docSnap) => {
                    const data = docSnap.data() as Record<string, unknown>;
                    rowsById.set(docSnap.id, {
                        id: docSnap.id,
                        name: typeof data.name === 'string' ? data.name : undefined,
                        address: typeof data.address === 'string' ? data.address : undefined,
                        mainImageUrl: typeof data.mainImageUrl === 'string' ? data.mainImageUrl : undefined,
                        userPhotoUrl: typeof data.userPhotoUrl === 'string' ? data.userPhotoUrl : undefined,
                        reviewsCount: toNumber(data.reviewsCount),
                        averageRating: toNumber(data.averageRating),
                        businessVerified: data.businessVerified === true,
                        businessOwnerUserId: typeof data.businessOwnerUserId === 'string' ? data.businessOwnerUserId : undefined,
                    });
                });

                setPlaces(Array.from(rowsById.values()));
            } catch (err) {
                console.error('BusinessDashboardPage: failed loading managed businesses', err);
                if (!cancelled) {
                    setError('No se pudieron cargar tus negocios asignados.');
                    setPlaces([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void loadBusinesses();
        return () => {
            cancelled = true;
        };
    }, [user?.uid]);

    const sortedPlaces = useMemo(() => {
        return [...places].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
    }, [places]);

    const loadTeam = async (placeId: string) => {
        setTeamLoadingByPlace((prev) => ({ ...prev, [placeId]: true }));
        setTeamMessage(null);
        try {
            const getBusinessTeam = httpsCallable<{ placeId: string }, BusinessTeam>(functions, 'getBusinessTeam');
            const result = await getBusinessTeam({ placeId });
            setTeamsByPlace((prev) => ({ ...prev, [placeId]: result.data }));
        } catch (err) {
            console.error('BusinessDashboardPage: failed loading team', err);
            setTeamMessage({ type: 'error', text: 'No se pudo cargar el equipo de este negocio.' });
        } finally {
            setTeamLoadingByPlace((prev) => ({ ...prev, [placeId]: false }));
        }
    };

    const toggleManage = (placeId: string) => {
        setExpandedPlaceId((prev) => {
            const next = prev === placeId ? null : placeId;
            if (next && !teamsByPlace[next]) void loadTeam(next);
            return next;
        });
    };

    const updateTeamMember = async (placeId: string, action: 'add' | 'remove', targetUserId?: string) => {
        const userSearch = (teamSearchByPlace[placeId] || '').trim();
        if (action === 'add' && !userSearch) {
            setTeamMessage({ type: 'error', text: 'Indica uid, username o email del usuario.' });
            return;
        }

        setTeamLoadingByPlace((prev) => ({ ...prev, [placeId]: true }));
        setTeamMessage(null);
        try {
            const updateBusinessTeamMember = httpsCallable(functions, 'updateBusinessTeamMember');
            await updateBusinessTeamMember({ placeId, action, userSearch, targetUserId });
            setTeamSearchByPlace((prev) => ({ ...prev, [placeId]: '' }));
            await loadTeam(placeId);
            setTeamMessage({ type: 'success', text: action === 'add' ? 'Usuario anadido al equipo.' : 'Usuario eliminado del equipo.' });
        } catch (err) {
            console.error('BusinessDashboardPage: failed updating team', err);
            const text = err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string'
                ? (err as { message: string }).message
                : 'No se pudo actualizar el equipo.';
            setTeamMessage({ type: 'error', text });
        } finally {
            setTeamLoadingByPlace((prev) => ({ ...prev, [placeId]: false }));
        }
    };

    const userLabel = (teamUser: BusinessTeamUser) => {
        return teamUser.username ? `@${teamUser.username}` : teamUser.displayName || teamUser.email || teamUser.id;
    };

    return (
        <div className="min-h-screen pt-28 pb-16 px-4 sm:px-6" style={{ background: 'var(--lt-bg)', color: 'var(--lt-text)' }}>
            <div className="max-w-5xl mx-auto">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-8">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-[var(--lt-accent)] mb-3">
                            <Building2 className="w-3.5 h-3.5" />
                            Negocios
                        </div>
                        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[var(--lt-text)]">Mis negocios</h1>
                        <p className="mt-2 text-sm text-[var(--lt-text-muted)] max-w-2xl">
                            Lugares asociados a tu cuenta. La gestión avanzada quedará aquí cuando activemos herramientas para negocios.
                        </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] px-4 py-3 text-sm text-[var(--lt-text-muted)]">
                        <span className="font-bold text-[var(--lt-text)]">{sortedPlaces.length}</span> asignado{sortedPlaces.length === 1 ? '' : 's'}
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-24 text-[var(--lt-text-muted)]">
                        <Loader2 className="w-6 h-6 animate-spin mr-2 text-[var(--lt-accent)]" />
                        Cargando negocios...
                    </div>
                ) : error ? (
                    <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-red-200">
                        {error}
                    </div>
                ) : sortedPlaces.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-white/10 bg-[var(--lt-card-strong)]/70 p-8 text-center">
                        <Building2 className="w-10 h-10 mx-auto text-[var(--lt-accent)] mb-3" />
                        <h2 className="text-xl font-bold text-[var(--lt-text)]">Aún no tienes negocios asignados</h2>
                        <p className="mt-2 text-sm text-[var(--lt-text-muted)]">
                            Cuando se apruebe una solicitud de negocio, aparecerá aquí automáticamente.
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                        {sortedPlaces.map((place) => {
                            const photoUrl = place.userPhotoUrl || place.mainImageUrl || '';
                            return (
                                <article key={place.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] shadow-lg shadow-black/10">
                                    <div className="h-36 bg-white/5">
                                        {photoUrl ? (
                                            <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-[var(--lt-accent)]">
                                                <Building2 className="w-10 h-10" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-5">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <h2 className="text-lg font-black text-[var(--lt-text)] truncate">{place.name || 'Negocio'}</h2>
                                                {place.address && (
                                                    <p className="mt-1 text-xs text-[var(--lt-text-muted)] flex gap-1.5">
                                                        <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                        <span className="line-clamp-2">{place.address}</span>
                                                    </p>
                                                )}
                                            </div>
                                            {place.businessVerified && (
                                                <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                                                    Verificado
                                                </span>
                                            )}
                                        </div>

                                        <div className="mt-4 flex items-center gap-3 text-xs text-[var(--lt-text-muted)]">
                                            <span>{place.reviewsCount ?? 0} reseñas</span>
                                            {place.averageRating !== undefined && <span>{place.averageRating.toFixed(1)} media</span>}
                                        </div>

                                        <div className="mt-5 grid grid-cols-3 gap-2">
                                            <Link
                                                to={`/place/${place.id}`}
                                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-[var(--lt-text)] hover:border-[var(--lt-accent-border)] transition-colors"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                                Ver lugar
                                            </Link>
                                            <Link
                                                to={`/businesses/${place.id}/manage`}
                                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--lt-accent)] px-3 py-2 text-sm font-bold text-white shadow-lg shadow-[var(--lt-accent-shadow)] transition-colors"
                                            >
                                                <Building2 className="w-4 h-4" />
                                                Datos
                                            </Link>
                                            <button
                                                type="button"
                                                onClick={() => toggleManage(place.id)}
                                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-[var(--lt-text)] hover:border-[var(--lt-accent-border)] transition-colors"
                                            >
                                                <Settings className="w-4 h-4" />
                                                Equipo
                                            </button>
                                        </div>

                                        {expandedPlaceId === place.id && (
                                            <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4">
                                                <h3 className="text-sm font-black text-[var(--lt-text)]">Equipo del negocio</h3>
                                                <p className="mt-1 text-xs text-[var(--lt-text-muted)]">
                                                    El propietario puede anadir o quitar gestores. Los gestores veran este negocio en su menu.
                                                </p>

                                                {teamMessage && (
                                                    <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
                                                        teamMessage.type === 'success'
                                                            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                                                            : 'border-red-500/25 bg-red-500/10 text-red-200'
                                                    }`}>
                                                        {teamMessage.text}
                                                    </div>
                                                )}

                                                <div className="mt-3 flex gap-2">
                                                    <input
                                                        value={teamSearchByPlace[place.id] || ''}
                                                        onChange={(event) => setTeamSearchByPlace((prev) => ({ ...prev, [place.id]: event.target.value }))}
                                                        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--lt-text)] outline-none focus:border-[var(--lt-accent-border)]"
                                                        placeholder="uid, @username o email"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => updateTeamMember(place.id, 'add')}
                                                        disabled={teamLoadingByPlace[place.id]}
                                                        className="rounded-xl bg-[var(--lt-accent)] px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                                                    >
                                                        Añadir
                                                    </button>
                                                </div>

                                                {teamLoadingByPlace[place.id] && !teamsByPlace[place.id] ? (
                                                    <div className="mt-4 flex items-center gap-2 text-xs text-[var(--lt-text-muted)]">
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        Cargando equipo...
                                                    </div>
                                                ) : teamsByPlace[place.id] && (
                                                    <div className="mt-4 space-y-2">
                                                        {teamsByPlace[place.id].users.map((member) => {
                                                            const isOwner = teamsByPlace[place.id].ownerUserId === member.id;
                                                            const canRemove = user?.uid === teamsByPlace[place.id].ownerUserId && !isOwner;
                                                            return (
                                                                <div key={member.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                                                    <div className="min-w-0">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="truncate text-sm font-bold text-[var(--lt-text)]">{userLabel(member)}</span>
                                                                            {isOwner && (
                                                                                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                                                                                    Propietario
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <p className="truncate text-[11px] text-[var(--lt-text-muted)]">{member.email || member.id}</p>
                                                                    </div>
                                                                    {canRemove && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => updateTeamMember(place.id, 'remove', member.id)}
                                                                            disabled={teamLoadingByPlace[place.id]}
                                                                            className="rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-xs font-bold text-red-200 disabled:opacity-50"
                                                                        >
                                                                            Quitar
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
