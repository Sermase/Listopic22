import React, { useEffect, useState } from 'react';
import { Check, ExternalLink, Inbox, Loader2, Megaphone, RefreshCw, Tags, X } from 'lucide-react';
import {
    describeProposal,
    getOpenSponsoredPlacements,
    getPendingItemProposals,
    reviewItemProposal,
    reviewSponsoredPlacement,
    type ItemProposal,
    type SponsoredPlacement,
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

export const ProProposalsTab: React.FC = () => {
    const [proposals, setProposals] = useState<ItemProposal[]>([]);
    const [placements, setPlacements] = useState<SponsoredPlacement[]>([]);
    const [loading, setLoading] = useState(false);
    const [workingId, setWorkingId] = useState<string | null>(null);
    const [notes, setNotes] = useState('');
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const load = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const [proposalRows, placementRows] = await Promise.all([
                getPendingItemProposals(),
                getOpenSponsoredPlacements(),
            ]);
            setProposals(proposalRows);
            setPlacements(placementRows);
        } catch (error) {
            console.error('ProProposalsTab: load failed', error);
            setMessage({ type: 'error', text: 'No se pudieron cargar las propuestas.' });
        } finally {
            setLoading(false);
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
                            Propuestas Pro
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
        </div>
    );
};
