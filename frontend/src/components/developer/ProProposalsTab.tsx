import React, { useEffect, useState } from 'react';
import { addDoc, collection, doc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { Check, Euro, ExternalLink, Inbox, Loader2, Megaphone, RefreshCw, Save, Swords, Tags, UtensilsCrossed, X } from 'lucide-react';
import { db } from '../../firebase';
import { mapDuel, type Duel } from '../../types/duel';
import { formatEur } from '../../config/planBeta';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { Button, Card } from '../ui';
import {
    adminRepairPlaceItems,
    DEFAULT_SPOTLIGHT_PRICING,
    describeProposal,
    getOpenItemSpotlights,
    getOpenSponsoredPlacements,
    getPendingItemProposals,
    getSpotlightPricing,
    impulsesPriceEur,
    packDiscountPercent,
    reviewItemProposal,
    reviewItemSpotlight,
    reviewSponsoredPlacement,
    SPOTLIGHT_RADIUS_STEP_KM,
    updateSpotlightPricing,
    type ItemProposal,
    type ItemSpotlight,
    type RepairPlaceItemsCounters,
    type RepairPlaceItemsPlace,
    type RepairPlaceItemsResult,
    type SponsoredPlacement,
    type SpotlightPricing,
} from '../../services/BusinessProService';

const getErrorMessage = (error: unknown, fallback: string) => {
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
        return (error as { message: string }).message;
    }
    return fallback;
};

const PROPOSAL_TYPE_LABELS: Record<ItemProposal['type'], string> = {
    merge: 'Fusión',
    rename: 'Renombre',
    reassign_review: 'Mover reseña',
};

const PLACEMENT_TYPE_LABELS: Record<SponsoredPlacement['type'], string> = {
    home: 'Home',
    search: 'Búsquedas',
};

const REPAIR_COUNTER_LABELS: Array<{ key: keyof RepairPlaceItemsCounters; label: string }> = [
    { key: 'renamedReviews', label: 'valoraciones renombradas' },
    { key: 'stampedReviews', label: 'valoraciones actualizadas' },
    { key: 'mergedItems', label: 'elementos fusionados' },
    { key: 'deactivatedItems', label: 'elementos desactivados' },
    { key: 'fixedMergedItems', label: 'fusiones corregidas' },
    { key: 'spotlightsUpdated', label: 'destacados actualizados' },
];

const repairPlaceHasNews = (row: RepairPlaceItemsPlace) => Boolean(row.error)
    || row.conflicts.length > 0
    || row.duplicates.length > 0
    || REPAIR_COUNTER_LABELS.some(({ key }) => row[key] > 0);

const RepairCounters: React.FC<{ counters: RepairPlaceItemsCounters }> = ({ counters }) => {
    const shown = REPAIR_COUNTER_LABELS.filter(({ key }) => counters[key] > 0);
    if (shown.length === 0) return <span className="text-xs text-gray-500">Sin cambios</span>;
    return (
        <div className="flex flex-wrap gap-1.5">
            {shown.map(({ key, label }) => (
                <span key={key} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-gray-300">
                    <span className="font-black text-white">{counters[key]}</span> {label}
                </span>
            ))}
        </div>
    );
};

/**
 * Reparación de cartas (adminRepairPlaceItems): pasa los datos antiguos al
 * modelo nuevo. «Simular» solo cuenta; «Aplicar» escribe.
 */
