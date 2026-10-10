/**
 * 📊 Estadísticas: «Cómo va tu negocio» (spec §9).
 *
 *   <BusinessStatsSection placeId={placeId} rating={place.rating} onGoToTab={(tab) => goToTab(tab)} />
 *
 * - `rating`: la nota PÚBLICA del sitio (placeRating del documento del lugar, T2).
 *   Si la página no la pasa, se lee aquí.
 * - `onGoToTab`: para los atajos a Carta y Promos (pasa por el aviso de cambios
 *   sin guardar de la página). Si no llega, se cambia `?tab=` directamente.
 *
 * Cada fuente (visitas, valoraciones, platos, campañas) carga y falla por su
 * cuenta (T4): las valoraciones y la carta salen antes y las visitas después.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import type { PlaceRating } from '../../../lib/placeRating';
import { cn } from '../../../lib/utils';
import { useToast } from '../../../context/ToastContext';
import { Button } from '../../ui/Button';
import { Tabs, type TabOption } from '../../ui/Tabs';
import { SectionHeader } from '../kit';
import { CampaignsCard } from './CampaignsCard';
import { HeadlinesStrip } from './HeadlinesStrip';
import { KpiRow, type KpiReviews } from './KpiRow';
import { OpinionsCard } from './OpinionsCard';
import { SharesCard } from './SharesCard';
import { SourcesCard } from './SourcesCard';
import { periodDays, STATS_PERIODS, type StatsGoToTab, type StatsPeriod } from './statsMeta';
import {
    computeHeadlines,
    countReviewsIn,
    lastDateKeys,
    reviewCoverage,
    reviewsPerDay,
    summarizeTraffic,
    sumOf,
    topItemsByScore,
    weekdayStrengths,
} from './statsModel';
import { TopItemsCard } from './TopItemsCard';
import { useStatsData } from './useStatsData';
import { VisitsCard } from './VisitsCard';

export interface BusinessStatsSectionProps {
    placeId: string;
    /** Nota pública del sitio (placeRating). Sin ella, se lee el lugar aquí. */
    rating?: PlaceRating | null;
    /** Cambiar de pestaña desde un atajo (Carta, Promos). */
    onGoToTab?: (tab: StatsGoToTab) => void;
}

const PERIOD_TABS: TabOption<StatsPeriod>[] = STATS_PERIODS.map((period) => ({
    value: period.value,
    icon: <span aria-hidden="true">{period.emoji}</span>,
    label: period.label,
}));

