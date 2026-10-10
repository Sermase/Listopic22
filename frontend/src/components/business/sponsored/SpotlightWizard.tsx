/**
 * 🍽️ Plato estrella: «① Plato → ② Alcance → ③ Lanzar» (spec §8).
 *
 *   <SpotlightWizard placeId={id} plan={plan} onPlanChange={updatePlan} items={data.items}
 *     spotlights={data.spotlights} wallet={wallet} place={place} requestedItemId={itemParam}
 *     onOpenPacks={openPacks} onLaunched={(result, name) => …} onGoToCarta={goToCarta} />
 *
 * El plan (plato, radio, días, intensidad y paso) vive en el padre, así que no
 * se pierde al cambiar de subpestaña ni al volver de Stripe. Los platos
 * marcados como no disponibles no se pueden elegir. La compra en Stripe (si
 * está abierta) guarda el plan para recuperarlo al volver.
 */
import React, { useMemo, useState } from 'react';
import { Check, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/Button';
import { formatEur } from '../../../config/planBeta';
import { cn } from '../../../lib/utils';
import type { CanonicalPlaceItem } from '../../../services/CanonicalItemService';
import {
    computeSpotlightImpulses,
    impulsesPriceEur,
    requestItemSpotlight,
    spotlightRadiusSteps,
    SPOTLIGHT_RADIUS_STEP_KM,
    type ItemSpotlight,
    type ItemSpotlightRequestResult,
} from '../../../services/BusinessProService';
import {
    businessErrorCopy,
    Disclosure,
    EmojiChip,
    EmptyState,
    foldText,
    kit,
    PanelError,
    SectionHeader,
    SoftCard,
    StatusPill,
    StepperInput,
    TextField,
} from '../kit';
import { ScoreChip } from '../items/menuParts';
import { sectionEmoji, sectionLabel } from '../items/menuVisuals';
import { RadiusRadar } from './RadiusRadar';
import { SponsoredItemCard } from './SponsoredItemCard';
import {
    DURATION_PRESETS,
    formatCount,
    formatKm,
    plural,
    radiusPresetsFor,
    reachLabel,
    type SpotlightPlan,
} from './sponsoredMeta';
import type { ImpulseWallet } from './useImpulseWallet';
import type { Loadable } from './useSponsoredData';
import type { PlacePreview } from './usePlacePreview';

export interface SpotlightWizardProps {
    placeId: string;
    /** Plan ya ajustado a los límites del precio. */
    plan: SpotlightPlan;
    onPlanChange: (updater: (prev: SpotlightPlan) => SpotlightPlan) => void;
    items: Loadable<CanonicalPlaceItem[]>;
    spotlights: Loadable<ItemSpotlight[]>;
    wallet: ImpulseWallet;
    place: PlacePreview;
    /** ?item= de la URL (Carta → «📣 Impulsar»). */
    requestedItemId?: string | null;
    onOpenPacks: () => void;
    onLaunched: (result: ItemSpotlightRequestResult, itemName: string) => void;
    onGoToCarta: () => void;
}

const STEPS: ReadonlyArray<{ step: SpotlightPlan['step']; mark: string; label: string }> = [
    { step: 1, mark: '①', label: 'Plato' },
    { step: 2, mark: '②', label: 'Alcance' },
    { step: 3, mark: '③', label: 'Lanzar' },
];

const readText = (item: CanonicalPlaceItem, key: string): string => {
    const value = (item.businessData || {})[key];
    return typeof value === 'string' ? value.trim() : '';
};

const dishName = (item: CanonicalPlaceItem): string => item.canonicalName || item.id;
const dishGroup = (item: CanonicalPlaceItem): string => readText(item, 'group');
const isUnavailable = (item: CanonicalPlaceItem): boolean => item.status === 'unavailable' || (item.businessData || {}).available === false;
const dishRating = (item: CanonicalPlaceItem): number | null => (typeof item.stats?.averageRating === 'number' ? item.stats.averageRating : null);
const dishReviews = (item: CanonicalPlaceItem): number => (typeof item.stats?.reviewCount === 'number' ? item.stats.reviewCount : 0);

const secondaryButtonClass = 'min-h-11 border-[var(--lt-border-strong)] bg-[var(--lt-glass)] hover:bg-[var(--lt-accent-soft)]';

export const SpotlightWizard: React.FC<SpotlightWizardProps> = ({
    placeId,
    plan,
    onPlanChange,
    items,
    spotlights,
    wallet,
    place,
    requestedItemId,
    onOpenPacks,
    onLaunched,
    onGoToCarta,
}) => {
    const { pricing } = wallet;
    const [query, setQuery] = useState('');
    const [section, setSection] = useState('');
    const [launching, setLaunching] = useState(false);
    const [launchError, setLaunchError] = useState<string | null>(null);

    const selected = items.data.find((row) => row.id === plan.itemId) ?? null;
    const item = selected && !isUnavailable(selected) ? selected : null;
    const requested = requestedItemId ? items.data.find((row) => row.id === requestedItemId) ?? null : null;
    const requestedUnavailable = requested && isUnavailable(requested) ? requested : null;
    // Sin plato válido (ya cargada la carta) se vuelve al paso 1.
    const step: SpotlightPlan['step'] = plan.step !== 1 && items.status === 'ready' && !item ? 1 : plan.step;

    const openItemIds = useMemo(() => new Set(
        spotlights.data.filter((row) => row.status === 'requested' || row.status === 'active').map((row) => row.itemId),
    ), [spotlights.data]);

    const sections = useMemo(() => (
        [...new Set(items.data.map(dishGroup).filter(Boolean))].sort((a, b) => sectionLabel(a).localeCompare(sectionLabel(b), 'es'))
    ), [items.data]);

    const dishes = useMemo(() => {
        const rows = items.data.filter((row) => (!section || dishGroup(row) === section) && (!query.trim() || foldText(dishName(row)).includes(foldText(query))));
        return [...rows].sort((a, b) => Number(isUnavailable(a)) - Number(isUnavailable(b)));
    }, [items.data, section, query]);

    const radiusSteps = spotlightRadiusSteps(pricing, plan.radiusKm);
    const impulses = computeSpotlightImpulses(pricing, plan);
    const valueEur = impulsesPriceEur(pricing, impulses);
    const credits = wallet.credits;
    const missing = credits !== null ? Math.max(0, impulses - credits) : null;
    const topUp = missing ? Math.max(missing, pricing.minPurchaseImpulses) : 0;
    const blockedByBalance = wallet.checkoutEnabled && (missing ?? 0) > 0;
    const radiusPresets = radiusPresetsFor(pricing);
    const durationPresets = DURATION_PRESETS.filter((preset) => preset.days <= pricing.maxDays);

    const setPlan = (patch: Partial<SpotlightPlan>) => {
        onPlanChange((prev) => ({ ...prev, ...patch }));
        setLaunchError(null);
    };
    const go = (next: SpotlightPlan['step']) => {
        if (next > 1 && !item) return;
        setPlan({ step: next });
    };

    const draft = { itemId: plan.itemId, radiusKm: plan.radiusKm, days: plan.days, intensity: plan.intensity };
    const canBuy = wallet.checkoutEnabled && credits !== null && !wallet.awaitingPayment && wallet.buyingKey === null;

    const launch = async () => {
        if (!item || launching || blockedByBalance) return;
        setLaunching(true);
        setLaunchError(null);
        try {
            const result = await requestItemSpotlight({
                placeId,
                itemId: item.id,
                radiusKm: plan.radiusKm,
                days: plan.days,
                intensity: plan.intensity,
            });
            onLaunched(result, dishName(item));
        } catch (error) {
            console.error('SpotlightWizard: request failed', error);
            setLaunchError(businessErrorCopy(error, '😕 No se pudo lanzar el plato estrella.').message);
        } finally {
            setLaunching(false);
        }
    };

    // En el paso ③ el recibo ya enseña el total: en móvil se deja sitio al botón.
    const summary = (
        <p
            className={cn('min-w-0 flex-1 truncate text-sm font-black text-[var(--lt-text)]', step === 3 && 'hidden sm:block')}
            aria-live="polite"
        >
            <span className="text-[var(--lt-promo)]">⚡ {formatCount(impulses)}</span>
            <span className="text-[var(--lt-text-muted)]"> · </span>
            {formatEur(valueEur)}
        </p>
    );

    return (
        <SoftCard as="section" aria-labelledby="promos-spotlight-title" className="space-y-5 p-4 pb-0 sm:p-5 sm:pb-0">
            <SectionHeader
                as="h3"
                id="promos-spotlight-title"
                emoji="🍽️"
                title="Plato estrella"
                help="Tu plato sale en «Platos destacados cerca de ti» a quien esté cerca. Siempre con la etiqueta Patrocinado."
            />

            <ol aria-label="Pasos" className="flex flex-wrap items-center gap-1.5 sm:gap-1">
                {STEPS.map((entry, index) => {
                    const current = entry.step === step;
                    const reachable = entry.step === 1 || Boolean(item);
                    return (
                        <li key={entry.step} className="flex items-center gap-1">
                            <button
                                type="button"
                                aria-current={current ? 'step' : undefined}
                                disabled={!reachable}
                                onClick={() => go(entry.step)}
                                className={cn(
                                    'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:px-3',
                                    kit.focus,
                                    current ? kit.selected : kit.idle,
                                )}
                            >
                                <span aria-hidden="true" className="text-base leading-none">{entry.mark}</span>
                                {entry.label}
                            </button>
                            {index < STEPS.length - 1 && <span aria-hidden="true" className="hidden px-0.5 text-[var(--lt-text-muted)] sm:inline">→</span>}
                        </li>
                    );
                })}
            </ol>

            {step === 1 && (
                <div className="space-y-4">
                    {requestedUnavailable && plan.itemId === requestedUnavailable.id && (
                        <p role="status" className="rounded-xl border border-[var(--lt-warning)]/40 bg-[var(--lt-warning-soft)] px-3 py-2 text-sm font-semibold text-[var(--lt-text)]">
                            <span aria-hidden="true">🚫 </span>«{dishName(requestedUnavailable)}» está como no disponible en tu carta. Márcalo disponible para destacarlo o elige otro.
                        </p>
                    )}
                    {items.status === 'loading' && (
                        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4" aria-label="Cargando tu carta">
                            {[0, 1, 2, 3].map((index) => (
                                <div key={index} className="h-32 animate-pulse rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-glass)]" />
                            ))}
                        </div>
                    )}
                    {items.status === 'error' && <PanelError what="tu carta" onRetry={items.reload} />}
                    {items.status === 'ready' && items.data.length === 0 && (
                        <EmptyState
                            emoji="🍽️"
                            title="Tu carta está vacía"
                            text="Añade tus platos en 📖 Carta y vuelve para destacar el mejor."
                            actions={<Button variant="primary" onClick={onGoToCarta} className="min-h-11">📖 Ir a la carta</Button>}
                        />
                    )}
                    {items.status === 'ready' && items.data.length > 0 && (
                        <>
                            <TextField
                                label="🔎 Busca el plato"
                                type="search"
                                value={query}
                                onChange={setQuery}
                                placeholder="Croquetas, tarta de queso…"
                            />
                            {sections.length > 0 && (
                                <div role="group" aria-label="Filtrar por sección" className="flex flex-wrap gap-2">
                                    <EmojiChip emoji="🍴" label="Todas" size="sm" selected={!section} onToggle={() => setSection('')} />
                                    {sections.map((name) => (
                                        <EmojiChip
                                            key={name}
                                            emoji={sectionEmoji(name)}
                                            label={sectionLabel(name)}
                                            size="sm"
                                            selected={section === name}
                                            onToggle={() => setSection(section === name ? '' : name)}
                                        />
                                    ))}
                                </div>
                            )}
                            {dishes.length === 0 ? (
                                <EmptyState size="sm" emoji="🔍" title="Ningún plato coincide" text="Prueba con otra palabra o quita el filtro." />
                            ) : (
                                <fieldset className="min-w-0">
                                    <legend className="sr-only">Elige el plato que quieres destacar</legend>
                                    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                                        {dishes.map((dish) => {
                                            const unavailable = isUnavailable(dish);
                                            const checked = dish.id === item?.id;
                                            const group = dishGroup(dish);
                                            const price = readText(dish, 'price');
                                            return (
                                                <button
                                                    key={dish.id}
                                                    type="button"
                                                    aria-pressed={checked}
                                                    disabled={unavailable}
                                                    onClick={() => setPlan({ itemId: dish.id })}
                                                    className={cn(
                                                        'relative flex min-h-32 flex-col items-start gap-1.5 rounded-2xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                                                        kit.focus,
                                                        checked ? kit.selected : kit.idle,
                                                    )}
                                                >
                                                    <span aria-hidden="true" className="text-3xl leading-none">{group ? sectionEmoji(group) : '🍽️'}</span>
                                                    <span className="line-clamp-2 break-words text-sm font-bold leading-snug text-[var(--lt-text)]">{dishName(dish)}</span>
                                                    <span className="flex flex-wrap items-center gap-1.5">
                                                        <ScoreChip rating={dishRating(dish)} count={dishReviews(dish)} />
                                                        {price && <span className="text-xs font-semibold text-[var(--lt-text-muted)]">{price}</span>}
                                                    </span>
                                                    {unavailable
                                                        ? <StatusPill emoji="🚫" label="No disponible" size="sm" />
                                                        : openItemIds.has(dish.id) && <StatusPill emoji="✨" label="Ya destacado" tone="promo" size="sm" />}
                                                    {checked && (
                                                        <span aria-hidden="true" className={cn(kit.checkBubble, 'absolute right-2.5 top-2.5')}>
                                                            <Check className="h-3 w-3" strokeWidth={3} />
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </fieldset>
                            )}
                        </>
                    )}
                </div>
            )}

            {step === 2 && (
                <div className="space-y-6">
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <fieldset className="min-w-0 space-y-3">
                            <legend className={kit.label}>📍 ¿Hasta dónde?</legend>
                            <RadiusRadar km={plan.radiusKm} minKm={pricing.minRadiusKm} maxKm={pricing.maxRadiusKm} />
                            <input
                                type="range"
                                min={pricing.minRadiusKm}
                                max={pricing.maxRadiusKm}
                                step={SPOTLIGHT_RADIUS_STEP_KM}
                                value={plan.radiusKm}
                                onChange={(event) => setPlan({ radiusKm: Number(Number(event.target.value).toFixed(1)) })}
                                aria-label="Radio"
                                aria-valuetext={`${formatKm(plan.radiusKm)}, ${reachLabel(plan.radiusKm)}`}
                                className="h-11 w-full cursor-pointer accent-[var(--lt-accent)]"
                            />
                            <div role="group" aria-label="Radios rápidos" className="flex flex-wrap gap-2">
                                {radiusPresets.map((preset) => (
                                    <EmojiChip
                                        key={preset.key}
                                        emoji={preset.emoji}
                                        label={`${preset.label} ${formatKm(preset.km)}`}
                                        size="sm"
                                        selected={plan.radiusKm === preset.km}
                                        onToggle={() => setPlan({ radiusKm: preset.km })}
                                    />
                                ))}
                            </div>
                        </fieldset>

                        <div className="min-w-0 space-y-6">
                            <fieldset className="min-w-0 space-y-3">
                                <legend className={kit.label}>📅 ¿Cuántos días?</legend>
                                <div role="group" aria-label="Duraciones rápidas" className="flex flex-wrap gap-2">
                                    {durationPresets.map((preset) => (
                                        <EmojiChip
                                            key={preset.days}
                                            emoji={preset.emoji}
                                            label={preset.label}
                                            size="sm"
                                            selected={plan.days === preset.days}
                                            onToggle={() => setPlan({ days: preset.days })}
                                        />
                                    ))}
                                </div>
                                <StepperInput
                                    label="Días"
                                    value={plan.days}
                                    min={1}
                                    max={pricing.maxDays}
                                    suffix={plan.days === 1 ? 'día' : 'días'}
                                    onChange={(days) => setPlan({ days })}
                                />
                            </fieldset>

                            <fieldset className="min-w-0 space-y-3">
                                <legend className={kit.label}>🎟️ Papeletas en el sorteo</legend>
                                <div role="group" aria-label="Intensidad" className="flex flex-wrap gap-1.5">
                                    {Array.from({ length: pricing.maxIntensity }, (_, index) => index + 1).map((level) => (
                                        <button
                                            key={level}
                                            type="button"
                                            aria-pressed={plan.intensity === level}
                                            aria-label={`×${level}`}
                                            title={`×${level}`}
                                            onClick={() => setPlan({ intensity: level })}
                                            className={cn(
                                                'grid h-11 w-11 place-items-center rounded-xl border text-xl leading-none transition',
                                                kit.focus,
                                                plan.intensity === level ? kit.selected : 'border-transparent hover:border-[var(--lt-border-strong)]',
                                                level > plan.intensity && 'opacity-35 grayscale',
                                            )}
                                        >
                                            <span aria-hidden="true">🎟️</span>
                                        </button>
                                    ))}
                                </div>
                                <p className="text-sm text-[var(--lt-text-muted)]">
                                    <strong className="text-[var(--lt-text)]">×{plan.intensity} = {plural(plan.intensity, 'papeleta')}</strong> en el sorteo del carrusel.
                                    {' '}Si nadie más compite en tu zona, con ×1 sales siempre.
                                </p>
                            </fieldset>
                        </div>
                    </div>

                    <Disclosure emoji="❓" title="¿Cómo funciona?">
                        <ul className="space-y-2 text-sm text-[var(--lt-text-muted)]">
                            <li><span aria-hidden="true">📍 </span>Te ven quienes están dentro del radio.</li>
                            <li><span aria-hidden="true">🎟️ </span>Más papeletas, más veces en el carrusel frente a otros negocios de la zona.</li>
                            <li><span aria-hidden="true">⚡ </span>1 impulso = 200 m durante 1 día ({formatEur(pricing.pricePerImpulseEur)} cada uno).</li>
                        </ul>
                    </Disclosure>
                </div>
            )}

            {step === 3 && (
                <div className="space-y-5">
                    {items.status === 'error' && !item && <PanelError what="tu carta" onRetry={items.reload} />}
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 flex-1 text-base font-black text-[var(--lt-text)]">
                            <span aria-hidden="true">{item && dishGroup(item) ? sectionEmoji(dishGroup(item)) : '🍽️'} </span>
                            {item ? dishName(item) : items.status === 'loading' ? 'Cargando tu plato…' : 'Elige un plato'}
                        </p>
                        <button
                            type="button"
                            onClick={() => setPlan({ step: 1 })}
                            className={cn('min-h-11 rounded-lg px-2 text-sm font-semibold text-[var(--lt-accent)] underline-offset-4 hover:underline', kit.focus)}
                        >
                            Cambiar plato
                        </button>
                    </div>

                    <div className={cn(kit.inset, 'space-y-1 p-4')} aria-label="Resumen del precio">
                        <p className="text-sm text-[var(--lt-text-muted)]">
                            <span aria-hidden="true">📏 </span>{plural(radiusSteps, 'tramo')} × <span aria-hidden="true">📅 </span>{plural(plan.days, 'día')} × <span aria-hidden="true">🎟️ </span>×{plan.intensity}
                        </p>
                        <p className="text-2xl font-black text-[var(--lt-text)]">
                            = <span className="text-[var(--lt-promo)]">⚡ {formatCount(impulses)}</span> impulsos · {formatEur(valueEur)}
                        </p>
                        <p className="text-xs text-[var(--lt-text-muted)]">
                            {formatKm(plan.radiusKm)} {reachLabel(plan.radiusKm)} · tramos de 200 m
                        </p>
                    </div>

                    <div className="space-y-3" aria-live="polite">
                        {wallet.creditsStatus === 'loading' && (
                            <div className="h-5 w-64 max-w-full animate-pulse rounded-lg bg-[var(--lt-glass)]" aria-label="Cargando tu saldo" />
                        )}
                        {wallet.creditsStatus === 'error' && (
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-[var(--lt-text)]"><span aria-hidden="true">😕 </span>No hemos podido cargar tu saldo.</p>
                                <Button variant="ghost" onClick={wallet.reloadCredits} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />} className="min-h-11 hover:bg-[var(--lt-glass)]">
                                    Reintentar
                                </Button>
                            </div>
                        )}
                        {credits !== null && missing !== null && (
                            <>
                                <p className="text-sm font-semibold text-[var(--lt-text)]">
                                    Tienes <span className="text-[var(--lt-promo)]">⚡ {formatCount(credits)}</span>
                                    {missing === 0 && <> → te quedan <span className="text-[var(--lt-promo)]">⚡ {formatCount(credits - impulses)}</span></>}
                                </p>
                                <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-[var(--lt-border-strong)]">
                                    <div
                                        className={cn('h-full rounded-full', missing > 0 ? 'bg-[var(--lt-warning)]' : 'bg-[var(--lt-promo)]')}
                                        style={{ width: `${credits > 0 ? Math.min(100, Math.round((Math.min(impulses, credits) / credits) * 100)) : 100}%` }}
                                    />
                                </div>
                                {missing > 0 ? (
                                    <div className="space-y-2">
                                        <p className="text-sm font-bold text-[var(--lt-warning)]">
                                            Te faltan ⚡ {formatCount(missing)} ({formatEur(impulsesPriceEur(pricing, missing))})
                                        </p>
                                        {wallet.checkoutEnabled ? (
                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    variant="primary"
                                                    onClick={() => void wallet.buy('missing', { impulses: missing }, draft)}
                                                    disabled={!canBuy}
                                                    leftIcon={wallet.buyingKey === 'missing' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : undefined}
                                                    className="min-h-11"
                                                >
                                                    🪙 Comprar lo que falta
                                                </Button>
                                                <Button variant="secondary" onClick={onOpenPacks} className={secondaryButtonClass}>
                                                    Ver paquetes
                                                </Button>
                                                <p className="basis-full text-xs text-[var(--lt-text-muted)]">
                                                    {topUp > missing
                                                        ? `La compra mínima es de ⚡ ${formatCount(topUp)} (${formatEur(impulsesPriceEur(pricing, topUp))}); lo que sobre se queda en tu saldo.`
                                                        : `Pagas ${formatEur(impulsesPriceEur(pricing, topUp))} en Stripe y vuelves aquí para lanzarlo.`}
                                                </p>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-[var(--lt-text-muted)]">
                                                <span aria-hidden="true">🔜 </span>La compra online llega pronto: puedes lanzarlo igualmente y te confirmaremos el precio de lo que falta antes de activarlo.
                                            </p>
                                        )}
                                        {wallet.buyError && (
                                            <p role="alert" className="rounded-xl bg-[var(--lt-danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--lt-danger)]">{wallet.buyError}</p>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-sm text-[var(--lt-success)]"><span aria-hidden="true">✅ </span>Se descontarán de tu saldo al lanzarlo.</p>
                                )}
                            </>
                        )}
                    </div>

                    <div className="space-y-2">
                        <p className="text-sm font-bold text-[var(--lt-text)]"><span aria-hidden="true">👀 </span>Así saldrá en «Platos destacados cerca de ti»</p>
                        <div className="flex justify-center rounded-2xl border border-dashed border-[var(--lt-border-strong)] bg-[var(--lt-glass)] p-4">
                            <SponsoredItemCard
                                itemName={item ? dishName(item) : 'Tu plato'}
                                placeName={place.name}
                                photoUrl={place.photoUrl}
                                averageRating={item ? dishRating(item) : null}
                                reviewCount={item ? dishReviews(item) : 0}
                            />
                        </div>
                    </div>

                    {launchError && (
                        <p role="alert" className="rounded-xl bg-[var(--lt-danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--lt-danger)]">{launchError}</p>
                    )}
                </div>
            )}

            <div className="sticky bottom-0 z-20 -mx-4 border-t border-[var(--lt-border)] bg-[var(--lt-card-strong)]/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-xl sm:-mx-5 sm:rounded-b-2xl sm:px-5">
                <div className="flex items-center gap-2">
                    {step > 1 && (
                        <Button variant="ghost" onClick={() => setPlan({ step: (step - 1) as SpotlightPlan['step'] })} className="min-h-11 shrink-0 px-3 hover:bg-[var(--lt-glass)]">
                            ← Atrás
                        </Button>
                    )}
                    {summary}
                    {step < 3 ? (
                        <Button
                            variant="primary"
                            onClick={() => go((step + 1) as SpotlightPlan['step'])}
                            disabled={!item}
                            title={!item ? 'Elige primero un plato' : undefined}
                            className="min-h-11 shrink-0"
                        >
                            Siguiente →
                        </Button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => void launch()}
                            disabled={!item || launching || blockedByBalance}
                            title={blockedByBalance ? 'Te faltan impulsos' : undefined}
                            style={{ backgroundImage: 'var(--lt-accent-grad)' }}
                            className={cn(
                                'ml-auto inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black text-white sm:flex-none shadow-lg shadow-[var(--lt-accent-shadow)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55',
                                kit.focus,
                            )}
                        >
                            {launching && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                            ✨ Lanzar plato estrella
                        </button>
                    )}
                </div>
            </div>
        </SoftCard>
    );
};
