import React, { useRef, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { deleteField, doc, getDoc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { Camera, ClipboardPaste, Loader, Pencil, Plus, Settings2, Trash2, X } from 'lucide-react';
import { uploadListImage } from '../lib/listCover';
import { canReadClipboardImage, imageFromPaste, readClipboardImage } from '../lib/clipboardImage';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSheetDismiss } from '../hooks/useSheetDismiss';
import { PlaceService, type PlaceResult } from '../services/PlaceService';
import { PlaceSearch } from './PlaceSearch';
import {
    candidateKey, candidateMatchKey, cleanDiet, CONTEST_DIETS, contestDatesLabel, contestPhase, dateToDay, dayToDate,
    dietBadges, featureScopeLabel, featureScopeOptions, isClosedContest, MAX_CANDIDATE_DESCRIPTION, MAX_CANDIDATES,
    type ContestCandidate, type ContestDiet, type ContestFeatureRequest, type ContestListLike,
} from '../lib/contest';

/** Detalles del aspirante (sin valoraciones): dieta declarada y una descripción corta. */
const CandidateDetailsFields: React.FC<{
    diet: ContestDiet[];
    description: string;
    onDiet: (next: ContestDiet[]) => void;
    onDescription: (next: string) => void;
}> = ({ diet, description, onDiet, onDescription }) => (
    <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Detalles del plato">
            {CONTEST_DIETS.map((d) => {
                const on = diet.includes(d.id);
                return (
                    <button
                        key={d.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onDiet(cleanDiet(on ? diet.filter((x) => x !== d.id) : [...diet, d.id]))}
                        className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${on
                            ? 'bg-[var(--lt-accent-soft)] border-[var(--lt-accent-border)] text-[var(--lt-accent)]'
                            : 'bg-[var(--lt-glass)] border-[var(--lt-border)] text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'}`}
                    >
                        {d.emoji} {d.label}
                    </button>
                );
            })}
        </div>
        <textarea
            value={description}
            onChange={(e) => onDescription(e.target.value.slice(0, MAX_CANDIDATE_DESCRIPTION))}
            placeholder="Descripción (opcional): ingredientes, cómo es…"
            rows={2}
            className="w-full resize-none rounded-lg bg-[var(--lt-glass)] border border-[var(--lt-border)] px-3 py-2 text-sm text-[var(--lt-text)] placeholder:text-[var(--lt-text-muted)] focus:outline-none focus:border-[var(--lt-accent-border)]"
        />
    </div>
);

/** Campos de detalle listos para guardar en el aspirante (sin claves vacías: Firestore no admite undefined). */
const detailsPatch = (diet: ContestDiet[], description: string): Pick<ContestCandidate, 'diet' | 'description'> => {
    const text = description.trim().slice(0, MAX_CANDIDATE_DESCRIPTION);
    return { ...(diet.length > 0 ? { diet } : {}), ...(text ? { description: text } : {}) };
};

/** Pedir que el concurso salga destacado en Inicio en una zona; lo acepta un jefe en Developer. */
const FeatureRequestSection: React.FC<{ listId: string; candidates: ContestCandidate[]; current: ContestFeatureRequest | null | undefined; onChanged: () => void }> = ({ listId, candidates, current, onChanged }) => {
    const { showToast } = useToast();
    const options = useMemo(() => featureScopeOptions(candidates), [candidates]);
    const [request, setRequest] = useState(current ?? null);
    const [choice, setChoice] = useState(() => (current ? `${current.level}:${current.value}` : options[0] ? `${options[0].level}:${options[0].value}` : ''));
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!choice && options[0]) setChoice(`${options[0].level}:${options[0].value}`);
    }, [choice, options]);

    const send = async (withdraw: boolean) => {
        const picked = options.find((o) => `${o.level}:${o.value}` === choice);
        if (!withdraw && !picked) return;
        setBusy(true);
        try {
            const next = withdraw ? null : { level: picked!.level, value: picked!.value, status: 'pending' as const };
            await updateDoc(doc(db, 'lists', listId), { featureRequest: next ? { ...next, requestedAt: serverTimestamp() } : deleteField() });
            setRequest(next);
            onChanged();
            showToast({ variant: 'success', message: withdraw ? 'Petición retirada.' : 'Petición enviada. Te avisamos al revisarla.' });
        } catch (e) {
            console.error('No se pudo pedir el destacado', e);
            showToast({ variant: 'error', message: 'No se pudo enviar la petición.' });
        } finally {
            setBusy(false);
        }
    };

    const status = request?.status;
    return (
        <section className="rounded-xl border border-[var(--lt-border)] p-3 space-y-2">
            <div>
                <span className="block text-sm font-bold text-[var(--lt-text)]">📣 Destacar en Inicio</span>
                <span className="block text-xs text-[var(--lt-text-muted)]">Mientras esté abierto, sale arriba en Inicio para quien esté en la zona. Lo revisa el equipo de Listopic.</span>
            </div>
            {status && (
                <p className={`text-xs font-bold ${status === 'approved' ? 'text-[var(--lt-success)]' : status === 'rejected' ? 'text-[var(--lt-danger)]' : 'text-[var(--lt-warning)]'}`}>
                    {status === 'approved' ? '✅ Destacado' : status === 'rejected' ? '✖ No aceptado' : '⏳ Pendiente de revisión'} · {featureScopeLabel(request!)}
                </p>
            )}
            {options.length === 0 ? (
                <p className="text-xs text-[var(--lt-text-muted)]">Apunta algún aspirante para poder elegir la zona.</p>
            ) : (
                <div className="flex gap-2">
                    <select
                        value={choice}
                        onChange={(e) => setChoice(e.target.value)}
                        aria-label="Zona donde destacar"
                        className="min-w-0 flex-1 rounded-lg bg-[var(--lt-glass)] border border-[var(--lt-border)] px-2 py-2 text-sm text-[var(--lt-text)]"
                    >
                        {options.map((o) => <option key={`${o.level}:${o.value}`} value={`${o.level}:${o.value}`}>{o.label}</option>)}
                    </select>
                    <button type="button" onClick={() => send(false)} disabled={busy || (status === 'pending' && choice === `${request!.level}:${request!.value}`) || (status === 'approved' && choice === `${request!.level}:${request!.value}`)}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] text-sm font-bold text-[var(--lt-accent)] disabled:opacity-50">
                        {busy && <Loader className="w-4 h-4 animate-spin" />}
                        {status ? 'Volver a pedir' : 'Pedir'}
                    </button>
                </div>
            )}
            {status && (
                <button type="button" onClick={() => send(true)} disabled={busy} className="text-xs text-[var(--lt-text-muted)] underline">
                    {status === 'approved' ? 'Dejar de destacar' : 'Retirar la petición'}
                </button>
            )}
        </section>
    );
};

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
    const [diet, setDiet] = useState<ContestDiet[]>([]);
    const [description, setDescription] = useState('');
    // Aspirante ya apuntado que se está editando (detalles y foto).
    const [editing, setEditing] = useState<{ key: string; diet: ContestDiet[]; description: string; photo: File | null } | null>(null);
    const [savingEdit, setSavingEdit] = useState(false);
    const editPreview = useMemo(() => (editing?.photo ? URL.createObjectURL(editing.photo) : null), [editing?.photo]);
    useEffect(() => () => { if (editPreview) URL.revokeObjectURL(editPreview); }, [editPreview]);
    const photoPreview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
    useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);
    // La foto se sube a list-images/{lista}: las reglas de Storage solo dejan al dueño (o un jefe).
    const canUploadPhoto = canManage || isJefe;
    const photoStep = Boolean(place) && canUploadPhoto;
    // Ctrl+V con una imagen copiada la pone como foto (el texto pegado sigue yendo a su campo).
    // Editando un aspirante, la imagen pegada va a él.
    const editingPhoto = Boolean(editing) && canUploadPhoto;
    useEffect(() => {
        if (!photoStep && !editingPhoto) return undefined;
        const onPaste = (event: ClipboardEvent) => {
            const image = imageFromPaste(event.clipboardData);
            if (!image) return;
            event.preventDefault();
            if (editingPhoto) setEditing((prev) => (prev ? { ...prev, photo: image } : prev));
            else setPhoto(image);
        };
        document.addEventListener('paste', onPaste);
        return () => document.removeEventListener('paste', onPaste);
    }, [photoStep, editingPhoto]);
    const pastePhoto = async (target: 'new' | 'edit' = 'new') => {
        try {
            const image = await readClipboardImage();
            if (image && target === 'edit') setEditing((prev) => (prev ? { ...prev, photo: image } : prev));
            else if (image) setPhoto(image);
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
            await save([...candidates, { key, placeId: place.id, placeName: place.name, placeAddress: place.address || '', itemName: name, ...(Number.isFinite(place.lat) && place.lat !== 0 ? { lat: place.lat, lng: place.lng } : _lat !== undefined ? { lat: _lat, lng: _lng } : {}), ...zone, ...(photoUrl ? { photoUrl } : {}), ...detailsPatch(diet, description) }]);
            setItemName('');
            setPhoto(null);
            setDiet([]);
            setDescription('');
            setPlace(null);
        } catch (e) {
            console.error('No se pudo añadir el aspirante', e);
            showToast({ variant: 'error', message: 'No se pudo añadir el aspirante.' });
        } finally {
            setAdding(false);
        }
    };

    const saveEdit = async () => {
        if (!editing) return;
        setSavingEdit(true);
        try {
            let photoUrl: string | undefined;
            if (editing.photo) {
                try {
                    photoUrl = (await uploadListImage(list.id, editing.photo, 'aspirante')).url;
                } catch (photoError) {
                    console.error('No se pudo subir la foto del aspirante', photoError);
                    showToast({ variant: 'error', message: 'No se pudo subir la foto; se guarda lo demás.' });
                }
            }
            const next = candidatesRef.current.map((c) => {
                if (c.key !== editing.key) return c;
                const rest = { ...c };
                delete rest.diet;
                delete rest.description;
                return { ...rest, ...(photoUrl ? { photoUrl } : {}), ...detailsPatch(editing.diet, editing.description) };
            });
            await save(next);
            setEditing(null);
        } catch (e) {
            console.error('No se pudo guardar el aspirante', e);
            showToast({ variant: 'error', message: 'No se pudo guardar el aspirante.' });
        } finally {
            setSavingEdit(false);
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
                                    <li key={c.key} className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                        {(editing?.key === c.key && editPreview) || c.photoUrl ? <img src={(editing?.key === c.key && editPreview) || c.photoUrl} alt="" loading="lazy" className="w-10 h-10 rounded-lg object-cover shrink-0" /> : null}
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-bold text-[var(--lt-text)] truncate">{c.itemName}</span>
                                            <span className="block text-xs text-[var(--lt-text-muted)] truncate">{[c.placeName, ...dietBadges(c.diet)].join(' · ')}</span>
                                        </span>
                                        <button type="button" aria-label={`Editar ${c.itemName}`} aria-expanded={editing?.key === c.key}
                                            onClick={() => setEditing(editing?.key === c.key ? null : { key: c.key, diet: cleanDiet(c.diet), description: c.description ?? '', photo: null })}
                                            className="p-1.5 rounded-lg text-[var(--lt-text-muted)] hover:text-[var(--lt-accent)] hover:bg-[var(--lt-glass)]">
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button type="button" aria-label={`Quitar ${c.itemName}`} onClick={() => removeCandidate(c.key)} className="p-1.5 rounded-lg text-[var(--lt-text-muted)] hover:text-[var(--lt-danger)] hover:bg-[var(--lt-glass)]">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        </div>
                                        {editing?.key === c.key && (
                                            <div className="mt-2 space-y-2">
                                                <CandidateDetailsFields
                                                    diet={editing.diet}
                                                    description={editing.description}
                                                    onDiet={(next) => setEditing({ ...editing, diet: next })}
                                                    onDescription={(next) => setEditing({ ...editing, description: next })}
                                                />
                                                <div className="flex gap-2">
                                                    {canUploadPhoto && (
                                                        <label className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--lt-border)] bg-[var(--lt-glass)] text-sm text-[var(--lt-text-muted)] cursor-pointer hover:text-[var(--lt-text)]">
                                                            <Camera className="w-4 h-4 shrink-0" />
                                                            <span className="flex-1 truncate">{editing.photo ? editing.photo.name : c.photoUrl ? 'Cambiar foto' : 'Añadir foto'}</span>
                                                            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0] ?? null; setEditing({ ...editing, photo: f }); e.target.value = ''; }} />
                                                        </label>
                                                    )}
                                                    {canUploadPhoto && canReadClipboardImage() && (
                                                        <button type="button" onClick={() => pastePhoto('edit')} title="Pegar la imagen copiada (o Ctrl+V)" className="shrink-0 flex items-center gap-1 px-3 rounded-lg border border-[var(--lt-border)] bg-[var(--lt-glass)] text-sm text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]">
                                                            <ClipboardPaste className="w-4 h-4" /> Pegar
                                                        </button>
                                                    )}
                                                    <button type="button" onClick={saveEdit} disabled={savingEdit}
                                                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] text-sm font-bold text-[var(--lt-accent)] disabled:opacity-50">
                                                        {savingEdit && <Loader className="w-4 h-4 animate-spin" />}
                                                        Guardar
                                                    </button>
                                                </div>
                                            </div>
                                        )}
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
                            {place && (
                                <CandidateDetailsFields diet={diet} description={description} onDiet={setDiet} onDescription={setDescription} />
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
                                    <button type="button" onClick={() => pastePhoto('new')} title="Pegar la imagen copiada (o Ctrl+V)" className="shrink-0 flex items-center gap-1 px-3 rounded-lg border border-[var(--lt-border)] bg-[var(--lt-glass)] text-sm text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]">
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

                    {canManage && isClosedContest(list) && (
                        <FeatureRequestSection listId={list.id} candidates={candidates} current={list.featureRequest} onChanged={onChanged} />
                    )}

                    {isJefe && (
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input type="checkbox" checked={official} onChange={(e) => setOfficial(e.target.checked)} className="mt-1 accent-[var(--lt-accent)]" />
                            <span>
                                <span className="block text-sm font-bold text-[var(--lt-text)]">✔️ Oficial de Listopic</span>
                                <span className="block text-xs text-[var(--lt-text-muted)]">Solo es un sello en la Minilista: todos lo ven. Lo ponen y lo quitan los jefes.</span>
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
