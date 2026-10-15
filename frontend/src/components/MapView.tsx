import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { createMapPinIcon, createUserLocationIcon, MAP_LAYERS, DEFAULT_MAP_LAYER, MAP_LAYER_STORAGE_KEY } from '../utils/mapUtils';
import { MapPopupCard } from './map/MapPopupCard';
import { getSponsoredSearchCampaigns, recordSponsoredEvent } from '../services/BusinessProService';
import type { MapLayerId } from '../utils/mapUtils';
import { useLocation } from '../hooks/useLocation';
import type { Location as UserLocation } from '../hooks/useLocation';
import { Locate, Layers, Check } from 'lucide-react';
import L from 'leaflet';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { whenMapSized } from '../lib/mapMotion';
import { formatScore, scoreTextColor } from '../lib/scoreScale';

const USER_LOCATION_ICON = createUserLocationIcon();

// Component to handle User Location Marker & Range Circle
const UserLocationFeatures = ({ range }: { range: number | null }) => {
    const { location } = useLocation();

    if (!location) return null;

    return (
        <>
            <Marker
                position={[location.latitude, location.longitude]}
                icon={USER_LOCATION_ICON}
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
    // El toque deja el vuelo pendiente y se vuela cuando llega la posición
    // (antes el primer toque no hacía nada: leía la ubicación del render previo).
    const pendingFlyRef = useRef(false);

    useEffect(() => {
        if (!pendingFlyRef.current || !location) return;
        pendingFlyRef.current = false;
        map.flyTo([location.latitude, location.longitude], 14, {
            animate: true,
            duration: 1.5
        });
    }, [location, map]);

    const handleLocate = (e: React.MouseEvent) => {
        e.stopPropagation();
        const known = location;
        if (known) {
            map.flyTo([known.latitude, known.longitude], 14, {
                animate: true,
                duration: 1.5
            });
        }
        pendingFlyRef.current = true;
        void requestLocation().then((fresh) => {
            // Sin posición o la misma de antes: ya no queda nada por volar.
            if (!fresh || fresh === known) pendingFlyRef.current = false;
        });
    };

    return (
        <div className="absolute bottom-10 right-4 z-[1000]">
            <button
                onClick={handleLocate}
                className="bg-[var(--lt-card-strong)] text-[var(--lt-text)] hover:bg-[var(--lt-accent)] hover:text-[#fff] p-3 rounded-full shadow-lg cursor-pointer flex items-center justify-center transition-all border border-[var(--lt-border-strong)] hover:scale-110 active:scale-95 motion-reduce:hover:scale-100"
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

    useEffect(() => whenMapSized(map, () => {
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
    }), [range, items, center, location, map]);

    return null;
}

const DEFAULT_CENTER: [number, number] = [40.416, -3.703];

export const MapView: React.FC<MapViewProps> = ({ items, mode = 'global', center = DEFAULT_CENTER, range = null, showLayerControl = true }) => {

    const { location } = useLocation();
    const { user, isJefe } = useAuth();

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

    // Lugares con publicidad activa: chincheta dorada con "P" (con cache de
    // 5 min en el servicio para no repetir lecturas por cada mapa).
    const [sponsoredCampaigns, setSponsoredCampaigns] = useState<Map<string, string[]>>(new Map());
    useEffect(() => {
        let cancelled = false;
        getSponsoredSearchCampaigns()
            .then((campaigns) => {
                if (!cancelled && campaigns.size > 0) setSponsoredCampaigns(campaigns);
            })
            .catch(() => {
                // Marcado patrocinado es best-effort: sin datos, pins normales.
            });
        return () => {
            cancelled = true;
        };
    }, []);

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

    // Normalize Items based on input to match Interface. Memorizado: la
    // ubicación es compartida y cada cambio (p. ej. «buscando…») re-renderiza
    // el mapa; sin esto MapUpdater re-encuadraría y anularía «Centrar en mi
    // ubicación».
    const validItems: MapItem[] = useMemo(() => items.flatMap((item, index) => {
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
    }), [items]);
    const [centerLat, centerLng] = center;
    const stableCenter = useMemo<[number, number]>(() => [centerLat, centerLng], [centerLat, centerLng]);

    // Determine Initial Map Center (Fallback)
    const initialCenter = location
        ? [location.latitude, location.longitude] as [number, number]
        : (validItems.length > 0 && validItems[0].lat && validItems[0].lng
            ? [validItems[0].lat!, validItems[0].lng!] as [number, number]
            : stableCenter);

    return (
        <div className="h-full w-full relative z-0">
            <MapContainer center={initialCenter} zoom={12} scrollWheelZoom={false} className="h-full w-full listopic-map">
                <TileLayer
                    key={currentLayer}
                    attribution={activeLayer.attribution}
                    url={activeLayer.url}
                />
                <TileFilterApplier filter={activeLayer.tileFilter} />

                <MapUpdater center={stableCenter} items={validItems} range={range} location={location} />

                {/* User Location Features */}
                <UserLocationFeatures range={range} />
                <CustomLocateControl />
                {showLayerControl && <LayerSelectorControl currentLayer={currentLayer} onLayerChange={handleLayerChange} />}

                {validItems.map((item) => {
                    const campaignIds = sponsoredCampaigns.get(item.placeId || item.id) || [];
                    const isSponsored = campaignIds.length > 0;
                    return (
                    <Marker
                        key={item.id}
                        position={[item.lat!, item.lng!]}
                        icon={createMapPinIcon({ score: item.rating, emoji: item.emoji, color: item.color, sponsored: isSponsored })}
                        eventHandlers={{
                            popupopen: () => {
                                if (!isJefe) campaignIds.forEach((campaignId) => {
                                    void recordSponsoredEvent('placement', campaignId, 'impression').catch(() => undefined);
                                });
                            },
                        }}
                    >
                        <Popup className="listopic-popup" closeButton={false} maxWidth={270} minWidth={250}>
                            <MapPopupCard
                                title={item.name}
                                to={`/place/${item.placeId || item.id}`}
                                photoUrl={item.photoUrl}
                                score={item.rating}
                                sponsored={isSponsored}
                                subtitle={item.reviewsCount ? `${item.reviewsCount} ${item.reviewsCount === 1 ? 'valoración' : 'valoraciones'}` : null}
                                onNavigate={() => {
                                    if (!isJefe) campaignIds.forEach((campaignId) => {
                                        void Promise.all([
                                            recordSponsoredEvent('placement', campaignId, 'impression'),
                                            recordSponsoredEvent('placement', campaignId, 'click'),
                                        ]).catch(() => undefined);
                                    });
                                }}
                            >
                                {mode === 'list' && item.items && item.items.length > 0 && (
                                    <ul className="mt-2 space-y-1">
                                        {item.items.slice(0, 3).map((subItem, idx) => (
                                            <li key={idx} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--lt-card)] px-2 py-1 text-xs">
                                                <span className="min-w-0 flex-1 truncate text-[var(--lt-text)]">{subItem.name}</span>
                                                <span className="font-bold" style={{ color: scoreTextColor(subItem.score) }}>{formatScore(subItem.score)}</span>
                                            </li>
                                        ))}
                                        {item.items.length > 3 && (
                                            <li className="text-center text-[10px] text-[var(--lt-text-muted)]">+{item.items.length - 3} más</li>
                                        )}
                                    </ul>
                                )}
                            </MapPopupCard>
                        </Popup>
                    </Marker>
                    );
                })}
            </MapContainer>
        </div>
    );
};
