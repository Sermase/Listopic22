/**
 * 📤 ¿Cómo te comparten? (spec §9.7): por dónde (💚 WhatsApp, 🔗 enlace…) y
 * qué comparten (📍 tu ficha, 🍽️ un plato…), como pegatinas con su número.
 */
import React from 'react';
import { cn } from '../../../lib/utils';
import { EmptyState, kit, PanelError } from '../kit';
import { formatCount } from '../sponsored/sponsoredMeta';
import {
    metaFor,
    SHARE_CHANNEL_META,
    SHARE_CHANNEL_ORDER,
    SHARE_ENTITY_META,
    SHARE_ENTITY_ORDER,
} from './statsMeta';
import type { TrafficSummary } from './statsModel';
import { CardSkeleton, StatsCard } from './statsParts';
import type { StatsLoadStatus } from './useStatsData';

export interface SharesCardProps {
    status: StatsLoadStatus;
    summary: TrafficSummary | null;
    onRetry: () => void;
    busy?: boolean;
    className?: string;
}

/** Conocidas en su orden, luego las demás; de más a menos y sin ceros. */
const chipsFor = (map: Record<string, number>, order: readonly string[]): string[] => {
    const keys = Object.keys(map).filter((key) => map[key] > 0);
    const rank = (key: string) => {
        const index = order.indexOf(key);
        return index < 0 ? order.length : index;
    };
    return keys.sort((a, b) => (map[b] - map[a]) || (rank(a) - rank(b)));
};

const ChipList: React.FC<{ title: string; map: Record<string, number>; order: readonly string[]; meta: Record<string, { emoji: string; label: string }> }> = ({ title, map, order, meta }) => {
    const keys = chipsFor(map, order);
    if (keys.length === 0) return null;
    return (
        <div className="space-y-2">
            <h4 className="text-sm font-semibold text-[var(--lt-text)]">{title}</h4>
            <ul className="flex flex-wrap gap-2">
                {keys.map((key) => {
                    const entry = metaFor(meta, key);
                    return (
                        <li key={key} className={cn(kit.inset, 'inline-flex min-h-11 items-center gap-2 px-3 text-sm text-[var(--lt-text)]')}>
                            <span aria-hidden="true" className="text-lg leading-none">{entry.emoji}</span>
                            <span className="font-semibold">{entry.label}</span>
                            <strong className="font-black">{formatCount(map[key])}</strong>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

export const SharesCard: React.FC<SharesCardProps> = ({ status, summary, onRetry, busy, className }) => {
    let body: React.ReactNode;
    if (status === 'error') {
        body = <PanelError what="cuántas veces te comparten" onRetry={onRetry} />;
    } else if (status === 'loading' || !summary) {
        body = <CardSkeleton lines={3} label="Cargando cómo te comparten…" />;
    } else if (summary.shares === 0) {
        body = (
            <EmptyState
                as="h4"
                size="sm"
                emoji="📤"
                title="Nadie te ha compartido en estos días."
                text="Cuando alguien mande tu ficha o un plato por WhatsApp o copie el enlace, lo verás aquí."
            />
        );
    } else {
        body = (
            <>
                <ChipList title="Por dónde" map={summary.byShareChannel} order={SHARE_CHANNEL_ORDER} meta={SHARE_CHANNEL_META} />
                <ChipList title="Qué comparten" map={summary.byShareEntityType} order={SHARE_ENTITY_ORDER} meta={SHARE_ENTITY_META} />
            </>
        );
    }
    return (
        <StatsCard emoji="📤" title="¿Cómo te comparten?" help="Tu ficha, tus platos y sus valoraciones." busy={busy} className={className}>
            {body}
        </StatsCard>
    );
};
