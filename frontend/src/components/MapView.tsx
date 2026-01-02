import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { createLegacyMarkerIcon } from '../utils/mapUtils';
import { useLocation } from '../hooks/useLocation';
import { Locate } from 'lucide-react';
import L from 'leaflet';

// Component to handle User Location Marker
const UserLocationMarker = () => {
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
        <Marker
            position={[location.latitude, location.longitude]}
            icon={blueDotIcon}
            zIndexOffset={1000} // Bring to front
        >
            <Popup>
                <div className="text-sm font-bold text-gray-900">Tu ubicación</div>
            </Popup>
        </Marker>
    );
};

// Component to handle "Center on Me" button
const LocateControl = () => {
    const map = useMap();
    const { location, requestLocation, loading } = useLocation();

    const handleLocate = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent map click propagation
        requestLocation();
        if (location) {
            map.flyTo([location.latitude, location.longitude], 15, {
                animate: true,
                duration: 1.5
            });
        }
    };

    return (
        <div className="leaflet-bottom leaflet-right">
            <div className="leaflet-control leaflet-bar !border-0 !m-4 pointer-events-auto">
                <button
                    onClick={handleLocate}
                    className="bg-white/90 backdrop-blur-sm text-gray-700 hover:text-indigo-600 hover:bg-white p-2 rounded-lg shadow-xl cursor-pointer flex items-center justify-center transition-colors w-10 h-10 border border-black/10"
                    title="Centrar en mi ubicación"
                >
                    <Locate className={`w-5 h-5 ${loading ? 'animate-spin text-indigo-500' : ''}`} />
                </button>
            </div>
        </div>
    );
};

interface MapViewProps {
    items: any[]; // Extended ReviewEntity
    center?: [number, number];
}

// Component to recenter map when items change
function ChangeView({ center }: { center: [number, number] }) {
    const map = useMap();
    useEffect(() => {
        map.flyTo(center, 13);
    }, [center, map]);
    return null;
}

export const MapView: React.FC<MapViewProps> = ({ items, center = [40.416, -3.703] }) => {
    // Filter valid items
    const validItems = items.filter(item => item.lat && item.lng);

    const mapCenter = validItems.length > 0
        ? [validItems[0].lat, validItems[0].lng] as [number, number]
        : center;

    return (
        <div className="h-[500px] w-full rounded-xl overflow-hidden border border-white/10 z-0 relative shadow-2xl">
            <MapContainer center={mapCenter} zoom={13} scrollWheelZoom={false} className="h-full w-full bg-[#0b1021]">
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />

                <ChangeView center={mapCenter} />

                {/* User Location Features */}
                <UserLocationMarker />
                <LocateControl />

                {validItems.map((item) => (
                    <Marker
                        key={item.id}
                        position={[item.lat, item.lng]}
                        icon={createLegacyMarkerIcon(item.avgRating || item.totalRating || 0)} // Use legacy icon logic
                    >
                        <Popup className="legacy-popup text-gray-900 font-sans">
                            <div className="min-w-[150px] p-2">
                                <h3 className="font-bold text-base mb-1">{item.name}</h3>
                                {item.placeName && item.placeName !== item.name && (
                                    <p className="text-xs text-gray-500 mb-2">{item.placeName}</p>
                                )}
                                <div className="flex items-center gap-2 mt-2">
                                    <span className="font-bold text-lg text-indigo-600">{item.avgRating?.toFixed(1)}</span>
                                    <span className="text-xs text-gray-400">({item.reviewCount} reseñas)</span>
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    );
};
