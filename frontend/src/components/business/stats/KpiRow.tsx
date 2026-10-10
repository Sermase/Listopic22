/**
 * Fila de cifras de 📊 (spec §9.2): 👀 visitas, ⭐ nota pública, 📝
 * valoraciones nuevas y 📤 veces compartido. 2×2 en móvil, 4 en escritorio.
 *
 * T2: la nota es la PÚBLICA del sitio (`placeRating`: personas, sin bots), la
 * misma que ve la gente; nunca una media hecha aquí con 100 reseñas.
 */
import React from 'react';
import type { PlaceRating } from '../../../lib/placeRating';
import { SCORE_BAND_EMOJI, SCORE_BAND_LABEL, scoreBand } from '../../../lib/scoreScale';
import { formatCount, plural } from '../sponsored/sponsoredMeta';
import { metaFor, SHARE_CHANNEL_META } from './statsMeta';
import { computeDelta, type TrafficSummary } from './statsModel';
import { ScoreChip } from './statsParts';
import { StatTile } from './StatTile';
import type { StatsLoadStatus } from './useStatsData';

export interface KpiReviews {
    count: number;
    prevCount: number | null;
    /** La lectura se quedó corta: el número es «al menos». */
    partial: boolean;
    perDay: number[];
    /** Bajo el número: de dónde sale. */
    note: string;
}

export interface KpiRowProps {
    traffic: { status: StatsLoadStatus; summary: TrafficSummary | null; retry: () => void };
    rating: { status: StatsLoadStatus; data: PlaceRating | null; retry: () => void };
    reviews: { status: StatsLoadStatus; data: KpiReviews | null; retry: () => void };
    busy?: boolean;
}

export const KpiRow: React.FC<KpiRowProps> = ({ traffic, rating, reviews, busy = false }) => {
    const summary = traffic.summary;
    const trafficStatus = traffic.status === 'ready' && !summary ? 'loading' : traffic.status;
    const reviewData = reviews.data;
    const reviewStatus = reviews.status === 'ready' && !reviewData ? 'loading' : reviews.status;
    const average = rating.data?.average ?? null;
    const topChannel = summary?.topShareChannel ? metaFor(SHARE_CHANNEL_META, summary.topShareChannel) : null;

    return (
        <section aria-labelledby="stats-kpi-title">
            <h3 id="stats-kpi-title" className="sr-only">Tus cifras del periodo</h3>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <StatTile
                    emoji="👀"
                    label="Visitas a tu ficha"
                    status={trafficStatus}
                    busy={busy}
                    onRetry={traffic.retry}
                    value={summary ? formatCount(summary.views) : null}
                    delta={summary ? computeDelta(summary.views, summary.prevViews) : null}
                    trend={summary?.days.map((day) => day.views)}
                />
                <StatTile
                    emoji="⭐"
                    label="Nota en Listopic"
                    status={rating.status === 'ready' && !rating.data ? 'error' : rating.status}
                    busy={busy}
                    onRetry={rating.retry}
                    value={average !== null
                        ? <ScoreChip score={average} size="lg" />
                        : <span className="block text-base font-bold leading-snug"><span aria-hidden="true">✍️ </span>Sin nota pública todavía</span>}
                    caption={average !== null && rating.data ? (
                        <>
                            <span className="block text-sm font-bold text-[var(--lt-text)]">
                                <span aria-hidden="true">{SCORE_BAND_EMOJI[scoreBand(average)]} </span>
                                {SCORE_BAND_LABEL[scoreBand(average)]}
                            </span>
                            de {plural(rating.data.count, 'valoración pública', 'valoraciones públicas')}
                        </>
                    ) : 'Sale cuando te valoran personas en público.'}
                />
                <StatTile
                    emoji="📝"
                    label="Valoraciones nuevas"
                    status={reviewStatus}
                    busy={busy}
                    onRetry={reviews.retry}
                    value={reviewData ? `${formatCount(reviewData.count)}${reviewData.partial ? '+' : ''}` : null}
                    caption={reviewData?.note}
                    delta={reviewData && !reviewData.partial ? computeDelta(reviewData.count, reviewData.prevCount) : null}
                    trend={reviewData?.perDay}
                />
                <StatTile
                    emoji="📤"
                    label="Veces compartido"
                    status={trafficStatus}
                    busy={busy}
                    onRetry={traffic.retry}
                    value={summary ? formatCount(summary.shares) : null}
                    caption={topChannel ? (
                        <>sobre todo por <span aria-hidden="true">{topChannel.emoji} </span>{topChannel.label}</>
                    ) : undefined}
                    delta={summary ? computeDelta(summary.shares, summary.prevShares) : null}
                    trend={summary?.days.map((day) => day.shares)}
                />
            </div>
        </section>
    );
};
