import React, { useRef, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { deleteField, doc, getDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { Camera, ClipboardPaste, Loader, Plus, Settings2, Trash2, X } from 'lucide-react';
import { uploadListImage } from '../lib/listCover';
import { canReadClipboardImage, imageFromPaste, readClipboardImage } from '../lib/clipboardImage';
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
    isJefe: boolean;
    /** Qué aspirantes se ven en el ranking y el mapa. */
    show: ContestShow;
    onShowChange: (value: ContestShow) => void;
    onChanged: () => void;
    /** Abre la ventana de aspirantes al cargar (recién creada en modo concurso). */
    autoOpenSettings?: boolean;
}

export type ContestShow = 'all' | 'rated' | 'pending';

/**
 * Cabecera del concurso de una Minilista: estado, fechas y cuántos faltan por probar,
 * con el filtro «Todos · Con nota · Sin probar». Los aspirantes van en el ranking.
 */
export const ContestPanel: React.FC<ContestPanelProps> = ({ list, reviews, canManage, canEditCandidates, isJefe, show, onShowChange, onChanged, autoOpenSettings = false }) => {
    const [settingsOpen, setSettingsOpenState] = useState(() => autoOpenSettings && canEditCandidates);
    const setSettingsOpen = (value: boolean) => {
        setSettingsOpenState(value);
        // Quita ?aspirantes=1 para que no se vuelva a abrir al recargar.
        if (!value && window.location.search.includes('aspirantes=')) window.history.replaceState({}, '', window.location.pathname);
    };
    const candidates = useMemo(() => list.candidates ?? [], [list.candidates]);
    const closed = isClosedContest(list);
    const phase = contestPhase(list.contest);
    const dates = contestDatesLabel(list.contest);

    const tasted = useMemo(() => new Set(reviews.map((r) => candidateMatchKey(r.placeId, r.itemName))), [reviews]);
    const untastedCount = candidates.filter((c) => !tasted.has(candidateMatchKey(c.placeId, c.itemName))).length;

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
    const options: { value: ContestShow; label: string }[] = [
        { value: 'all', label: 'Todos' },
        { value: 'rated', label: 'Con nota' },
        { value: 'pending', label: `Sin probar${untastedCount ? ` (${untastedCount})` : ''}` },
    ];

    return (
        <section id="contest-panel" className="mb-6 rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)] px-4 py-3">
            <div className="flex items-center gap-2">
                <span aria-hidden className="text-lg">🏆</span>
                <div className="min-w-0 flex-1">
                    <p className="font-display font-bold text-sm text-[var(--lt-text)]">
                        {closed ? 'Concurso' : 'Aspirantes'}
                        {phaseLabel && <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${phase === 'open' ? 'bg-[var(--lt-success-soft)] text-[var(--lt-success)]' : 'bg-[var(--lt-glass)] text-[var(--lt-text-muted)]'}`}>{phaseLabel}</span>}
                    </p>
                    <p className="text-xs text-[var(--lt-text-muted)] truncate">
                        {[dates, `${candidates.length} aspirante${candidates.length === 1 ? '' : 's'}`, untastedCount ? `${untastedCount} sin probar` : 'todos probados'].filter(Boolean).join(' · ')}
                    </p>
                </div>
                {canEditCandidates && (
                    <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Ajustes del concurso" className="p-2 rounded-lg text-[var(--lt-text-muted)] hover:text-[var(--lt-text)] hover:bg-[var(--lt-glass)]">
                        <Settings2 className="w-4 h-4" />
                    </button>
                )}
            </div>
            {candidates.length > 0 && (
                <div id="contest-filter" role="radiogroup" aria-label="Qué aspirantes ver" className="mt-3 flex gap-1 rounded-xl bg-[var(--lt-glass)] p-0.5 border border-[var(--lt-border)]">
                    {options.map((o) => (
                        <button
                            key={o.value}
                            type="button"
                            role="radio"
                            aria-checked={show === o.value}
                            onClick={() => onShowChange(o.value)}
                            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-bold transition-colors ${show === o.value ? 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]' : 'text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'}`}
                        >
                            {o.label}
                        </button>
                    ))}
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

