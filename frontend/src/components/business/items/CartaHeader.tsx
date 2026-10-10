/**
 * Cabecera de «Tu carta» (spec §7.1): progreso medio de los platos con nivel,
 * pills de resumen, «＋ Añadir plato», «🕓 Historial» y Editar | Vista pública.
 *
 *   <CartaHeader placeId={id} loaded items={items} sections={names}
 *     reviewedNoAllergens={set} pendingProposals={2} view={view} onViewChange={setView}
 *     onAddItem={openNew} onOpenHistory={openHistory} onJumpToUnsectioned={scrollToBucket} />
 */
import React, { useMemo } from 'react';
import { Button, Tabs } from '../../ui';
import { useToast } from '../../../context/ToastContext';
import type { CanonicalPlaceItem } from '../../../services/CanonicalItemService';
import { cn } from '../../../lib/utils';
import { kit, ProgressMeter, SectionHeader, useCelebrateOnce } from '../kit';
import { isUnsectioned, itemBusinessDataFrom } from './menuModel';
import { CARTA_CHECKS, cartaLevel, itemCompletion, type CartaCheckKey } from './menuVisuals';

export type CartaView = 'edit' | 'public';

const platos = (n: number) => (n === 1 ? 'plato' : 'platos');

const NEXT_STEP: Record<CartaCheckKey, (n: number) => string> = {
    section: (n) => `📂 Coloca ${n} ${platos(n)} en su sección`,
    price: (n) => `💶 Ponle precio a ${n} ${platos(n)}`,
    description: (n) => `📝 Describe ${n} ${platos(n)}: ayuda a decidir`,
    allergens: (n) => `⚠️ Marca los alérgenos de ${n} ${platos(n)}`,
    ingredients: (n) => `🥕 Añade ingredientes a ${n} ${platos(n)}`,
};

const StatPill: React.FC<{ emoji: string; children: React.ReactNode; tone?: 'neutral' | 'warning'; onClick?: () => void }> = ({ emoji, children, tone = 'neutral', onClick }) => {
    const className = cn(
        'inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-semibold',
        tone === 'warning'
            ? 'border-[var(--lt-warning)]/40 bg-[var(--lt-warning-soft)] text-[var(--lt-text)]'
            : 'border-[var(--lt-border)] bg-[var(--lt-glass)] text-[var(--lt-text)]',
    );
    const content = (
        <>
            <span aria-hidden="true">{emoji}</span>
            {children}
        </>
    );
    if (!onClick) return <li className={className}>{content}</li>;
    return (
        <li className="shrink-0">
            <button type="button" onClick={onClick} className={cn(className, 'min-h-11', kit.focus)}>{content}</button>
        </li>
    );
};

export interface CartaHeaderProps {
    placeId: string;
    /** Platos y secciones leídos: hasta entonces no hay progreso ni pills (ni confeti). */
    loaded: boolean;
    items: CanonicalPlaceItem[];
    sections: string[];
    reviewedNoAllergens: ReadonlySet<string>;
    pendingProposals: number;
    view: CartaView;
    onViewChange: (view: CartaView) => void;
    onAddItem: () => void;
    onOpenHistory: () => void;
    onJumpToUnsectioned: () => void;
}

