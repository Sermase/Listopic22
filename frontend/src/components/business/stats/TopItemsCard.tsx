/**
 * 🏆 Tus estrellas de la carta (spec §9.6): podio 🥇🥈🥉 por mejor nota (al
 * menos 3 valoraciones, desde «😍 Muy bueno») o por más valorados, los puestos
 * 4 y 5, y los platos con margen de mejora (llevan a la Carta).
 *
 * T5: la nota de cada plato va con el color de su tramo. T6: las cifras de un
 * plato cuentan todas sus valoraciones (también las no públicas), y se dice.
 */
import React, { useState } from 'react';
import type { CanonicalPlaceItem } from '../../../services/CanonicalItemService';
import { cn } from '../../../lib/utils';
import { ChoiceCards, EmptyState, kit, PanelError, type ChoiceOption } from '../kit';
import { formatCount } from '../sponsored/sponsoredMeta';
import { IMPROVE_ITEMS_LIMIT, MIN_RATINGS_FOR_STAR, TOP_ITEMS_LIMIT } from './statsMeta';
import { itemsToImprove, topItemsByCount, topItemsByScore, type RankedItem } from './statsModel';
import { CardSkeleton, ScoreChip, secondaryActionClass, StatsCard } from './statsParts';
import type { StatsLoadStatus } from './useStatsData';

type RankMode = 'score' | 'count';

const MODE_OPTIONS: ChoiceOption<RankMode>[] = [
    { value: 'score', emoji: '⭐', title: `Mejor nota (≥${MIN_RATINGS_FOR_STAR})` },
    { value: 'count', emoji: '📝', title: 'Más valorados' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

export interface TopItemsCardProps {
    status: StatsLoadStatus;
    items: CanonicalPlaceItem[] | null;
    onRetry: () => void;
    /** «✏️ Mejorar su ficha» y «Ir a tu carta». */
    onGoToCarta: (itemId?: string) => void;
    busy?: boolean;
    className?: string;
}

const Counts: React.FC<{ item: RankedItem; className?: string }> = ({ item, className }) => (
    <span className={cn('text-xs text-[var(--lt-text-muted)]', className)}>
        <span aria-hidden="true">📝 </span>
        <span className="sr-only">Valoraciones: </span>
        {formatCount(item.reviews)}
        {' · '}
        <span aria-hidden="true">📸 </span>
        <span className="sr-only">Fotos: </span>
        {formatCount(item.photos)}
    </span>
);

const Podium: React.FC<{ items: RankedItem[] }> = ({ items }) => (
    <ol aria-label="Podio" className="grid grid-cols-3 gap-2">
        {items.slice(0, 3).map((item, index) => (
            <li
                key={item.id}
                className={cn(
                    kit.inset,
                    'flex min-w-0 flex-col items-center gap-1.5 px-2 py-3 text-center',
                    index === 0 && 'border-[var(--lt-accent-border)]',
                )}
            >
                <span aria-hidden="true" className="text-3xl leading-none">{MEDALS[index]}</span>
                <span className="sr-only">{`Puesto ${index + 1}: `}</span>
                <span className="line-clamp-2 w-full break-words text-sm font-bold leading-snug text-[var(--lt-text)]">{item.name}</span>
                {item.average !== null && <ScoreChip score={item.average} size="md" />}
                <Counts item={item} />
            </li>
        ))}
    </ol>
);

const CompactRow: React.FC<{ item: RankedItem; position: number }> = ({ item, position }) => (
    <li className="flex min-h-11 items-center gap-3 border-t border-[var(--lt-border)] py-2">
        <span className="w-5 shrink-0 text-right text-sm font-black tabular-nums text-[var(--lt-text-muted)]">{position}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--lt-text)]">{item.name}</span>
        <Counts item={item} className="shrink-0" />
        {item.average !== null ? <ScoreChip score={item.average} /> : <span className="w-8 shrink-0" />}
    </li>
);

