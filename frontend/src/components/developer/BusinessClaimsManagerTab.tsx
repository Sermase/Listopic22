import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit as firestoreLimit, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { CheckCircle, ExternalLink, FileText, RefreshCw, XCircle } from 'lucide-react';
import { db, functions } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import type { BusinessClaim, BusinessClaimStatus } from '../../services/BusinessClaimService';

interface BusinessClaimsManagerTabProps {
    highlightClaimId?: string | null;
}

const statusLabel: Record<BusinessClaimStatus, string> = {
    pending: 'Pendiente',
    approved: 'Aprobada',
    rejected: 'Rechazada',
};

const statusClass: Record<BusinessClaimStatus, string> = {
    pending: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
    approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    rejected: 'bg-red-500/15 text-red-300 border-red-500/25',
};

const toMillis = (value: unknown) => {
    if (value && typeof value === 'object' && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
        return ((value as { toMillis: () => number }).toMillis());
    }
    if (value && typeof value === 'object' && typeof (value as { seconds?: unknown }).seconds === 'number') {
        return (value as { seconds: number }).seconds * 1000;
    }
    return 0;
};

const getErrorMessage = (error: unknown) => {
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
        return (error as { message: string }).message;
    }
    return 'No se pudo revisar la solicitud.';
};

