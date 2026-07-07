import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, MapPin } from 'lucide-react';
import { getActiveHomePlacements, type SponsoredPlacement } from '../../services/BusinessProService';

// Destacados patrocinados de la home (Business Pro). Se autoalimenta de los
// emplazamientos activos aprobados por admin; si no hay ninguno no pinta nada.
// Siempre con etiqueta "Patrocinado" y sin tocar rankings orgánicos.
export const SponsoredHomeSpotlight: React.FC = () => {
    const [placements, setPlacements] = useState<SponsoredPlacement[]>([]);

    useEffect(() => {
        let cancelled = false;
        getActiveHomePlacements()
            .then((rows) => {
                if (!cancelled) setPlacements(rows);
            })
            .catch((error) => {
                console.warn('SponsoredHomeSpotlight: load failed', error);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (placements.length === 0) return null;

    return (
        <div className="mx-auto mt-8 w-full max-w-4xl">
            <div className={`grid gap-3 ${placements.length > 1 ? 'sm:grid-cols-2' : ''} ${placements.length > 2 ? 'lg:grid-cols-3' : ''}`}>
                {placements.map((placement) => (
                    <Link
                        key={placement.id}
                        to={`/place/${placement.placeId}`}
                        className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-amber-500/20 bg-[var(--lt-card-strong)] p-3 shadow-lg transition-transform hover:scale-[1.01]"
                    >
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-white/5">
                            {placement.placePhotoUrl ? (
                                <img
                                    src={placement.placePhotoUrl}
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
                                {placement.placeName || 'Negocio'}
                            </p>
                            {placement.headline && (
                                <p className="mt-0.5 truncate text-xs text-[var(--lt-text-muted)]">{placement.headline}</p>
                            )}
                            {placement.placeAddress && (
                                <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-[var(--lt-text-muted)]">
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    {placement.placeAddress}
                                </p>
                            )}
                        </div>
                        <span className="absolute right-2 top-2 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-300">
                            Patrocinado
                        </span>
                    </Link>
                ))}
            </div>
        </div>
    );
};