export const BusinessStatsSection: React.FC<BusinessStatsSectionProps> = ({ placeId, rating, onGoToTab }) => {
    const data = useStatsData(placeId, rating);
    const { traffic, reviews, items, campaigns } = data;
    const { showToast } = useToast();
    const [, setSearchParams] = useSearchParams();
    const [period, setPeriod] = useState<StatsPeriod>('30');
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [refreshing, setRefreshing] = useState(false);
    const days = periodDays(period);

    const goTo = useCallback((tab: StatsGoToTab) => {
        if (onGoToTab) {
            onGoToTab(tab);
            return;
        }
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('tab', tab);
            return next;
        }, { replace: true });
    }, [onGoToTab, setSearchParams]);

    const refresh = async () => {
        if (refreshing) return;
        setRefreshing(true);
        setNowMs(Date.now());
        const ok = await data.refreshAll();
        setRefreshing(false);
        if (!ok) {
            showToast({
                variant: 'error',
                title: '😕 No se ha podido actualizar todo',
                message: 'Lo que ves es lo último que cargó bien. Vuelve a intentarlo en un rato.',
            });
        }
    };

    const summary = useMemo(() => (traffic.data ? summarizeTraffic(traffic.data, days) : null), [traffic.data, days]);
    const weekdays = useMemo(() => (traffic.data ? weekdayStrengths(traffic.data) : null), [traffic.data]);

    const kpiReviews = useMemo((): KpiReviews | null => {
        const read = reviews.data;
        if (!read) return null;
        const keys = lastDateKeys(days * 2, nowMs);
        const currentKeys = keys.slice(days);
        const previousKeys = keys.slice(0, days);
        const coverage = reviewCoverage(read.reviews, read);
        const current = countReviewsIn(read.reviews, currentKeys, coverage);
        const previous = countReviewsIn(read.reviews, previousKeys, coverage);
        let note = 'Valoraciones públicas en el periodo';
        if (current.partial) {
            note = read.newestFirst ? 'Contamos tus 100 valoraciones más recientes' : 'Contamos 100 de tus valoraciones';
        }
        return {
            count: current.count,
            prevCount: previous.partial ? null : previous.count,
            partial: current.partial,
            perDay: reviewsPerDay(read.reviews, currentKeys),
            note,
        };
    }, [reviews.data, days, nowMs]);

    const bestItem = useMemo(() => (items.data ? topItemsByScore(items.data, 1)[0] ?? null : null), [items.data]);

    const headlinesReady = traffic.status !== 'loading' && items.status !== 'loading';
    const headlines = useMemo(() => {
        if (!headlinesReady) return [];
        return computeHeadlines({
            traffic: summary && traffic.data && traffic.status === 'ready'
                ? {
                    views: summary.views,
                    prevViews: summary.prevViews,
                    totalViews: sumOf(traffic.data, (day) => day.views),
                    searchViews: summary.bySource.search || 0,
                    topShareChannel: summary.topShareChannel,
                    bestWeekdayPlural: weekdays?.best?.plural ?? null,
                }
                : null,
            bestItem: items.status === 'ready' ? bestItem : null,
        });
    }, [headlinesReady, summary, traffic.data, traffic.status, weekdays, items.status, bestItem]);

    return (
        <div className="space-y-5">
            <SectionHeader
                emoji="📊"
                title="Cómo va tu negocio"
                help="Lo que pasa en tu ficha de Listopic, de forma anónima y sin cookies."
                right={(
                    <Button
                        variant="secondary"
                        onClick={() => void refresh()}
                        disabled={refreshing}
                        aria-label="Actualizar estadísticas"
                        title="Actualizar"
                        leftIcon={<RefreshCw aria-hidden="true" className={cn('h-4 w-4', refreshing && 'animate-spin')} />}
                        className="min-h-11 border-[var(--lt-border-strong)] bg-[var(--lt-glass)] px-3 hover:bg-[var(--lt-accent-soft)]"
                    >
                        <span className="hidden sm:inline">Actualizar</span>
                    </Button>
                )}
            />

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Tabs size="lg" ariaLabel="Periodo" value={period} options={PERIOD_TABS} onChange={setPeriod} />
                <p className="text-xs text-[var(--lt-text-muted)]">Comparado con los {days} días anteriores</p>
            </div>

            <HeadlinesStrip
                status={headlinesReady ? 'ready' : 'loading'}
                headlines={headlines}
                onAction={goTo}
                busy={refreshing}
            />

            <KpiRow
                busy={refreshing}
                traffic={{ status: traffic.status, summary, retry: traffic.reload }}
                rating={{ status: data.rating.status, data: data.rating.data, retry: data.rating.reload }}
                reviews={{ status: reviews.status, data: kpiReviews, retry: reviews.reload }}
            />

            <div className="grid gap-5 lg:grid-cols-2">
                <VisitsCard
                    className="lg:col-span-2"
                    placeId={placeId}
                    status={traffic.status}
                    summary={summary}
                    weekdays={weekdays}
                    onRetry={traffic.reload}
                    onBoost={() => goTo('sponsored')}
                    busy={refreshing}
                />
                <SourcesCard status={traffic.status} summary={summary} onRetry={traffic.reload} busy={refreshing} />
                <OpinionsCard status={reviews.status} data={reviews.data} nowMs={nowMs} onRetry={reviews.reload} busy={refreshing} />
                <TopItemsCard
                    status={items.status}
                    items={items.data}
                    onRetry={items.reload}
                    onGoToCarta={() => goTo('items')}
                    busy={refreshing}
                />
                <SharesCard status={traffic.status} summary={summary} onRetry={traffic.reload} busy={refreshing} />
                <CampaignsCard
                    className="lg:col-span-2"
                    status={campaigns.status}
                    data={campaigns.data}
                    onRetry={campaigns.reload}
                    onGoToPromos={() => goTo('sponsored')}
                    busy={refreshing}
                />
            </div>

            <p className="flex items-start gap-2 text-sm text-[var(--lt-text-muted)]">
                <span aria-hidden="true">ℹ️</span>
                <span>Contamos visitas de forma anónima y sin cookies. Incluye las veces que abres tu propia ficha.</span>
            </p>
        </div>
    );
};
