import React, { useEffect, useMemo, useState } from 'react';
import { X, Save, Search, Loader2, ExternalLink, User, Tag, Star, Image as ImageIcon, AlertCircle, Copy, ChevronDown, Bot, ShieldCheck } from 'lucide-react';
import { computeReviewScore, computingCriteria, normalizeCriteria } from '../../lib/scoring';
import {
    adminGetReview, adminSearchUsers, adminUpdateReview, formatAdminDate, userLabel,
    type AdminReviewChanges, type AdminReviewDetail, type AdminReviewRow, type AdminUserRow,
} from '../../services/developerAdmin';

interface Props {
    path: string;
    onClose: () => void;
    onSaved?: (review: AdminReviewRow) => void;
}

const numberOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const asTypes = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : (typeof value === 'string' && value ? [value] : []));
const initialTags = (review: Record<string, unknown>): string[] => [...new Set([
    ...(Array.isArray(review.userTags) ? review.userTags : []),
    ...(Array.isArray(review.tags) ? review.tags : []),
].filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map((t) => t.trim()))];

/**
 * Valoración en Developer: todo el detalle y edición por el servidor (adminUpdateReview).
 * La nota global no se escribe a mano si la Lista tiene criterios: se recalcula como al valorar.
 */
export const ReviewAdminModal: React.FC<Props> = ({ path, onClose, onSaved }) => {
    const [detail, setDetail] = useState<AdminReviewDetail | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [itemName, setItemName] = useState('');
    const [comment, setComment] = useState('');
    const [tags, setTags] = useState<string[]>([]);
    const [tagDraft, setTagDraft] = useState('');
    const [scores, setScores] = useState<Record<string, string>>({});
    const [manualOverall, setManualOverall] = useState('');
    const [newAuthor, setNewAuthor] = useState<AdminUserRow | null>(null);
    const [authorQuery, setAuthorQuery] = useState('');
    const [authorResults, setAuthorResults] = useState<AdminUserRow[]>([]);
    const [searchingAuthor, setSearchingAuthor] = useState(false);
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveResult, setSaveResult] = useState<string | null>(null);
    const [showRaw, setShowRaw] = useState(false);

    const load = async () => {
        setLoadError(null);
        try {
            const data = await adminGetReview(path);
            const r = data.review;
            setDetail(data);
            setItemName(typeof r.itemName === 'string' ? r.itemName : '');
            setComment(typeof r.comment === 'string' ? r.comment : '');
            setTags(initialTags(r));
            const stored = (r.scores && typeof r.scores === 'object' ? r.scores : {}) as Record<string, unknown>;
            setScores(Object.fromEntries(Object.entries(stored).map(([k, v]) => [k, numberOrNull(v) === null ? '' : String(v)])));
            setManualOverall(numberOrNull(r.overallRating) === null ? '' : String(r.overallRating));
            setNewAuthor(null);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : String(error));
        }
    };

    useEffect(() => { load(); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

    const criteria = useMemo(() => normalizeCriteria(detail?.scoring.criteria ?? []), [detail]);
    const labels = useMemo(() => Object.fromEntries((detail?.scoring.criteria ?? []).map((c) => [c.id, c.label || c.id])), [detail]);
    const scoringOptions = useMemo(() => ({ weights: detail?.scoring.weights ?? null }), [detail]);
    const hasComputing = useMemo(() => computingCriteria(criteria, scoringOptions).length > 0, [criteria, scoringOptions]);
    const parsedScores = useMemo(() => Object.fromEntries(Object.entries(scores)
        .filter(([, v]) => v.trim() !== '')
        .map(([k, v]) => [k, Number(v.replace(',', '.'))])), [scores]);
    const preview = useMemo(() => computeReviewScore(parsedScores, criteria, scoringOptions), [parsedScores, criteria, scoringOptions]);

    const review = detail?.review;
    const storedOverall = numberOrNull(review?.overallRating);

    const changes = useMemo((): AdminReviewChanges => {
        if (!review) return {};
        const out: AdminReviewChanges = {};
        if (itemName.trim() !== String(review.itemName ?? '').trim()) out.itemName = itemName;
        if (comment.trim() !== String(review.comment ?? '').trim()) out.comment = comment;
        if (JSON.stringify(tags) !== JSON.stringify(initialTags(review))) out.tags = tags;
        const stored = (review.scores && typeof review.scores === 'object' ? review.scores : {}) as Record<string, unknown>;
        const storedClean = Object.fromEntries(Object.entries(stored).filter(([, v]) => numberOrNull(v) !== null));
        if (JSON.stringify(Object.entries(parsedScores).sort()) !== JSON.stringify(Object.entries(storedClean).sort())) out.scores = parsedScores;
        if (!hasComputing && manualOverall.trim() !== '' && Number(manualOverall.replace(',', '.')) !== storedOverall) out.overallRating = Number(manualOverall.replace(',', '.'));
        if (newAuthor && newAuthor.uid !== detail?.author?.uid && newAuthor.uid !== review.userId) out.authorUid = newAuthor.uid;
        return out;
    }, [review, itemName, comment, tags, parsedScores, hasComputing, manualOverall, storedOverall, newAuthor, detail]);

    const changeCount = Object.keys(changes).length;

    const searchAuthor = async () => {
        setSearchingAuthor(true);
        try {
            setAuthorResults((await adminSearchUsers(authorQuery.trim(), 10)).users);
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : String(error));
        } finally {
            setSearchingAuthor(false);
        }
    };

    const addTag = () => {
        const t = tagDraft.trim();
        if (t && !tags.includes(t)) setTags([...tags, t]);
        setTagDraft('');
    };

    const save = async () => {
        if (changeCount === 0) return;
        const summary = Object.keys(changes).map((k) => ({ itemName: 'nombre', comment: 'comentario', tags: 'etiquetas', scores: 'puntuaciones', overallRating: 'nota global', authorUid: 'AUTOR' }[k] || k)).join(', ');
        if (!confirm(`¿Guardar cambios (${summary}) en esta valoración?${changes.authorUid ? '\n\nCambiar el autor recalcula los contadores, la experiencia y las medallas de los dos usuarios.' : ''}`)) return;
        setSaving(true);
        setSaveError(null);
        setSaveResult(null);
        try {
            const result = await adminUpdateReview(path, changes, reason);
            const recount = result.recounted.length
                ? ` · Recontados: ${result.recounted.map((r) => `${r.uid} (${r.reviewsCount} valoraciones)`).join(', ')}`
                : '';
            setSaveResult(result.changed.length ? `Guardado: ${result.changed.join(', ')}${recount}` : 'No había nada que cambiar.');
            onSaved?.(result.review);
            await load();
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : String(error));
        } finally {
            setSaving(false);
        }
    };

    const input = 'w-full bg-[#1e253c] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[var(--lt-accent-border)]';
    const section = 'rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3';
    const h = 'flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400';

    return (
        <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Valoración">
            <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#121624] shadow-2xl sm:rounded-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
                    <div className="min-w-0">
                        <h3 className="truncate text-lg font-bold text-white">{itemName || 'Valoración'}</h3>
                        <p className="truncate text-xs text-gray-400">
                            {detail?.place?.name || String(review?.placeName ?? '')}{detail?.place?.city ? ` · ${detail.place.city}` : ''}
                        </p>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white" aria-label="Cerrar"><X className="h-5 w-5" /></button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                    {loadError && <p className="flex items-center gap-2 text-sm text-red-400"><AlertCircle className="h-4 w-4" /> {loadError}</p>}
                    {!detail && !loadError && <p className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>}

                    {detail && review && (
                        <>
                            {/* Contexto */}
                            <div className="flex flex-wrap gap-2 text-xs">
                                <span className={`rounded-full px-2 py-0.5 font-bold ${review.visibility === 'public' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-gray-500/20 text-gray-300'}`}>
                                    {review.visibility === 'public' ? 'Pública' : 'Privada'}
                                </span>
                                {detail.list && (
                                    <a href={`/list/${detail.list.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-gray-300 hover:text-white">
                                        Lista: {detail.list.name} <ExternalLink className="h-3 w-3" />
                                    </a>
                                )}
                                {detail.sublist && (
                                    <a href={`/list/${detail.sublist.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-gray-300 hover:text-white">
                                        Minilista: {detail.sublist.name} <ExternalLink className="h-3 w-3" />
                                    </a>
                                )}
                                {detail.place && (
                                    <a href={`/place/${detail.place.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-gray-300 hover:text-white">
                                        Sitio <ExternalLink className="h-3 w-3" />
                                    </a>
                                )}
                                <span className="rounded-full bg-white/5 px-2 py-0.5 text-gray-400">Creada {formatAdminDate(numberOrNull(review.createdAt))}</span>
                                <span className="rounded-full bg-white/5 px-2 py-0.5 text-gray-400">Editada {formatAdminDate(numberOrNull(review.updatedAt))}</span>
                                <button type="button" onClick={() => navigator.clipboard?.writeText(path)} className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 font-mono text-gray-500 hover:text-white" title="Copiar ruta">
                                    <Copy className="h-3 w-3" /> {path}
                                </button>
                            </div>

                            {/* Autor */}
                            <div className={section}>
                                <p className={h}><User className="h-4 w-4" /> Autor</p>
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                    <span className={newAuthor ? 'text-gray-500 line-through' : 'text-white font-semibold'}>
                                        {detail.author?.name || String(review.authorName ?? '') || '—'}
                                    </span>
                                    <span className="font-mono text-xs text-gray-500">{String(review.userId ?? '')}</span>
                                    {asTypes(detail.author?.userType).includes('bot') && <span className="inline-flex items-center gap-1 rounded bg-cyan-500/15 px-1.5 text-xs text-cyan-300"><Bot className="h-3 w-3" /> bot</span>}
                                    {asTypes(detail.author?.userType).includes('critico') && <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 text-xs text-amber-300"><ShieldCheck className="h-3 w-3" /> crítico</span>}
                                    {newAuthor && <span className="font-semibold text-[var(--lt-accent)]">→ {userLabel(newAuthor)}</span>}
                                    {newAuthor && <button type="button" onClick={() => setNewAuthor(null)} className="text-xs text-gray-400 underline">deshacer</button>}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        value={authorQuery}
                                        onChange={(e) => setAuthorQuery(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') searchAuthor(); }}
                                        placeholder="Cambiar autor: nombre de usuario, email o uid"
                                        className={input}
                                        aria-label="Buscar nuevo autor"
                                    />
                                    <button type="button" onClick={searchAuthor} disabled={searchingAuthor} className="shrink-0 rounded-lg bg-white/10 px-3 text-sm text-gray-200 hover:bg-white/15 disabled:opacity-50" aria-label="Buscar autor">
                                        {searchingAuthor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                    </button>
                                </div>
                                {authorResults.length > 0 && (
                                    <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10">
                                        {authorResults.map((u) => (
                                            <button
                                                key={u.uid}
                                                type="button"
                                                onClick={() => { setNewAuthor(u); setAuthorResults([]); }}
                                                className="flex w-full items-center justify-between gap-2 border-b border-white/5 px-3 py-2 text-left text-sm text-gray-200 last:border-b-0 hover:bg-white/5"
                                            >
                                                <span className="truncate">{userLabel(u)} <span className="text-xs text-gray-500">{u.email || ''}</span></span>
                                                <span className="shrink-0 text-xs text-gray-500">{u.userType.join(', ')} · {u.reviewsCount} val.</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Elemento y comentario */}
                            <div className={section}>
                                <label className="block space-y-1">
                                    <span className={h}>Elemento</span>
                                    <input value={itemName} onChange={(e) => setItemName(e.target.value)} className={input} aria-label="Elemento" />
                                </label>
                                <label className="block space-y-1">
                                    <span className={h}>Comentario</span>
                                    <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} className={`${input} resize-y`} aria-label="Comentario" />
                                </label>
                            </div>

                            {/* Puntuaciones */}
                            <div className={section}>
                                <div className="flex items-center justify-between">
                                    <p className={h}><Star className="h-4 w-4" /> Puntuaciones</p>
                                    <span className="text-sm text-gray-300">
                                        Nota global: <span className="font-bold text-white">{storedOverall ?? '—'}</span>
                                        {hasComputing && preview.score !== null && preview.score !== storedOverall && <span className="font-bold text-[var(--lt-accent)]"> → {preview.score}</span>}
                                    </span>
                                </div>
                                {criteria.length === 0 && <p className="text-xs text-gray-500">Esta Lista no tiene criterios.</p>}
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {criteria.map((c) => {
                                        const weight = detail.scoring.weights?.[c.id];
                                        return (
                                            <label key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2">
                                                <span className="min-w-0 truncate text-sm text-gray-200">
                                                    {labels[c.id] || c.id}
                                                    {typeof weight === 'number' && <span className="ml-1 text-xs text-gray-500">×{weight}</span>}
                                                </span>
                                                <input
                                                    type="number" min={0} max={10} step={0.5}
                                                    value={scores[c.id] ?? ''}
                                                    onChange={(e) => setScores({ ...scores, [c.id]: e.target.value })}
                                                    className="w-20 rounded-md border border-white/10 bg-[#1e253c] px-2 py-1 text-right text-sm text-white"
                                                    aria-label={`Puntuación ${labels[c.id] || c.id}`}
                                                />
                                            </label>
                                        );
                                    })}
                                </div>
                                {hasComputing ? (
                                    <p className="text-xs text-gray-500">La nota global se calcula con los criterios y sus pesos, como al valorar.{!preview.complete && preview.missing.length > 0 ? ` Falta: ${preview.missing.join(', ')}.` : ''}</p>
                                ) : (
                                    <label className="flex items-center gap-2 text-sm text-gray-300">
                                        Nota global
                                        <input type="number" min={0} max={10} step={0.1} value={manualOverall} onChange={(e) => setManualOverall(e.target.value)} className="w-24 rounded-md border border-white/10 bg-[#1e253c] px-2 py-1 text-right text-sm text-white" aria-label="Nota global" />
                                    </label>
                                )}
                            </div>

                            {/* Etiquetas */}
                            <div className={section}>
                                <p className={h}><Tag className="h-4 w-4" /> Etiquetas</p>
                                <div className="flex flex-wrap gap-2">
                                    {tags.map((t) => (
                                        <button key={t} type="button" onClick={() => setTags(tags.filter((x) => x !== t))} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-gray-200 hover:border-red-400/50 hover:text-red-300" title="Quitar">
                                            {t} <X className="h-3 w-3" />
                                        </button>
                                    ))}
                                    {tags.length === 0 && <span className="text-xs text-gray-500">Sin etiquetas</span>}
                                </div>
                                <div className="flex gap-2">
                                    <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTag(); }} placeholder="Añadir etiqueta" className={input} aria-label="Nueva etiqueta" />
                                    <button type="button" onClick={addTag} className="shrink-0 rounded-lg bg-white/10 px-3 text-sm text-gray-200 hover:bg-white/15">Añadir</button>
                                </div>
                            </div>

                            {/* Fotos */}
                            {(() => {
                                const urls = [review.photoUrls, review.photos, review.images].find((v) => Array.isArray(v) && v.length) as string[] | undefined
                                    ?? (typeof review.photoUrl === 'string' && review.photoUrl ? [review.photoUrl] : []);
                                return urls.length > 0 ? (
                                    <div className={section}>
                                        <p className={h}><ImageIcon className="h-4 w-4" /> Fotos ({urls.length})</p>
                                        <div className="flex flex-wrap gap-2">
                                            {urls.map((u) => (
                                                <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="h-20 w-20 rounded-lg object-cover" /></a>
                                            ))}
                                        </div>
                                    </div>
                                ) : null;
                            })()}

                            {/* Documento completo */}
                            <div className={section}>
                                <button type="button" onClick={() => setShowRaw((v) => !v)} className={`${h} w-full justify-between`}>
                                    Documento completo <ChevronDown className={`h-4 w-4 transition-transform ${showRaw ? 'rotate-180' : ''}`} />
                                </button>
                                {showRaw && <pre className="max-h-64 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] text-gray-300">{JSON.stringify(review, null, 2)}</pre>}
                            </div>
                        </>
                    )}
                </div>

                <div className="space-y-2 border-t border-white/10 px-5 py-4">
                    {saveError && <p className="flex items-center gap-2 text-sm text-red-400"><AlertCircle className="h-4 w-4 shrink-0" /> {saveError}</p>}
                    {saveResult && <p className="text-sm text-emerald-300">{saveResult}</p>}
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo del cambio (queda en el registro de auditoría)" className={input} aria-label="Motivo" />
                        <button
                            type="button"
                            onClick={save}
                            disabled={saving || changeCount === 0 || !detail}
                            className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--lt-accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Guardar {changeCount > 0 ? `(${changeCount})` : ''}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
