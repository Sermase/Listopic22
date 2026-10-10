/**
 * Tarjeta de un plato estrella del carrusel «Platos destacados cerca de ti».
 * La usan el carrusel público (con enlace) y la vista previa del asistente
 * de 🍽️ Plato estrella (sin enlace).
 *
 *   <SponsoredItemCard itemName="Croquetas" placeName="Bar Pepe" photoUrl={url}
 *     averageRating={8.4} reviewCount={12} to="/group/…" sponsoredId={id} onClick={track} />
 *   <SponsoredItemCard itemName="Croquetas" placeName="Bar Pepe" averageRating={null} reviewCount={0} />
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Star, UtensilsCrossed } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface SponsoredItemCardProps {
    itemName: string;
    placeName?: string;
    photoUrl?: string;
    averageRating: number | null;
    reviewCount: number;
    /** Con `to` es un enlace; sin él, una tarjeta de muestra. */
    to?: string;
    /** id de la campaña para contar impresiones (data-sponsored-id). */
    sponsoredId?: string;
    onClick?: () => void;
    className?: string;
}

const cardClass = 'group w-44 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] shadow-lg transition-transform hover:scale-[1.02]';

export const SponsoredItemCard: React.FC<SponsoredItemCardProps> = ({
    itemName,
    placeName,
    photoUrl,
    averageRating,
    reviewCount,
    to,
    sponsoredId,
    onClick,
    className,
}) => {
    const body = (
        <>
            <div className="relative h-24 w-full overflow-hidden bg-white/5">
                {photoUrl ? (
                    <img
                        src={photoUrl}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                        loading="lazy"
                    />
                ) : (
                    <div className="grid h-full w-full place-items-center text-amber-300">
                        <UtensilsCrossed className="h-7 w-7" />
                    </div>
                )}
                {/* Cartelito por tarjeta: cada elemento marca que es patrocinado */}
                <span className="absolute right-1.5 top-1.5 rounded-full border border-amber-400/50 bg-black/55 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-300 backdrop-blur-sm">
                    Patrocinado
                </span>
            </div>
            <div className="p-3">
                <p className="truncate text-sm font-black text-[var(--lt-text)] group-hover:text-[var(--lt-accent)]">
                    {itemName}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-[var(--lt-text-muted)]">{placeName}</p>
                {averageRating !== null && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-bold text-emerald-400">
                        <Star className="h-3 w-3 fill-current" />
                        {averageRating.toFixed(1)}
                        <span className="font-normal text-[var(--lt-text-muted)]">({reviewCount})</span>
                    </p>
                )}
            </div>
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
