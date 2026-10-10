/**
 * ClaimHistory: «🧾 Historial de decisiones» de una solicitud de negocio.
 * Lee `adminAuditLog where details.claimId == id` (índice simple, se ordena en
 * cliente) y lo une con lo que guarda la propia solicitud: la nota de la
 * decisión actual y `previousReviews` de los reenvíos. Se monta solo al
 * desplegar la fila. La caché cuelga de ['developer', …], así que se refresca
 * sola al invalidar tras una decisión.
 */
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import { useAdminName } from '../../../hooks/useAdminNames';
import { formatDateTime } from '../../../utils/adminTime';
import { ResolvedMeta } from '../queue';
import { auditEntryFromDoc, buildClaimHistory, type ClaimHistoryEntry, type ClaimView } from './claimUtils';

const HISTORY_LIMIT = 25;
const HISTORY_STALE_MS = 60 * 1000;

const fetchClaimAudit = async (claimId: string) => {
    const snap = await getDocs(query(
        collection(db, 'adminAuditLog'),
        where('details.claimId', '==', claimId),
        limit(HISTORY_LIMIT),
    ));
    return snap.docs.map((entry) => auditEntryFromDoc(entry.id, entry.data() as Record<string, unknown>));
};

const ActorName: React.FC<{ uid: string | null }> = ({ uid }) => {
    const name = useAdminName(uid);
    return name ? <span className="font-semibold text-gray-200">{name}</span> : null;
};

const HistoryLine: React.FC<{ entry: ClaimHistoryEntry }> = ({ entry }) => {
    if (entry.kind === 'submitted') {
        return (
            <p className="text-xs text-gray-400">
                <span className="font-semibold text-gray-200">
                    {entry.action === 'resubmitted' ? '🔁 Reenviada' : '📨 Enviada'}
                </span>
                {' · '}
                <time className="tabular-nums">{formatDateTime(entry.atMs)}</time>
            </p>
        );
    }
    if (entry.kind === 'other') {
        return (
            <p className="text-xs text-gray-400">
                <span className="font-semibold text-gray-200">🛠️ {entry.action || 'Acción'}</span>
                {entry.by && <> por <ActorName uid={entry.by} /></>}
                {entry.atMs > 0 && <> · <time className="tabular-nums">{formatDateTime(entry.atMs)}</time></>}
            </p>
        );
    }
    const extras = entry.previousOwnerId || entry.proofs.length > 0;
    return (
        <ResolvedMeta status={entry.status || 'resolved'} by={entry.by} at={entry.atMs || null} notes={entry.notes}>
            {extras ? (
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                    {entry.previousOwnerId && (
                        <span>🔁 Propiedad transferida de <ActorName uid={entry.previousOwnerId} /></span>
                    )}
                    {entry.proofs.map((proof) => (
                        <a
                            key={proof.storagePath || proof.downloadUrl}
                            href={proof.downloadUrl || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--lt-accent)] underline-offset-2 hover:underline"
                        >
                            📎 {proof.name}
                        </a>
                    ))}
                </span>
            ) : null}
        </ResolvedMeta>
    );
};

export const ClaimHistory: React.FC<{ claim: ClaimView }> = ({ claim }) => {
    const { data, isLoading, isError } = useQuery({
        queryKey: ['developer', 'claimHistory', claim.id],
        queryFn: () => fetchClaimAudit(claim.id),
        staleTime: HISTORY_STALE_MS,
        retry: 0,
    });
    const entries = useMemo(() => buildClaimHistory(claim, data ?? []), [claim, data]);

    return (
        <section aria-label="Historial de decisiones">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">🧾 Historial de decisiones</h4>
            {isLoading && <p className="text-xs text-gray-500">⏳ Cargando historial…</p>}
            {isError && (
                <p className="mb-2 text-xs text-amber-300">
                    ⚠️ No se pudo leer el registro de auditoría. Se muestra lo que guarda la solicitud.
                </p>
            )}
            {!isLoading && entries.length === 0 ? (
                <p className="text-xs text-gray-500">Sin decisiones registradas.</p>
            ) : (
                <ol className="space-y-1.5 border-l border-white/10 pl-3">
                    {entries.map((entry) => (
                        <li key={entry.key}>
                            <HistoryLine entry={entry} />
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
};
