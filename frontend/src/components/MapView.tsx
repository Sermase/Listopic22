import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { createRatingMarkerIcon, createEmojiMarkerIcon, getRatingColor, MAP_LAYERS, DEFAULT_MAP_LAYER, MAP_LAYER_STORAGE_KEY } from '../utils/mapUtils';
import type { MapLayerId } from '../utils/mapUtils';
import { useLocation } from '../hooks/useLocation';
import type { Location as UserLocation } from '../hooks/useLocation';
import { Locate, Layers, Check } from 'lucide-react';
import L from 'leaflet';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Component to handle User Location Marker & Range Circle
const UserLocationFeatures = ({ range }: { range: number | null }) => {
    const { location } = useLocation();

    if (!location) return null;

    // Custom Blue Dot Icon using DivIcon
    const blueDotIcon = L.divIcon({
        className: 'user-location-marker',
        html: `<div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg relative">
                 <div class="absolute -inset-2 bg-blue-500/30 rounded-full animate-ping"></div>
               </div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });

    return (
        <>
            <Marker
                position={[location.latitude, location.longitude]}
                icon={blueDotIcon}
                zIndexOffset={1000} // Bring to front
            >
                <Popup>
                    <div className="text-sm font-bold text-gray-900">Tu ubicación</div>
                </Popup>
            </Marker>

            {range !== null && (
                <Circle
                    center={[location.latitude, location.longitude]}
                    radius={range * 1000} // km to meters
                    pathOptions={{
                        color: '#6366f1', // Indigo-500
                        fillColor: '#6366f1',
                        fillOpacity: 0.1,
                        weight: 1,
                        dashArray: '5, 10'
                    }}
                />
            )}
        </>
    );
};

// Component to handle "Center on Me" button - Custom Overlay
const CustomLocateControl = () => {
    const map = useMap();
    const { location, requestLocation, loading } = useLocation();

    const handleLocate = (e: React.MouseEvent) => {
        e.stopPropagation();
        requestLocation();
        if (location) {
            map.flyTo([location.latitude, location.longitude], 14, {
                animate: true,
                duration: 1.5
            });
        }
    };

    return (
        <div className="absolute bottom-6 right-6 z-[1000]">
            <button
                onClick={handleLocate}
                className="bg-[var(--lt-card-strong)] text-white hover:bg-[var(--lt-accent)] p-3 rounded-full shadow-lg cursor-pointer flex items-center justify-center transition-all border border-white/20 hover:scale-110 active:scale-95"
                title="Centrar en mi ubicación"
            >
                <Locate className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
        </div>
    );
};

// Add placeId to MapItem interface (Line 85)
export interface MapItem {
    id: string;
    placeId?: string; // Added field
    lat?: number;
    lng?: number;
    name: string;
    photoUrl?: string;
    rating?: number;
    reviewsCount?: number;
    emoji?: string;
    color?: string;
    items?: {
        name: string;
        score: number;
    }[];
}

interface MapInputItem extends Partial<MapItem> {
    latitude?: number;
    longitude?: number;
    placeName?: string;
    placeMainImage?: string;
    mainImageUrl?: string;
    placeAverageRating?: number;
    overallRating?: number;
    avgRating?: number;
    reviewCount?: number;
    count?: number;
}

interface MapViewProps {
    items: MapInputItem[];
    mode?: 'global' | 'list';
    center?: [number, number];
    range?: number | null;
    showLayerControl?: boolean;
}

// Aplica un filtro CSS al tile pane del mapa (para capas claras/oscuras)
function TileFilterApplier({ filter }: { filter?: string }) {
    const map = useMap();
    useEffect(() => {
        const pane = map.getPane('tilePane') as HTMLElement | undefined;
        if (pane) pane.style.filter = filter || '';
    }, [filter, map]);
    return null;
}

// Botón flotante para seleccionar la capa del mapa
function LayerSelectorControl({ currentLayer, onLayerChange }: { currentLayer: MapLayerId; onLayerChange: (id: MapLayerId) => void }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="absolute top-4 right-4 z-[1000]">
            <button
                onClick={() => setIsOpen(v => !v)}
                className={`flex items-center justify-center w-9 h-9 rounded-xl shadow-lg border transition-all ${isOpen ? 'bg-[var(--lt-accent)] border-[var(--lt-accent-border)] text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                title="Cambiar capa del mapa"
            >
                <Layers className="w-4 h-4" />
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden w-44 py-1">
                    {(Object.entries(MAP_LAYERS) as [MapLayerId, typeof MAP_LAYERS[MapLayerId]][]).map(([id, layer]) => (
                        <button
                            key={id}
                            onClick={() => { onLayerChange(id); setIsOpen(false); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${currentLayer === id ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-gray-700 hover:bg-gray-50 font-medium'}`}
                        >
                            <span className="text-base leading-none">{layer.emoji}</span>
                            <span className="flex-1 text-left">{layer.label}</span>
                            {currentLayer === id && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function MapUpdater({ center, items, range, location }: { center: [number, number], items: MapItem[], range: number | null, location: UserLocation | null }) {
    const map = useMap();

    useEffect(() => {
        if (range !== null && location) {
            let zoom = 12;
            if (range <= 1) zoom = 15;
            else if (range <= 5) zoom = 13;
            else if (range <= 10) zoom = 12;
            else zoom = 9;

            map.flyTo([location.latitude, location.longitude], zoom, { duration: 1.5 });
        } else if (items.length > 0) {
            if (items.length === 1 && items[0].lat && items[0].lng) {
                map.flyTo([items[0].lat, items[0].lng], 14, { duration: 1.5 });
            } else {
                const bounds = L.latLngBounds(items.map(i => [i.lat!, i.lng!] as [number, number]));
                if (bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true, duration: 1.5 });
                }
            }
        } else {
            map.flyTo(center, 10, { duration: 1.5 });
        }
    }, [range, items, center, location, map]);

    return null;
}

export const MapView: React.FC<MapViewProps> = ({ items, mode = 'global', center = [40.416, -3.703], range = null, showLayerControl = true }) => {

    const { location } = useLocation();
    const { user } = useAuth();

    // Capa activa: lee localStorage primero (inmediato), luego Firestore (async)
    const [currentLayer, setCurrentLayer] = useState<MapLayerId>(() => {
        const stored = localStorage.getItem(MAP_LAYER_STORAGE_KEY) as MapLayerId | null;
        return (stored && MAP_LAYERS[stored]) ? stored : DEFAULT_MAP_LAYER;
    });

    useEffect(() => {
        if (!user || localStorage.getItem(MAP_LAYER_STORAGE_KEY)) return;
        getDoc(doc(db, 'users', user.uid)).then(snap => {
            if (!snap.exists()) return;
            const pref = snap.data().mapLayerPreference as MapLayerId | undefined;
            if (pref && MAP_LAYERS[pref]) {
                setCurrentLayer(pref);
                localStorage.setItem(MAP_LAYER_STORAGE_KEY, pref);
            }
        }).catch(() => {
            // Preference sync is best-effort; keep the local default if Firestore fails.
        });
    }, [user]);

    const handleLayerChange = async (layerId: MapLayerId) => {
        setCurrentLayer(layerId);
        localStorage.setItem(MAP_LAYER_STORAGE_KEY, layerId);
        if (user) {
            try {
                await updateDoc(doc(db, 'users', user.uid), { mapLayerPreference: layerId });
            } catch {
                // Best-effort preference persistence.
            }
        }
    };

    const activeLayer = MAP_LAYERS[currentLayer];

    // Normalize Items based on input to match Interface
    const validItems: MapItem[] = items.flatMap((item, index) => {
        const lat = item.lat ?? item.latitude;
        const lng = item.lng ?? item.longitude;

        if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
            return [];
        }

        return [{
            id: item.id ?? item.placeId ?? `map-item-${index}-${lat}-${lng}`,
            placeId: item.placeId, // Preserve placeId
            lat,
            lng,
            name: item.name ?? item.placeName ?? 'Lugar desconocido',
            photoUrl: item.photoUrl ?? item.placeMainImage ?? item.mainImageUrl,
            rating: item.rating ?? item.placeAverageRating ?? item.overallRating ?? item.avgRating ?? 0,
            reviewsCount: item.reviewsCount ?? item.reviewCount ?? item.count ?? 0,
            emoji: item.emoji,
            color: item.color,
            items: item.items
        }];
    });

    // Determine Initial Map Center (Fallback)
    const initialCenter = location
        ? [location.latitude, location.longitude] as [number, number]
        : (validItems.length > 0 && validItems[0].lat && validItems[0].lng
            ? [validItems[0].lat!, validItems[0].lng!] as [number, number]
            : center);

    return (
        <div className="h-full w-full relative z-0">
            <MapContainer center={initialCenter} zoom={12} scrollWheelZoom={false} className="h-full w-full listopic-map">
                <TileLayer
                    key={currentLayer}
                    attribution={activeLayer.attribution}
                    url={activeLayer.url}
                />
                <TileFilterApplier filter={activeLayer.tileFilter} />

                <MapUpdater center={center} items={validItems} range={range} location={location} />

                {/* User Location Features */}
                <UserLocationFeatures range={range} />
                <CustomLocateControl />
                {showLayerControl && <LayerSelectorControl currentLayer={currentLayer} onLayerChange={handleLayerChange} />}

                {validItems.map((item) => (
                    <Marker
                        key={item.id}
                        position={[item.lat!, item.lng!]}
                        icon={item.emoji || item.color ? createEmojiMarkerIcon(item.emoji || '📍', item.color || '#6366f1') : createRatingMarkerIcon(item.rating || 0)}
                    >
                        <Popup className="listopic-popup" closeButton={false} maxWidth={270} minWidth={250}>
                            {(() => {
                                const { bg } = getRatingColor(item.rating || 0);
                                const ratingText = item.rating ? item.rating.toFixed(1) : '-';
                                return (
                                    <div style={{ width: 250, borderRadius: 16, overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.9)', background: '#fff', fontFamily: "'Poppins', system-ui, sans-serif" }}>
                                        {/* Header Image */}
                                        <div style={{ position: 'relative', height: 120, background: '#e5e7eb' }}>
                                            {item.photoUrl ? (
                                                <img src={item.photoUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <span style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>Sin foto</span>
                                                </div>
                                            )}
                                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)' }} />
                                            {/* Rating badge overlay */}
                                            <div style={{ position: 'absolute', bottom: 8, right: 8, background: bg, color: '#fff', borderRadius: 8, padding: '3px 10px', fontWeight: 800, fontSize: 14, boxShadow: `0 2px 8px ${bg}80`, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <span style={{ fontSize: 11 }}>★</span>
                                                {ratingText}
                                            </div>
                                        </div>

                                        <div style={{ padding: '10px 14px 12px' }}>
                                            <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {item.name}
                                            </div>
                                            {item.reviewsCount ? (
                                                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
                                                    {item.reviewsCount} {item.reviewsCount === 1 ? 'reseña' : 'reseñas'}
                                                </div>
                                            ) : null}

                                            {/* Sub Items List (List Mode) */}
                                            {mode === 'list' && item.items && item.items.length > 0 && (
                                                <div style={{ marginBottom: 10 }}>
                                                    {item.items.slice(0, 3).map((subItem, idx) => {
                                                        const { bg: subBg } = getRatingColor(subItem.score);
                                                        return (
                                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', background: '#f9fafb', borderRadius: 6, marginBottom: 3, fontSize: 12, border: '1px solid #f3f4f6' }}>
                                                                <span style={{ color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>{subItem.name}</span>
                                                                <span style={{ fontWeight: 700, color: subBg }}>{subItem.score.toFixed(1)}</span>
                                                            </div>
                                                        );
                                                    })}
                                                    {item.items.length > 3 && (
                                                        <div style={{ textAlign: 'center', fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                                                            +{item.items.length - 3} más
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <Link
                                                to={`/place/${item.placeId || item.id}`}
                                                style={{ display: 'block', width: '100%', padding: '8px 0', background: '#4f46e5', color: '#fff', textAlign: 'center', fontWeight: 700, fontSize: 13, borderRadius: 10, textDecoration: 'none', boxSizing: 'border-box' }}
                                            >
                                                Ver detalles
                                            </Link>
                                        </div>
                                    </div>
                                );
                            })()}
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    );
};