type CandidatePlaceFields = Pick<ContestCandidate, 'lat' | 'lng' | 'city' | 'province' | 'region' | 'country'>;

/** Coordenadas y zona de un sitio de Listopic, para guardarlas en el aspirante. */
function candidatePlaceFields(place: Record<string, unknown> | null | undefined): CandidatePlaceFields {
    const loc = (place?.location || place?.coordinates) as { latitude?: unknown; longitude?: unknown } | undefined;
    const out: CandidatePlaceFields = {};
    if (typeof loc?.latitude === 'number' && typeof loc?.longitude === 'number') {
        out.lat = loc.latitude;
        out.lng = loc.longitude;
    }
    (['city', 'province', 'region', 'country'] as const).forEach((k) => {
        const v = place?.[k];
        if (typeof v === 'string' && v) out[k] = v;
    });
    return out;
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
    const [keepAvailable, setKeepAvailable] = useState(list.contest?.keepAvailable === true);
    const [place, setPlace] = useState<PlaceResult | null>(null);
    const [itemName, setItemName] = useState('');
    const [photo, setPhoto] = useState<File | null>(null);
    const photoPreview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
    useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);
    // La foto se sube a list-images/{lista}: las reglas de Storage solo dejan al dueño (o un jefe).
    const canUploadPhoto = canManage || isJefe;
    const photoStep = Boolean(place) && canUploadPhoto;
    // Ctrl+V con una imagen copiada la pone como foto (el texto pegado sigue yendo a su campo).
    useEffect(() => {
        if (!photoStep) return undefined;
        const onPaste = (event: ClipboardEvent) => {
            const image = imageFromPaste(event.clipboardData);
            if (!image) return;
            event.preventDefault();
            setPhoto(image);
        };
        document.addEventListener('paste', onPaste);
        return () => document.removeEventListener('paste', onPaste);
    }, [photoStep]);
    const pastePhoto = async () => {
        try {
            const image = await readClipboardImage();
            if (image) setPhoto(image);
            else showToast({ variant: 'error', message: 'No hay ninguna imagen copiada.' });
        } catch {
            showToast({ variant: 'error', message: 'No se pudo leer el portapapeles. Prueba con Ctrl+V o elige la foto.' });
        }
    };
    const [adding, setAdding] = useState(false);
    const [saving, setSaving] = useState(false);

    // Aspirantes sin sitio en Listopic o sin coordenadas (apuntados antes, o falló el alta):
    // se reparan al abrir, y al guardarlos el servidor los mete en la carta.
    const repairedRef = useRef(false);
    const candidatesRef = useRef(candidates);
    useEffect(() => { candidatesRef.current = candidates; }, [candidates]);
    useEffect(() => {
        if (repairedRef.current || !user) return;
        const broken = candidates.filter((c) => typeof c.lat !== 'number' || (c.lat === 0 && c.lng === 0));
        if (broken.length === 0) return;
        repairedRef.current = true;
        void (async () => {
            const fixes = new Map<string, CandidatePlaceFields>();
            for (const placeId of new Set(broken.map((c) => c.placeId))) {
                let data = (await getDoc(doc(db, 'places', placeId)).catch(() => null))?.data() as Record<string, unknown> | undefined;
                if (!data) {
                    data = await PlaceService.ensurePlaceSyncedWithBackend(placeId, await user.getIdToken())
                        .then((p) => p as unknown as Record<string, unknown>)
                        .catch((e) => { console.error('No se pudo guardar el sitio del aspirante', e); return undefined; });
                }
                const fields = candidatePlaceFields(data);
                if (Object.keys(fields).length > 0) fixes.set(placeId, fields);
            }
            if (fixes.size === 0) return;
            // Sobre los aspirantes de ahora: mientras se reparaba se pudo añadir o quitar alguno.
            const next = candidatesRef.current.map((c) => (fixes.has(c.placeId) ? { ...c, ...fixes.get(c.placeId) } : c));
            await save(next).catch((e) => console.error('No se pudieron reparar los aspirantes', e));
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

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
            const synced = await PlaceService.ensurePlaceSyncedWithBackend(place.id, await user.getIdToken()).catch((syncError) => {
                console.error('No se pudo guardar el sitio del aspirante', syncError);
                showToast({ variant: 'error', message: 'No se pudo guardar el sitio en Listopic; se reintentará al abrir esta ventana.' });
                return null;
            }) as Record<string, unknown> | null;
            const { lat: _lat, lng: _lng, ...zone } = candidatePlaceFields(synced);
            let photoUrl: string | undefined;
            if (photo) {
                try {
                    photoUrl = (await uploadListImage(list.id, photo, 'aspirante')).url;
                } catch (photoError) {
                    console.error('No se pudo subir la foto del aspirante', photoError);
                    showToast({ variant: 'error', message: 'No se pudo subir la foto; el aspirante se añade sin ella.' });
                }
            }
            await save([...candidates, { key, placeId: place.id, placeName: place.name, placeAddress: place.address || '', itemName: name, ...(Number.isFinite(place.lat) && place.lat !== 0 ? { lat: place.lat, lng: place.lng } : _lat !== undefined ? { lat: _lat, lng: _lng } : {}), ...zone, ...(photoUrl ? { photoUrl } : {}) }]);
            setItemName('');
            setPhoto(null);
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
                const endsTs = endsAt ? Timestamp.fromDate(endsAt) : null;
                // Ya cerrado por el servidor y con el mismo final: no se vuelve a cerrar.
                const prev = list.contest;
                const keepCloseOut = prev?.closedOutAt && endsTs && prev.endsAt?.toMillis() === endsTs.toMillis() && !keepAvailable;
                update.contest = closed
                    ? {
                        closed: true,
                        startsAt: startsAt ? Timestamp.fromDate(startsAt) : null,
                        endsAt: endsTs,
                        keepAvailable,
                        ...(keepCloseOut ? { closedOutAt: prev.closedOutAt } : {}),
                    }
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
                                        {c.photoUrl ? <img src={c.photoUrl} alt="" loading="lazy" className="w-10 h-10 rounded-lg object-cover shrink-0" /> : null}
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
                            {photoStep && (
                                <div className="flex gap-2">
                                <label className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--lt-border)] bg-[var(--lt-glass)] text-sm text-[var(--lt-text-muted)] cursor-pointer hover:text-[var(--lt-text)]">
                                    {photoPreview ? <img src={photoPreview} alt="" className="w-8 h-8 rounded object-cover" /> : <Camera className="w-4 h-4" />}
                                    <span className="flex-1 truncate">{photo ? photo.name : 'Foto del plato (opcional)'}</span>
                                    {photo && (
                                        <button type="button" aria-label="Quitar foto" onClick={(e) => { e.preventDefault(); setPhoto(null); }} className="p-1 rounded hover:bg-white/10"><X className="w-3.5 h-3.5" /></button>
                                    )}
                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { setPhoto(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                                </label>
                                {canReadClipboardImage() && (
                                    <button type="button" onClick={pastePhoto} title="Pegar la imagen copiada (o Ctrl+V)" className="shrink-0 flex items-center gap-1 px-3 rounded-lg border border-[var(--lt-border)] bg-[var(--lt-glass)] text-sm text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]">
                                        <ClipboardPaste className="w-4 h-4" /> Pegar
                                    </button>
                                )}
                                </div>
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
                                    <span className="block text-sm font-bold text-[var(--lt-text)]">🏆 Modo concurso</span>
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
                                    <label className="col-span-2 flex items-start gap-2 cursor-pointer mt-1">
                                        <input type="checkbox" checked={keepAvailable} onChange={(e) => setKeepAvailable(e.target.checked)} className="mt-0.5 accent-[var(--lt-accent)]" />
                                        <span className="text-xs text-[var(--lt-text)]">Los platos siguen en la carta al acabar
                                            <span className="block text-[11px] text-[var(--lt-text-muted)]">Si no, al día siguiente del final pasan a «ya no lo sirven» (en este concurso se siguen viendo). Se pueden reactivar.</span>
                                        </span>
                                    </label>
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
