import React from 'react';
import { Link } from 'react-router-dom';
import { List as ListIcon, MapPin, Utensils } from 'lucide-react';
import type { HomeFeedCard as HomeFeedCardData } from '../../lib/homeFeeds';
import { scoreBadgeStyle } from '../../lib/scoreScale';
import { ProgressiveImage } from '../ProgressiveImage';
import { MarqueeText } from '../ui/MarqueeText';

const FALLBACK_ICON = { dish: Utensils, place: MapPin, list: ListIcon, review: Utensils } as const;

/** Tarjeta de los carruseles de la Home (platos, sitios, listas y reseñas). */
export const HomeFeedCard: React.FC<{ card: HomeFeedCardData }> = ({ card }) => {
    const Fallback = FALLBACK_ICON[card.kind];
    const isReview = card.kind === 'review';
    const placeholder = (
        <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundImage: 'linear-gradient(135deg, var(--lt-accent-soft), transparent)' }}>
            <Fallback className="h-10 w-10 text-[var(--lt-text-muted)] opacity-50" />
        </div>
    );

    return (
        <Link
            to={card.to}
            className="lt-media-card group relative block h-[170px] w-[220px] shrink-0 overflow-hidden rounded-3xl border border-[var(--lt-border)] bg-[var(--lt-card-strong)] shadow-lg transition-transform duration-300 hover:scale-[1.03] md:h-[190px] md:w-[260px]"
        >
            {card.photoUrl ? (
                <ProgressiveImage
                    src={card.photoUrl}
                    alt=""
                    containerClassName="absolute inset-0"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                    fallback={placeholder}
                />
            ) : placeholder}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />

            <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
                {isReview && card.authorName ? (
                    <span className="flex min-w-0 items-center gap-1.5 rounded-full border border-white/10 bg-black/45 py-0.5 pl-0.5 pr-2.5 backdrop-blur-md">
                        {card.authorPhoto ? (
                            <img src={card.authorPhoto} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
                        ) : (
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold text-white">
                                {card.authorName.charAt(0).toUpperCase()}
                            </span>
                        )}
                        <span className="truncate text-[10px] font-bold text-white">{card.authorName}</span>
                    </span>
                ) : card.badge ? (
                    <span className="truncate rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white backdrop-blur-md">
                        {card.badge}
                    </span>
                ) : <span />}
                {typeof card.rating === 'number' && (
                    <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 font-display text-sm font-bold shadow-lg"
                        style={scoreBadgeStyle(card.rating)}
                    >
                        {card.rating.toFixed(1)}
                    </span>
                )}
            </div>

            <div className="absolute inset-x-3 bottom-3 text-left">
                <MarqueeText as="h3" text={card.title} className="text-sm font-bold leading-tight text-white" />
                {card.subtitle && (
                    <MarqueeText text={card.subtitle} className="mt-0.5 text-[11px] font-medium text-gray-300" />
                )}
                {isReview && card.comment && (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-gray-200">“{card.comment}”</p>
                )}
            </div>
        </Link>
    );
};
