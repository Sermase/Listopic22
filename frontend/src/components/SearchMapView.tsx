import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { useInfiniteHits } from 'react-instantsearch';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Maximize2, Minimize2 } from 'lucide-react';
import { MAP_LAYERS } from '../utils/mapUtils';

// Icono de marcador para búsqueda — normal y resaltado
function createSearchMarker(score: number, highlighted = false): L.DivIcon {
    const s = isNaN(score) ? 0 : score;
    const scoreText = s === 0 ? '?' : (s % 1 === 0 ? s.toFixed(0) : s.toFixed(1));
    const fontSize = scoreText.length >= 3 ? 10 : 12;

    const bg = s >= 9 ? '#10b981' : s >= 7 ? '#6366f1' : s >= 5 ? '#f59e0b' : '#ef4444';
    const r = highlighted ? 17 : 14;
    const cx = highlighted ? 18 : 15;
    const cy = highlighted ? 18 : 15;
    const stemTop = cy + r + 1;
    const stemBot = stemTop + 13;
    const dotCy = stemBot + 2.5;
    const totalW = highlighted ? 36 : 30;
    const totalH = Math.ceil(dotCy + 3);

    const ringHtml = highlighted
        ? `<circle cx="${cx}" cy="${cy}" r="${r + 5}" fill="none" stroke="${bg}" stroke-width="2" opacity="0.4"/>`
        : '';

    const svgHtml = `
<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" overflow="visible">
  <defs>
    <filter id="sh-${scoreText}" x="-60%" y="-60%" width="220%" height="220%">
      <feDropShadow dx="0" dy="2" stdDeviation="${highlighted ? 5 : 3}" flood-color="${bg}" flood-opacity="${highlighted ? 0.6 : 0.35}"/>
    </filter>
  </defs>
  ${ringHtml}
  <line x1="${cx}" y1="${stemTop}" x2="${cx}" y2="${stemBot}" stroke="${bg}" stroke-width="2" stroke-linecap="round" opacity="0.85"/>
  <circle cx="${cx}" cy="${dotCy}" r="2.5" fill="${bg}" opacity="0.85"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${bg}" stroke-width="${highlighted ? 3 : 2.5}" filter="url(#sh-${scoreText})"/>
  <text x="${cx}" y="${cy + 1}" dominant-baseline="middle" text-anchor="middle"
    font-family="'Poppins','Inter',system-ui,sans-serif"
    font-size="${fontSize}" font-weight="800" fill="${bg}">${scoreText}</text>
</svg>`;

    return L.divIcon({
        html: svgHtml,
        className: 'rating-marker',
        iconSize: [totalW, totalH],
        iconAnchor: [cx, totalH],
        popupAnchor: [0, -(totalH + 4)],
    });
}

// Ajusta el encuadre del mapa cuando cambian los resultados
function MapFitBounds({ items }: { items: { lat: number; lng: number; id: string }[] }) {
    const map = useMap();
    const key = items.map(i => i.id).join(',');

    useEffect(() => {
        if (items.length === 0) return;
        if (items.length === 1) {
            map.flyTo([items[0].lat, items[0].lng], 14, { animate: true, duration: 1 });
        } else {
            const bounds = L.latLngBounds(items.map(i => [i.lat, i.lng] as [number, number]));
            if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: true, duration: 1 });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, map]);

    return null;
}

interface SearchMapViewProps {
    mode: 'mini' | 'full';
    activeTab: string;
    selectedHitId?: string | null;
    hoveredHitId?: string | null;
    onMarkerClick?: (hitId: string) => void;
    onToggleExpand?: () => void;
}

