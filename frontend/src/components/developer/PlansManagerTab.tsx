import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { Building2, CalendarClock, Crown, ExternalLink, Loader2, RefreshCw, Search, Sparkles, User, X } from 'lucide-react';
import { db } from '../../firebase';
import { adminSetBusinessPlan, adminSetUserPlan } from '../../services/PlanAdminService';
import { formatPlanExpiry, getBusinessPlanFromPlace, PLAN_SOURCE_LABELS, type BusinessPlan } from '../../utils/businessPlan';

interface PlanPlace {
    id: string;
    name?: string;
    address?: string;
    mainImageUrl?: string;
    userPhotoUrl?: string;
    businessVerified?: boolean;
    plan: BusinessPlan;
}

interface PlanUser {
    id: string;
    username?: string;
    displayName?: string;
    email?: string;
    photoUrl?: string;
    premiumActive: boolean;
    premiumSource: string | null;
    premiumExpiresAt: Date | null;
    premiumNotes: string | null;
}

type Duration = 'indefinite' | '1m' | '3m' | 'custom';

const asString = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const toDate = (value: unknown): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
        return (value as { toDate: () => Date }).toDate();
    }
    return null;
};

const getErrorMessage = (error: unknown, fallback: string) => {
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
        return (error as { message: string }).message;
    }
    return fallback;
};

const mapPlace = (id: string, data: Record<string, unknown>): PlanPlace => ({
    id,
    name: asString(data.name),
    address: asString(data.address) || asString(data.formattedAddress),
    mainImageUrl: asString(data.mainImageUrl),
    userPhotoUrl: asString(data.userPhotoUrl),
    businessVerified: data.businessVerified === true,
    plan: getBusinessPlanFromPlace(data),
});

const mapUser = (id: string, data: Record<string, unknown>): PlanUser => {
    const premium = (data.premium && typeof data.premium === 'object' ? data.premium : {}) as Record<string, unknown>;
    const expiresAt = toDate(premium.expiresAt);
    const expired = expiresAt !== null && expiresAt.getTime() <= Date.now();
    return {
        id,
        username: asString(data.username),
        displayName: asString(data.displayName) || asString(data.name),
        email: asString(data.email),
        photoUrl: asString(data.photoUrl),
        premiumActive: premium.active === true && !expired,
        premiumSource: asString(premium.source) || null,
        premiumExpiresAt: expiresAt,
        premiumNotes: asString(premium.notes) || null,
    };
};

const userLabel = (user: PlanUser): string =>
    user.username ? `@${user.username}` : user.displayName || user.email || user.id;

const PlanChip: React.FC<{ plan: BusinessPlan }> = ({ plan }) => {
    if (!plan.isPro) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase text-gray-400">
                Free
            </span>
        );
    }
    const expiry = formatPlanExpiry(plan.expiresAt);
    return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase text-amber-200">
            <Sparkles className="h-3 w-3" />
            Pro
            {plan.source ? ` · ${PLAN_SOURCE_LABELS[plan.source]}` : ''}
            {expiry ? ` · hasta ${expiry}` : ''}
        </span>
    );
};

