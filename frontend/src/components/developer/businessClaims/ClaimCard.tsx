/**
 * ClaimCard: una solicitud de negocio en la pestaña «Solicitudes negocio».
 *
 * Cabecera siempre visible: lugar, estado, antigüedad, solicitante (rol) y avisos
 * («⚠️ Ya verificado · propietario Ana», «👥 2 solicitudes para este lugar»,
 * «🔁 Reenvío nº 1»). Las resueltas añaden ResolvedMeta (quién, cuándo, nota).
 * Al desplegar: fechas, contacto (email, teléfono, web, dirección), mensaje,
 * declaración de veracidad, pruebas, historial de decisiones y, solo si está
 * pendiente, la nota de esa fila con Rechazar / Aprobar. El aviso de éxito o
 * error de la decisión se pinta dentro de la propia fila.
 */
import React from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useAdminName } from '../../../hooks/useAdminNames';
import type { InboxBadge, InboxBadgeTone } from '../../../services/adminQueues';
import { formatAge, formatDateTime } from '../../../utils/adminTime';
import { Button } from '../../ui';
import { AgeChip, ResolvedMeta, StatusChip } from '../queue';
import { ClaimHistory } from './ClaimHistory';
import {
    MIN_REJECT_NOTE_LENGTH,
    claimantLabel,
    formatBytes,
    phoneHref,
    safeWebsiteUrl,
    type ClaimDecision,
    type ClaimView,
} from './claimUtils';

export interface ClaimRowMessage {
    type: 'success' | 'error';
    text: string;
}

export interface ClaimCardProps {
    claim: ClaimView;
    badges: InboxBadge[];
    expanded: boolean;
    focused: boolean;
    onToggle: (id: string) => void;
    note: string;
    onNoteChange: (id: string, value: string) => void;
    /** Decisión en curso en esta fila. */
    busy: ClaimDecision | null;
    /** Hay otra decisión en curso (en otra fila). */
    locked: boolean;
    message?: ClaimRowMessage | null;
    onDecide: (claimId: string, decision: ClaimDecision) => void;
    /** uid del propietario al que se le quitaría la propiedad al aprobar. */
    replacedOwnerId: string | null;
}

const BADGE_TONE_CLASS: Record<InboxBadgeTone, string> = {
    danger: 'border-red-500/30 bg-red-500/10 text-red-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    info: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
    neutral: 'border-white/10 bg-white/5 text-gray-300',
};

export const ClaimBadge: React.FC<{ badge: InboxBadge }> = ({ badge }) => {
    const name = useAdminName(badge.userId ?? null);
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                BADGE_TONE_CLASS[badge.tone],
            )}
        >
            <span aria-hidden="true">{badge.emoji}</span>
            {badge.text}
            {name ? ` ${name}` : ''}
        </span>
    );
};

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
    <div className={cn('min-w-0', className)}>
        <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</dt>
        <dd className="mt-0.5 break-words text-sm text-gray-200">{children}</dd>
    </div>
);

const Missing: React.FC<{ text?: string }> = ({ text = 'No indicado' }) => <span className="text-gray-500">{text}</span>;

const linkClass = 'text-[var(--lt-accent)] underline-offset-2 hover:underline';

const proofEmoji = (type: string): string => {
    if (type.startsWith('image/')) return '🖼️';
    if (type === 'application/pdf') return '📄';
    return '📎';
};

