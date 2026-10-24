import React, { useMemo } from 'react';
import { MessageSquareQuote } from 'lucide-react';
import { scoreBadgeStyle } from '../lib/scoreScale';

interface QuoteReview {
    id?: string;
    comment?: string;
    authorName?: string;
    overallRating?: number;
    reactionCounts?: { like?: number };
    visibility?: string;
    itemName?: string;
    createdAt?: unknown;
}

const MIN_CHARS = 25;

const toMillis = (value: unknown): number => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (value instanceof Date) return value.getTime();
    const v = value as { toMillis?: () => number; seconds?: number };
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    return 0;
};

/** Elige la frase que se destaca: pública, con chicha, la más apoyada y luego la más reciente. */
function pickFeaturedReview<T extends QuoteReview>(reviews: T[]): T | null {
    const candidates = reviews.filter((r) => (r.visibility ?? 'public') === 'public' && (r.comment?.trim().length ?? 0) >= MIN_CHARS);
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => {
        const likes = (b.reactionCounts?.like ?? 0) - (a.reactionCounts?.like ?? 0);
        return likes !== 0 ? likes : toMillis(b.createdAt) - toMillis(a.createdAt);
    })[0];
}

interface FeaturedQuoteProps {
    reviews: QuoteReview[];
    /** Enseña el plato junto al autor (en la ficha del sitio). */
    showItem?: boolean;
    onSeeAll?: () => void;
    className?: string;
}

/** «Lo que dice la gente»: una frase de una reseña para decidir de un vistazo. */
export const FeaturedQuote: React.FC<FeaturedQuoteProps> = ({ reviews, showItem = false, onSeeAll, className = '' }) => {
    const review = useMemo(() => pickFeaturedReview(reviews), [reviews]);
    if (!review?.comment) return null;

    return (
        <section className={`rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)] p-4 ${className}`}>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[var(--lt-text-muted)]">
                <MessageSquareQuote className="h-3.5 w-3.5 text-[var(--lt-accent)]" /> Lo que dice la gente
            </p>
            <p className="line-clamp-3 text-[15px] leading-relaxed text-[var(--lt-text)]">{review.comment.trim()}</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-[var(--lt-text-muted)]">
                <span className="min-w-0 truncate">
                    {review.authorName || 'Anónimo'}{showItem && review.itemName ? ` · ${review.itemName}` : ''}
                </span>
                {typeof review.overallRating === 'number' && (
                    <span className="shrink-0 rounded-full px-1.5 py-0.5 font-display text-[11px] font-bold tabular-nums" style={scoreBadgeStyle(review.overallRating)}>
                        {review.overallRating.toFixed(1)}
                    </span>
                )}
                {onSeeAll && (
                    <button type="button" onClick={onSeeAll} className="ml-auto shrink-0 font-bold text-[var(--lt-accent)] hover:underline">
                        Ver reseñas
                    </button>
                )}
            </div>
        </section>
    );
};
