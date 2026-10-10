/**
 * 🧭 ¿Cómo te encuentran? (spec §9.4): de dónde llegan las visitas, con qué
 * aparato y cuántas son de gente con cuenta de Listopic.
 */
import React from 'react';
import { cn } from '../../../lib/utils';
import { EmptyState, kit, PanelError } from '../kit';
import { formatCount } from '../sponsored/sponsoredMeta';
import { EmojiBarList, type EmojiBarRow } from './EmojiBarList';
import { DEVICE_META, DEVICE_ORDER, metaFor, SOURCE_META, SOURCE_ORDER } from './statsMeta';
import { formatPercent, percentOf, type TrafficSummary } from './statsModel';
import { CardSkeleton, StatsCard } from './statsParts';
import type { StatsLoadStatus } from './useStatsData';

export interface SourcesCardProps {
    status: StatsLoadStatus;
    summary: TrafficSummary | null;
    onRetry: () => void;
    busy?: boolean;
    className?: string;
}

/** Claves conocidas en su orden y, detrás, las que no conocemos (con su nombre tal cual). */
const orderedKeys = (map: Record<string, number>, order: readonly string[]): string[] => [
    ...order.filter((key) => (map[key] || 0) > 0),
    ...Object.keys(map).filter((key) => !order.includes(key) && map[key] > 0),
];

const AudienceBar: React.FC<{ members: number; guests: number }> = ({ members, guests }) => {
    const total = members + guests;
    if (total === 0) return null;
    const membersPct = percentOf(members, total);
    const legend = [
        { key: 'members', emoji: '🙋', label: 'Usuarios de Listopic', value: members, swatch: 'bg-[var(--lt-accent)]' },
        { key: 'guests', emoji: '👤', label: 'Visitantes sin cuenta', value: guests, swatch: 'bg-[var(--lt-text-muted)]' },
    ];
    return (
        <div className="space-y-2">
            <h4 className="text-sm font-semibold text-[var(--lt-text)]">¿Tienen cuenta?</h4>
            <div aria-hidden="true" className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
                {members > 0 && <span className="block h-full min-w-1.5 bg-[var(--lt-accent)]" style={{ flexGrow: members, flexBasis: 0 }} />}
                {guests > 0 && <span className="block h-full min-w-1.5 bg-[var(--lt-text-muted)] opacity-60" style={{ flexGrow: guests, flexBasis: 0 }} />}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {legend.map((entry) => (
                    <li key={entry.key} className="inline-flex items-center gap-1.5 text-[var(--lt-text)]">
                        <span aria-hidden="true" className={cn('h-2.5 w-2.5 shrink-0 rounded-full', entry.swatch, entry.key === 'guests' && 'opacity-60')} />
                        <span><span aria-hidden="true">{entry.emoji} </span>{entry.label}</span>
                        <strong className="font-black">{formatPercent(entry.key === 'members' ? membersPct : 100 - membersPct)}</strong>
                        <span className="text-[var(--lt-text-muted)]">({formatCount(entry.value)})</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export const SourcesCard: React.FC<SourcesCardProps> = ({ status, summary, onRetry, busy, className }) => {
    let body: React.ReactNode;
    if (status === 'error') {
        body = <PanelError what="de dónde llegan tus visitas" onRetry={onRetry} />;
    } else if (status === 'loading' || !summary) {
        body = <CardSkeleton lines={4} label="Cargando de dónde llegan tus visitas…" />;
    } else if (summary.views === 0) {
        body = <EmptyState as="h4" size="sm" emoji="🧭" title="Cuando te visiten, verás aquí de dónde llegan." />;
    } else {
        const sources: EmojiBarRow[] = orderedKeys(summary.bySource, SOURCE_ORDER).map((key) => ({
            key, ...metaFor(SOURCE_META, key), value: summary.bySource[key],
        }));
        const devices = orderedKeys(summary.byDevice, DEVICE_ORDER);
        const deviceTotal = devices.reduce((sum, key) => sum + summary.byDevice[key], 0);
        body = (
            <>
                {sources.length > 0 && <EmojiBarList ariaLabel="De dónde llegan las visitas" rows={sources} />}
                {devices.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-[var(--lt-text)]">Con qué te miran</h4>
                        <ul className="flex flex-wrap gap-2">
                            {devices.map((key) => {
                                const meta = metaFor(DEVICE_META, key);
                                return (
                                    <li key={key} className={cn(kit.inset, 'inline-flex min-h-11 items-center gap-2 px-3 text-sm text-[var(--lt-text)]')}>
                                        <span aria-hidden="true" className="text-lg leading-none">{meta.emoji}</span>
                                        <span className="font-semibold">{meta.label}</span>
                                        <strong className="font-black">{formatPercent(percentOf(summary.byDevice[key], deviceTotal))}</strong>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
                <AudienceBar members={summary.authViews} guests={summary.anonViews} />
            </>
        );
    }
    return (
        <StatsCard emoji="🧭" title="¿Cómo te encuentran?" help="De dónde llega la gente a tu ficha." busy={busy} className={className}>
            {body}
        </StatsCard>
    );
};
