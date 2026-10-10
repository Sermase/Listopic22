/**
 * ProRowCard: una propuesta de carta, campaña o plato destacado en
 * «Patrocinios y Pro».
 *
 * Siempre visible: tipo, lugar, estado, antigüedad (en la Bandeja), avisos de
 * adminQueues (🧹 vencida, ∞ sin fin, 🚫 plato retirado, ⏳ propuesta atascada…)
 * y lo necesario para decidir: la propuesta y la nota del negocio; titular y
 * fechas de la campaña; impulsos del plato con lo que es de regalo y lo que se
 * factura. En «En curso», métricas, CTR y quién la activó. Una propuesta que se
 * está aplicando enseña quién y desde cuándo; si se atascó, «🔁 Reintentar».
 * En el Historial (solo lectura), ResolvedMeta con applyResult, y el aviso
 * «↩️ N impulsos devueltos» de los platos rechazados. Al desplegar: fechas, autor, ids y datos de detalle.
 *
 * Bandeja y En curso llevan la nota de esa fila y sus botones; el aviso de
 * éxito o error de la decisión se pinta dentro de la fila.
 */
import React from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { formatEur } from '../../../config/planBeta';
import { useAdminName } from '../../../hooks/useAdminNames';
import type { InboxBadge, InboxBadgeTone } from '../../../services/adminQueues';
import {
    describeProposal,
    type ItemProposal,
    type ItemSpotlight,
    type SponsoredMetrics,
    type SponsoredPlacement,
} from '../../../services/BusinessProService';
import { formatAge, formatDate, formatDateTime } from '../../../utils/adminTime';
import { Button } from '../../ui';
import { AgeChip, ResolvedMeta, StatusChip } from '../queue';
import {
    KIND_META,
    PLACEMENT_TYPE_META,
    PROPOSAL_TYPE_META,
    activationInfo,
    applyResultText,
    campaignDatesText,
    closingInfo,
    ctrText,
    decisionsFor,
    isStuckProposal,
    proRowDomId,
    spotlightCost,
    spotlightDays,
    type ProDecision,
    type ProRow,
} from './proUtils';
import type { ProRowMessage } from './useProDecisions';

export type ProRowMode = 'inbox' | 'active' | 'history';

export interface ProRowCardProps {
    row: ProRow;
    mode: ProRowMode;
    expanded: boolean;
    focused: boolean;
    onToggle: (key: string) => void;
    note?: string;
    onNoteChange?: (key: string, value: string) => void;
    /** Decisión en curso en esta fila. */
    busy?: ProDecision | null;
    /** Hay otra decisión en curso (en otra fila). */
    locked?: boolean;
    message?: ProRowMessage | null;
    onDecide?: (row: ProRow, decision: ProDecision) => void;
}

const BADGE_TONE_CLASS: Record<InboxBadgeTone, string> = {
    danger: 'border-red-500/30 bg-red-500/10 text-red-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    info: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
    neutral: 'border-white/10 bg-white/5 text-gray-300',
};

const KIND_CHIP_CLASS: Record<ProRow['kind'], string> = {
    proposal: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    placement: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
    spotlight: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
};

const linkClass = 'text-[var(--lt-accent)] underline-offset-2 hover:underline';

const kindChipText = (row: ProRow): string => {
    if (row.kind === 'proposal') {
        const meta = PROPOSAL_TYPE_META[row.proposal.type];
        return `${meta.emoji} ${meta.label}`;
    }
    if (row.kind === 'placement') {
        const meta = PLACEMENT_TYPE_META[row.placement.type];
        return `${meta.emoji} ${meta.label}`;
    }
    return '⚡ Plato destacado';
};

const Badge: React.FC<{ badge: InboxBadge }> = ({ badge }) => {
    const name = useAdminName(badge.userId ?? null);
    return (
        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', BADGE_TONE_CLASS[badge.tone])}>
            <span aria-hidden="true">{badge.emoji}</span>
            {badge.text}
            {name ? ` ${name}` : ''}
        </span>
    );
};