const ClaimDetails: React.FC<{ claim: ClaimView }> = ({ claim }) => {
    const website = safeWebsiteUrl(claim.website);
    const phone = phoneHref(claim.contactPhone);
    const declarationAt = formatDateTime(claim.truthDeclarationAcceptedAt);
    return (
        <div className="space-y-4">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Field label="📅 Enviada">
                    {claim.createdAtMs ? (
                        <>
                            <span className="tabular-nums">{formatDateTime(claim.createdAtMs)}</span>
                            <span className="text-gray-500"> · {formatAge(claim.createdAtMs)}</span>
                        </>
                    ) : <Missing text="Sin fecha" />}
                </Field>
                <Field label="🔄 Última actualización">
                    {claim.updatedAtMs ? <span className="tabular-nums">{formatDateTime(claim.updatedAtMs)}</span> : <Missing text="Sin fecha" />}
                </Field>
                <Field label="👤 Solicitante">
                    <span className="font-semibold">{claimantLabel(claim)}</span>
                    {claim.userEmail && claim.userEmail !== claim.userName && <span className="text-gray-400"> · {claim.userEmail}</span>}
                    {claim.userId && (
                        <>
                            {' · '}
                            <a href={`/profile/${encodeURIComponent(claim.userId)}`} target="_blank" rel="noopener noreferrer" className={linkClass}>
                                ver perfil
                            </a>
                        </>
                    )}
                </Field>
                <Field label="🎭 Rol">{claim.role || <Missing />}</Field>
                <Field label="✉️ Email de contacto">
                    {claim.contactEmail
                        ? <a href={`mailto:${claim.contactEmail}`} className={linkClass}>{claim.contactEmail}</a>
                        : <Missing />}
                </Field>
                <Field label="📞 Teléfono">
                    {claim.contactPhone
                        ? phone ? <a href={phone} className={linkClass}>{claim.contactPhone}</a> : claim.contactPhone
                        : <Missing />}
                </Field>
                <Field label="🌐 Web">
                    {claim.website
                        ? website ? <a href={website} target="_blank" rel="noopener noreferrer" className={linkClass}>{claim.website}</a> : claim.website
                        : <Missing text="No indicada" />}
                </Field>
                <Field label="📍 Dirección">{claim.placeAddress || <Missing text="No indicada" />}</Field>
                <Field label="🆔 Ids" className="sm:col-span-2">
                    <span className="font-mono text-xs text-gray-400">lugar {claim.placeId || '?'} · solicitud {claim.id}</span>
                </Field>
            </dl>

            <section>
                <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">💬 Mensaje</h4>
                <p className="whitespace-pre-wrap rounded-xl border border-white/10 bg-black/15 p-3 text-sm text-gray-200">
                    {claim.message.trim() || 'Sin mensaje.'}
                </p>
            </section>

            {claim.truthDeclarationAccepted ? (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm">
                    <p className="text-xs font-bold text-amber-300">
                        ✍️ Declaración de veracidad aceptada{declarationAt ? ` · ${declarationAt}` : ''}
                    </p>
                    <p className="mt-1 text-gray-300">
                        {claim.truthDeclarationText || 'El solicitante declara que la información enviada es veraz y que está autorizado a reclamar este negocio.'}
                    </p>
                </div>
            ) : (
                <p className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-xs font-semibold text-red-300">
                    ⚠️ Sin declaración de veracidad
                </p>
            )}

            <section>
                <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">📎 Pruebas ({claim.proofs.length})</h4>
                {claim.proofs.length === 0 ? (
                    <p className="text-xs text-gray-500">Sin pruebas adjuntas.</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {claim.proofs.map((proof) => (
                            <a
                                key={proof.storagePath || proof.downloadUrl}
                                href={proof.downloadUrl || undefined}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex max-w-full items-center gap-2 rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-xs font-semibold text-gray-200 hover:border-[var(--lt-accent-border)]"
                            >
                                <span aria-hidden="true">{proofEmoji(proof.type)}</span>
                                <span className="truncate">{proof.name}</span>
                                {proof.size > 0 && <span className="shrink-0 text-gray-500">{formatBytes(proof.size)}</span>}
                            </a>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

const DecisionForm: React.FC<{
    claim: ClaimView;
    note: string;
    onNoteChange: (id: string, value: string) => void;
    busy: ClaimDecision | null;
    locked: boolean;
    onDecide: (claimId: string, decision: ClaimDecision) => void;
    replacedOwnerId: string | null;
}> = ({ claim, note, onNoteChange, busy, locked, onDecide, replacedOwnerId }) => {
    const ownerName = useAdminName(replacedOwnerId);
    const noteLength = note.trim().length;
    const canReject = noteLength >= MIN_REJECT_NOTE_LENGTH;
    const noteId = `business-claim-${claim.id}-note`;
    return (
        <div className="space-y-3 rounded-xl border border-white/10 bg-black/15 p-3 sm:p-4">
            <label htmlFor={noteId} className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                📝 Nota de esta solicitud
            </label>
            <textarea
                id={noteId}
                value={note}
                onChange={(event) => onNoteChange(claim.id, event.target.value)}
                maxLength={1600}
                className="min-h-20 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500 focus:border-[var(--lt-accent-border)]"
                placeholder="Si rechazas, explica el motivo: lo verá el solicitante. Si apruebas, es una nota interna."
            />
            <p className="text-[11px] text-gray-500">
                {canReject
                    ? 'Si rechazas, esta nota llega al solicitante como motivo.'
                    : `Para rechazar, escribe el motivo (${MIN_REJECT_NOTE_LENGTH} caracteres o más).`}
            </p>
            {replacedOwnerId && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300">
                    ⚠️ Al aprobar, la propiedad pasa de {ownerName || 'su propietario actual'} a {claimantLabel(claim)}. Te pediremos confirmación.
                </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                    variant="danger"
                    size="sm"
                    onClick={() => onDecide(claim.id, 'rejected')}
                    disabled={locked || !canReject}
                    loading={busy === 'rejected'}
                    title={canReject ? undefined : `Escribe el motivo (${MIN_REJECT_NOTE_LENGTH} caracteres o más)`}
                >
                    ❌ Rechazar
                </Button>
                <Button
                    variant="success"
                    size="sm"
                    onClick={() => onDecide(claim.id, 'approved')}
                    disabled={locked}
                    loading={busy === 'approved'}
                >
                    {replacedOwnerId ? '⚠️ Aprobar y transferir' : '✅ Aprobar'}
                </Button>
            </div>
        </div>
    );
};

export const ClaimCard: React.FC<ClaimCardProps> = ({
    claim,
    badges,
    expanded,
    focused,
    onToggle,
    note,
    onNoteChange,
    busy,
    locked,
    message,
    onDecide,
    replacedOwnerId,
}) => {
    const isPending = claim.status === 'pending';
    const detailsId = `business-claim-${claim.id}-details`;
    const title = claim.placeName || claim.placeId || 'Lugar sin nombre';

    return (
        <article
            id={`business-claim-${claim.id}`}
            data-testid={`business-claim-${claim.id}`}
            className={cn(
                'scroll-mt-24 rounded-xl border bg-[var(--lt-card-strong)] transition-colors',
                focused ? 'border-[var(--lt-accent-border)] ring-1 ring-[var(--lt-accent-border)]' : 'border-white/10',
            )}
        >
            <div className="flex items-start gap-2 p-3 sm:gap-3 sm:p-4">
                <button
                    type="button"
                    onClick={() => onToggle(claim.id)}
                    aria-expanded={expanded}
                    aria-controls={detailsId}
                    className="min-w-0 flex-1 text-left"
                >
                    <span className="flex flex-wrap items-center gap-2">
                        <span aria-hidden="true">🏪</span>
                        <span className="min-w-0 truncate text-base font-bold text-white">{title}</span>
                        <StatusChip status={claim.status} />
                        {isPending && <AgeChip at={claim.createdAtMs} />}
                    </span>
                    <span className="mt-1 block text-sm text-gray-300">
                        <span className="font-semibold">{claimantLabel(claim)}</span>
                        {claim.role && <span> ({claim.role})</span>}
                        {claim.contactEmail && <span className="text-gray-500"> · {claim.contactEmail}</span>}
                    </span>
                    {badges.length > 0 && (
                        <span className="mt-2 flex flex-wrap gap-1.5">
                            {badges.map((badge) => <ClaimBadge key={`${badge.emoji}${badge.text}`} badge={badge} />)}
                        </span>
                    )}
                </button>
                <div className="flex shrink-0 items-center gap-1">
                    {claim.placeId && (
                        <a
                            href={`/place/${encodeURIComponent(claim.placeId)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 text-xs font-bold text-white hover:bg-white/15"
                            title="Abrir el lugar en otra pestaña"
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Lugar</span>
                        </a>
                    )}
                    <button
                        type="button"
                        onClick={() => onToggle(claim.id)}
                        aria-label={expanded ? 'Plegar' : 'Desplegar'}
                        aria-expanded={expanded}
                        aria-controls={detailsId}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-white/10 hover:text-white"
                    >
                        <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
                    </button>
                </div>
            </div>

            {!isPending && (
                <ResolvedMeta
                    className="-mt-1 px-3 pb-3 sm:px-4"
                    status={claim.status}
                    by={claim.reviewedBy}
                    at={claim.reviewedAtMs || null}
                    notes={claim.adminNotes}
                />
            )}

            {expanded && (
                <div id={detailsId} className="space-y-4 border-t border-white/10 p-3 sm:p-4">
                    <ClaimDetails claim={claim} />
                    <ClaimHistory claim={claim} />
                    {isPending && (
                        <DecisionForm
                            claim={claim}
                            note={note}
                            onNoteChange={onNoteChange}
                            busy={busy}
                            locked={locked || busy !== null}
                            onDecide={onDecide}
                            replacedOwnerId={replacedOwnerId}
                        />
                    )}
                </div>
            )}

            {message && (
                <div
                    role={message.type === 'error' ? 'alert' : 'status'}
                    className={cn(
                        'mx-3 mb-3 rounded-lg border px-3 py-2 text-sm sm:mx-4 sm:mb-4',
                        message.type === 'success'
                            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                            : 'border-red-500/25 bg-red-500/10 text-red-300',
                    )}
                >
                    {message.text}
                </div>
            )}
        </article>
    );
};