export const CartaHeader: React.FC<CartaHeaderProps> = ({
    placeId,
    loaded,
    items,
    sections,
    reviewedNoAllergens,
    pendingProposals,
    view,
    onViewChange,
    onAddItem,
    onOpenHistory,
    onJumpToUnsectioned,
}) => {
    const { showToast } = useToast();
    const summary = useMemo(() => {
        const missing: Record<CartaCheckKey, number> = { section: 0, price: 0, description: 0, allergens: 0, ingredients: 0 };
        let percentTotal = 0;
        let withPrice = 0;
        let withAllergens = 0;
        let soldOut = 0;
        let unsectioned = 0;
        items.forEach((item) => {
            const data = itemBusinessDataFrom(item);
            const completion = itemCompletion(data, { sections, reviewedNoAllergens: reviewedNoAllergens.has(item.id) });
            percentTotal += completion.percent;
            CARTA_CHECKS.forEach((check) => { if (!completion.checks[check.key]) missing[check.key] += 1; });
            if (data.price.trim()) withPrice += 1;
            if (data.allergens.length > 0) withAllergens += 1;
            if (!data.available) soldOut += 1;
            if (isUnsectioned(item, sections)) unsectioned += 1;
        });
        const percent = items.length ? Math.round(percentTotal / items.length) : 0;
        // Lo que más falta, en el orden de las comprobaciones.
        const next = CARTA_CHECKS.reduce<CartaCheckKey | null>((best, check) => (
            missing[check.key] > 0 && (best === null || missing[check.key] > missing[best]) ? check.key : best
        ), null);
        return { missing, percent, withPrice, withAllergens, soldOut, unsectioned, next };
    }, [items, sections, reviewedNoAllergens]);

    useCelebrateOnce(`carta:${placeId}`, loaded && items.length > 0 && summary.percent === 100, () => showToast({
        variant: 'success',
        title: '⭐ ¡Carta de estrella!',
        message: 'Todos tus platos tienen sección, precio, descripción, alérgenos e ingredientes.',
    }));

    return (
        <div className="space-y-4">
            <SectionHeader
                emoji="📖"
                title="Tu carta"
                help="Ordena tus platos, ponles precio y alérgenos. Lo que ves aquí es lo que verá la gente."
            />

            {loaded && items.length > 0 && (
                <ProgressMeter
                    value={summary.percent}
                    title={`🎯 Tu carta está al ${summary.percent} %`}
                    level={cartaLevel(summary.percent)}
                    dots={CARTA_CHECKS.map((check) => ({ emoji: check.emoji, label: check.label, done: summary.missing[check.key] === 0 }))}
                    next={summary.next ? NEXT_STEP[summary.next](summary.missing[summary.next]) : undefined}
                />
            )}

            {loaded && items.length > 0 && (
                <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Resumen de la carta">
                    <StatPill emoji="🍽️">{items.length} {platos(items.length)}</StatPill>
                    <StatPill emoji="💶">{summary.withPrice} con precio</StatPill>
                    <StatPill emoji="⚠️">{summary.withAllergens} con alérgenos</StatPill>
                    {summary.soldOut > 0 && <StatPill emoji="🚫">{summary.soldOut} {summary.soldOut === 1 ? 'agotado' : 'agotados'}</StatPill>}
                    {summary.unsectioned > 0 && (
                        <StatPill emoji="📦" tone="warning" onClick={onJumpToUnsectioned}>{summary.unsectioned} sin sección</StatPill>
                    )}
                </ul>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <Button onClick={onAddItem} className="min-h-11">＋ Añadir plato</Button>
                <Button
                    variant="secondary"
                    onClick={onOpenHistory}
                    className="min-h-11 border-[var(--lt-border-strong)] bg-[var(--lt-glass)] hover:bg-[var(--lt-accent-soft)]"
                    aria-label={pendingProposals > 0 ? `Historial de propuestas, ${pendingProposals} pendientes` : 'Historial de propuestas'}
                >
                    🕓 Historial
                    {pendingProposals > 0 && (
                        <span aria-hidden="true" className="rounded-full bg-[var(--lt-warning-soft)] px-1.5 text-xs font-black tabular-nums text-[var(--lt-warning)]">
                            {pendingProposals}
                        </span>
                    )}
                </Button>
                <Tabs
                    size="lg"
                    value={view}
                    onChange={onViewChange}
                    ariaLabel="Vista de la carta"
                    className="ml-auto xl:hidden"
                    options={[
                        { value: 'edit', label: '✏️ Editar' },
                        { value: 'public', label: '👀 Vista pública' },
                    ]}
                />
            </div>
        </div>
    );
};