export const SearchMapView: React.FC<SearchMapViewProps> = ({
    mode,
    activeTab,
    selectedHitId,
    hoveredHitId,
    onMarkerClick,
    onToggleExpand,
}) => {
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
    const height = mode === 'mini' ? 'h-44' : 'h-full';

    return (
        <div className={`relative ${height} rounded-2xl overflow-hidden border border-white/10 bg-[#0b1021] flex-shrink-0`}>
            {/* Badge nº marcadores */}
            {geoHits.length > 0 && (
                <div className="absolute top-2 left-2 z-[1000] bg-[#151b2e]/90 border border-white/20 rounded-lg px-2 py-1 text-[11px] text-white font-semibold pointer-events-none">
                    {geoHits.length} en mapa
                </div>
            )}

            {/* Botón expand/contraer */}
            {onToggleExpand && (
                <button
                    onClick={onToggleExpand}
                    className="absolute top-2 right-2 z-[1000] bg-[#151b2e]/90 border border-white/20 rounded-lg p-1.5 text-white hover:bg-indigo-600 transition-colors"
                    title={mode === 'mini' ? 'Ampliar mapa' : 'Minimizar mapa'}
                >
                    {mode === 'mini' ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
                </button>
            )}

            {geoHits.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-1 opacity-40">
                    <span className="text-2xl">🗺️</span>
                    <p className="text-gray-500 text-xs text-center px-3">Sin coordenadas en los resultados</p>
                </div>
            ) : (
                <MapContainer
                    center={[40.4168, -3.7038]}
                    zoom={6}
                    scrollWheelZoom={mode === 'full'}
                    dragging={mode === 'full'}
                    zoomControl={false}
                    className="h-full w-full listopic-map"
                >
                    <TileLayer attribution={layer.attribution} url={layer.url} />
                    <MapFitBounds items={mapItems} />

                    {geoHits.map((hit: any) => {
                        const isPlace = activeTab === 'places';
                        const rating = hit.averageRating || hit.avgGeneralScore || 0;
                        const name = hit.name || hit.itemName || '';
                        const photo = hit.mainImageUrl || hit.photoUrl || hit.thumbnailUrl || null;
                        const reviewCount = hit.reviewsCount || hit.reviewCount || 0;
                        const isHighlighted = hit.objectID === selectedHitId || hit.objectID === hoveredHitId;
                        const href = isPlace
                            ? `/place/${hit.objectID}`
                            : `/group/${hit.placeId}/${encodeURIComponent(hit.itemName || hit.name || '')}`;
                        const ratingColor = rating >= 9 ? '#10b981' : rating >= 7 ? '#6366f1' : rating >= 5 ? '#f59e0b' : '#ef4444';

                        return (
                            <Marker
                                key={hit.objectID}
                                position={[hit._geoloc.lat, hit._geoloc.lng]}
                                icon={createSearchMarker(rating, isHighlighted)}
                                zIndexOffset={isHighlighted ? 1000 : 0}
                                eventHandlers={{
                                    click: () => onMarkerClick?.(hit.objectID),
                                }}
                            >
                                {/* Popup solo en modo full */}
                                {mode === 'full' && (
                                    <Popup closeButton={false} maxWidth={210} minWidth={200} className="listopic-popup">
                                        <div style={{
                                            width: 200, borderRadius: 14, overflow: 'hidden',
                                            background: '#0f1629', border: '1px solid rgba(255,255,255,0.1)',
                                            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                                            fontFamily: "'Poppins', system-ui, sans-serif"
                                        }}>
                                            {photo
                                                ? <img src={photo} alt={name} style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }} />
                                                : <div style={{ width: '100%', height: 70, background: '#1e2a45', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <span style={{ color: '#4b5563', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>Sin foto</span>
                                                  </div>
                                            }
                                            <div style={{ padding: '10px 12px 12px' }}>
                                                <div style={{ fontWeight: 700, fontSize: 13, color: '#f9fafb', marginBottom: 5, lineHeight: 1.3 }}>{name}</div>
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
                                                <a href={href} style={{
                                                    display: 'block', width: '100%', padding: '7px 0',
                                                    background: '#4f46e5', color: '#fff', textAlign: 'center',
                                                    fontWeight: 700, fontSize: 12, borderRadius: 8,
                                                    textDecoration: 'none', boxSizing: 'border-box'
                                                }}>
                                                    Ver detalles →
                                                </a>
                                            </div>
                                        </div>
                                    </Popup>
                                )}
                            </Marker>
                        );
                    })}
                </MapContainer>
            )}
        </div>
    );
};
