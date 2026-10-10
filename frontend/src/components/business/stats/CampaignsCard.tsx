/**
 * 📣 ¿Funcionan tus campañas? (spec §9.8): veces vista, clics y % de clics de
 * tus campañas en marcha o terminadas, y una fila por campaña. Sin campañas,
 * solo una invitación discreta a Promos.
 */
import React from 'react';
import { cn } from '../../../lib/utils';
import { kit, PanelError, SoftCard, StatusPill } from '../kit';
import {
    CAMPAIGN_STATUS_META,
    formatCount,
    formatCtr,
    formatDateRange,
    isSpotlightPaused,
    PLACEMENT_TYPE_META,
    SPOTLIGHT_ITEM_INACTIVE_NOTICE,
    type CampaignRow,
} from '../sponsored/sponsoredMeta';
import type { SponsoredMetrics } from '../../../services/BusinessProService';
import { CAMPAIGN_ROWS_LIMIT } from './statsMeta';
import type { CampaignSummary } from './statsModel';
import { CardSkeleton, secondaryActionClass, StatsCard } from './statsParts';
import type { StatsLoadStatus } from './useStatsData';

export interface CampaignsCardProps {
    status: StatsLoadStatus;
    data: CampaignSummary | null;
    onRetry: () => void;
    onGoToPromos: () => void;
    busy?: boolean;
    className?: string;
}

const rowTitle = (row: CampaignRow): { emoji: string; title: string } => {
    if (row.kind === 'spotlight') return { emoji: '🍽️', title: row.spotlight.itemName || 'Plato estrella' };
    const meta = PLACEMENT_TYPE_META[row.placement.type];
    return { emoji: meta.emoji, title: meta.label };
};

const MetricTiles: React.FC<{ metrics: SponsoredMetrics }> = ({ metrics }) => {
    const tiles = [
        { key: 'views', emoji: '👁️', label: 'Veces vista', value: formatCount(metrics.impressions) },
        { key: 'clicks', emoji: '👆', label: 'Clics', value: formatCount(metrics.clicks) },
        { key: 'ctr', emoji: '🎯', label: '% de clics', value: formatCtr(metrics) },
    ];
    return (
        <dl className="grid grid-cols-3 gap-2 sm:gap-3">
            {tiles.map((tile) => (
                <div key={tile.key} className={cn(kit.inset, 'min-w-0 px-2 py-3 text-center')}>
                    <dt className="text-xs font-semibold text-[var(--lt-text-muted)]">
                        <span aria-hidden="true" className="block text-xl leading-none">{tile.emoji}</span>
                        <span className="mt-1 block">{tile.label}</span>
                    </dt>
                    <dd className="mt-1 text-xl font-black text-[var(--lt-text)] sm:text-2xl">{tile.value}</dd>
                </div>
            ))}
        </dl>
    );
};

const CampaignLine: React.FC<{ row: CampaignRow }> = ({ row }) => {
    const { emoji, title } = rowTitle(row);
    const source = row.kind === 'spotlight' ? row.spotlight : row.placement;
    const dates = formatDateRange(source.startsAt, source.endsAt);
    const measured = row.status === 'active' || row.status === 'ended';
    return (
        <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--lt-border)] py-2.5">
            <span aria-hidden="true" className="text-lg leading-none">{emoji}</span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-[var(--lt-text)]">{title}</span>
                {dates && <span className="block text-xs text-[var(--lt-text-muted)]">{dates}</span>}
                {row.kind === 'spotlight' && isSpotlightPaused(row.spotlight) && (
                    <span className="block text-xs font-semibold text-[var(--lt-warning)]">
                        <span aria-hidden="true">🚫 </span>{SPOTLIGHT_ITEM_INACTIVE_NOTICE}
                    </span>
                )}
            </span>
            <StatusPill size="sm" {...CAMPAIGN_STATUS_META[row.status]} />
            {measured && (
                <span className="basis-full text-xs text-[var(--lt-text-muted)] sm:basis-auto">
                    <span aria-hidden="true">👁️ </span>{formatCount(source.metrics.impressions)} vistas
                    {' · '}
                    <span aria-hidden="true">👆 </span>{formatCount(source.metrics.clicks)} clics
                    {' · '}
                    <span aria-hidden="true">🎯 </span>{formatCtr(source.metrics)}
                </span>
            )}
        </li>
    );
};

export const CampaignsCard: React.FC<CampaignsCardProps> = ({ status, data, onRetry, onGoToPromos, busy, className }) => {
    if (status === 'ready' && data && data.rows.length === 0) {
        return (
            <SoftCard as="aside" aria-label="Campañas" className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:items-center', className)}>
                <p className="min-w-0 flex-1 text-sm text-[var(--lt-text-muted)]">
                    <span aria-hidden="true">📣 </span>
                    <strong className="font-bold text-[var(--lt-text)]">¿Quieres que te vean más?</strong>
                    {' '}Destaca un plato o sal en la portada. Aquí verás cómo funciona.
                </p>
                <button type="button" onClick={onGoToPromos} className={cn(secondaryActionClass, 'shrink-0')}>
                    Ir a Promos
                </button>
            </SoftCard>
        );
    }

    let body: React.ReactNode;
    if (status === 'error') {
        body = <PanelError what="tus campañas" onRetry={onRetry} />;
    } else if (status === 'loading' || !data) {
        body = <CardSkeleton lines={3} label="Cargando tus campañas…" />;
    } else {
        const shown = data.rows.slice(0, CAMPAIGN_ROWS_LIMIT);
        body = (
            <>
                <MetricTiles metrics={data.totals} />
                <ul aria-label="Tus campañas">
                    {shown.map((row) => <CampaignLine key={`${row.kind}-${row.id}`} row={row} />)}
                </ul>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-[var(--lt-text-muted)]">Desde que empezó cada campaña. Las que están en revisión aún no suman.</p>
                    <button type="button" onClick={onGoToPromos} className={secondaryActionClass}>
                        <span aria-hidden="true">📈</span>
                        {data.rows.length > shown.length ? `Ver las ${data.rows.length} en Promos` : 'Ver en Promos'}
                    </button>
                </div>
            </>
        );
    }

    return (
        <StatsCard emoji="📣" title="¿Funcionan tus campañas?" help="Lo que consiguen tus anuncios en Listopic." busy={busy} className={className}>
            {body}
        </StatsCard>
    );
};
