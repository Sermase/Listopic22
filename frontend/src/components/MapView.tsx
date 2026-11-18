import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { createMapPinIcon, createUserLocationIcon, MAP_LAYERS, DEFAULT_MAP_LAYER, MAP_LAYER_STORAGE_KEY } from '../utils/mapUtils';
import { MapPopupCard } from './map/MapPopupCard';
import { Link } from 'react-router-dom';
import { getSponsoredSearchCampaigns, recordSponsoredEvent } from '../services/BusinessProService';
import type { MapLayerId } from '../utils/mapUtils';
import { useLocation } from '../hooks/useLocation';
import type { Location as UserLocation } from '../hooks/useLocation';
import { Locate, Layers, Check } from 'lucide-react';
import L from 'leaflet';
import { focusPoints } from '../lib/mapFocus';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { animateMap, whenMapSized } from '../lib/mapMotion';
import { formatScore, scoreTextColor } from '../lib/scoreScale';
import { ClusteredPins, CLUSTER_MAX_ZOOM } from './map/ClusteredPins';
import { listPopupView, useStableMapItems } from './map/mapItems';
import { haptic } from '../utils/haptics';
import type { MapItem, MapInputItem } from './map/mapItems';

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
            animate: animateMap(),
            duration: 1
        });
    }, [location, map]);

    const handleLocate = (e: React.MouseEvent) => {
        e.stopPropagation();
        const known = location;
        if (known) {
            map.flyTo([known.latitude, known.longitude], 14, {
                animate: animateMap(),
                duration: 1
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

export type { MapItem, MapInputItem } from './map/mapItems';

interface MapViewProps {
    items: MapInputItem[];
    mode?: 'global' | 'list';
    center?: [number, number];
    range?: number | null;
    showLayerControl?: boolean;
    /** Zoom con la rueda del ratón (en el mapa a pantalla completa). */
    scrollWheelZoom?: boolean;
    /** Sitio elegido en la lista del mapa grande: el mapa va hasta él y abre su ficha. */
    focusId?: string | null;
    /** Cambia con cada toque en la lista, para volver al mismo sitio dos veces. */
    focusNonce?: number;
    /** Sin radio: encuadra donde están la mayoría, o a tu alrededor si tienes alguno cerca. */
    smartFocus?: boolean;
    /** Mapa pequeño (p. ej. en la página del sitio): sin zoom, capas ni «mi ubicación»; eso, en el grande. */
    compact?: boolean;
}

// Vuela hasta el sitio elegido y abre su ficha cuando su chincheta ya está suelta.
function FocusOnItem({ item, nonce, markers }: { item: MapItem | null; nonce?: number; markers: React.MutableRefObject<Map<string, L.Marker>> }) {
    const map = useMap();
    useEffect(() => {
        if (!item) return;
        let cancelled = false;
        const open = () => {
            if (cancelled) return;
            // El grupo se deshace al acabar el zoom: la chincheta aparece en el siguiente pintado.
            setTimeout(() => { if (!cancelled) markers.current.get(item.id)?.openPopup(); }, 60);
        };
        map.once('moveend', open);
        map.flyTo([item.lat!, item.lng!], Math.max(map.getZoom(), CLUSTER_MAX_ZOOM), { animate: animateMap(), duration: 0.8 });
        return () => { cancelled = true; map.off('moveend', open); };
    }, [item, nonce, map, markers]);
    return null;
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

function MapUpdater({ center, items, range, location, smartFocus = false }: { center: [number, number], items: MapItem[], range: number | null, location: UserLocation | null, smartFocus?: boolean }) {
    const map = useMap();
    // La ubicación solo cuenta con radio: sin él, «Centrar en mi ubicación» (que la
    // refresca) no debe volver a encuadrar todos los sitios. Redondeada (~100 m).
    const near = range !== null && location ? location : null;
    const nearKey = near ? `${near.latitude.toFixed(3)},${near.longitude.toFixed(3)}` : '';
    const nearRef = useRef(near);
    useLayoutEffect(() => { nearRef.current = near; });
    // Encuadre inteligente (lista sin radio): tu posición solo decide si tienes algo cerca.
    const me = smartFocus && range === null && location ? location : null;
    const meKey = me ? `${me.latitude.toFixed(2)},${me.longitude.toFixed(2)}` : '';
    const meRef = useRef(me);
    useLayoutEffect(() => { meRef.current = me; });

    useEffect(() => whenMapSized(map, () => {
        const location = nearRef.current;
        const animate = animateMap();
        const duration = 0.9;
        if (range !== null && location) {
            let zoom = 12;
            if (range <= 1) zoom = 15;
            else if (range <= 5) zoom = 13;
            else if (range <= 10) zoom = 12;
            else zoom = 9;

            map.flyTo([location.latitude, location.longitude], zoom, { animate, duration });
        } else if (items.length > 0) {
            if (items.length === 1 && items[0].lat && items[0].lng) {
                map.flyTo([items[0].lat, items[0].lng], 14, { animate, duration });
            } else {
                const user = meRef.current;
                const all = items.map(i => ({ lat: i.lat!, lng: i.lng! }));
                const shown = smartFocus ? focusPoints(all, user ? { lat: user.latitude, lng: user.longitude } : null) : all;
                if (shown.length === 1) {
                    map.flyTo([shown[0].lat, shown[0].lng], 14, { animate, duration });
                    return;
                }
                const bounds = L.latLngBounds(shown.map(p => [p.lat, p.lng] as [number, number]));
                if (bounds.isValid()) {
                    map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 15, animate, duration });
                }
            }
        } else {
            map.flyTo(center, 10, { animate, duration });
        }
    }), [range, items, center, nearKey, meKey, smartFocus, map]);

    return null;
}

const DEFAULT_CENTER: [number, number] = [40.416, -3.703];

// Memorizado: el mapa a pantalla completa se vuelve a pintar al abrir filtros o la lista,
// y el mapa no tiene que rehacerse por eso.
export const MapView: React.FC<MapViewProps> = React.memo(function MapView({ items, mode = 'global', center = DEFAULT_CENTER, range = null, showLayerControl = true, scrollWheelZoom = false, focusId = null, focusNonce, smartFocus = false, compact = false }) {

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
    const markerRefs = useRef(new Map<string, L.Marker>());

    // Normalize Items based on input to match Interface. Memorizado: la
    // ubicación es compartida y cada cambio (p. ej. «buscando…») re-renderiza
    // el mapa; sin esto MapUpdater re-encuadraría y anularía «Centrar en mi
    // ubicación».
    const validItems: MapItem[] = useStableMapItems(items);
    const clusterPoints = useMemo(() => validItems.map((item) => ({
        ...item,
        lat: item.lat!,
        lng: item.lng!,
        score: item.rating,
        alwaysVisible: sponsoredCampaigns.has(item.placeId || item.id),
    })), [validItems, sponsoredCampaigns]);
    const focusItem = useMemo(() => (focusId ? validItems.find((item) => item.id === focusId) ?? null : null), [focusId, validItems]);
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
            <MapContainer center={initialCenter} zoom={12} scrollWheelZoom={scrollWheelZoom} zoomControl={!compact} className="h-full w-full listopic-map">
                <TileLayer
                    key={currentLayer}
                    attribution={activeLayer.attribution}
                    url={activeLayer.url}
                    // Más teselas alrededor y sin pedirlas a medio zoom: al arrastrar no asoman huecos grises.
                    keepBuffer={4}
                    updateWhenZooming={false}
                />
                <TileFilterApplier filter={activeLayer.tileFilter} />

                <MapUpdater center={stableCenter} items={validItems} range={range} location={location} smartFocus={smartFocus} />

                {/* User Location Features */}
                <UserLocationFeatures range={range} />
                {!compact && <CustomLocateControl />}
                {showLayerControl && !compact && <LayerSelectorControl currentLayer={currentLayer} onLayerChange={handleLayerChange} />}

                <FocusOnItem item={focusItem} nonce={focusNonce} markers={markerRefs} />

                <ClusteredPins points={clusterPoints} renderPin={(item) => {
                    const campaignIds = sponsoredCampaigns.get(item.placeId || item.id) || [];
                    const isSponsored = campaignIds.length > 0;
                    return (
                    <Marker
                        ref={(marker) => { if (marker) markerRefs.current.set(item.id, marker); else markerRefs.current.delete(item.id); }}
                        position={[item.lat, item.lng]}
                        icon={createMapPinIcon({ score: item.rating, botScore: item.botRating, emoji: item.emoji, color: item.color, sponsored: isSponsored, mark: item.pinMark, photo: item.pinPhoto })}
                        eventHandlers={{
                            popupopen: () => {
                                haptic('selection');
                                if (!isJefe) campaignIds.forEach((campaignId) => {
                                    void recordSponsoredEvent('placement', campaignId, 'impression').catch(() => undefined);
                                });
                            },
                        }}
                    >
                        <Popup className="listopic-popup" closeButton={false} maxWidth={270} minWidth={250}>
                            {(() => {
                                // Mapa de una Lista: la ficha es del elemento (o elige entre los del sitio).
                                const view = mode === 'list' ? listPopupView(item) : null;
                                const trackClick = () => {
                                    if (!isJefe) campaignIds.forEach((campaignId) => {
                                        void Promise.all([
                                            recordSponsoredEvent('placement', campaignId, 'impression'),
                                            recordSponsoredEvent('placement', campaignId, 'click'),
                                        ]).catch(() => undefined);
                                    });
                                };
                                return (
                            <MapPopupCard
                                title={view ? view.title : item.name}
                                to={view ? view.to : `/place/${item.placeId || item.id}`}
                                photoUrl={view ? view.photoUrl : item.photoUrl}
                                score={view ? view.score : item.rating}
                                sponsored={isSponsored}
                                subtitle={view && view.to !== `/place/${item.placeId || item.id}` ? view.subtitle : (item.subtitle || (!item.rating && item.botRating ? `🤖 ${formatScore(item.botRating)} de bots · aún sin nota de personas` : null) || (item.reviewsCount ? `${item.reviewsCount} ${item.reviewsCount === 1 ? 'reseña' : 'reseñas'}` : null))}
                                onNavigate={trackClick}
                            >
                                {view && view.dishes.length > 0 && (
                                    <ul className="mt-2 max-h-[176px] space-y-1 overflow-y-auto overscroll-contain pr-0.5" aria-label="Elementos de este sitio">
                                        {view.dishes.map((dish) => (
                                            <li key={dish.to}>
                                                <Link to={dish.to!} onClick={trackClick} className="flex items-center gap-2 rounded-lg bg-[var(--lt-card)] p-1 pr-2 text-xs hover:bg-[var(--lt-accent-soft)]">
                                                    {dish.photo
                                                        ? <img src={dish.photo} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-md object-cover" />
                                                        : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--lt-card-strong)]" aria-hidden="true">{dish.pending ? '🏆' : '🍽️'}</span>}
                                                    <span className="min-w-0 flex-1 truncate font-semibold !text-[var(--lt-text)]">{dish.name}</span>
                                                    {dish.pending
                                                        ? <span className="shrink-0 text-[10px] text-[var(--lt-text-muted)]">Sin valorar</span>
                                                        : <span className="shrink-0 font-bold" style={{ color: scoreTextColor(dish.score) }}>{dish.score > 0 ? formatScore(dish.score) : '—'}</span>}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </MapPopupCard>
                                );
                            })()}
                        </Popup>
                    </Marker>
                    );
                }} />
            </MapContainer>
        </div>
    );
});
