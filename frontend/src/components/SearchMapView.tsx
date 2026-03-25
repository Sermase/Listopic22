import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { useInfiniteHits } from 'react-instantsearch';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Maximize2, Minimize2 } from 'lucide-react';
import { createRatingMarkerIcon, MAP_LAYERS } from '../utils/mapUtils';

// Ajusta el mapa para encuadrar todos los marcadores cuando cambian
function MapFitBounds({ items }: { items: { lat: number; lng: number; id: string }[] }) {
    const map = useMap();
    const key = items.map(i => i.id).join(',');

    useEffect(() => {
        if (items.length === 0) return;
        if (items.length === 1) {
            map.flyTo([items[0].lat, items[0].lng], 14, { animate: true, duration: 1 });
        } else {
            const bounds = L.latLngBounds(items.map(i => [i.lat, i.lng] as [number, number]));
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: true, duration: 1 });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, map]);

    return null;
}

interface SearchMapViewProps {
    activeTab: string;
    isExpanded: boolean;
    onToggleExpand: () => void;
}

export const SearchMapView: React.FC<SearchMapViewProps> = ({ activeTab, isExpanded, onToggleExpand }) => {
    const { hits } = useInfiniteHits();

    const geoHits = useMemo(
        () => (hits as any[]).filter(h => h._geoloc?.lat != null && h._geoloc?.lng != null),
        [hits]
    );

    const mapItems = useMemo(
        () => geoHits.map(h => ({ lat: h._geoloc.lat, lng: h._geoloc.lng, id: h.objectID })),
        [geoHits]
    );

    const layer = MAP_LAYERS.dark;

    return (
        <div className="relative h-full rounded-2xl overflow-hidden border border-white/10 bg-[#0b1021]">
            {/* Botón expandir/contraer */}
            <button
                onClick={onToggleExpand}
                className="absolute top-3 right-3 z-[1000] bg-[#151b2e]/90 border border-white/20 rounded-lg p-2 text-white hover:bg-indigo-600 transition-colors shadow-lg"
                title={isExpanded ? 'Minimizar mapa' : 'Ampliar mapa'}
            >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Badge con nº de marcadores */}
            {geoHits.length > 0 && (
                <div className="absolute top-3 left-3 z-[1000] bg-[#151b2e]/90 border border-white/20 rounded-lg px-2.5 py-1.5 text-xs text-white font-semibold shadow-lg">
                    {geoHits.length} en el mapa
                </div>
            )}

            {geoHits.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-2">
                    <span className="text-3xl">🗺️</span>
                    <p className="text-gray-500 text-sm text-center px-4">
                        Los resultados actuales no tienen coordenadas disponibles
                    </p>
                </div>
            ) : (
                <MapContainer
                    center={[40.4168, -3.7038]}
                    zoom={6}
                    scrollWheelZoom={true}
                    className="h-full w-full listopic-map"
                    zoomControl={false}
                >
                    <TileLayer attribution={layer.attribution} url={layer.url} />
                    <MapFitBounds items={mapItems} />

                    {geoHits.map((hit: any) => {
                        const isPlace = activeTab === 'places';
                        const rating = hit.averageRating || hit.avgGeneralScore || 0;
                        const name = hit.name || hit.itemName || '';
                        const photo = hit.mainImageUrl || hit.photoUrl || hit.thumbnailUrl || null;
                        const reviewCount = hit.reviewsCount || hit.reviewCount || 0;
                        const href = isPlace
                            ? `/place/${hit.objectID}`
                            : `/group/${hit.placeId}/${encodeURIComponent(hit.itemName || hit.name || '')}`;
                        const ratingColor =
                            rating >= 9 ? '#10b981' :
                            rating >= 7 ? '#6366f1' :
                            rating >= 5 ? '#f59e0b' : '#ef4444';

                        return (
                            <Marker
                                key={hit.objectID}
                                position={[hit._geoloc.lat, hit._geoloc.lng]}
                                icon={createRatingMarkerIcon(rating)}
                            >
                                <Popup
                                    closeButton={false}
                                    maxWidth={210}
                                    minWidth={200}
                                    className="listopic-popup"
                                >
                                    <div style={{
                                        width: 200,
                                        borderRadius: 14,
                                        overflow: 'hidden',
                                        background: '#0f1629',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                                        fontFamily: "'Poppins', system-ui, sans-serif"
                                    }}>
                                        {/* Imagen */}
                                        {photo ? (
                                            <img src={photo} alt={name} style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }} />
                                        ) : (
                                            <div style={{ width: '100%', height: 80, background: '#1e2a45', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <span style={{ color: '#4b5563', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>Sin foto</span>
                                            </div>
                                        )}

                                        <div style={{ padding: '10px 12px 12px' }}>
                                            {/* Nombre */}
                                            <div style={{ fontWeight: 700, fontSize: 13, color: '#f9fafb', marginBottom: 6, lineHeight: 1.3 }}>
                                                {name}
                                            </div>

                                            {/* Reseñas + rating */}
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                                <span style={{ fontSize: 11, color: '#9ca3af' }}>
                                                    {reviewCount > 0 ? `${reviewCount} reseñas` : 'Sin reseñas'}
                                                </span>
                                                {rating > 0 && (
                                                    <span style={{ background: ratingColor, color: '#fff', borderRadius: 6, padding: '2px 8px', fontWeight: 800, fontSize: 12 }}>
                                                        ★ {rating.toFixed(1)}
                                                    </span>
                                                )}
                                            </div>

                                            {/* CTA */}
                                            <a
                                                href={href}
                                                style={{
                                                    display: 'block',
                                                    width: '100%',
                                                    padding: '7px 0',
                                                    background: '#4f46e5',
                                                    color: '#fff',
                                                    textAlign: 'center',
                                                    fontWeight: 700,
                                                    fontSize: 12,
                                                    borderRadius: 8,
                                                    textDecoration: 'none',
                                                    boxSizing: 'border-box'
                                                }}
                                            >
                                                Ver detalles →
                                            </a>
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        );
                    })}
                </MapContainer>
            )}
        </div>
    );
};
