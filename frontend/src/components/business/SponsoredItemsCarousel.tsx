import React, { useEffect, useMemo, useRef, useState } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import { useLocation } from '../../hooks/useLocation';
import {
    getActiveItemSpotlights,
    recordSponsoredEvent,
    weightedSampleSpotlights,
    type ItemSpotlight,
} from '../../services/BusinessProService';
import { useAuth } from '../../context/AuthContext';
import { SponsoredItemCard } from './sponsored/SponsoredItemCard';

const MAX_CAROUSEL_ITEMS = 6;

// Carrusel de platos destacados (Business Pro). Los candidatos son campañas
// activas cuyo radio cubre la posición del usuario (y, en listas, vinculadas a
// esa lista); entre ellos se hace un sorteo ponderado por unidades compradas:
// pagar 2 unidades duplica la probabilidad de salir. Siempre con etiqueta
// "Patrocinado" y sin tocar valoraciones ni rankings orgánicos.
// La ubicación es la compartida de la app: si el usuario se ubica más tarde
// (chip de distancia, mapa, este mismo aviso...) el carrusel aparece solo.
export const SponsoredItemsCarousel: React.FC<{ listId?: string; className?: string }> = ({ listId, className }) => {
    const { location, calculateDistance, requestLocation, loading: locating } = useLocation();
    const [spotlights, setSpotlights] = useState<ItemSpotlight[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [askedLocation, setAskedLocation] = useState(false);
    const [locationFailed, setLocationFailed] = useState(false);
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

    if (picked.length === 0) {
        // Hay campañas que podrían salir aquí, pero sin ubicación no se sabe si
        // quedan cerca: aviso discreto para activarla (no mientras se pide sola).
        const hasCandidates = loaded && spotlights.some((spotlight) =>
            !!spotlight.center && (!listId || spotlight.linkedListIds.includes(listId)));
        if (location || !hasCandidates || (locating && !askedLocation)) return null;
        const handleEnableLocation = () => {
            setAskedLocation(true);
            setLocationFailed(false);
            void requestLocation().then((found) => {
                if (!found) setLocationFailed(true);
            });
        };
        return (
            <div className={className}>
                <button
                    type="button"
                    onClick={handleEnableLocation}
                    disabled={locating}
                    className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/5 px-3 py-1.5 text-xs font-semibold text-[var(--lt-text-muted)] transition-colors hover:border-amber-500/45 hover:text-[var(--lt-text)] disabled:cursor-wait disabled:opacity-70"
                >
                    <span aria-hidden="true">📍</span>
                    {locating ? 'Buscando tu ubicación…' : 'Activa tu ubicación para ver platos destacados cerca'}
                </button>
                {locationFailed && !locating && (
                    <p className="mt-1 px-1 text-[11px] text-[var(--lt-text-muted)]">
                        No hemos podido ubicarte. Revisa el permiso de ubicación.
                    </p>
                )}
            </div>
        );
    }

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
                    <SponsoredItemCard
                        key={spotlight.id}
                        sponsoredId={spotlight.id}
                        to={`/group/${spotlight.placeId}/${encodeURIComponent(spotlight.itemName)}`}
                        onClick={() => {
                            if (!isJefe) void Promise.all([
                                recordSponsoredEvent('spotlight', spotlight.id, 'impression'),
                                recordSponsoredEvent('spotlight', spotlight.id, 'click'),
                            ]).catch(() => undefined);
                        }}
                        itemName={spotlight.itemName}
                        placeName={spotlight.placeName}
                        photoUrl={spotlight.placePhotoUrl}
                        averageRating={spotlight.itemAverageRating}
                        reviewCount={spotlight.itemReviewCount}
                    />
                ))}
            </div>
        </div>
    );
};