const ActorName: React.FC<{ uid?: string | null }> = ({ uid }) => {
    const name = useAdminName(uid ?? null);
    if (!uid) return <span className="text-gray-500">Sin datos</span>;
    return (
        <>
            <span className="font-semibold">{name}</span>
            {' · '}
            <a href={`/profile/${encodeURIComponent(uid)}`} target="_blank" rel="noopener noreferrer" className={linkClass}>ver perfil</a>
        </>
    );
};

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
    <div className={cn('min-w-0', className)}>
        <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</dt>
        <dd className="mt-0.5 break-words text-sm text-gray-200">{children}</dd>
    </div>
);

const MetricsLine: React.FC<{ metrics: SponsoredMetrics }> = ({ metrics }) => (
    <p className="text-xs text-cyan-300">
        👁️ {metrics.impressions.toLocaleString('es-ES')} impresiones únicas · 👆 {metrics.clicks.toLocaleString('es-ES')} clics · CTR {ctrText(metrics)}
    </p>
);

// ── Cuerpo según el tipo ─────────────────────────────────────────────────────

const reviewListId = (reviewPath: string): string | null => {
    const segments = reviewPath.split('/').filter(Boolean);
    return segments.length === 4 && segments[0] === 'lists' ? segments[1] : null;
};

const ProposalBody: React.FC<{ proposal: ItemProposal }> = ({ proposal }) => {
    const reviewPath = proposal.type === 'reassign_review' ? proposal.payload.reviewPath || '' : '';
    const listId = reviewPath ? reviewListId(reviewPath) : null;
    return (
        <>
            <p className="text-sm text-gray-200">{describeProposal(proposal)}</p>
            {proposal.note && <p className="text-xs text-gray-400">💬 Nota del negocio: “{proposal.note}”</p>}
            {reviewPath && (
                <p className="break-all text-xs text-gray-400">
                    📄 Reseña: <code className="font-mono text-gray-300">{reviewPath}</code>
                    {listId && (
                        <>
                            {' · '}
                            <a href={`/list/${encodeURIComponent(listId)}`} target="_blank" rel="noopener noreferrer" className={linkClass}>abrir la lista</a>
                        </>
                    )}
                </p>
            )}
        </>
    );
};

const PlacementBody: React.FC<{ placement: SponsoredPlacement }> = ({ placement }) => {
    const dates = campaignDatesText(placement.startsAt, placement.endsAt);
    return (
        <>
            {placement.headline && <p className="text-sm text-gray-200">«{placement.headline}»</p>}
            <p className="text-xs text-gray-400">📅 {dates ? dates.charAt(0).toUpperCase() + dates.slice(1) : 'Sin fechas'}</p>
            {(placement.status === 'active' || placement.status === 'ended') && <MetricsLine metrics={placement.metrics} />}
        </>
    );
};

const CostLine: React.FC<{ spotlight: ItemSpotlight }> = ({ spotlight }) => {
    const cost = spotlightCost(spotlight);
    if (cost.impulses === null) {
        return cost.totalEur !== null ? <p className="text-xs text-gray-300">💳 {formatEur(cost.totalEur)}</p> : null;
    }
    return (
        <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-gray-300">
            <span className="font-semibold text-amber-300">⚡ {cost.impulses.toLocaleString('es-ES')} impulsos</span>
            <span aria-hidden="true" className="text-gray-500">·</span>
            <span>🎁 {cost.gift.toLocaleString('es-ES')} de regalo</span>
            <span aria-hidden="true" className="text-gray-500">·</span>
            <span>
                💳 {cost.billed === 0
                    ? 'nada que facturar'
                    : `${(cost.billed ?? 0).toLocaleString('es-ES')} a facturar${cost.totalEur !== null ? ` (${formatEur(cost.totalEur)})` : ''}`}
            </span>
        </p>
    );
};

