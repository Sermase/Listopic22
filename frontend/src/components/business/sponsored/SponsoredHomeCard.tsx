/**
 * Tarjeta de un negocio destacado en la portada (Explorar). La usan la portada
 * pública (con enlace) y la vista previa de 🗺️ Portada y mapa (sin enlace).
 *
 *   <SponsoredHomeCard placeName="Bar Pepe" headline="Terraza abierta" address="C/ Mayor 3"
 *     photoUrl={url} to="/place/…" sponsoredId={id} onClick={track} />
 *   <SponsoredHomeCard placeName="Bar Pepe" headline={draftHeadline} />
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, MapPin } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface SponsoredHomeCardProps {
    placeName?: string;
    headline?: string;
    address?: string;
    photoUrl?: string;
    /** Con `to` es un enlace; sin él, una tarjeta de muestra. */
    to?: string;
    sponsoredId?: string;
    onClick?: () => void;
    className?: string;
}

const cardClass = 'group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-amber-500/20 bg-[var(--lt-card-strong)] p-3 shadow-lg transition-transform hover:scale-[1.01]';

export const SponsoredHomeCard: React.FC<SponsoredHomeCardProps> = ({
    placeName,
    headline,
    address,
    photoUrl,
    to,
    sponsoredId,
    onClick,
    className,
}) => {
    const body = (
        <>
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-white/5">
                {photoUrl ? (
                    <img
                        src={photoUrl}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                        loading="lazy"
                    />
                ) : (
                    <div className="grid h-full w-full place-items-center text-amber-300">
                        <Building2 className="h-6 w-6" />
                    </div>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-[var(--lt-text)] group-hover:text-[var(--lt-accent)]">
                    {placeName || 'Negocio'}
                </p>
                {headline && (
                    <p className="mt-0.5 truncate text-xs text-[var(--lt-text-muted)]">{headline}</p>
                )}
                {address && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-[var(--lt-text-muted)]">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {address}
                    </p>
                )}
            </div>
            <span className="absolute right-2 top-2 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-300">
                Patrocinado
            </span>
        </>
    );

    if (to) {
        return (
            <Link data-sponsored-id={sponsoredId} to={to} onClick={onClick} className={cn(cardClass, className)}>
                {body}
            </Link>
        );
    }
    return <div className={cn(cardClass, 'hover:scale-100', className)}>{body}</div>;
};
