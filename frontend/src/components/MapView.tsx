import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { createLegacyMarkerIcon } from '../utils/mapUtils';
import { useLocation } from '../hooks/useLocation';
import { Locate } from 'lucide-react';
import L from 'leaflet';
import { Link } from 'react-router-dom';

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
                className="bg-[#151b2e] text-white hover:bg-indigo-600 p-3 rounded-full shadow-lg cursor-pointer flex items-center justify-center transition-all border border-white/20 hover:scale-110 active:scale-95"
                title="Centrar en mi ubicación"
            >
                <Locate className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
        </div>
    );
};

export interface MapItem {
    id: string;
    lat?: number;
    lng?: number;
    name: string;
    photoUrl?: string; // Main image
    rating?: number; // Score to display on the pin/card
    reviewsCount?: number;

    // For List Mode grouping
    items?: {
        name: string;
        score: number;
    }[];
}

interface MapViewProps {
    items: any[]; // Accepts raw data, we normalize inside or expect MapItem-like
    mode?: 'global' | 'list'; // 'global' = one pin per place (Home), 'list' = pin shows aggregated list items
    center?: [number, number];
    range?: number | null;
}

// Component to recenter map when items change
// Component to handle View Updates (Zoom/Center)
function MapUpdater({ center, items, range, location }: { center: [number, number], items: any[], range: number | null, location: any }) {
    const map = useMap();

    useEffect(() => {
        if (range !== null && location) {
            // If Range Mode: Center on User & Zoom to Range circle
            // 1km ~ 15, 5km ~ 13, 10km ~ 12, 50km ~ 9/10
            let zoom = 12;
            if (range <= 1) zoom = 15;
            else if (range <= 5) zoom = 13;
            else if (range <= 10) zoom = 12;
            else zoom = 9;

            map.flyTo([location.latitude, location.longitude], zoom, { duration: 1.5 });
        } else if (items.length > 0) {
            // No Range: Fit Bounds of ALL items
            if (items.length === 1 && items[0].lat && items[0].lng) {
                map.flyTo([items[0].lat, items[0].lng], 14, { duration: 1.5 });
            } else {
                const bounds = L.latLngBounds(items.map(i => [i.lat, i.lng] as [number, number]));
                if (bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true, duration: 1.5 });
                }
            }
        } else {
            // Default Fallback
            map.flyTo(center, 10, { duration: 1.5 });
        }
    }, [range, items, center, location, map]);

    return null;
}

export const MapView: React.FC<MapViewProps> = ({ items, mode = 'global', center = [40.416, -3.703], range = null }) => {

    const { location } = useLocation();

    // Normalize Items based on input to match Interface
    const validItems: MapItem[] = items
        .filter(item => (item.lat || item.latitude) && (item.lng || item.longitude))
        .map(item => ({
            id: item.id || item.placeId,
            lat: item.lat || item.latitude,
            lng: item.lng || item.longitude,
            name: item.name || item.placeName || 'Lugar desconocido',
            photoUrl: item.photoUrl || item.placeMainImage || item.mainImageUrl,
            rating: item.rating || item.placeAverageRating || item.overallRating || item.avgRating || 0,
            reviewsCount: item.reviewsCount || item.reviewCount || item.count || 0,
            items: item.items // Only present if pre-grouped for list mode
        }));

    // Determine Initial Map Center (Fallback)
    const initialCenter = location
        ? [location.latitude, location.longitude] as [number, number]
        : (validItems.length > 0 && validItems[0].lat && validItems[0].lng
            ? [validItems[0].lat!, validItems[0].lng!] as [number, number]
            : center);

    return (
        <div className="h-full w-full relative z-0">
            <MapContainer center={initialCenter} zoom={12} scrollWheelZoom={false} className="h-full w-full bg-[#0b1021]">
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />

                <MapUpdater center={center} items={validItems} range={range} location={location} />

                {/* User Location Features */}
                <UserLocationFeatures range={range} />
                <CustomLocateControl />

                {validItems.map((item) => (
                    <Marker
                        key={item.id}
                        position={[item.lat!, item.lng!]}
                        icon={createLegacyMarkerIcon(item.rating || 0)}
                    >
                        <Popup className="legacy-popup" closeButton={false} maxWidth={280} minWidth={260}>
                            <div className="bg-[#0b1021]/95 backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex flex-col w-[260px]">
                                {/* Header Image */}
                                <div className="relative h-36 w-full bg-gray-900 group">
                                    {item.photoUrl ? (
                                        <img src={item.photoUrl} alt={item.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                            <span className="text-gray-600 font-bold text-xs uppercase tracking-widest">Sin foto</span>
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#0b1021] via-transparent to-transparent opacity-90" />

                                    {/* Rating Badge */}
                                    <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-md border border-white/10 px-2 py-1 rounded-lg flex items-center gap-1">
                                        <span className="text-yellow-400 text-xs">★</span>
                                        <span className="text-white font-bold text-xs">{item.rating?.toFixed(1) || '-'}</span>
                                    </div>
                                </div>

                                <div className="p-4 pt-1 relative z-10">
                                    <h3 className="font-display font-bold text-lg text-white leading-tight mb-1 truncate">
                                        {item.name}
                                    </h3>
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider border border-white/5 px-1.5 py-0.5 rounded">
                                            {item.reviewsCount} reseñas
                                        </span>
                                    </div>

                                    {/* Sub Items List (List Mode) */}
                                    {mode === 'list' && item.items && item.items.length > 0 ? (
                                        <div className="space-y-1.5 mb-3">
                                            {item.items.slice(0, 3).map((subItem, idx) => (
                                                <div key={idx} className="flex items-center justify-between text-xs bg-white/5 px-2 py-1.5 rounded border border-white/5">
                                                    <span className="text-gray-300 truncate pr-2 max-w-[150px]">{subItem.name}</span>
                                                    <span className={`font-bold ${subItem.score >= 8 ? 'text-emerald-400' : 'text-indigo-400'}`}>
                                                        {subItem.score.toFixed(1)}
                                                    </span>
                                                </div>
                                            ))}
                                            {item.items.length > 3 && (
                                                <div className="text-center text-[10px] text-gray-500 mt-1">
                                                    +{item.items.length - 3} más
                                                </div>
                                            )}
                                        </div>
                                    ) : null}

                                    <Link
                                        to={`/place/${item.id}`}
                                        className="block w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-center text-sm font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/25 active:scale-95 border border-indigo-500/50"
                                    >
                                        Ver detalles
                                    </Link>
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    );
};
