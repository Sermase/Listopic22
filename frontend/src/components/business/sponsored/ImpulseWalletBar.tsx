/**
 * El monedero de impulsos ⚡ (la única tarjeta con tinte promo de 📣 Promos):
 * saldo, cuántos días de plato estrella dan, «🪙 Recargar», el aviso de pago
 * pendiente de Stripe y los contadores de ofertas y campañas.
 *
 *   <ImpulseWalletBar wallet={wallet} counters={{ liveOffers: 3, running: 1, inReview: 2 }}
 *     onRecharge={() => setPacksOpen(true)} />
 *
 * Un contador en null (cargando o con error) no se pinta: nunca un 0 falso.
 */
import React from 'react';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '../../ui/Button';
import { cn } from '../../../lib/utils';
import { kit, SoftCard, StatusPill } from '../kit';
import { daysAtRadius, formatCount, formatKm, plural, REFERENCE_RADIUS_KM } from './sponsoredMeta';
import type { ImpulseWallet } from './useImpulseWallet';

export interface WalletCounters {
    liveOffers: number | null;
    running: number | null;
    inReview: number | null;
}

export interface ImpulseWalletBarProps {
    wallet: ImpulseWallet;
    counters: WalletCounters;
    onRecharge: () => void;
    className?: string;
}

const noticeToneClass = {
    success: 'text-[var(--lt-success)]',
    neutral: 'text-[var(--lt-text)]',
    warning: 'text-[var(--lt-warning)]',
} as const;

export const ImpulseWalletBar: React.FC<ImpulseWalletBarProps> = ({ wallet, counters, onRecharge, className }) => {
    const { credits, creditsStatus, pricing, awaitingPayment, notice } = wallet;
    const days = credits !== null ? daysAtRadius(pricing, credits) : 0;

    const counterItems = [
        counters.liveOffers !== null && { key: 'offers', emoji: '🎁', text: `${plural(counters.liveOffers, 'oferta')} en vivo` },
        counters.running !== null && { key: 'running', emoji: '🟢', text: `${plural(counters.running, 'campaña')} en marcha` },
        counters.inReview !== null && { key: 'review', emoji: '⏳', text: `${formatCount(counters.inReview)} en revisión` },
    ].filter(Boolean) as Array<{ key: string; emoji: string; text: string }>;

    return (
        <SoftCard as="section" tone="promo" aria-label="Tu monedero de impulsos" className={cn('space-y-3 p-4 sm:p-5', className)}>
            <div className="flex flex-wrap items-center gap-3">
                <span aria-hidden="true" className="hidden h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[var(--lt-promo)]/30 bg-[var(--lt-card-strong)] text-2xl leading-none sm:grid">
                    ⚡
                </span>
                <div className="min-w-0 flex-1" aria-live="polite">
                    {creditsStatus === 'ready' && credits !== null ? (
                        <>
                            <p className="text-xl font-black leading-tight text-[var(--lt-text)]">
                                <span className="text-[var(--lt-promo)]">⚡ {formatCount(credits)}</span> {credits === 1 ? 'impulso' : 'impulsos'}
                            </p>
                            <p className="mt-0.5 text-sm text-[var(--lt-text-muted)]">
                                {credits > 0 && days > 0
                                    ? `≈ ${plural(days, 'día')} de plato estrella a ${formatKm(REFERENCE_RADIUS_KM)}`
                                    : 'Con impulsos, tu mejor plato sale a quien esté cerca.'}
                            </p>
                        </>
                    ) : creditsStatus === 'error' ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-[var(--lt-text)]"><span aria-hidden="true">😕 </span>No hemos podido cargar tu saldo</p>
                            <button
                                type="button"
                                onClick={wallet.reloadCredits}
                                className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-bold text-[var(--lt-accent)] underline-offset-4 hover:underline', kit.focus)}
                            >
                                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                                Reintentar
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2" aria-label="Cargando tu saldo">
                            <div className="h-6 w-40 animate-pulse rounded-lg bg-[var(--lt-glass)]" />
                            <div className="h-4 w-56 max-w-full animate-pulse rounded-lg bg-[var(--lt-glass)]" />
                        </div>
                    )}
                </div>
                <Button
                    variant="secondary"
                    onClick={onRecharge}
                    className="min-h-11 shrink-0 border-[var(--lt-border-strong)] bg-[var(--lt-card-strong)] hover:bg-[var(--lt-glass)]"
                >
                    🪙 Recargar
                </Button>
            </div>

            {awaitingPayment && (
                <div role="status">
                    <StatusPill emoji="⏳" label="Confirmando tu pago con Stripe…" tone="promo" className="border border-[var(--lt-promo)]/40" />
                </div>
            )}

            {notice && (
                <div role="status" className="flex items-start gap-2 rounded-xl border border-[var(--lt-border)] bg-[var(--lt-card-strong)] px-3 py-2">
                    <p className={cn('min-w-0 flex-1 text-sm font-semibold', noticeToneClass[notice.tone])}>{notice.text}</p>
                    <button
                        type="button"
                        onClick={wallet.dismissNotice}
                        aria-label="Cerrar aviso"
                        className={cn('-my-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]', kit.focus)}
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            )}

            {counterItems.length > 0 && (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--lt-text-muted)]">
                    {counterItems.map((item, index) => (
                        <React.Fragment key={item.key}>
                            {index > 0 && <span aria-hidden="true">·</span>}
                            <span className="whitespace-nowrap">
                                <span aria-hidden="true">{item.emoji} </span>
                                {item.text}
                            </span>
                        </React.Fragment>
                    ))}
                </p>
            )}
        </SoftCard>
    );
};
