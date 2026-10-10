import React, { useEffect, useRef, useState } from 'react';
import { getActiveHomePlacements, recordSponsoredEvent, type SponsoredPlacement } from '../../services/BusinessProService';
import { useAuth } from '../../context/AuthContext';
import { SponsoredHomeCard } from './sponsored/SponsoredHomeCard';

// Destacados patrocinados de la home (Business Pro). Se autoalimenta de los
// emplazamientos activos aprobados por admin; si no hay ninguno no pinta nada.
// Siempre con etiqueta "Patrocinado" y sin tocar rankings orgánicos.
export const SponsoredHomeSpotlight: React.FC = () => {
    const [placements, setPlacements] = useState<SponsoredPlacement[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const { isJefe } = useAuth();

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

    useEffect(() => {
        if (isJefe) return;
        const elements = Array.from(containerRef.current?.querySelectorAll<HTMLElement>('[data-sponsored-id]') || []);
        if (elements.length === 0) return;
        const register = (element: HTMLElement) => {
            const id = element.dataset.sponsoredId;
            if (id) void recordSponsoredEvent('placement', id, 'impression').catch(() => undefined);
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
    }, [isJefe, placements]);

    if (placements.length === 0) return null;

    return (
        <div className="mx-auto mt-8 w-full max-w-4xl">
            <div ref={containerRef} className={`grid gap-3 ${placements.length > 1 ? 'sm:grid-cols-2' : ''} ${placements.length > 2 ? 'lg:grid-cols-3' : ''}`}>
                {placements.map((placement) => (
                    <SponsoredHomeCard
                        key={placement.id}
                        sponsoredId={placement.id}
                        to={`/place/${placement.placeId}`}
                        onClick={() => {
                            if (!isJefe) void Promise.all([
                                recordSponsoredEvent('placement', placement.id, 'impression'),
                                recordSponsoredEvent('placement', placement.id, 'click'),
                            ]).catch(() => undefined);
                        }}
                        placeName={placement.placeName}
                        headline={placement.headline}
                        address={placement.placeAddress}
                        photoUrl={placement.placePhotoUrl}
                    />
                ))}
            </div>
        </div>
    );
};
