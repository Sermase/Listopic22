/**
 * 📈 Resultados: portada, mapa y platos estrella juntos, los más recientes
 * primero, con filtro por estado, progreso mientras están en marcha y
 * vistas, clics y CTR (también al terminar).
 *
 *   <CampaignsTimeline placements={data.placements} spotlights={data.spotlights}
 *     highlightId={justLaunchedId} onStartSpotlight={() => setSub('plato')} />
 *
 * Mientras carga, esqueleto; si falla un conjunto, su PanelError (nunca un
 * «aún no has lanzado campañas» falso).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatEur } from '../../../config/planBeta';
import { cn } from '../../../lib/utils';
import type { ItemSpotlight, SponsoredMetrics, SponsoredPlacement } from '../../../services/BusinessProService';
import { Button } from '../../ui/Button';
import { ChoiceCards, EmptyState, kit, PanelError, SectionHeader, SoftCard, StatusPill, toDateInput, type ChoiceOption } from '../kit';
import {
    CAMPAIGN_FILTERS,
    CAMPAIGN_STATUS_META,
    campaignProgress,
    formatCount,
    formatCtr,
    formatDateRange,
    formatKm,
    isSpotlightPaused,
    mergeCampaigns,
    PLACEMENT_TYPE_META,
    plural,
    SPOTLIGHT_ITEM_INACTIVE_NOTICE,
    spotlightDays,
    type CampaignFilter,
    type CampaignRow,
} from './sponsoredMeta';
import type { Loadable } from './useSponsoredData';

export interface CampaignsTimelineProps {
    placements: Loadable<SponsoredPlacement[]>;
    spotlights: Loadable<ItemSpotlight[]>;
    /** Campaña recién creada: se resalta y se lleva a la vista. */
    highlightId?: string | null;
    onStartSpotlight: () => void;
}

export const MetricTiles: React.FC<{ metrics: SponsoredMetrics; className?: string }> = ({ metrics, className }) => {
    const tiles = [
        { key: 'views', emoji: '👀', value: formatCount(metrics.impressions), label: metrics.impressions === 1 ? 'vista' : 'vistas' },
        { key: 'clicks', emoji: '👆', value: formatCount(metrics.clicks), label: metrics.clicks === 1 ? 'clic' : 'clics' },
        { key: 'ctr', emoji: '🎯', value: formatCtr(metrics), label: 'CTR' },
    ];
    return (
        <dl className={cn('grid grid-cols-3 gap-2', className)}>
            {tiles.map((tile) => (
                <div key={tile.key} className={cn(kit.inset, 'px-2 py-2 text-center')}>
                    <dt className="text-[11px] font-semibold text-[var(--lt-text-muted)]">
                        <span aria-hidden="true">{tile.emoji} </span>{tile.label}
                    </dt>
                    <dd className="text-base font-black tabular-nums text-[var(--lt-text)]">{tile.value}</dd>
                </div>
            ))}
        </dl>
    );
};

const rowTitle = (row: CampaignRow): { emoji: string; title: string } => {
    if (row.kind === 'spotlight') return { emoji: '🍽️', title: row.spotlight.itemName || 'Plato estrella' };
    const meta = PLACEMENT_TYPE_META[row.placement.type];
    return { emoji: meta.emoji, title: meta.label };
};