export const PlansManagerTab: React.FC = () => {
    const [places, setPlaces] = useState<PlanPlace[]>([]);
    const [loading, setLoading] = useState(false);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [placeSearch, setPlaceSearch] = useState('');
    const [duration, setDuration] = useState<Duration>('indefinite');
    const [customDate, setCustomDate] = useState('');
    const [notes, setNotes] = useState('');
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const [userSearch, setUserSearch] = useState('');
    const [searchingUser, setSearchingUser] = useState(false);
    const [selectedUser, setSelectedUser] = useState<PlanUser | null>(null);

    const loadPlaces = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const [verifiedSnap, proSnap] = await Promise.all([
                getDocs(query(collection(db, 'places'), where('businessVerified', '==', true), limit(150))),
                getDocs(query(collection(db, 'places'), where('businessProActive', '==', true), limit(150))),
            ]);
            const byId = new Map<string, PlanPlace>();
            for (const snap of [verifiedSnap, proSnap]) {
                snap.docs.forEach((placeDoc) => {
                    byId.set(placeDoc.id, mapPlace(placeDoc.id, placeDoc.data() as Record<string, unknown>));
                });
            }
            const rows = Array.from(byId.values());
            rows.sort((a, b) => Number(b.plan.isPro) - Number(a.plan.isPro) || (a.name || '').localeCompare(b.name || ''));
            setPlaces(rows);
        } catch (error) {
            console.error('PlansManagerTab: failed loading places', error);
            setMessage({ type: 'error', text: 'No se pudieron cargar los negocios.' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadPlaces();
    }, []);

    const visiblePlaces = useMemo(() => {
        const term = placeSearch.trim().toLowerCase();
        if (!term) return places;
        return places.filter((place) => [place.id, place.name || '', place.address || '']
            .some((value) => value.toLowerCase().includes(term)));
    }, [placeSearch, places]);

    const computeExpiresAt = (): string | undefined => {
        const now = new Date();
        if (duration === '1m') {
            now.setMonth(now.getMonth() + 1);
            return now.toISOString();
        }
        if (duration === '3m') {
            now.setMonth(now.getMonth() + 3);
            return now.toISOString();
        }
        if (duration === 'custom') {
            if (!customDate) throw new Error('Elige la fecha de caducidad.');
            const date = new Date(`${customDate}T23:59:59`);
            if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
                throw new Error('La fecha de caducidad debe ser futura.');
            }
            return date.toISOString();
        }
        return undefined;
    };

    const setBusinessPlan = async (place: PlanPlace, active: boolean) => {
        if (!active && !window.confirm(`¿Quitar Business Pro a ${place.name || place.id}?`)) return;

        setUpdatingId(place.id);
        setMessage(null);
        try {
            const expiresAt = active ? computeExpiresAt() : undefined;
            const result = await adminSetBusinessPlan({
                placeId: place.id,
                active,
                expiresAt,
                notes: notes.trim() || undefined,
            });
            setPlaces((prev) => prev.map((row) => row.id === place.id
                ? {
                    ...row,
                    plan: {
                        isPro: result.active,
                        source: result.source,
                        expiresAt: result.expiresAt ? new Date(result.expiresAt) : null,
                        billingStatus: row.plan.billingStatus,
                    },
                }
                : row));
            setMessage({
                type: 'success',
                text: active
                    ? `Business Pro activado en ${place.name || place.id}.`
                    : `Business Pro desactivado en ${place.name || place.id}.`,
            });
        } catch (error) {
            console.error('PlansManagerTab: setBusinessPlan failed', error);
            setMessage({ type: 'error', text: getErrorMessage(error, 'No se pudo actualizar el plan.') });
        } finally {
            setUpdatingId(null);
        }
    };

    const searchUser = async () => {
        const term = userSearch.trim();
        if (!term) return;

        setSearchingUser(true);
        setSelectedUser(null);
        setMessage(null);

        try {
            const candidates: PlanUser[] = [];

            const directSnap = await getDoc(doc(db, 'users', term)).catch(() => null);
            if (directSnap?.exists()) {
                candidates.push(mapUser(directSnap.id, directSnap.data() as Record<string, unknown>));
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
                    candidates.push(mapUser(userDoc.id, userDoc.data() as Record<string, unknown>));
                });
            }

            if (candidates.length === 0) {
                setMessage({ type: 'error', text: 'No se encontró ningún usuario con ese uid, username o email.' });
                return;
            }

            setSelectedUser(candidates[0]);
        } finally {
            setSearchingUser(false);
        }
    };

    const setUserPlan = async (user: PlanUser, active: boolean) => {
        if (!active && !window.confirm(`¿Quitar premium a ${userLabel(user)}?`)) return;

        setUpdatingId(user.id);
        setMessage(null);
        try {
            const expiresAt = active ? computeExpiresAt() : undefined;
            const result = await adminSetUserPlan({
                userId: user.id,
                active,
                expiresAt,
                notes: notes.trim() || undefined,
            });
            setSelectedUser({
                ...user,
                premiumActive: result.active,
                premiumSource: result.source,
                premiumExpiresAt: result.expiresAt ? new Date(result.expiresAt) : null,
                premiumNotes: notes.trim() || user.premiumNotes,
            });
            setMessage({
                type: 'success',
                text: active
                    ? `Premium activado para ${userLabel(user)}.`
                    : `Premium desactivado para ${userLabel(user)}.`,
            });
        } catch (error) {
            console.error('PlansManagerTab: setUserPlan failed', error);
            setMessage({ type: 'error', text: getErrorMessage(error, 'No se pudo actualizar el plan del usuario.') });
        } finally {
            setUpdatingId(null);
        }
    };

    const isStripeManaged = (plan: BusinessPlan) =>
        plan.source === 'stripe' && ['active', 'trialing', 'past_due'].includes(plan.billingStatus || '');

    return (
        <div className="max-w-6xl mx-auto space-y-5">
            <div className="rounded-xl border border-white/10 bg-[var(--lt-card-strong)] p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Sparkles className="w-6 h-6 text-amber-300" />
                            Planes
                        </h2>
                        <p className="mt-1 max-w-2xl text-sm text-gray-400">
                            Concede o retira Business Pro por local y premium personal por usuario. Las concesiones
                            manuales conviven con Stripe: si el negocio paga, el plan pasa a ser de Stripe.
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

                <div className="mt-6 grid gap-3 lg:grid-cols-3">
                    <label className="block">
                        <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Duración de la concesión</span>
                        <select
                            value={duration}
                            onChange={(event) => setDuration(event.target.value as Duration)}
                            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                        >
                            <option value="indefinite">Indefinida</option>
                            <option value="1m">1 mes (prueba)</option>
                            <option value="3m">3 meses (prueba)</option>
                            <option value="custom">Hasta fecha concreta</option>
                        </select>
                    </label>
                    {duration === 'custom' && (
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Caduca el</span>
                            <input
                                type="date"
                                value={customDate}
                                onChange={(event) => setCustomDate(event.target.value)}
                                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                            />
                        </label>
                    )}
                    <label className={`block ${duration === 'custom' ? '' : 'lg:col-span-2'}`}>
                        <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Notas (motivo)</span>
                        <input
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                            placeholder="Prueba interna, cortesía, prensa..."
                        />
                    </label>
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

            <div className="rounded-xl border border-white/10 bg-[var(--lt-card-strong)] p-6">
                <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                    <User className="h-5 w-5 text-indigo-300" />
                    Premium de usuario
                </h3>
                <div className="mt-4 flex gap-2">
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
                    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/10 bg-black/15 p-4 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-white">{userLabel(selectedUser)}</span>
                                {selectedUser.premiumActive ? (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2.5 py-1 text-[10px] font-bold uppercase text-indigo-200">
                                        <Crown className="h-3 w-3" />
                                        Premium
                                        {selectedUser.premiumSource ? ` · ${selectedUser.premiumSource}` : ''}
                                        {selectedUser.premiumExpiresAt ? ` · hasta ${formatPlanExpiry(selectedUser.premiumExpiresAt)}` : ''}
                                    </span>
                                ) : (
                                    <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase text-gray-400">
                                        Free
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 truncate text-xs text-gray-500">
                                {[selectedUser.email, selectedUser.id].filter(Boolean).join(' / ')}
                            </p>
                            {selectedUser.premiumNotes && (
                                <p className="mt-1 text-xs text-gray-400">Notas: {selectedUser.premiumNotes}</p>
                            )}
                        </div>
                        <div className="flex shrink-0 gap-2">
                            {selectedUser.premiumActive ? (
                                <button
                                    type="button"
                                    onClick={() => setUserPlan(selectedUser, false)}
                                    disabled={updatingId === selectedUser.id}
                                    className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-200 disabled:opacity-50"
                                >
                                    Quitar premium
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setUserPlan(selectedUser, true)}
                                    disabled={updatingId === selectedUser.id}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-3 py-2 text-xs font-bold text-indigo-200 disabled:opacity-50"
                                >
                                    <Crown className="h-3.5 w-3.5" />
                                    Activar premium
                                </button>
                            )}
                            <button type="button" onClick={() => setSelectedUser(null)} className="text-gray-500 hover:text-white">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="rounded-xl border border-white/10 bg-[var(--lt-card-strong)] p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                        <Building2 className="h-5 w-5 text-emerald-300" />
                        Business Pro por local
                    </h3>
                    <div className="relative sm:w-80">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                        <input
                            value={placeSearch}
                            onChange={(event) => setPlaceSearch(event.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                            placeholder="Nombre, placeId, dirección..."
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="py-10 text-center text-sm text-gray-400">
                        <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-[var(--lt-accent)]" />
                        Cargando negocios...
                    </div>
                ) : visiblePlaces.length === 0 ? (
                    <p className="mt-4 rounded-lg border border-dashed border-white/10 bg-black/15 px-4 py-6 text-center text-sm text-gray-500">
                        No hay negocios verificados que coincidan.
                    </p>
                ) : (
                    <div className="mt-4 space-y-3">
                        {visiblePlaces.map((place) => {
                            const stripeManaged = isStripeManaged(place.plan);
                            return (
                                <div key={place.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/15 p-4 lg:flex-row lg:items-center">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="truncate font-bold text-white">{place.name || 'Negocio'}</span>
                                            <PlanChip plan={place.plan} />
                                            {stripeManaged && (
                                                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold uppercase text-cyan-200">
                                                    <CalendarClock className="h-3 w-3" />
                                                    {place.plan.billingStatus}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-1 break-all font-mono text-xs text-gray-500">{place.id}</p>
                                        {place.address && <p className="mt-0.5 truncate text-xs text-gray-400">{place.address}</p>}
                                    </div>
                                    <div className="flex shrink-0 flex-wrap gap-2">
                                        <a
                                            href={`/place/${place.id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15"
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" />
                                            Lugar
                                        </a>
                                        {place.plan.isPro ? (
                                            <button
                                                type="button"
                                                onClick={() => setBusinessPlan(place, false)}
                                                disabled={updatingId === place.id || stripeManaged}
                                                title={stripeManaged ? 'Suscripción de Stripe activa: cancélala desde Stripe.' : undefined}
                                                className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-200 disabled:opacity-50"
                                            >
                                                Quitar Pro
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setBusinessPlan(place, true)}
                                                disabled={updatingId === place.id}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200 disabled:opacity-50"
                                            >
                                                <Sparkles className="h-3.5 w-3.5" />
                                                Activar Pro
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
