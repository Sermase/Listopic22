/**
 * Una oferta tal y como sale en la ficha pública (PlacePage, bloque «Ofertas ·
 * Patrocinado») y en la vista previa del editor de ofertas.
 *
 *   <PlaceOfferCard offer={offer} />
 *   <PlaceOfferCard offer={draft} preview />   // en el editor: el enlace no se sigue
 */
import React from 'react';
import { Clock, ExternalLink } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { formatPublicDateRange } from './sponsoredMeta';

export interface PlaceOfferCardData {
    title: string;
    description?: string;
    conditions?: string;
    ctaUrl?: string;
    startsAt?: string;
    endsAt?: string;
}

export interface PlaceOfferCardProps {
    offer: PlaceOfferCardData;
    /** Vista previa: el enlace se ve pero no navega. */
    preview?: boolean;
    className?: string;
}

const previewHref = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

export const PlaceOfferCard: React.FC<PlaceOfferCardProps> = ({ offer, preview = false, className }) => {
    const dates = formatPublicDateRange(offer.startsAt, offer.endsAt);
    return (
        <div className={cn('rounded-xl border border-[var(--lt-border)] bg-[var(--lt-glass)] p-3', className)}>
            <p className="break-words text-sm font-bold text-[var(--lt-text)]">{offer.title}</p>
            {offer.description && (
                <p className="mt-1 whitespace-pre-line break-words text-xs leading-relaxed text-[var(--lt-text-muted)]">{offer.description}</p>
            )}
            {dates && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--lt-text-muted)]">
                    <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {dates}
                </p>
            )}
            {offer.conditions && (
                <p className="mt-1 break-words text-[11px] text-[var(--lt-text-muted)]">{offer.conditions}</p>
            )}
            {offer.ctaUrl && (
                <a
                    href={preview ? previewHref(offer.ctaUrl) : offer.ctaUrl}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    tabIndex={preview ? -1 : undefined}
                    onClick={preview ? (event) => event.preventDefault() : undefined}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--lt-accent)] hover:underline"
                >
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    Más información
                </a>
            )}
        </div>
    );
};
