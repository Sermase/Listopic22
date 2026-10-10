/**
 * Una oferta como cupón: talón con el emoji del título, borde discontinuo,
 * estado real (🟢 En vivo, 🗓️ Programada, ⌛ Caducada, 📝 Borrador), fechas,
 * el interruptor «Publicada» y el menú ✏️ Editar · 📄 Duplicar · 🗑️ Eliminar.
 *
 *   <OfferCouponCard offer={offer} today={publicToday()} busy={busyId === offer.id}
 *     error={errors[offer.id]} onTogglePublished={(on) => …} onEdit={…} onDuplicate={…} onDelete={…} />
 */
import React from 'react';
import { Loader2 } from 'lucide-react';
import type { BusinessOffer } from '../../../services/BusinessProService';
import { cn } from '../../../lib/utils';
import { SoftCard, StatusPill, Switch } from '../kit';
import { ActionMenu } from '../items/menuParts';
import {
    computeOfferStatus,
    formatDateRange,
    formatShortDate,
    OFFER_STATUS_META,
    offerEmoji,
    splitLeadingEmoji,
    type OfferDisplayStatus,
} from './sponsoredMeta';

export interface OfferCouponCardProps {
    offer: BusinessOffer;
    today: string;
    busy?: boolean;
    error?: string | null;
    canDuplicate?: boolean;
    onTogglePublished: (published: boolean) => void;
    onEdit: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    className?: string;
}

const switchHelp = (status: OfferDisplayStatus, offer: BusinessOffer): string => {
    switch (status) {
        case 'live':
            return 'Se ve en tu ficha.';
        case 'scheduled':
            return `Se verá desde el ${formatShortDate(offer.startsAt)}.`;
        case 'expired':
            return `Caducó el ${formatShortDate(offer.endsAt)}: ya no se ve.`;
        default:
            return 'No se ve en tu ficha.';
    }
};

export const OfferCouponCard: React.FC<OfferCouponCardProps> = ({
    offer,
    today,
    busy = false,
    error,
    canDuplicate = true,
    onTogglePublished,
    onEdit,
    onDuplicate,
    onDelete,
    className,
}) => {
    const status = computeOfferStatus(offer, today);
    const meta = OFFER_STATUS_META[status];
    const titleText = splitLeadingEmoji(offer.title).text || offer.title;
    const dates = formatDateRange(offer.startsAt, offer.endsAt);

    return (
        <SoftCard as="article" aria-label={`Oferta ${titleText}`} className={cn('flex min-w-0', className)}>
            <div aria-hidden="true" className="flex w-16 shrink-0 items-center justify-center rounded-l-2xl bg-[var(--lt-glass)] text-3xl leading-none sm:w-20">
                {offerEmoji(offer.title)}
            </div>
            <div aria-hidden="true" className="my-3 shrink-0 border-l-2 border-dashed border-[var(--lt-border-strong)]" />
            <div className="min-w-0 flex-1 space-y-2 p-3 sm:p-4">
                <div className="flex items-start gap-2">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 pt-2.5">
                        <StatusPill emoji={meta.emoji} label={meta.label} tone={meta.tone} size="sm" />
                        {busy && <Loader2 className="h-4 w-4 animate-spin text-[var(--lt-text-muted)]" aria-label="Guardando" />}
                    </div>
                    <ActionMenu
                        label={`Acciones de la oferta ${titleText}`}
                        items={[
                            { key: 'edit', label: '✏️ Editar', onSelect: onEdit, disabled: busy },
                            { key: 'duplicate', label: '📄 Duplicar', onSelect: onDuplicate, disabled: busy || !canDuplicate },
                            { key: 'delete', label: '🗑️ Eliminar', onSelect: onDelete, danger: true, disabled: busy },
                        ]}
                    />
                </div>
                <h3 className="line-clamp-2 break-words text-base font-black leading-snug text-[var(--lt-text)]">{titleText}</h3>
                <p className="text-xs text-[var(--lt-text-muted)]">
                    <span aria-hidden="true">📅 </span>
                    {dates ?? 'Sin fechas: siempre que esté publicada'}
                </p>
                <Switch
                    variant="plain"
                    checked={offer.status === 'active'}
                    onChange={onTogglePublished}
                    label="Publicada"
                    description={switchHelp(status, offer)}
                    disabled={busy}
                />
                {error && (
                    <p role="alert" className="rounded-xl bg-[var(--lt-danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--lt-danger)]">{error}</p>
                )}
            </div>
        </SoftCard>
    );
};
