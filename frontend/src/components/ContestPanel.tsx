import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { deleteField, doc, Timestamp, updateDoc } from 'firebase/firestore';
import { ChevronDown, Loader, Plus, Settings2, Trash2, X } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSheetDismiss } from '../hooks/useSheetDismiss';
import { PlaceService, type PlaceResult } from '../services/PlaceService';
import { PlaceSearch } from './PlaceSearch';
import {
    candidateKey, candidateMatchKey, contestDatesLabel, contestPhase, dateToDay, dayToDate,
    isClosedContest, MAX_CANDIDATES, type ContestCandidate, type ContestListLike,
} from '../lib/contest';

interface ReviewLite { placeId?: string; itemName?: string; sublistId?: string | null }

interface ContestPanelProps {
    list: ContestListLike & { id: string; name: string };
    /** Reseñas de esta Minilista (para saber qué aspirantes faltan por probar). */
    reviews: ReviewLite[];
    canManage: boolean;
    canEditCandidates: boolean;
    canRate: boolean;
    isJefe: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onRate: (candidate: ContestCandidate) => void;
    onChanged: () => void;
}

/** Aspirantes y modo concurso de una Minilista: un desplegable que no ocupa nada si no hace falta. */
export const ContestPanel: React.FC<ContestPanelProps> = ({ list, reviews, canManage, canEditCandidates, canRate, isJefe, open, onOpenChange, onRate, onChanged }) => {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const candidates = useMemo(() => list.candidates ?? [], [list.candidates]);
    const closed = isClosedContest(list);
    const phase = contestPhase(list.contest);
    const dates = contestDatesLabel(list.contest);

    const reviewCount = useMemo(() => {
        const counts = new Map<string, number>();
        reviews.forEach((r) => {
            const key = candidateMatchKey(r.placeId, r.itemName);
            counts.set(key, (counts.get(key) ?? 0) + 1);
        });
        return counts;
    }, [reviews]);
    const untasted = candidates.filter((c) => !reviewCount.get(candidateMatchKey(c.placeId, c.itemName)));

    if (!closed && candidates.length === 0) {
        if (!canEditCandidates) return null;
        return (
            <>
                <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    className="w-full mb-6 flex items-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-[var(--lt-border-strong)] text-sm text-[var(--lt-text-muted)] hover:text-[var(--lt-text)] hover:border-[var(--lt-accent-border)] transition-colors"
                >
                    <span aria-hidden>🏆</span>
                    <span className="font-bold">Aspirantes y modo concurso</span>
                    <span className="ml-auto text-xs">Apunta platos antes de probarlos</span>
                </button>
                {settingsOpen && <ContestSettingsModal list={list} canManage={canManage} isJefe={isJefe} onClose={() => setSettingsOpen(false)} onChanged={onChanged} />}
            </>
        );
    }

    const phaseLabel = !closed ? null : phase === 'before' ? 'Aún no empieza' : phase === 'after' ? 'Terminado' : 'Abierto';

    return (
        <section id="contest-panel" className="mb-6 rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)] overflow-hidden">
            <div className="flex items-center gap-2 pr-2">
                <button
                    type="button"
                    onClick={() => onOpenChange(!open)}
                    aria-expanded={open}
                    className="flex-1 min-w-0 flex items-center gap-2 px-4 py-3 text-left"
                >
                    <span aria-hidden className="text-lg">🏆</span>
                    <span className="min-w-0">
                        <span className="block font-display font-bold text-sm text-[var(--lt-text)]">
                            {closed ? 'Concurso' : 'Aspirantes'}
                            {phaseLabel && <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${phase === 'open' ? 'bg-[var(--lt-success-soft)] text-[var(--lt-success)]' : 'bg-[var(--lt-glass)] text-[var(--lt-text-muted)]'}`}>{phaseLabel}</span>}
                        </span>
                        <span className="block text-xs text-[var(--lt-text-muted)]">
                            {[dates, `${candidates.length} aspirante${candidates.length === 1 ? '' : 's'}`, untasted.length ? `${untasted.length} sin probar` : 'todos probados'].filter(Boolean).join(' · ')}
                        </span>
                    </span>
                    <ChevronDown className={`ml-auto w-4 h-4 shrink-0 text-[var(--lt-text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
                {canEditCandidates && (
                    <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Ajustes del concurso" className="p-2 rounded-lg text-[var(--lt-text-muted)] hover:text-[var(--lt-text)] hover:bg-[var(--lt-glass)]">
                        <Settings2 className="w-4 h-4" />
                    </button>
                )}
            </div>

            {open && (
                <div className="border-t border-[var(--lt-border)] px-2 py-2">
                    {untasted.length === 0 ? (
                        <p className="px-2 py-3 text-xs text-[var(--lt-text-muted)]">Todos los aspirantes tienen ya nota: están en el ranking de abajo.</p>
                    ) : (
                        <>
                            <p className="px-2 pt-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--lt-text-muted)]">Sin probar</p>
                            <ul>
                                {untasted.map((c) => (
                                    <li key={c.key}>
                                        <button
                                            type="button"
                                            disabled={!canRate || (closed && phase !== 'open')}
                                            onClick={() => onRate(c)}
                                            className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-left hover:bg-[var(--lt-glass)] disabled:hover:bg-transparent disabled:cursor-default"
                                        >
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-bold text-[var(--lt-text)] opacity-80 truncate">{c.itemName}</span>
                                                <span className="block text-xs text-[var(--lt-text-muted)] truncate">{c.placeName}</span>
                                            </span>
                                            {canRate && (!closed || phase === 'open') && (
                                                <span className="shrink-0 text-xs font-bold text-[var(--lt-accent)]">Valorar</span>
                                            )}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                    {candidates.length > untasted.length && untasted.length > 0 && (
                        <p className="px-2 pt-1 pb-2 text-xs text-[var(--lt-text-muted)]">{candidates.length - untasted.length} ya en el ranking de abajo.</p>
                    )}
                </div>
            )}
            {settingsOpen && <ContestSettingsModal list={list} canManage={canManage} isJefe={isJefe} onClose={() => setSettingsOpen(false)} onChanged={onChanged} />}
        </section>
    );
};

interface SettingsProps {
    list: ContestListLike & { id: string; name: string };
    canManage: boolean;
    isJefe: boolean;
    onClose: () => void;
    onChanged: () => void;
}

/** Una sola ventana: aspirantes (añadir/quitar) y, para el dueño, cerrar y fechas. */
const ContestSettingsModal: React.FC<SettingsProps> = ({ list, canManage, isJefe, onClose, onChanged }) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const panelRef = useSheetDismiss(onClose);
    const [candidates, setCandidates] = useState<ContestCandidate[]>(list.candidates ?? []);
    const [closed, setClosed] = useState(list.contest?.closed === true);
    const [startDay, setStartDay] = useState(dateToDay(list.contest?.startsAt));
    const [endDay, setEndDay] = useState(dateToDay(list.contest?.endsAt));
    const [official, setOfficial] = useState(list.official === true);
    const [place, setPlace] = useState<PlaceResult | null>(null);
    const [itemName, setItemName] = useState('');
    const [adding, setAdding] = useState(false);
    const [saving, setSaving] = useState(false);

    const save = async (next: ContestCandidate[], extra: Record<string, unknown> = {}) => {
        await updateDoc(doc(db, 'lists', list.id), {
            candidates: next,
            candidateKeys: next.map((c) => c.key),
            ...extra,
        });
        setCandidates(next);
        onChanged();
    };

    const addCandidate = async () => {
        const name = itemName.trim();
        if (!place || !name || !user) return;
        const key = candidateKey(place.id, name);
        if (candidates.some((c) => c.key === key)) {
            showToast({ variant: 'error', message: 'Ese aspirante ya está apuntado.' });
            return;
        }
        if (candidates.length >= MAX_CANDIDATES) {
            showToast({ variant: 'error', message: `Como mucho ${MAX_CANDIDATES} aspirantes.` });
            return;
        }
        setAdding(true);
        try {
            // Deja el sitio guardado en Listopic para que «Valorar» lo encuentre relleno.
            await PlaceService.ensurePlaceSyncedWithBackend(place.id, await user.getIdToken()).catch(() => null);
            await save([...candidates, { key, placeId: place.id, placeName: place.name, placeAddress: place.address || '', itemName: name }]);
            setItemName('');
            setPlace(null);
        } catch (e) {
            console.error('No se pudo añadir el aspirante', e);
            showToast({ variant: 'error', message: 'No se pudo añadir el aspirante.' });
        } finally {
            setAdding(false);
        }
    };

    const removeCandidate = async (key: string) => {
        try {
            await save(candidates.filter((c) => c.key !== key));
        } catch (e) {
            console.error('No se pudo quitar el aspirante', e);
            showToast({ variant: 'error', message: 'No se pudo quitar el aspirante.' });
        }
    };

    const saveContest = async () => {
        const startsAt = startDay ? dayToDate(startDay, 'start') : null;
        const endsAt = endDay ? dayToDate(endDay, 'end') : null;
        if (startsAt && endsAt && startsAt > endsAt) {
            showToast({ variant: 'error', message: 'La fecha de fin va antes que la de inicio.' });
            return;
        }
        setSaving(true);
        try {
            const update: Record<string, unknown> = {};
            if (canManage) {
                update.contest = closed
                    ? { closed: true, startsAt: startsAt ? Timestamp.fromDate(startsAt) : null, endsAt: endsAt ? Timestamp.fromDate(endsAt) : null }
                    : deleteField();
            }
            if (isJefe && official !== (list.official === true)) update.official = official;
            if (Object.keys(update).length > 0) await updateDoc(doc(db, 'lists', list.id), update);
            onChanged();
            onClose();
        } catch (e) {
            console.error('No se pudo guardar el concurso', e);
            showToast({ variant: 'error', message: 'No se pudo guardar.' });
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[10000] lt-mobile-overlay bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-6" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div ref={panelRef} className="w-full sm:max-w-lg lt-mobile-modal-panel sm:max-h-[92dvh] bg-[var(--lt-bg)] border border-white/10 sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-white/10 flex items-center justify-between gap-3 bg-[var(--lt-card-strong)]">
                    <div className="min-w-0">
                        <h2 className="text-base font-bold text-[var(--lt-text)]">🏆 Aspirantes y concurso</h2>
                        <p className="text-xs text-[var(--lt-text-muted)] truncate">{list.name}</p>
                    </div>
                    <button type="button" aria-label="Cerrar" onClick={onClose} className="p-2 rounded-lg text-[var(--lt-text-muted)] hover:bg-white/10">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-5">
                    {/* Aspirantes */}
                    <section>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--lt-text-muted)] mb-2">Aspirantes ({candidates.length})</h3>
                        {candidates.length > 0 && (
                            <ul className="mb-3 divide-y divide-[var(--lt-border)] rounded-xl border border-[var(--lt-border)]">
                                {candidates.map((c) => (
                                    <li key={c.key} className="flex items-center gap-2 px-3 py-2">
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-bold text-[var(--lt-text)] truncate">{c.itemName}</span>
                                            <span className="block text-xs text-[var(--lt-text-muted)] truncate">{c.placeName}</span>
                                        </span>
                                        <button type="button" aria-label={`Quitar ${c.itemName}`} onClick={() => removeCandidate(c.key)} className="p-1.5 rounded-lg text-[var(--lt-text-muted)] hover:text-[var(--lt-danger)] hover:bg-[var(--lt-glass)]">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="rounded-xl border border-dashed border-[var(--lt-border-strong)] p-3 space-y-2">
                            {place ? (
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="min-w-0 flex-1 truncate text-[var(--lt-text)]">📍 {place.name}</span>
                                    <button type="button" onClick={() => setPlace(null)} className="text-xs text-[var(--lt-accent)] underline">Cambiar</button>
                                </div>
                            ) : (
                                <PlaceSearch onSelect={setPlace} placeholder="Busca el sitio" />
                            )}
                            {place && (
                                <input
                                    value={itemName}
                                    onChange={(e) => setItemName(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addCandidate(); } }}
                                    placeholder="Nombre del plato (p. ej. Tarta de queso)"
                                    maxLength={120}
                                    className="w-full rounded-lg bg-[var(--lt-glass)] border border-[var(--lt-border)] px-3 py-2 text-sm text-[var(--lt-text)] placeholder:text-[var(--lt-text-muted)] focus:outline-none focus:border-[var(--lt-accent-border)]"
                                />
                            )}
                            <button
                                type="button"
                                onClick={addCandidate}
                                disabled={!place || !itemName.trim() || adding}
                                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] text-sm font-bold text-[var(--lt-accent)] disabled:opacity-50"
                            >
                                {adding ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                Añadir aspirante
                            </button>
                        </div>
                    </section>

                    {/* Modo concurso: solo el dueño */}
                    {canManage && (
                        <section>
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} className="mt-1 accent-[var(--lt-accent)]" />
                                <span>
                                    <span className="block text-sm font-bold text-[var(--lt-text)]">Cerrar la minilista (modo concurso)</span>
                                    <span className="block text-xs text-[var(--lt-text-muted)]">Solo se pueden valorar los aspirantes, y solo entre las fechas.</span>
                                </span>
                            </label>
                            {closed && (
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    <label className="text-xs text-[var(--lt-text-muted)]">Desde
                                        <input type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)} className="mt-1 w-full rounded-lg bg-[var(--lt-glass)] border border-[var(--lt-border)] px-2 py-2 text-sm text-[var(--lt-text)]" />
                                    </label>
                                    <label className="text-xs text-[var(--lt-text-muted)]">Hasta (incluido)
                                        <input type="date" value={endDay} onChange={(e) => setEndDay(e.target.value)} className="mt-1 w-full rounded-lg bg-[var(--lt-glass)] border border-[var(--lt-border)] px-2 py-2 text-sm text-[var(--lt-text)]" />
                                    </label>
                                    <p className="col-span-2 text-[11px] text-[var(--lt-text-muted)]">Sin fechas, se puede valorar siempre. Fuera de ellas no se crean ni se cambian valoraciones.</p>
                                </div>
                            )}
                        </section>
                    )}

                    {isJefe && (
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input type="checkbox" checked={official} onChange={(e) => setOfficial(e.target.checked)} className="mt-1 accent-[var(--lt-accent)]" />
                            <span>
                                <span className="block text-sm font-bold text-[var(--lt-text)]">✔️ Oficial de Listopic</span>
                                <span className="block text-xs text-[var(--lt-text-muted)]">Solo lo ven y lo cambian los jefes.</span>
                            </span>
                        </label>
                    )}
                </div>

                {(canManage || isJefe) && (
                    <div className="p-4 border-t border-white/10">
                        <button
                            type="button"
                            onClick={saveContest}
                            disabled={saving}
                            style={{ backgroundImage: 'var(--lt-accent-grad)' }}
                            className="lt-on-accent w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold disabled:opacity-60"
                        >
                            {saving && <Loader className="w-4 h-4 animate-spin" />}
                            Guardar
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
};