const SpotlightBody: React.FC<{ spotlight: ItemSpotlight }> = ({ spotlight }) => {
    const days = spotlightDays(spotlight);
    const dates = campaignDatesText(spotlight.startsAt, spotlight.endsAt);
    return (
        <>
            <p className="text-xs text-gray-400">
                📍 Radio {spotlight.radiusKm.toLocaleString('es-ES')} km · {days} {days === 1 ? 'día' : 'días'} · intensidad ×{spotlight.units}
            </p>
            <CostLine spotlight={spotlight} />
            {dates ? (
                <p className="text-xs text-gray-400">📅 Activo {dates}</p>
            ) : spotlight.status === 'requested' && (
                <p className="text-xs text-gray-400">⏱️ El periodo empieza a contar al activarlo</p>
            )}
            {(spotlight.status === 'active' || spotlight.status === 'ended') && <MetricsLine metrics={spotlight.metrics} />}
        </>
    );
};

const RowBody: React.FC<{ row: ProRow }> = ({ row }) => {
    if (row.kind === 'proposal') return <ProposalBody proposal={row.proposal} />;
    if (row.kind === 'placement') return <PlacementBody placement={row.placement} />;
    return <SpotlightBody spotlight={row.spotlight} />;
};

// ── Quién decidió ────────────────────────────────────────────────────────────

const RowMeta: React.FC<{ row: ProRow }> = ({ row }) => {
    const gender = KIND_META[row.kind].gender;
    const { status } = row.item;
    if (status === 'pending' || status === 'requested') return null;
    // 'applying' cae abajo: closingInfo da quién la está aplicando y desde cuándo.
    const notes = row.kind === 'proposal' ? row.proposal.adminNotes : row.kind === 'placement' ? row.placement.adminNotes : row.spotlight.adminNotes;
    if (status === 'active') {
        const activation = activationInfo(row);
        if (!activation || (!activation.by && !activation.at)) return null;
        return (
            <ResolvedMeta
                status="active"
                label={gender === 'm' ? 'Activado' : 'Activada'}
                by={activation.by}
                at={activation.at}
                notes={notes}
                gender={gender}
            />
        );
    }
    const closing = closingInfo(row);
    // El cierre automático no escribe nota: la que hay es la de la activación.
    const closingNotes = closing.status === 'ended' && closing.by === 'system' ? null : notes;
    // Los impulsos devueltos ya salen como aviso «↩️ N impulsos devueltos» (adminQueues).
    const applied = row.kind === 'proposal' ? applyResultText(row.proposal) : null;
    return (
        <ResolvedMeta status={closing.status} by={closing.by} at={closing.at} notes={closingNotes} gender={gender}>
            {applied ? <span className="font-semibold text-gray-200">{applied}</span> : undefined}
        </ResolvedMeta>
    );
};

// ── Detalle al desplegar ─────────────────────────────────────────────────────

const ActivationField: React.FC<{ row: ProRow }> = ({ row }) => {
    const activation = activationInfo(row);
    const name = useAdminName(activation?.by && activation.by !== 'system' ? activation.by : null);
    if (!activation) return null;
    const startsAt = row.kind === 'spotlight' ? row.spotlight.startsAt : undefined;
    const when = activation.at ? formatDateTime(activation.at) : startsAt ? formatDate(startsAt) : '';
    if (!name && !when) return null;
    return (
        <Field label="🟢 Activación">
            {[name ? `por ${name}` : '', when].filter(Boolean).join(' · ')}
        </Field>
    );
};

const ProposalDetails: React.FC<{ proposal: ItemProposal }> = ({ proposal }) => {
    const { payload } = proposal;
    if (proposal.type === 'merge') {
        return <Field label="🧩 Elementos">{payload.sourceItemId || '?'} → {payload.targetItemId || '?'}</Field>;
    }
    if (proposal.type === 'rename') {
        return <Field label="🧩 Elemento">{payload.itemId || '?'}</Field>;
    }
    return <Field label="🧩 Elementos">{payload.currentItemId || '?'} → {payload.targetItemId || '?'}</Field>;
};