export const BusinessClaimsManagerTab: React.FC<BusinessClaimsManagerTabProps> = ({ highlightClaimId }) => {
    const { user } = useAuth();
    const [claims, setClaims] = useState<BusinessClaim[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<BusinessClaimStatus | 'all'>('pending');
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const loadClaims = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(query(collection(db, 'businessClaims'), firestoreLimit(150)));
            const rows = snap.docs
                .map((claimDoc) => ({ id: claimDoc.id, ...(claimDoc.data() as Omit<BusinessClaim, 'id'>) }))
                .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
            setClaims(rows);
            setNotes(Object.fromEntries(rows.map((claim) => [claim.id, claim.adminNotes || ''])));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadClaims();
    }, []);

    useEffect(() => {
        if (!highlightClaimId) return;
        setFilter('all');
        window.setTimeout(() => {
            document.getElementById(`business-claim-${highlightClaimId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 120);
    }, [highlightClaimId]);

    const visibleClaims = useMemo(() => {
        return filter === 'all' ? claims : claims.filter((claim) => claim.status === filter);
    }, [claims, filter]);

    const handleStatus = async (claim: BusinessClaim, status: Exclude<BusinessClaimStatus, 'pending'>) => {
        if (!user) return;
        const adminNotes = (notes[claim.id] || '').trim();
        if (status === 'rejected' && adminNotes.length < 8) {
            setMessage({ type: 'error', text: 'Escribe un motivo de rechazo antes de rechazar la solicitud.' });
            return;
        }
        setUpdatingId(claim.id);
        setMessage(null);
        try {
            const reviewBusinessClaim = httpsCallable(functions, 'reviewBusinessClaim');
            await reviewBusinessClaim({ claimId: claim.id, status, adminNotes });
            setClaims((prev) => prev.map((item) => item.id === claim.id ? {
                ...item,
                status,
                adminNotes,
                reviewedBy: user.uid,
            } : item));
            setMessage({ type: 'success', text: status === 'approved' ? 'Solicitud aprobada y usuario notificado.' : 'Solicitud rechazada y usuario notificado.' });
        } catch (error) {
            console.error('BusinessClaimsManagerTab: review failed', error);
            setMessage({ type: 'error', text: getErrorMessage(error) });
        } finally {
            setUpdatingId(null);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-5">
            <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-white">Reclamaciones de negocio</h2>
                        <p className="mt-1 text-sm text-gray-400">
                            Revisa las pruebas enviadas por usuarios que solicitan gestionar datos oficiales de un lugar.
                        </p>
                    </div>
                    <button
                        onClick={loadClaims}
                        disabled={loading}
                        className="px-4 py-2 rounded-xl bg-white/10 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50 flex items-center gap-2"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Actualizar
                    </button>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                    {(['pending', 'approved', 'rejected', 'all'] as const).map((nextFilter) => (
                        <button
                            key={nextFilter}
                            type="button"
                            onClick={() => setFilter(nextFilter)}
                            className={`px-3 py-1.5 rounded-full border text-xs font-bold ${filter === nextFilter
                                ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-white'
                                : 'border-white/10 bg-black/15 text-gray-400 hover:text-white'
                                }`}
                        >
                            {nextFilter === 'all' ? 'Todas' : statusLabel[nextFilter]}
                        </button>
                    ))}
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

            {loading ? (
                <div className="rounded-xl border border-white/10 bg-[var(--lt-card-strong)] p-8 text-center text-sm text-gray-400">
                    Cargando solicitudes...
                </div>
            ) : visibleClaims.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-[var(--lt-card-strong)] p-8 text-center text-sm text-gray-400">
                    No hay solicitudes en este filtro.
                </div>
            ) : (
                <div className="space-y-4">
                    {visibleClaims.map((claim) => (
                        <div
                            key={claim.id}
                            id={`business-claim-${claim.id}`}
                            className={`rounded-xl border bg-[var(--lt-card-strong)] p-5 ${claim.id === highlightClaimId ? 'border-[var(--lt-accent-border)]' : 'border-white/10'}`}
                        >
                            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-lg font-bold text-white">{claim.placeName}</h3>
                                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusClass[claim.status]}`}>
                                            {statusLabel[claim.status]}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-gray-500 font-mono break-all">{claim.placeId}</p>
                                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-300">
                                        <span>{claim.userName || claim.userEmail || claim.userId}</span>
                                        <span>·</span>
                                        <span>{claim.role}</span>
                                        <span>·</span>
                                        <span>{claim.contactEmail}</span>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <a
                                        href={`/place/${claim.placeId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-3 py-2 rounded-lg bg-white/10 text-xs font-bold text-white hover:bg-white/15 flex items-center gap-2"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        Lugar
                                    </a>
                                </div>
                            </div>

                            <p className="mt-4 whitespace-pre-wrap rounded-xl border border-white/5 bg-black/15 p-4 text-sm text-gray-200">
                                {claim.message}
                            </p>

                            {claim.truthDeclarationAccepted && (
                                <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
                                    <p className="text-xs font-bold uppercase text-amber-200/80">Declaración de veracidad aceptada</p>
                                    <p className="mt-1">{claim.truthDeclarationText || 'El solicitante declara que la información enviada es veraz y que está autorizado a reclamar este negocio.'}</p>
                                </div>
                            )}

                            {claim.proofs?.length > 0 && (
                                <div className="mt-4">
                                    <p className="mb-2 text-xs font-bold uppercase text-gray-500">Pruebas</p>
                                    <div className="flex flex-wrap gap-2">
                                        {claim.proofs.map((proof) => (
                                            <a
                                                key={proof.storagePath}
                                                href={proof.downloadUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-3 py-2 rounded-lg border border-white/10 bg-black/20 text-xs font-semibold text-gray-200 hover:text-white flex items-center gap-2"
                                            >
                                                <FileText className="w-3.5 h-3.5 text-[var(--lt-accent)]" />
                                                {proof.name}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <label className="mt-4 block">
                                <span className="mb-2 block text-xs font-bold uppercase text-gray-500">Notas internas / respuesta</span>
                                <textarea
                                    value={notes[claim.id] || ''}
                                    onChange={(event) => setNotes((prev) => ({ ...prev, [claim.id]: event.target.value }))}
                                    className="min-h-20 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[var(--lt-accent-border)]"
                                    placeholder="Motivo de rechazo, contexto de aprobación..."
                                />
                            </label>

                            {claim.status === 'pending' && (
                                <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:justify-end">
                                    <button
                                        onClick={() => handleStatus(claim, 'rejected')}
                                        disabled={updatingId === claim.id}
                                        className="px-4 py-2 rounded-xl bg-red-500/15 border border-red-500/25 text-sm font-bold text-red-200 hover:bg-red-500/20 flex items-center justify-center gap-2"
                                    >
                                        <XCircle className="w-4 h-4" />
                                        Rechazar
                                    </button>
                                    <button
                                        onClick={() => handleStatus(claim, 'approved')}
                                        disabled={updatingId === claim.id}
                                        className="px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-sm font-bold text-emerald-200 hover:bg-emerald-500/20 flex items-center justify-center gap-2"
                                    >
                                        <CheckCircle className="w-4 h-4" />
                                        Aprobar
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
