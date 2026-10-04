import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, AlertCircle, ExternalLink, Copy, Star, List as ListIcon, Image as ImageIcon, Building2, FileText, Search, Shield } from 'lucide-react';
import { adminUserOverview, formatAdminDate, type AdminUserOverview } from '../../services/developerAdmin';
import { ReviewAdminModal } from './ReviewAdminModal';
import { scoreBadgeStyle } from '../../lib/scoreScale';

type PanelTab = 'reviews' | 'lists' | 'photos' | 'business' | 'data';

interface Props {
    uid: string;
    onClose: () => void;
    /** Abre el editor de tipos y medallas con los datos del usuario. */
    onEditRoles?: (user: AdminUserOverview['user']) => void;
}

const asText = (value: unknown): string => (typeof value === 'string' ? value : '');
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Ficha completa de un usuario en Developer (adminUserOverview): todo lo suyo, con detalle. */
export const UserAdminPanel: React.FC<Props> = ({ uid, onClose, onEditRoles }) => {
    const [data, setData] = useState<AdminUserOverview | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<PanelTab>('reviews');
    const [filter, setFilter] = useState('');
    const [openReview, setOpenReview] = useState<string | null>(null);

    const [reloadKey, setReloadKey] = useState(0);
    useEffect(() => {
        let cancelled = false;
        adminUserOverview(uid).then(
            (overview) => { if (!cancelled) { setData(overview); setError(null); } },
            (err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); },
        );
        return () => { cancelled = true; };
    }, [uid, reloadKey]);
    const load = () => setReloadKey((k) => k + 1);

    const reviews = useMemo(() => {
        const needle = fold(filter.trim());
        if (!data || !needle) return data?.reviews ?? [];
        return data.reviews.filter((r) => fold([r.itemName, r.placeName, r.listName, r.sublistName, r.comment, ...(r.tags || [])].join(' ')).includes(needle));
    }, [data, filter]);

    const user = data?.user;
    const name = asText(user?.displayName) || asText(user?.username) || uid;
    const types = Array.isArray(user?.userType) ? (user?.userType as string[]) : (asText(user?.userType) ? [asText(user?.userType)] : []);
    const stats = data?.stats;
    const mismatch = stats && (stats.storedReviewsCount !== stats.reviews);

    const stat = (label: string, value: React.ReactNode, hint?: string) => (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3" title={hint}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
            <p className="mt-0.5 text-lg font-bold text-white">{value ?? '—'}</p>
        </div>
    );

    const tabButton = (id: PanelTab, label: string, icon: React.ReactNode, count?: number) => (
        <button
            type="button"
            onClick={() => setTab(id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${tab === id ? 'bg-[var(--lt-accent)] text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}
        >
            {icon} {label}{typeof count === 'number' ? ` (${count})` : ''}
        </button>
    );

    return (
        <div className="fixed inset-0 z-[1250] flex items-stretch justify-end bg-black/60" role="dialog" aria-modal="true" aria-label="Ficha de usuario">
            <div className="flex h-full w-full max-w-4xl flex-col border-l border-white/10 bg-[#0f1320] shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                        {asText(user?.photoUrl) ? (
                            <img src={asText(user?.photoUrl)} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                        ) : (
                            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--lt-accent)] text-lg font-bold text-white">{name[0]?.toUpperCase()}</div>
                        )}
                        <div className="min-w-0">
                            <h3 className="truncate text-lg font-bold text-white">{name}</h3>
                            <p className="truncate text-xs text-gray-400">
                                @{asText(user?.username) || '—'} · {asText(user?.email) || 'sin email'}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                                {types.map((t) => <span key={t} className="rounded-full bg-white/10 px-2 py-0.5 font-bold text-gray-200">{t}</span>)}
                                <span className="text-gray-500">nivel {String(user?.level ?? '—')} · {String(user?.xp ?? 0)} XP · alta {formatAdminDate(typeof user?.createdAt === 'number' ? user.createdAt : null)}</span>
                                <button type="button" onClick={() => navigator.clipboard?.writeText(uid)} className="inline-flex items-center gap-1 font-mono text-gray-500 hover:text-white" title="Copiar uid"><Copy className="h-3 w-3" />{uid}</button>
                            </div>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <a href={`/profile/${uid}`} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white" title="Ver perfil"><ExternalLink className="h-5 w-5" /></a>
                        {onEditRoles && user && (
                            <button type="button" onClick={() => onEditRoles(user)} className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white" title="Tipos y medallas"><Shield className="h-5 w-5" /></button>
                        )}
                        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white" aria-label="Cerrar"><X className="h-5 w-5" /></button>
                    </div>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                    {error && <p className="flex items-center gap-2 text-sm text-red-400"><AlertCircle className="h-4 w-4" /> {error}</p>}
                    {!data && !error && <p className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Cargando todo lo del usuario…</p>}

                    {data && stats && (
                        <>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {stat('Valoraciones', stats.reviews, `${stats.publicReviews} públicas · ${stats.privateReviews} privadas`)}
                                {stat('Públicas / privadas', `${stats.publicReviews} / ${stats.privateReviews}`)}
                                {stat('Nota media', stats.averageRating ?? '—')}
                                {stat('Con fotos', stats.withPhotos)}
                                {stat('Sitios valorados', stats.places)}
                                {stat('Listas / Minilistas', `${stats.lists} / ${stats.minilists}`)}
                                {stat('Seguidores / siguiendo', `${stats.followers ?? '—'} / ${stats.following ?? '—'}`, `Listas seguidas: ${stats.followingLists ?? '—'}`)}
                                {stat('Fotos de sitios', stats.placePhotos ?? '—')}
                            </div>
                            {mismatch && (
                                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                                    El contador guardado dice {stats.storedReviewsCount} valoraciones y hay {stats.reviews}. Se corrige con Mantenimiento → «Recalcular usuarios».
                                </p>
                            )}

                            <div className="flex gap-2 overflow-x-auto pb-1">
                                {tabButton('reviews', 'Valoraciones', <Star className="h-3.5 w-3.5" />, data.reviews.length)}
                                {tabButton('lists', 'Listas', <ListIcon className="h-3.5 w-3.5" />, data.lists.length)}
                                {tabButton('photos', 'Fotos de sitios', <ImageIcon className="h-3.5 w-3.5" />, data.placePhotos.length)}
                                {tabButton('business', 'Negocios', <Building2 className="h-3.5 w-3.5" />, data.businessPlaces.length)}
                                {tabButton('data', 'Datos', <FileText className="h-3.5 w-3.5" />)}
                            </div>

                            {tab === 'reviews' && (
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#1e253c] px-3 py-2">
                                        <Search className="h-4 w-4 text-gray-500" />
                                        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar por elemento, sitio, Lista, comentario o etiqueta" className="min-w-0 flex-1 bg-transparent text-sm text-gray-200 outline-none" aria-label="Filtrar valoraciones" />
                                    </label>
                                    {reviews.length === 0 && <p className="py-6 text-center text-sm text-gray-500">Sin valoraciones.</p>}
                                    <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
                                        {reviews.map((r) => (
                                            <button key={r.path} type="button" onClick={() => setOpenReview(r.path)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5">
                                                <span className="grid h-8 w-10 shrink-0 place-items-center rounded-lg text-xs font-bold" style={scoreBadgeStyle(r.overallRating)}>{r.overallRating ?? '—'}</span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-semibold text-white">{r.itemName || '—'} <span className="font-normal text-gray-400">· {r.placeName || 'sin sitio'}</span></span>
                                                    <span className="block truncate text-xs text-gray-500">{r.sublistName ? `${r.sublistName} (Minilista de ${r.listName || r.listId})` : (r.listName || r.listId || 'sin Lista')} · {formatAdminDate(r.createdAtMs)}{r.comment ? ` · ${r.comment}` : ''}</span>
                                                </span>
                                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${r.visibility === 'public' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-gray-500/20 text-gray-300'}`}>
                                                    {r.visibility === 'public' ? 'pública' : 'privada'}
                                                </span>
                                                {r.photos.length > 0 && <ImageIcon className="h-4 w-4 shrink-0 text-gray-500" aria-label="con fotos" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {tab === 'lists' && (
                                <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
                                    {data.lists.length === 0 && <p className="py-6 text-center text-sm text-gray-500">Sin Listas.</p>}
                                    {data.lists.map((l) => (
                                        <a key={l.id} href={`/list/${l.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/5">
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-semibold text-white">{l.name}</span>
                                                <span className="block text-xs text-gray-500">{l.parentListId ? 'Minilista' : 'Lista'} {l.visibility === 'public' ? 'pública' : 'privada'} · {l.reviewCount} valoraciones · {l.itemCount} elementos · {l.followersCount} seguidores</span>
                                            </span>
                                            <ExternalLink className="h-4 w-4 shrink-0 text-gray-500" />
                                        </a>
                                    ))}
                                </div>
                            )}

                            {tab === 'photos' && (
                                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                                    {data.placePhotos.length === 0 && <p className="col-span-full py-6 text-center text-sm text-gray-500">Sin fotos de sitios.</p>}
                                    {data.placePhotos.map((p) => {
                                        const url = asText(p.url) || asText(p.photoUrl) || asText(p.downloadUrl);
                                        const placeId = p.path.split('/')[1];
                                        return (
                                            <a key={p.path} href={`/place/${placeId}`} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg bg-white/5" title={p.path}>
                                                {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-xs text-gray-500">sin URL</span>}
                                            </a>
                                        );
                                    })}
                                </div>
                            )}

                            {tab === 'business' && (
                                <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
                                    {data.businessPlaces.length === 0 && <p className="py-6 text-center text-sm text-gray-500">No gestiona ningún negocio.</p>}
                                    {data.businessPlaces.map((p) => (
                                        <a key={p.id} href={`/place/${p.id}`} target="_blank" rel="noreferrer" className="flex items-center justify-between px-3 py-2.5 text-sm text-white hover:bg-white/5">
                                            {p.name} <ExternalLink className="h-4 w-4 text-gray-500" />
                                        </a>
                                    ))}
                                </div>
                            )}

                            {tab === 'data' && (
                                <div className="space-y-2">
                                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">users/{uid}</p>
                                    <pre className="max-h-80 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] text-gray-300">{JSON.stringify(data.user, null, 2)}</pre>
                                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">publicProfiles/{uid}</p>
                                    <pre className="max-h-60 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] text-gray-300">{JSON.stringify(data.publicProfile, null, 2)}</pre>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {openReview && (
                <ReviewAdminModal path={openReview} onClose={() => setOpenReview(null)} onSaved={() => { load(); }} />
            )}
        </div>
    );
};