export const TopItemsCard: React.FC<TopItemsCardProps> = ({ status, items, onRetry, onGoToCarta, busy, className }) => {
    const [chosenMode, setChosenMode] = useState<RankMode | null>(null);

    let body: React.ReactNode;
    if (status === 'error') {
        body = <PanelError what="los platos de tu carta" onRetry={onRetry} />;
    } else if (status === 'loading' || !items) {
        body = <CardSkeleton lines={4} label="Cargando tus platos…" />;
    } else {
        const byScore = topItemsByScore(items, TOP_ITEMS_LIMIT);
        const byCount = topItemsByCount(items, TOP_ITEMS_LIMIT);
        const mode: RankMode = chosenMode ?? (byScore.length > 0 ? 'score' : 'count');
        const ranked = mode === 'score' ? byScore : byCount;
        const improve = itemsToImprove(items, new Set(byScore.map((item) => item.id)), IMPROVE_ITEMS_LIMIT);

        if (byCount.length === 0) {
            body = (
                <EmptyState
                    as="h4"
                    size="sm"
                    emoji="🍽️"
                    title="Aún no hay platos valorados."
                    text="Cuando valoren tus platos, verás aquí los favoritos."
                    actions={(
                        <button type="button" onClick={() => onGoToCarta()} className={secondaryActionClass}>
                            <span aria-hidden="true">📖</span>
                            Ir a tu carta
                        </button>
                    )}
                />
            );
        } else {
            body = (
                <>
                    <ChoiceCards
                        legend="Ordenar platos por"
                        hideLegend
                        variant="compact"
                        options={MODE_OPTIONS}
                        value={mode}
                        onChange={setChosenMode}
                    />

                    {ranked.length === 0 ? (
                        <p className="text-sm text-[var(--lt-text-muted)]">
                            <span aria-hidden="true">🌱 </span>
                            Aún ningún plato tiene {MIN_RATINGS_FOR_STAR} valoraciones o más con nota de «Muy bueno» para arriba. Mira los más valorados.
                        </p>
                    ) : (
                        <div>
                            <Podium items={ranked} />
                            {ranked.length > 3 && (
                                <ol start={4} aria-label="Siguientes puestos" className="mt-3">
                                    {ranked.slice(3).map((item, index) => <CompactRow key={item.id} item={item} position={index + 4} />)}
                                </ol>
                            )}
                        </div>
                    )}

                    {improve.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-[var(--lt-text)]">
                                <span aria-hidden="true">🌱 </span>Con margen de mejora
                            </h4>
                            <ul className="space-y-2">
                                {improve.map((item) => (
                                    <li key={item.id} className={cn(kit.inset, 'flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:gap-3')}>
                                        <span className="flex min-w-0 flex-1 items-center gap-2">
                                            <span className="min-w-0 flex-1 break-words text-sm font-semibold text-[var(--lt-text)]">{item.name}</span>
                                            {item.average !== null && <ScoreChip score={item.average} />}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => onGoToCarta(item.id)}
                                            className={cn('-ml-1 min-h-11 self-start rounded-lg px-1 text-sm font-bold text-[var(--lt-accent)] sm:ml-0 sm:self-auto sm:px-2', kit.focus)}
                                        >
                                            <span aria-hidden="true">✏️ </span>Mejorar su ficha
                                            <span className="sr-only">{`: ${item.name}`}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <p className="text-xs text-[var(--lt-text-muted)]">
                        <span aria-hidden="true">ℹ️ </span>
                        La nota y las cifras de cada plato cuentan todas sus valoraciones, también las que no son públicas, así que pueden no cuadrar con tu nota en Listopic.
                    </p>
                </>
            );
        }
    }

    return (
        <StatsCard emoji="🏆" title="Tus estrellas de la carta" help="Los platos que más gustan." busy={busy} className={className}>
            {body}
        </StatsCard>
    );
};
