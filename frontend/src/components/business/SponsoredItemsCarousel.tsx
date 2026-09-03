import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, UtensilsCrossed } from 'lucide-react';
import { useLocation } from '../../hooks/useLocation';
import {
    getActiveItemSpotlights,
    recordSponsoredEvent,
    weightedSampleSpotlights,
    type ItemSpotlight,
} from '../../services/BusinessProService';
import { useAuth } from '../../context/AuthContext';

const MAX_CAROUSEL_ITEMS = 6;

// Carrusel de platos destacados (Business Pro). Los candidatos son campañas
// activas cuyo radio cubre la posición del usuario (y, en listas, vinculadas a
// esa lista); entre ellos se hace un sorteo ponderado por unidades compradas:
// pagar 2 unidades duplica la probabilidad de salir. Siempre con etiqueta
// "Patrocinado" y sin tocar valoraciones ni rankings orgánicos.
export const SponsoredItemsCarousel: React.FC<{ listId?: string; className?: string }> = ({ listId, className }) => {
    const { location, calculateDistance } = useLocation();
    const [spotlights, setSpotlights] = useState<ItemSpotlight[]>([]);
    const [loaded, setLoaded] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const { isJefe } = useAuth();

    useEffect(() => {
        let cancelled = false;
        getActiveItemSpotlights()
            .then((rows) => {
                if (!cancelled) setSpotlights(rows);
            })
            .catch((error) => {
                console.warn('SponsoredItemsCarousel: load failed', error);
            })
            .finally(() => {
                if (!cancelled) setLoaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const picked = useMemo(() => {
        if (!loaded) return [];
        const candidates = spotlights.filter((spotlight) => {
            if (listId && !spotlight.linkedListIds.includes(listId)) return false;
            if (!spotlight.center) return false;
            // Sin ubicación del usuario no se puede validar el radio: no se muestra
            // (el negocio paga por proximidad real, no por impresiones globales).
            if (!location) return false;
            const distance = calculateDistance(spotlight.center.lat, spotlight.center.lng);
            return distance !== null && distance <= spotlight.radiusKm;
        });
        return weightedSampleSpotlights(candidates, MAX_CAROUSEL_ITEMS);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loaded, spotlights, listId, location?.latitude, location?.longitude]);

    useEffect(() => {
        if (isJefe) return;
        const elements = Array.from(containerRef.current?.querySelectorAll<HTMLElement>('[data-sponsored-id]') || []);
        if (elements.length === 0) return;
        const register = (element: HTMLElement) => {
            const id = element.dataset.sponsoredId;
            if (id) void recordSponsoredEvent('spotlight', id, 'impression').catch(() => undefined);
        };
        if (!('IntersectionObserver' in window)) {
            elements.forEach(register);
            return;
        }
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                    register(entry.target as HTMLElement);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });
        elements.forEach((element) => observer.observe(element));
        return () => observer.disconnect();
    }, [isJefe, picked]);

    if (picked.length === 0) return null;

    return (
        <div className={className}>
            <div className="mb-2 flex items-center gap-2 px-1">
                <UtensilsCrossed className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--lt-text)]">Platos destacados cerca de ti</h3>
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                    Patrocinado
                </span>
            </div>
            <div ref={containerRef} className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
                {picked.map((spotlight) => (
                    <Link
                        key={spotlight.id}
                        data-sponsored-id={spotlight.id}
                        to={`/group/${spotlight.placeId}/${encodeURIComponent(spotlight.itemName)}`}
                        onClick={() => {
                            if (!isJefe) void Promise.all([
                                recordSponsoredEvent('spotlight', spotlight.id, 'impression'),
                                recordSponsoredEvent('spotlight', spotlight.id, 'click'),
                            ]).catch(() => undefined);
                        }}
                        className="group w-44 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] shadow-lg transition-transform hover:scale-[1.02]"
                    >
                        <div className="relative h-24 w-full overflow-hidden bg-white/5">
                            {spotlight.placePhotoUrl ? (
                                <img
                                    src={spotlight.placePhotoUrl}
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
                                {spotlight.itemName}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-[var(--lt-text-muted)]">{spotlight.placeName}</p>
                            {spotlight.itemAverageRating !== null && (
                                <p className="mt-1 flex items-center gap-1 text-xs font-bold text-emerald-400">
                                    <Star className="h-3 w-3 fill-current" />
                                    {spotlight.itemAverageRating.toFixed(1)}
                                    <span className="font-normal text-[var(--lt-text-muted)]">({spotlight.itemReviewCount})</span>
                                </p>
                            )}
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
};