const RowDetails: React.FC<{ row: ProRow }> = ({ row }) => {
    const record = row.kind === 'proposal' ? row.proposal : row.kind === 'placement' ? row.placement : row.spotlight;
    return (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Field label="📅 Enviada">
                {row.item.createdAtMs ? (
                    <>
                        <span className="tabular-nums">{formatDateTime(row.item.createdAtMs)}</span>
                        <span className="text-gray-500"> · {formatAge(row.item.createdAtMs)}</span>
                    </>
                ) : <span className="text-gray-500">Sin fecha</span>}
            </Field>
            <Field label="👤 Enviada por"><ActorName uid={record.createdBy} /></Field>
            {row.kind === 'proposal' && <ProposalDetails proposal={row.proposal} />}
            {row.kind === 'placement' && row.placement.placeAddress && <Field label="📍 Dirección">{row.placement.placeAddress}</Field>}
            {row.kind === 'spotlight' && (
                <>
                    {typeof row.spotlight.pricePerImpulseEur === 'number' && (
                        <Field label="💶 Precio por impulso">{formatEur(row.spotlight.pricePerImpulseEur)}</Field>
                    )}
                    <Field label="⭐ Plato">
                        {row.spotlight.itemAverageRating !== null ? `${row.spotlight.itemAverageRating.toLocaleString('es-ES', { maximumFractionDigits: 1 })} · ` : ''}
                        {row.spotlight.itemReviewCount} {row.spotlight.itemReviewCount === 1 ? 'reseña' : 'reseñas'}
                        {row.spotlight.linkedListIds.length > 0 ? ` · ${row.spotlight.linkedListIds.length} ${row.spotlight.linkedListIds.length === 1 ? 'lista' : 'listas'}` : ''}
                    </Field>
                </>
            )}
            {row.kind !== 'proposal' && row.item.status !== 'requested' && <ActivationField row={row} />}
            <Field label="🆔 Ids" className="sm:col-span-2">
                <span className="break-all font-mono text-xs text-gray-400">
                    {row.kind === 'proposal' ? 'propuesta' : row.kind === 'placement' ? 'campaña' : 'plato'} {row.item.id} · lugar {record.placeId || '?'}
                    {row.kind === 'spotlight' && row.spotlight.itemId ? ` · elemento ${row.spotlight.itemId}` : ''}
                </span>
            </Field>
        </dl>
    );
};

// ── Decisión ─────────────────────────────────────────────────────────────────

const DECISION_BUTTON: Record<ProDecision, { label: string; variant: 'success' | 'danger' | 'secondary' }> = {
    approve: { label: '✅ Aprobar y aplicar', variant: 'success' },
    activate: { label: '🟢 Activar', variant: 'success' },
    reject: { label: '❌ Rechazar', variant: 'danger' },
    end: { label: '🏁 Finalizar', variant: 'secondary' },
};

const DecisionBar: React.FC<{
    row: ProRow;
    decisions: ProDecision[];
    note: string;
    onNoteChange?: (key: string, value: string) => void;
    busy: ProDecision | null;
    locked: boolean;
    onDecide?: (row: ProRow, decision: ProDecision) => void;
}> = ({ row, decisions, note, onNoteChange, busy, locked, onDecide }) => {
    const noteId = `${proRowDomId(row.item)}-note`;
    // Propuesta atascada: aprobar es terminar de aplicarla.
    const retry = isStuckProposal(row);
    return (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor={noteId} className="sr-only">Nota para el negocio</label>
            <input
                id={noteId}
                value={note}
                onChange={(event) => onNoteChange?.(row.item.key, event.target.value)}
                maxLength={500}
                disabled={locked}
                placeholder={decisions.includes('reject')
                    ? '📝 Nota para el negocio (opcional; si rechazas, explica el motivo)'
                    : '📝 Nota para el negocio (opcional)'}
                className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-gray-500 focus:border-[var(--lt-accent-border)] disabled:opacity-60"
            />
            <div className="flex shrink-0 justify-end gap-2">
                {decisions.map((decision) => (
                    <Button
                        key={decision}
                        variant={DECISION_BUTTON[decision].variant}
                        size="sm"
                        onClick={() => onDecide?.(row, decision)}
                        disabled={locked}
                        loading={busy === decision}
                    >
                        {decision === 'approve' && retry ? '🔁 Reintentar' : DECISION_BUTTON[decision].label}
                    </Button>
                ))}
            </div>
        </div>
    );
};

