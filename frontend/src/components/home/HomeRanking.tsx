import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, MapPin, Utensils } from 'lucide-react';
import { ProgressiveImage } from '../ProgressiveImage';
import { scoreBadgeStyle } from '../../lib/scoreScale';
import { MarqueeText } from '../ui/MarqueeText';
import { HelpTip } from '../HelpTip';

export interface RankingRow {
    key: string;
    to: string;
    title: string;
    subtitle?: string;
    imageUrl?: string;
    score: number | null;
    /** Reseñas que hay detrás de la nota: explica por qué un 8,6 con muchas va antes que un 9,2 con una. */
    count?: number;
    /** Distancia ya formateada («a 350 m»). */
    distanceLabel?: string;
    /** «Tu colega Cris le dio un 9». */
    friendNote?: string;
}


interface HomeRankingProps {
    dishes: RankingRow[];
    places: RankingRow[];
    dishesLink: string;
    placesLink: string;
    loading?: boolean;
}

const ROWS = 5;

const Row: React.FC<{ row: RankingRow; position: number; fallbackIcon: React.ElementType }> = ({ row, position, fallbackIcon: Fallback }) => (
    <li>
        <Link
            to={row.to}
            className="grid grid-cols-[1.5rem_3rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--lt-glass)]"
        >
            <span className={`text-center font-display text-lg font-bold tabular-nums ${position === 1 ? 'text-[var(--lt-accent)]' : 'text-[var(--lt-text-muted)]'}`}>
                {position}
            </span>
            <span className="relative h-12 w-12 overflow-hidden rounded-xl bg-[var(--lt-glass)]">
                {row.imageUrl ? (
                    <ProgressiveImage
                        src={row.imageUrl}
                        alt=""
                        containerClassName="h-full w-full"
                        className="h-full w-full object-cover"
                        fallback={<span className="flex h-full w-full items-center justify-center text-[var(--lt-text-muted)]"><Fallback className="h-5 w-5" /></span>}
                    />
                ) : (
                    <span className="flex h-full w-full items-center justify-center text-[var(--lt-text-muted)]">
                        <Fallback className="h-5 w-5" />
                    </span>
                )}
            </span>
            <span className="min-w-0">
                <MarqueeText text={row.title} className="text-sm font-bold text-[var(--lt-text)]" />
                {(row.subtitle || row.distanceLabel) && (
                    <MarqueeText text={[row.subtitle, row.distanceLabel].filter(Boolean).join(' · ')} className="text-xs text-[var(--lt-text-muted)]" />
                )}
                {row.friendNote && (
                    <span className="block truncate text-[11px] font-semibold text-[var(--lt-accent)]">{row.friendNote}</span>
                )}
            </span>
            <span className="flex flex-col items-center gap-0.5">
                <span
                    className="min-w-[2.6rem] rounded-full px-2 py-1 text-center font-display text-sm font-bold tabular-nums"
                    style={scoreBadgeStyle(row.score)}
                >
                    {typeof row.score === 'number' ? row.score.toFixed(1) : '–'}
                </span>
                {typeof row.count === 'number' && row.count > 0 && (
                    <span className="text-[10px] font-semibold tabular-nums text-[var(--lt-text-muted)]">
                        {row.count} {row.count === 1 ? 'reseña' : 'reseñas'}
                    </span>
                )}
            </span>
        </Link>
    </li>
);

/** Ranking en filas de la home: platos y sitios mejor valorados de la zona. */
export const HomeRanking: React.FC<HomeRankingProps> = ({ dishes, places, dishesLink, placesLink, loading }) => {
    const [tab, setTab] = useState<'dishes' | 'places'>('dishes');
    const rows = (tab === 'dishes' ? dishes : places).slice(0, ROWS);
    const link = tab === 'dishes' ? dishesLink : placesLink;

    if (!loading && dishes.length === 0 && places.length === 0) return null;

    return (
        <section className="w-full">
            <div className="mb-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="truncate font-display text-base font-bold leading-tight text-[var(--lt-text)] md:text-xl"><span className="inline-flex items-center gap-1">Cerca y bueno <HelpTip topic="cerca" /></span></h2>
                    <p className="mt-0.5 truncate text-xs font-medium text-[var(--lt-text-muted)]">Lo mejor valorado a tu alrededor.</p>
                </div>
                <div role="tablist" aria-label="Tipo de ranking" className="flex shrink-0 rounded-full border border-[var(--lt-border)] bg-[var(--lt-glass)] p-1">
                    {([['dishes', 'Platos'], ['places', 'Sitios']] as const).map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            role="tab"
                            aria-selected={tab === id}
                            onClick={() => setTab(id)}
                            className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${tab === id ? 'bg-[var(--lt-accent)] lt-on-accent' : 'text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-[var(--lt-border)] bg-[var(--lt-card)] backdrop-blur-xl">
                {loading && rows.length === 0 ? (
                    <ul aria-hidden="true">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                                <span className="lt-skeleton block h-12 w-12 shrink-0 rounded-xl" />
                                <span className="flex-1 space-y-2">
                                    <span className="lt-skeleton block h-3 w-2/3 rounded" />
                                    <span className="lt-skeleton block h-3 w-1/3 rounded" />
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : rows.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-[var(--lt-text-muted)]">Todavía no hay reseñas aquí. ¡Estrena tú el ranking!</p>
                ) : (
                    <ol className="divide-y divide-[var(--lt-border)]">
                        {rows.map((row, index) => (
                            <Row key={row.key} row={row} position={index + 1} fallbackIcon={tab === 'dishes' ? Utensils : MapPin} />
                        ))}
                    </ol>
                )}
                <Link
                    to={link}
                    className="flex items-center justify-center gap-1 border-t border-[var(--lt-border)] py-3 text-sm font-bold text-[var(--lt-accent)] transition-colors hover:bg-[var(--lt-glass)]"
                >
                    Ver el ranking completo <ChevronRight className="h-4 w-4" />
                </Link>
            </div>
        </section>
    );
};