const RepairPlaceItemsCard: React.FC = () => {
    const confirm = useConfirm();
    const { showToast } = useToast();
    const [placeId, setPlaceId] = useState('');
    const [running, setRunning] = useState<'dry' | 'apply' | null>(null);
    const [result, setResult] = useState<RepairPlaceItemsResult | null>(null);

    const run = async (dryRun: boolean) => {
        if (running) return;
        const target = placeId.trim();
        if (!dryRun) {
            const accepted = await confirm({
                title: target ? '¿Reparar la carta de este sitio?' : '¿Reparar todas las cartas?',
                message: target
                    ? `Se reescribirán las valoraciones y los elementos de ${target}. Conviene simular antes.`
                    : 'Se repararán los sitios verificados y los que tienen propuestas aprobadas (hasta 300). Conviene simular antes.',
                confirmLabel: 'Aplicar',
                destructive: true,
            });
            if (!accepted) return;
        }
        setRunning(dryRun ? 'dry' : 'apply');
        try {
            const response = await adminRepairPlaceItems({ placeId: target || undefined, dryRun });
            setResult(response);
            showToast({
                variant: 'success',
                message: dryRun ? 'Simulación lista: no se ha cambiado nada.' : 'Cartas reparadas.',
            });
        } catch (error) {
            console.error('ProProposalsTab: repair place items failed', error);
            showToast({ variant: 'error', message: getErrorMessage(error, 'No se pudieron reparar las cartas.') });
        } finally {
            setRunning(null);
        }
    };

    const rowsWithNews = result ? result.places.filter(repairPlaceHasNews) : [];
    const quietPlaces = result ? result.places.length - rowsWithNews.length : 0;

    return (
        <Card className="p-6">
            <h3 className="text-lg font-bold text-white">🧹 Reparar cartas</h3>
            <p className="mt-1 max-w-3xl text-sm text-gray-400">
                Pone al día los datos antiguos: las valoraciones movidas o renombradas pasan a llevar el nombre oficial del
                elemento, se recuperan los nombres de renombres y fusiones aprobados, se cierran duplicados y se actualizan
                los platos destacados. Sin sitio, repasa los verificados y los que tienen propuestas aprobadas.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                    value={placeId}
                    onChange={(event) => setPlaceId(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') void run(true);
                    }}
                    aria-label="placeId del sitio a reparar"
                    placeholder="placeId (opcional, vacío para todos)"
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                />
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => run(true)} disabled={running !== null}>
                        {running === 'dry' && <Loader2 className="h-4 w-4 animate-spin" />}
                        Simular
                    </Button>
                    <Button variant="danger" onClick={() => run(false)} disabled={running !== null}>
                        {running === 'apply' && <Loader2 className="h-4 w-4 animate-spin" />}
                        Aplicar
                    </Button>
                </div>
            </div>

            {result && (
                <div className="mt-4 space-y-3" data-testid="repair-result">
                    <div className="rounded-xl border border-white/10 bg-black/15 p-4">
                        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                            {result.dryRun ? 'Simulación (no se ha cambiado nada)' : 'Aplicado'} · {result.totals.places} {result.totals.places === 1 ? 'sitio' : 'sitios'}
                        </p>
                        <RepairCounters counters={result.totals} />
                        {result.truncated && (
                            <p className="mt-2 text-xs text-amber-300">
                                Se cortó antes de terminar (máximo de sitios o de tiempo). Vuelve a lanzarlo para seguir.
                            </p>
                        )}
                    </div>
                    {rowsWithNews.map((row) => (
                        <div key={row.placeId} className="rounded-xl border border-white/10 bg-black/15 p-4">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-bold text-white">{row.placeName || row.placeId}</span>
                                <a
                                    href={`/place/${row.placeId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-gray-500 hover:text-white"
                                    title="Abrir lugar"
                                >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                            </div>
                            {row.error ? (
                                <p className="text-xs text-red-300">Error: {row.error}</p>
                            ) : (
                                <RepairCounters counters={row} />
                            )}
                            {row.conflicts.length > 0 && (
                                <ul className="mt-2 space-y-0.5 text-xs text-amber-200">
                                    {row.conflicts.map((conflict) => (
                                        <li key={`c-${conflict.name}`}>
                                            Conflicto «{conflict.name}»: {conflict.itemIds.join(', ')} (gana {conflict.itemIds[0]})
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {row.duplicates.length > 0 && (
                                <ul className="mt-2 space-y-0.5 text-xs text-gray-400">
                                    {row.duplicates.map((duplicate) => (
                                        <li key={`d-${duplicate.name}`}>
                                            Duplicado «{duplicate.name}»: {duplicate.itemIds.join(', ')}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                    {quietPlaces > 0 && (
                        <p className="text-xs text-gray-500">
                            {quietPlaces} {quietPlaces === 1 ? 'sitio sin cambios' : 'sitios sin cambios'}.
                        </p>
                    )}
                </div>
            )}
        </Card>
    );
};

export const ProProposalsTab: React.FC = () => {
    const [proposals, setProposals] = useState<ItemProposal[]>([]);
    const [placements, setPlacements] = useState<SponsoredPlacement[]>([]);
    const [spotlights, setSpotlights] = useState<ItemSpotlight[]>([]);
    const [pricing, setPricing] = useState<SpotlightPricing>(DEFAULT_SPOTLIGHT_PRICING);
    const [savingPricing, setSavingPricing] = useState(false);
    const [activeDuel, setActiveDuel] = useState<Duel | null>(null);
    const [duelForm, setDuelForm] = useState({
        title: '',
        aLabel: '', aSublabel: '', aImageUrl: '', aLink: '',
        bLabel: '', bSublabel: '', bImageUrl: '', bLink: '',
    });
    const [savingDuel, setSavingDuel] = useState(false);
    const [loading, setLoading] = useState(false);
    const [workingId, setWorkingId] = useState<string | null>(null);
    const [notes, setNotes] = useState('');
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const load = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const [proposalRows, placementRows, spotlightRows, pricingConfig] = await Promise.all([
                getPendingItemProposals(),
                getOpenSponsoredPlacements(),
                getOpenItemSpotlights().catch(() => [] as ItemSpotlight[]),
                getSpotlightPricing().catch(() => DEFAULT_SPOTLIGHT_PRICING),
            ]);
            setProposals(proposalRows);
            setPlacements(placementRows);
            setSpotlights(spotlightRows);
            setPricing(pricingConfig);
            const duelSnap = await getDocs(query(collection(db, 'duels'), where('status', '==', 'active'), limit(1))).catch(() => null);
            setActiveDuel(duelSnap && !duelSnap.empty
                ? mapDuel(duelSnap.docs[0].id, duelSnap.docs[0].data() as Record<string, unknown>)
                : null);
        } catch (error) {
            console.error('ProProposalsTab: load failed', error);
            setMessage({ type: 'error', text: 'No se pudieron cargar las propuestas.' });
        } finally {
            setLoading(false);
        }
    };

    const savePricing = async () => {
        setSavingPricing(true);
        setMessage(null);
        try {
            const savedPricing = await updateSpotlightPricing(pricing);
            setPricing(savedPricing);
            setMessage({ type: 'success', text: 'Fórmula de precios guardada y validada en el servidor.' });
        } catch (error) {
            console.error('ProProposalsTab: save pricing failed', error);
            setMessage({ type: 'error', text: getErrorMessage(error, 'No se pudo guardar la fórmula de precios.') });
        } finally {
            setSavingPricing(false);
        }
    };

    const createDuel = async () => {
        if (!duelForm.aLabel.trim() || !duelForm.bLabel.trim()) {
            setMessage({ type: 'error', text: 'El duelo necesita los dos contendientes.' });
            return;
        }
        setSavingDuel(true);
        setMessage(null);
        try {
            if (activeDuel) {
                await setDoc(doc(db, 'duels', activeDuel.id), { status: 'ended', endedAt: serverTimestamp() }, { merge: true });
            }
            const ref = await addDoc(collection(db, 'duels'), {
                title: duelForm.title.trim() || 'El Duelo de la semana',
                status: 'active',
                sideA: {
                    label: duelForm.aLabel.trim(),
                    sublabel: duelForm.aSublabel.trim() || null,
                    imageUrl: duelForm.aImageUrl.trim() || null,
                    link: duelForm.aLink.trim() || null,
                },
                sideB: {
                    label: duelForm.bLabel.trim(),
                    sublabel: duelForm.bSublabel.trim() || null,
                    imageUrl: duelForm.bImageUrl.trim() || null,
                    link: duelForm.bLink.trim() || null,
                },
                createdAt: serverTimestamp(),
            });
            setActiveDuel({
                id: ref.id,
                title: duelForm.title.trim() || 'El Duelo de la semana',
                status: 'active',
                sideA: { label: duelForm.aLabel.trim() },
                sideB: { label: duelForm.bLabel.trim() },
            });
            setDuelForm({ title: '', aLabel: '', aSublabel: '', aImageUrl: '', aLink: '', bLabel: '', bSublabel: '', bImageUrl: '', bLink: '' });
            setMessage({ type: 'success', text: 'Duelo activado. Recuerda tener encendido el flag en Otros.' });
        } catch (error) {
            console.error('ProProposalsTab: create duel failed', error);
            setMessage({ type: 'error', text: getErrorMessage(error, 'No se pudo crear el duelo.') });
        } finally {
            setSavingDuel(false);
        }
    };

    const endDuel = async () => {
        if (!activeDuel || !window.confirm(`¿Finalizar el duelo "${activeDuel.sideA.label} vs ${activeDuel.sideB.label}"?`)) return;
        setSavingDuel(true);
        try {
            await setDoc(doc(db, 'duels', activeDuel.id), { status: 'ended', endedAt: serverTimestamp() }, { merge: true });
            setActiveDuel(null);
            setMessage({ type: 'success', text: 'Duelo finalizado.' });
        } catch (error) {
            setMessage({ type: 'error', text: getErrorMessage(error, 'No se pudo finalizar el duelo.') });
        } finally {
            setSavingDuel(false);
        }
    };

    const decideSpotlight = async (spotlight: ItemSpotlight, decision: 'activate' | 'reject' | 'end') => {
        const labels = { activate: 'activar', reject: 'rechazar', end: 'finalizar' };
        if (!window.confirm(`¿Seguro que quieres ${labels[decision]} el plato destacado "${spotlight.itemName}" de ${spotlight.placeName || spotlight.placeId}?`)) return;
        setWorkingId(spotlight.id);
        setMessage(null);
        try {
            await reviewItemSpotlight(spotlight.id, decision, notes.trim() || undefined);
            if (decision === 'activate') {
                setSpotlights((prev) => prev.map((row) => row.id === spotlight.id ? { ...row, status: 'active' } : row));
            } else {
                setSpotlights((prev) => prev.filter((row) => row.id !== spotlight.id));
            }
            setMessage({ type: 'success', text: 'Plato destacado actualizado.' });
        } catch (error) {
            console.error('ProProposalsTab: review spotlight failed', error);
            setMessage({ type: 'error', text: getErrorMessage(error, 'No se pudo actualizar el plato destacado.') });
        } finally {
            setWorkingId(null);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const decideProposal = async (proposal: ItemProposal, decision: 'approve' | 'reject') => {
        const label = decision === 'approve' ? 'aprobar' : 'rechazar';
        if (!window.confirm(`¿Seguro que quieres ${label} esta propuesta?\n\n${describeProposal(proposal)}`)) return;
        setWorkingId(proposal.id);
        setMessage(null);
        try {
            await reviewItemProposal(proposal.id, decision, notes.trim() || undefined);
            setProposals((prev) => prev.filter((row) => row.id !== proposal.id));
            setMessage({ type: 'success', text: decision === 'approve' ? 'Propuesta aprobada y aplicada.' : 'Propuesta rechazada.' });
        } catch (error) {
            console.error('ProProposalsTab: review proposal failed', error);
            setMessage({ type: 'error', text: getErrorMessage(error, 'No se pudo revisar la propuesta.') });
        } finally {
            setWorkingId(null);
        }
    };

    const decidePlacement = async (placement: SponsoredPlacement, decision: 'activate' | 'reject' | 'end') => {
        const labels = { activate: 'activar', reject: 'rechazar', end: 'finalizar' };
        if (!window.confirm(`¿Seguro que quieres ${labels[decision]} esta campaña de ${placement.placeName || placement.placeId}?`)) return;
        setWorkingId(placement.id);
        setMessage(null);
        try {
            await reviewSponsoredPlacement(placement.id, decision, notes.trim() || undefined);
            if (decision === 'activate') {
                setPlacements((prev) => prev.map((row) => row.id === placement.id ? { ...row, status: 'active' } : row));
            } else {
                setPlacements((prev) => prev.filter((row) => row.id !== placement.id));
            }
            setMessage({ type: 'success', text: 'Campaña actualizada.' });
        } catch (error) {
            console.error('ProProposalsTab: review placement failed', error);
            setMessage({ type: 'error', text: getErrorMessage(error, 'No se pudo actualizar la campaña.') });
        } finally {
            setWorkingId(null);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-5">
            <div className="rounded-xl border border-white/10 bg-[var(--lt-card-strong)] p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Inbox className="w-6 h-6 text-indigo-300" />
                            Gestión Pro y patrocinios
                        </h2>
                        <p className="mt-1 max-w-2xl text-sm text-gray-400">
                            Propuestas de carta de los negocios (fusiones de duplicados, renombres, mover reseñas)
                            y solicitudes de campañas patrocinadas. Al aprobar una propuesta de carta se aplica
                            automáticamente y se reconstruyen los items del lugar.
                        </p>
                    </div>
                    <button
                        onClick={load}
                        disabled={loading}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Actualizar
                    </button>
                </div>

                <label className="mt-4 block">
                    <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Notas para el negocio (se envían con la decisión)</span>
                    <input
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                        placeholder="Motivo del rechazo, matices de la aprobación..."
                    />
                </label>

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
                    <Tags className="h-5 w-5 text-amber-300" />
                    Propuestas de carta ({proposals.length})
                </h3>
                {loading ? (
                    <div className="py-8 text-center text-sm text-gray-400">
                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[var(--lt-accent)]" />
                        Cargando...
                    </div>
                ) : proposals.length === 0 ? (
                    <p className="mt-4 rounded-lg border border-dashed border-white/10 bg-black/15 px-4 py-6 text-center text-sm text-gray-500">
                        No hay propuestas pendientes.
                    </p>
                ) : (
                    <div className="mt-4 space-y-3">
                        {proposals.map((proposal) => (
                            <div key={proposal.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/15 p-4 lg:flex-row lg:items-center">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black uppercase text-amber-200">
                                            {PROPOSAL_TYPE_LABELS[proposal.type]}
                                        </span>
                                        <span className="truncate text-sm font-bold text-white">{proposal.placeName || proposal.placeId}</span>
                                        <a
                                            href={`/place/${proposal.placeId}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-gray-500 hover:text-white"
                                            title="Abrir lugar"
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                    </div>
                                    <p className="mt-1.5 text-sm text-gray-300">{describeProposal(proposal)}</p>
                                    {proposal.note && <p className="mt-1 text-xs text-gray-500">Nota del negocio: {proposal.note}</p>}
                                </div>
                                <div className="flex shrink-0 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => decideProposal(proposal, 'approve')}
                                        disabled={workingId === proposal.id}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200 disabled:opacity-50"
                                    >
                                        {workingId === proposal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                        Aprobar y aplicar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => decideProposal(proposal, 'reject')}
                                        disabled={workingId === proposal.id}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-200 disabled:opacity-50"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                        Rechazar
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <RepairPlaceItemsCard />

            <div className="rounded-xl border border-white/10 bg-[var(--lt-card-strong)] p-6">
                <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                    <Megaphone className="h-5 w-5 text-cyan-300" />
                    Campañas patrocinadas ({placements.length})
                </h3>
                {loading ? (
                    <div className="py-8 text-center text-sm text-gray-400">
                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[var(--lt-accent)]" />
                        Cargando...
                    </div>
                ) : placements.length === 0 ? (
                    <p className="mt-4 rounded-lg border border-dashed border-white/10 bg-black/15 px-4 py-6 text-center text-sm text-gray-500">
                        No hay solicitudes ni campañas abiertas.
                    </p>
                ) : (
                    <div className="mt-4 space-y-3">
                        {placements.map((placement) => (
                            <div key={placement.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/15 p-4 lg:flex-row lg:items-center">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${
                                            placement.status === 'active'
                                                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                                                : 'border-amber-500/25 bg-amber-500/10 text-amber-200'
                                        }`}>
                                            {placement.status === 'active' ? 'Activa' : 'Solicitada'}
                                        </span>
                                        <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-black uppercase text-cyan-200">
                                            {PLACEMENT_TYPE_LABELS[placement.type]}
                                        </span>
                                        <span className="truncate text-sm font-bold text-white">{placement.placeName || placement.placeId}</span>
                                    </div>
                                    {placement.headline && <p className="mt-1 text-sm text-gray-300">{placement.headline}</p>}
                                    {(placement.startsAt || placement.endsAt) && (
                                        <p className="mt-1 text-xs text-gray-500">
                                            {placement.startsAt || '—'} → {placement.endsAt || 'sin fin'}
                                        </p>
                                    )}
                                    {placement.status === 'active' && (
                                        <p className="mt-1 text-xs text-cyan-200/80">
                                            {placement.metrics.impressions} impresiones únicas · {placement.metrics.clicks} clics · CTR {placement.metrics.impressions > 0 ? ((placement.metrics.clicks / placement.metrics.impressions) * 100).toFixed(1) : '0,0'}%
                                        </p>
                                    )}
                                </div>
                                <div className="flex shrink-0 gap-2">
                                    {placement.status === 'requested' && (
                                        <button
                                            type="button"
                                            onClick={() => decidePlacement(placement, 'activate')}
                                            disabled={workingId === placement.id}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200 disabled:opacity-50"
                                        >
                                            {workingId === placement.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                            Activar
                                        </button>
                                    )}
                                    {placement.status === 'requested' && (
                                        <button
                                            type="button"
                                            onClick={() => decidePlacement(placement, 'reject')}
                                            disabled={workingId === placement.id}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-200 disabled:opacity-50"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                            Rechazar
                                        </button>
                                    )}
                                    {placement.status === 'active' && (
                                        <button
                                            type="button"
                                            onClick={() => decidePlacement(placement, 'end')}
                                            disabled={workingId === placement.id}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-gray-300 disabled:opacity-50"
                                        >
                                            Finalizar
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-xl border border-white/10 bg-[var(--lt-card-strong)] p-6">
                <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                    <UtensilsCrossed className="h-5 w-5 text-amber-300" />
                    Platos destacados ({spotlights.length})
                </h3>
                <p className="mt-1 text-sm text-gray-400">
                    Campañas por radio: cada unidad comprada es un peso en el sorteo del carrusel de platos cercanos.
                </p>
                {loading ? (
                    <div className="py-8 text-center text-sm text-gray-400">
                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[var(--lt-accent)]" />
                        Cargando...
                    </div>
                ) : spotlights.length === 0 ? (
                    <p className="mt-4 rounded-lg border border-dashed border-white/10 bg-black/15 px-4 py-6 text-center text-sm text-gray-500">
                        No hay solicitudes ni campañas de platos abiertas.
                    </p>
                ) : (
                    <div className="mt-4 space-y-3">
                        {spotlights.map((spotlight) => (
                            <div key={spotlight.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/15 p-4 lg:flex-row lg:items-center">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${
                                            spotlight.status === 'active'
                                                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                                                : 'border-amber-500/25 bg-amber-500/10 text-amber-200'
                                        }`}>
                                            {spotlight.status === 'active' ? 'Activa' : 'Solicitada'}
                                        </span>
                                        <span className="truncate text-sm font-bold text-white">{spotlight.itemName}</span>
                                        <span className="text-xs text-gray-400">· {spotlight.placeName || spotlight.placeId}</span>
                                    </div>
                                    <p className="mt-1 text-xs text-gray-500">
                                        ×{spotlight.units} · radio {spotlight.radiusKm} km
                                        {spotlight.days ? ` · ${spotlight.days} día${spotlight.days === 1 ? '' : 's'}` : spotlight.weeks ? ` · ${spotlight.weeks} semana${spotlight.weeks === 1 ? '' : 's'}` : ''}
                                        {spotlight.impulses ? ` · ${spotlight.impulses.toLocaleString('es-ES')} impulsos` : ''}
                                        {typeof spotlight.totalPriceEur === 'number' ? ` · ${formatEur(spotlight.totalPriceEur)}` : ''}
                                        {spotlight.endsAt ? ` · activa hasta ${spotlight.endsAt}` : ' · el periodo empieza al activarla'}
                                    </p>
                                    {spotlight.status === 'active' && (
                                        <p className="mt-1 text-xs text-amber-200/80">
                                            {spotlight.metrics.impressions} impresiones únicas · {spotlight.metrics.clicks} clics · CTR {spotlight.metrics.impressions > 0 ? ((spotlight.metrics.clicks / spotlight.metrics.impressions) * 100).toFixed(1) : '0,0'}%
                                        </p>
                                    )}
                                </div>
                                <div className="flex shrink-0 gap-2">
                                    {spotlight.status === 'requested' && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => decideSpotlight(spotlight, 'activate')}
                                                disabled={workingId === spotlight.id}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200 disabled:opacity-50"
                                            >
                                                {workingId === spotlight.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                                Activar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => decideSpotlight(spotlight, 'reject')}
                                                disabled={workingId === spotlight.id}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-200 disabled:opacity-50"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                                Rechazar
                                            </button>
                                        </>
                                    )}
                                    {spotlight.status === 'active' && (
                                        <button
                                            type="button"
                                            onClick={() => decideSpotlight(spotlight, 'end')}
                                            disabled={workingId === spotlight.id}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-gray-300 disabled:opacity-50"
                                        >
                                            Finalizar
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-xl border border-white/10 bg-[var(--lt-card-strong)] p-6">
                <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                    <Swords className="h-5 w-5 text-amber-300" />
                    Duelo de la semana
                </h3>
                <p className="mt-1 text-sm text-gray-400">
                    Dos platos rivales, la comunidad vota. El banner se enciende con el flag "Duelo de la semana" en Otros.
                </p>
                {activeDuel ? (
                    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 lg:flex-row lg:items-center">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-white">{activeDuel.title || 'El Duelo de la semana'}</p>
                            <p className="mt-1 text-xs text-gray-400">{activeDuel.sideA.label} 🆚 {activeDuel.sideB.label}</p>
                        </div>
                        <button
                            type="button"
                            onClick={endDuel}
                            disabled={savingDuel}
                            className="shrink-0 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-200 disabled:opacity-50"
                        >
                            Finalizar duelo
                        </button>
                    </div>
                ) : (
                    <p className="mt-4 rounded-lg border border-dashed border-white/10 bg-black/15 px-4 py-3 text-center text-sm text-gray-500">
                        No hay duelo activo.
                    </p>
                )}
                <div className="mt-4 grid gap-3">
                    <input
                        value={duelForm.title}
                        onChange={(event) => setDuelForm({ ...duelForm, title: event.target.value })}
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                        placeholder="Título (opcional): El Duelo de la semana en Madrid"
                    />
                    <div className="grid gap-3 lg:grid-cols-2">
                        {(['a', 'b'] as const).map((side) => (
                            <div key={side} className="space-y-2 rounded-xl border border-white/10 bg-black/15 p-3">
                                <p className="text-xs font-black uppercase tracking-wider text-amber-300">Contendiente {side.toUpperCase()}</p>
                                <input
                                    value={duelForm[`${side}Label`]}
                                    onChange={(event) => setDuelForm({ ...duelForm, [`${side}Label`]: event.target.value })}
                                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                                    placeholder="Plato (ej. Tarta de queso de Casa Paca)"
                                />
                                <input
                                    value={duelForm[`${side}Sublabel`]}
                                    onChange={(event) => setDuelForm({ ...duelForm, [`${side}Sublabel`]: event.target.value })}
                                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                                    placeholder="Subtítulo (ej. nota 8,9 · 24 reseñas)"
                                />
                                <input
                                    value={duelForm[`${side}ImageUrl`]}
                                    onChange={(event) => setDuelForm({ ...duelForm, [`${side}ImageUrl`]: event.target.value })}
                                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                                    placeholder="URL de foto"
                                />
                                <input
                                    value={duelForm[`${side}Link`]}
                                    onChange={(event) => setDuelForm({ ...duelForm, [`${side}Link`]: event.target.value })}
                                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                                    placeholder="Enlace interno (ej. /group/{placeId}/{plato})"
                                />
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={createDuel}
                        disabled={savingDuel}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-black text-white hover:bg-amber-500 disabled:opacity-50"
                    >
                        {savingDuel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
                        {activeDuel ? 'Sustituir duelo activo' : 'Crear y activar duelo'}
                    </button>
                </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[var(--lt-card-strong)] p-6">
                <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                    <Euro className="h-5 w-5 text-emerald-300" />
                    Precio de los impulsos
                </h3>
                <p className="mt-1 text-sm text-gray-400">
                    1 impulso = 0,2 km de radio × 1 día × 1 papeleta. Una campaña gasta tramos × días × intensidad.
                    Ejemplo con el precio actual: 1 km × 7 días × ×1 = 35 impulsos = {formatEur(impulsesPriceEur(pricing, 35))};
                    5 km × 10 días × ×4 = 1.000 impulsos = {formatEur(impulsesPriceEur(pricing, 1000))}.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                    {([
                        ['pricePerImpulseEur', '€ por impulso', 0.001],
                        ['minRadiusKm', 'Radio mínimo (km)', SPOTLIGHT_RADIUS_STEP_KM],
                        ['maxRadiusKm', 'Radio máximo (km)', SPOTLIGHT_RADIUS_STEP_KM],
                        ['maxIntensity', 'Intensidad máx. (×)', 1],
                        ['maxDays', 'Días máx.', 1],
                        ['minPurchaseImpulses', 'Compra mínima (impulsos)', 1],
                    ] as Array<[Exclude<keyof SpotlightPricing, 'packs'>, string, number]>).map(([key, label, step]) => (
                        <label key={key} className="block">
                            <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">{label}</span>
                            <input
                                type="number"
                                min={0}
                                step={step}
                                value={pricing[key]}
                                onChange={(event) => setPricing((prev) => ({ ...prev, [key]: Number(event.target.value) || 0 }))}
                                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                            />
                        </label>
                    ))}
                </div>
                <div className="mt-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Paquetes (salen más baratos que comprar suelto)</p>
                    <div className="mt-2 space-y-2">
                        {pricing.packs.map((pack, index) => (
                            <div key={index} className="flex flex-wrap items-center gap-2">
                                <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    aria-label={`Impulsos del paquete ${index + 1}`}
                                    value={pack.impulses}
                                    onChange={(event) => setPricing((prev) => ({
                                        ...prev,
                                        packs: prev.packs.map((row, i) => i === index ? { ...row, impulses: Math.floor(Number(event.target.value)) || 0 } : row),
                                    }))}
                                    className="w-32 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                                />
                                <span className="text-xs text-gray-400">impulsos por</span>
                                <input
                                    type="number"
                                    min={0.5}
                                    step={0.5}
                                    aria-label={`Precio del paquete ${index + 1}`}
                                    value={pack.priceEur}
                                    onChange={(event) => setPricing((prev) => ({
                                        ...prev,
                                        packs: prev.packs.map((row, i) => i === index ? { ...row, priceEur: Number(event.target.value) || 0 } : row),
                                    }))}
                                    className="w-28 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                                />
                                {packDiscountPercent(pricing, pack) < 0 ? (
                                    <span className="text-xs font-bold text-red-300">€ · más caro que suelto</span>
                                ) : (
                                    <span className="text-xs text-gray-400">€ · {packDiscountPercent(pricing, pack)} % de descuento</span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setPricing((prev) => ({ ...prev, packs: prev.packs.filter((_, i) => i !== index) }))}
                                    className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white"
                                    aria-label={`Quitar paquete ${index + 1}`}
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                        {pricing.packs.length < 8 && (
                            <button
                                type="button"
                                onClick={() => setPricing((prev) => ({ ...prev, packs: [...prev.packs, { impulses: 1000, priceEur: 45 }] }))}
                                className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15"
                            >
                                Añadir paquete
                            </button>
                        )}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={savePricing}
                    disabled={savingPricing}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--lt-accent)] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                >
                    {savingPricing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Guardar precios
                </button>
            </div>
        </div>
    );
};