// ── Tarjeta ──────────────────────────────────────────────────────────────────

export const ProRowCard: React.FC<ProRowCardProps> = ({
    row,
    mode,
    expanded,
    focused,
    onToggle,
    note = '',
    onNoteChange,
    busy = null,
    locked = false,
    message,
    onDecide,
}) => {
    const { item } = row;
    const domId = proRowDomId(item);
    const detailsId = `${domId}-details`;
    const gender = KIND_META[row.kind].gender;
    const decisions = decisionsFor(row).filter((decision) => (mode === 'inbox'
        ? decision !== 'end'
        : mode === 'active' ? decision === 'end' : false));
    const placeId = item.placeId;
    const placeName = row.kind === 'spotlight' ? row.spotlight.placeName || row.spotlight.placeId : null;

    return (
        <article
            id={domId}
            data-testid={domId}
            className={cn(
                'scroll-mt-24 rounded-xl border bg-[var(--lt-card-strong)] transition-colors',
                focused ? 'border-[var(--lt-accent-border)] ring-1 ring-[var(--lt-accent-border)]' : 'border-white/10',
            )}
        >
            <div className="flex items-start gap-2 p-3 sm:gap-3 sm:p-4">
                <button
                    type="button"
                    onClick={() => onToggle(item.key)}
                    aria-expanded={expanded}
                    aria-controls={detailsId}
                    className="min-w-0 flex-1 text-left"
                >
                    <span className="flex flex-wrap items-center gap-2">
                        <span aria-hidden="true">{KIND_META[row.kind].emoji}</span>
                        <span className="min-w-0 truncate text-base font-bold text-white">{item.title}</span>
                        {placeName && <span className="min-w-0 truncate text-sm text-gray-400">· {placeName}</span>}
                        <span className={cn('inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold', KIND_CHIP_CLASS[row.kind])}>
                            {kindChipText(row)}
                        </span>
                        <StatusChip status={item.status} gender={gender} />
                        {mode === 'inbox' && (item.status === 'pending' || item.status === 'requested') && <AgeChip at={item.createdAtMs} />}
                    </span>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                    {placeId && (
                        <a
                            href={`/place/${encodeURIComponent(placeId)}`}
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
                        onClick={() => onToggle(item.key)}
                        aria-label={expanded ? 'Plegar' : 'Desplegar'}
                        aria-expanded={expanded}
                        aria-controls={detailsId}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-white/10 hover:text-white"
                    >
                        <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
                    </button>
                </div>
            </div>

            <div className="-mt-1 space-y-1.5 px-3 pb-3 sm:px-4 sm:pb-4">
                <RowBody row={row} />
                {item.badges.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {item.badges.map((badge) => <Badge key={`${badge.emoji}${badge.text}`} badge={badge} />)}
                    </div>
                )}
                <RowMeta row={row} />
                {decisions.length > 0 && (
                    <div className="pt-1.5">
                        <DecisionBar
                            row={row}
                            decisions={decisions}
                            note={note}
                            onNoteChange={onNoteChange}
                            busy={busy}
                            locked={locked || busy !== null}
                            onDecide={onDecide}
                        />
                    </div>
                )}
            </div>

            {expanded && (
                <div id={detailsId} className="border-t border-white/10 p-3 sm:p-4">
                    <RowDetails row={row} />
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
