import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { Building2, ExternalLink, Loader2, MapPin, Settings } from 'lucide-react';
import { db } from '../firebase';
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

const toNumber = (value: unknown): number | undefined => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};

export const BusinessDashboardPage: React.FC = () => {
    const { user } = useAuth();
    const [places, setPlaces] = useState<ManagedBusinessPlace[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!user?.uid) return;

        let cancelled = false;
        const loadBusinesses = async () => {
            setLoading(true);
            setError('');
            try {
                const snap = await getDocs(query(
                    collection(db, 'places'),
                    where('businessManagerIds', 'array-contains', user.uid),
                    limit(50),
                ));
                if (cancelled) return;

                const rows = snap.docs.map((docSnap) => {
                    const data = docSnap.data() as Record<string, unknown>;
                    return {
                        id: docSnap.id,
                        name: typeof data.name === 'string' ? data.name : undefined,
                        address: typeof data.address === 'string' ? data.address : undefined,
                        mainImageUrl: typeof data.mainImageUrl === 'string' ? data.mainImageUrl : undefined,
                        userPhotoUrl: typeof data.userPhotoUrl === 'string' ? data.userPhotoUrl : undefined,
                        reviewsCount: toNumber(data.reviewsCount),
                        averageRating: toNumber(data.averageRating),
                        businessVerified: data.businessVerified === true,
                        businessOwnerUserId: typeof data.businessOwnerUserId === 'string' ? data.businessOwnerUserId : undefined,
                    } satisfies ManagedBusinessPlace;
                });

                setPlaces(rows);
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

                                        <div className="mt-5 flex gap-2">
                                            <Link
                                                to={`/place/${place.id}`}
                                                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-[var(--lt-text)] hover:border-[var(--lt-accent-border)] transition-colors"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                                Ver lugar
                                            </Link>
                                            <button
                                                type="button"
                                                disabled
                                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-[var(--lt-text-muted)] opacity-60"
                                                title="Próximamente"
                                            >
                                                <Settings className="w-4 h-4" />
                                                Gestionar
                                            </button>
                                        </div>
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
