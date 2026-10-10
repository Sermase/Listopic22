/**
 * ⭐ ¿Qué opinan de ti? (spec §9.5): termómetro de notas, valoraciones por
 * mes (con su nota) y lo último que dicen. Sale de las valoraciones públicas
 * que lee la gestión (como mucho 100, las más recientes cuando hay índice).
 */
import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '../../../lib/utils';
import type { ManagerPlaceReview } from '../../../services/BusinessProService';
import { formatScore } from '../../../lib/scoreScale';
import { EmptyState, kit, PanelError } from '../kit';
import { plural } from '../sponsored/sponsoredMeta';
import { MiniColumns } from './MiniColumns';
import { LATEST_REVIEWS_COLLAPSED, LATEST_REVIEWS_EXPANDED } from './statsMeta';
import { bandCounts, monthlyReviews } from './statsModel';
import { CardSkeleton, ScoreChip, StatsCard } from './statsParts';
import { ScoreThermometer } from './ScoreThermometer';
import type { StatsLoadStatus, StatsReviews } from './useStatsData';

export interface OpinionsCardProps {
    status: StatsLoadStatus;
    data: StatsReviews | null;
    nowMs: number;
    onRetry: () => void;
    busy?: boolean;
    className?: string;
}

const MONTHS_SHOWN = 6;

const timeAgo = (ms: number, nowMs: number): string | null => {
    if (!ms) return null;
    return formatDistanceToNow(new Date(Math.min(ms, nowMs)), { locale: es, addSuffix: true });
};

const ReviewRow: React.FC<{ review: ManagerPlaceReview; nowMs: number }> = ({ review, nowMs }) => {
    const author = review.authorName.trim() || 'Anónimo';
    const ago = timeAgo(review.createdAtMs, nowMs);
    return (
        <li className={cn(kit.inset, 'flex gap-3 p-3')}>
            <span
                aria-hidden="true"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--lt-border-strong)] bg-[var(--lt-card-strong)] text-sm font-black uppercase text-[var(--lt-text)]"
            >
                {Array.from(author)[0] || '?'}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-sm text-[var(--lt-text)]">
                        <strong className="font-bold">{author}</strong>
                        {review.itemName && (
                            <>
                                <span className="text-[var(--lt-text-muted)]"> sobre </span>
                                <strong className="font-bold">{review.itemName}</strong>
                            </>
                        )}
                    </p>
                    {review.overallRating !== null && <ScoreChip score={review.overallRating} />}
                </div>
                {review.comment.trim()
                    ? <p className="line-clamp-2 text-sm text-[var(--lt-text-muted)]">{review.comment}</p>
                    : <p className="text-sm italic text-[var(--lt-text-muted)]">Sin comentario</p>}
                {ago && <p className="text-xs text-[var(--lt-text-muted)]">{ago}</p>}
            </div>
        </li>
    );
};

export const OpinionsCard: React.FC<OpinionsCardProps> = ({ status, data, nowMs, onRetry, busy, className }) => {
    const [expanded, setExpanded] = useState(false);

    let body: React.ReactNode;
    if (status === 'error') {
        body = <PanelError what="tus valoraciones" onRetry={onRetry} />;
    } else if (status === 'loading' || !data) {
        body = <CardSkeleton chart lines={3} label="Cargando tus valoraciones…" />;
    } else if (data.reviews.length === 0) {
        body = (
            <EmptyState
                as="h4"
                size="sm"
                emoji="⭐"
                title="Aún no tienes valoraciones públicas."
                text="Cuando alguien valore un plato de tu carta, lo verás aquí."
            />
        );
    } else {
        const months = monthlyReviews(data.reviews, MONTHS_SHOWN, nowMs);
        const latest = data.reviews.slice(0, expanded ? LATEST_REVIEWS_EXPANDED : LATEST_REVIEWS_COLLAPSED);
        const canExpand = data.reviews.length > LATEST_REVIEWS_COLLAPSED;
        body = (
            <>
                <ScoreThermometer counts={bandCounts(data.reviews)} />

                <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-[var(--lt-text)]">Valoraciones por mes</h4>
                    <MiniColumns
                        ariaLabel="Valoraciones por mes"
                        hint="Toca un mes para ver su nota"
                        heightClass="h-28"
                        columns={months.map((month, index) => ({
                            key: month.key,
                            value: month.count,
                            current: index === months.length - 1,
                            axisLabel: month.label,
                            detail: `${month.label} ${month.key.slice(0, 4)} · ${plural(month.count, 'valoración', 'valoraciones')}${month.average !== null ? ` · nota ${formatScore(Math.round(month.average * 10) / 10)}` : ''}`,
                            extra: month.average !== null
                                ? <ScoreChip score={Math.round(month.average * 10) / 10} />
                                : <span aria-hidden="true" className="text-xs text-[var(--lt-text-muted)]">·</span>,
                        }))}
                    />
                </div>

                <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-[var(--lt-text)]">
                        <span aria-hidden="true">🗣️ </span>Lo último que dicen
                    </h4>
                    <ul className="space-y-2">
                        {latest.map((review) => <ReviewRow key={review.id} review={review} nowMs={nowMs} />)}
                    </ul>
                    {canExpand && (
                        <button
                            type="button"
                            aria-expanded={expanded}
                            onClick={() => setExpanded((value) => !value)}
                            className={cn('-ml-1 min-h-11 rounded-lg px-1 text-sm font-bold text-[var(--lt-accent)]', kit.focus)}
                        >
                            {expanded ? 'Ver menos' : `Ver más (hasta ${Math.min(LATEST_REVIEWS_EXPANDED, data.reviews.length)})`}
                        </button>
                    )}
                </div>

                {data.capped && (
                    <p className="text-xs text-[var(--lt-text-muted)]">
                        <span aria-hidden="true">ℹ️ </span>
                        {data.newestFirst
                            ? 'Basado en tus 100 valoraciones más recientes.'
                            : 'Basado en 100 de tus valoraciones públicas.'}
                    </p>
                )}
            </>
        );
    }

    return (
        <StatsCard emoji="⭐" title="¿Qué opinan de ti?" help="Las valoraciones públicas de tus platos." busy={busy} className={className}>
            {body}
        </StatsCard>
    );
};
