/**
 * «🪙 Recarga tu monedero»: paquetes de impulsos (2×2) con su descuento y
 * cuántos días de plato estrella dan. Sin compra online, tarjetas en gris
 * con «🔜 Próximamente».
 *
 *   <ImpulsePacksModal open={packsOpen} onClose={() => setPacksOpen(false)} wallet={wallet}
 *     draft={{ itemId, radiusKm, days, intensity }} />
 *
 * `draft` es la campaña que se está preparando: se guarda al ir a Stripe para
 * recuperarla al volver.
 */
import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { formatEur } from '../../../config/planBeta';
import { packDiscountPercent } from '../../../services/BusinessProService';
import { cn } from '../../../lib/utils';
import { StatusPill } from '../kit';
import { daysAtRadius, formatCount, formatKm, packEmoji, packRibbon, plural, REFERENCE_RADIUS_KM } from './sponsoredMeta';
import type { SpotlightDraft } from './spotlightDraft';
import type { ImpulseWallet } from './useImpulseWallet';

export interface ImpulsePacksModalProps {
    open: boolean;
    onClose: () => void;
    wallet: ImpulseWallet;
    draft: Omit<SpotlightDraft, 'balanceBefore'>;
}

export const ImpulsePacksModal: React.FC<ImpulsePacksModalProps> = ({ open, onClose, wallet, draft }) => {
    const { pricing, checkoutEnabled, credits, buyingKey, awaitingPayment } = wallet;
    const packs = pricing.packs;
    const canBuy = checkoutEnabled && credits !== null && !awaitingPayment && buyingKey === null;

    return (
        <Modal
            isOpen={open}
            onClose={onClose}
            size="lg"
            title={<span><span aria-hidden="true">🪙 </span>Recarga tu monedero</span>}
        >
            <div className="space-y-4">
                <p className="text-sm text-[var(--lt-text-muted)]">
                    {credits !== null
                        ? <>Tienes <strong className="text-[var(--lt-promo)]">⚡ {formatCount(credits)}</strong>. </>
                        : null}
                    1 impulso = 200 m durante 1 día. Cuantos más compras, más barato sale cada uno.
                </p>

                {!checkoutEnabled && (
                    <p className="rounded-xl border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-2 text-sm font-semibold text-[var(--lt-text)]">
                        <span aria-hidden="true">🔜 </span>La compra online llega pronto. Mientras tanto, puedes lanzar un plato estrella y te confirmamos el precio antes de activarlo.
                    </p>
                )}
                {awaitingPayment && (
                    <p role="status" className="text-sm font-semibold text-[var(--lt-text-muted)]">
                        <span aria-hidden="true">⏳ </span>Estamos confirmando tu pago anterior con Stripe; espera un momento antes de comprar otro.
                    </p>
                )}

                {packs.length === 0 ? (
                    <p className="text-sm text-[var(--lt-text-muted)]">Ahora mismo no hay paquetes a la venta.</p>
                ) : (
                    <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                        {packs.map((pack, index) => {
                            const discount = packDiscountPercent(pricing, pack);
                            const ribbon = packRibbon(pricing, packs, index);
                            const days = daysAtRadius(pricing, pack.impulses);
                            const key = `pack-${index}`;
                            return (
                                <li
                                    key={pack.impulses}
                                    className={cn(
                                        'relative flex flex-col gap-2 rounded-2xl border p-4',
                                        ribbon === 'Más elegido' ? 'border-[var(--lt-promo)]/50' : 'border-[var(--lt-border)]',
                                        'bg-[var(--lt-glass)]',
                                        !checkoutEnabled && 'opacity-60',
                                    )}
                                >
                                    {ribbon && (
                                        <StatusPill label={ribbon} tone="promo" size="sm" className="absolute right-3 top-3" />
                                    )}
                                    <span aria-hidden="true" className="text-3xl leading-none">{packEmoji(index)}</span>
                                    <p className="text-lg font-black text-[var(--lt-text)]">
                                        ⚡ {formatCount(pack.impulses)} <span className="text-sm font-bold text-[var(--lt-text-muted)]">impulsos</span>
                                    </p>
                                    <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-[var(--lt-text)]">
                                        {formatEur(pack.priceEur)}
                                        {discount > 0 && <StatusPill label={`−${discount} %`} tone="success" size="sm" />}
                                    </p>
                                    <p className="text-xs text-[var(--lt-text-muted)]">≈ {plural(days, 'día')} de plato a {formatKm(REFERENCE_RADIUS_KM)}</p>
                                    {checkoutEnabled ? (
                                        <Button
                                            variant="primary"
                                            onClick={() => void wallet.buy(key, { packIndex: index }, draft)}
                                            disabled={!canBuy}
                                            leftIcon={buyingKey === key ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : undefined}
                                            className="mt-auto min-h-11"
                                            aria-label={`Comprar ${formatCount(pack.impulses)} impulsos por ${formatEur(pack.priceEur)}`}
                                        >
                                            Comprar
                                        </Button>
                                    ) : (
                                        <StatusPill emoji="🔜" label="Próximamente" className="mt-auto self-start" />
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}

                {wallet.buyError && (
                    <p role="alert" className="rounded-xl bg-[var(--lt-danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--lt-danger)]">{wallet.buyError}</p>
                )}
                {checkoutEnabled && credits === null && (
                    <p className="text-xs text-[var(--lt-text-muted)]">Espera a que cargue tu saldo para comprar.</p>
                )}
                {checkoutEnabled && (
                    <p className="text-xs text-[var(--lt-text-muted)]">Pagas en Stripe. Los impulsos se suman a tu saldo en cuanto se confirma el pago.</p>
                )}
            </div>
        </Modal>
    );
};