const CampaignCard: React.FC<{ row: CampaignRow; today: string; highlighted: boolean }> = ({ row, today, highlighted }) => {
    const ref = useRef<HTMLElement>(null);
    const meta = CAMPAIGN_STATUS_META[row.status];
    const { emoji, title } = rowTitle(row);
    const source = row.kind === 'spotlight' ? row.spotlight : row.placement;
    const dates = formatDateRange(source.startsAt, source.endsAt);
    const progress = row.status === 'active' ? campaignProgress(source.startsAt, source.endsAt, today) : null;
    const showMetrics = row.status === 'active' || row.status === 'ended';

    useEffect(() => {
        if (!highlighted) return;
        ref.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }, [highlighted]);

    return (
        <SoftCard
            as="li"
            ref={ref}
            className={cn('space-y-3 p-4', highlighted && 'ring-2 ring-[var(--lt-accent-border)] ring-offset-2 ring-offset-[var(--lt-bg)]')}
        >
            <div className="flex items-start gap-3">
                <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-glass)] text-xl leading-none">
                    {emoji}
                </span>
                <div className="min-w-0 flex-1">
                    <h4 className="truncate text-base font-black text-[var(--lt-text)]">{title}</h4>
                    {row.kind === 'placement' && row.placement.headline && (
                        <p className="line-clamp-2 break-words text-sm text-[var(--lt-text-muted)]">«{row.placement.headline}»</p>
                    )}
                    {row.kind === 'spotlight' && <p className="text-sm text-[var(--lt-text-muted)]">Plato estrella</p>}
                </div>
                <StatusPill emoji={meta.emoji} label={meta.label} tone={meta.tone} size="sm" />
            </div>

            {row.kind === 'spotlight' && (
                <div className="flex flex-wrap gap-1.5">
                    <StatusPill emoji="📍" label={formatKm(row.spotlight.radiusKm)} size="sm" />
                    {spotlightDays(row.spotlight) && <StatusPill emoji="📅" label={plural(spotlightDays(row.spotlight) as number, 'día')} size="sm" />}
                    <StatusPill emoji="🎟️" label={`×${row.spotlight.units}`} size="sm" />
                    {row.spotlight.impulses ? <StatusPill emoji="⚡" label={formatCount(row.spotlight.impulses)} tone="promo" size="sm" /> : null}
                    {typeof row.spotlight.totalPriceEur === 'number' && row.spotlight.totalPriceEur > 0 && (
                        <StatusPill emoji="💶" label={`${formatEur(row.spotlight.totalPriceEur)} pendientes`} size="sm" />
                    )}
                </div>
            )}

            {row.kind === 'spotlight' && isSpotlightPaused(row.spotlight) && (
                <p className="rounded-xl border border-[var(--lt-warning)]/40 bg-[var(--lt-warning-soft)] px-3 py-2 text-sm font-semibold text-[var(--lt-text)]">
                    <span aria-hidden="true">🚫 </span>{SPOTLIGHT_ITEM_INACTIVE_NOTICE}
                </p>
            )}

            {(dates || progress !== null) && (
                <div className="space-y-1.5">
                    {dates && <p className="text-sm text-[var(--lt-text-muted)]"><span aria-hidden="true">📅 </span>{dates}</p>}
                    {progress !== null && (
                        <div
                            role="progressbar"
                            aria-label="Avance de la campaña"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={progress}
                            className="h-2 overflow-hidden rounded-full bg-[var(--lt-border-strong)]"
                        >
                            <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundImage: 'var(--lt-accent-grad)' }} />
                        </div>
                    )}
                </div>
            )}
            {!dates && row.status === 'requested' && (
                <p className="text-sm text-[var(--lt-text-muted)]"><span aria-hidden="true">🕵️ </span>Un administrador la está revisando.</p>
            )}

            {showMetrics && <MetricTiles metrics={source.metrics} />}

            {source.adminNotes && (
                <p className="rounded-2xl rounded-tl-sm border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-2 text-sm text-[var(--lt-text)]">
                    <span aria-hidden="true">💬 </span>{source.adminNotes}
                </p>
            )}
        </SoftCard>
    );
};

export const CampaignsTimeline: React.FC<CampaignsTimelineProps> = ({ placements, spotlights, highlightId, onStartSpotlight }) => {
    const [filter, setFilter] = useState<CampaignFilter>('all');
    const [today] = useState(() => toDateInput(new Date()));

    const rows = useMemo(() => mergeCampaigns(
        placements.status === 'ready' ? placements.data : [],
        spotlights.status === 'ready' ? spotlights.data : [],
    ), [placements.status, placements.data, spotlights.status, spotlights.data]);

    const loading = placements.status === 'loading' || spotlights.status === 'loading';
    const failed = placements.status === 'error' || spotlights.status === 'error';
    const visible = filter === 'all' ? rows : rows.filter((row) => row.status === filter);

    const filterOptions: ChoiceOption<CampaignFilter>[] = CAMPAIGN_FILTERS.map((entry) => {
        const count = entry.value === 'all' ? rows.length : rows.filter((row) => row.status === entry.value).length;
        return { value: entry.value, emoji: entry.emoji, title: `${entry.label} · ${count}` };
    });

    return (
        <section aria-labelledby="promos-results-title" className="space-y-4">
            <SectionHeader
                as="h3"
                id="promos-results-title"
                emoji="📈"
                title="Resultados"
                help="Tus campañas de portada, mapa y platos estrella, con lo que han conseguido."
            />

            {placements.status === 'error' && <PanelError what="tus campañas de portada y mapa" onRetry={placements.reload} />}
            {spotlights.status === 'error' && <PanelError what="tus platos estrella" onRetry={spotlights.reload} />}

            {loading && (
                <div className="space-y-3" aria-label="Cargando tus campañas">
                    {[0, 1].map((index) => (
                        <div key={index} className="h-28 animate-pulse rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card-strong)]" />
                    ))}
                </div>
            )}

            {!loading && rows.length === 0 && !failed && (
                <SoftCard>
                    <EmptyState
                        emoji="🌱"
                        title="Aún no has lanzado campañas"
                        text="Empieza por un plato estrella: desde 200 m y 1 día."
                        actions={<Button variant="primary" onClick={onStartSpotlight} className="min-h-11">🍽️ Lanzar un plato estrella</Button>}
                    />
                </SoftCard>
            )}

            {!loading && rows.length > 0 && (
                <>
                    <ChoiceCards
                        legend="Filtrar campañas"
                        hideLegend
                        options={filterOptions}
                        value={filter}
                        onChange={setFilter}
                        variant="compact"
                    />
                    {visible.length === 0 ? (
                        <EmptyState size="sm" emoji="🫙" title="Nada con este filtro" />
                    ) : (
                        <ul className="space-y-3">
                            {visible.map((row) => (
                                <CampaignCard key={`${row.kind}-${row.id}`} row={row} today={today} highlighted={row.id === highlightId} />
                            ))}
                        </ul>
                    )}
                </>
            )}
        </section>
    );
};
