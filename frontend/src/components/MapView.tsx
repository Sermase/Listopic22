import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { createLegacyMarkerIcon } from '../utils/mapUtils';

interface MapViewProps {
    items: any[]; // Extended ReviewEntity
    center?: [number, number];
}

// The DefaultIcon and L.Marker.prototype.options.icon are removed as createLegacyMarkerIcon will be used per marker.
// let DefaultIcon = L.icon({
//     iconUrl: icon,
//     shadowUrl: iconShadow,
//     iconSize: [25, 41],
//     iconAnchor: [12, 41]
// });

// L.Marker.prototype.options.icon = DefaultIcon;

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
    // items passed here are likely the "groupedItems" from ListPage.
    // They have { avgRating, placeName, placeId, ... } 
    // We need coordinates. If they are not on the group, we might need to find them or they might be missing.
    // The legacy app likely had coordinates on the 'place' object.
    // My aggregation logic in ListPage didn't explicitly preserve coordinates, let me check ListPage.tsx aggregation.
    // ... checking mental model ...
    // In ListPage.tsx I did: 
    // const g = groups[key]; ... if (!g.photoUrl && review.photoUrl) g.photoUrl = review.photoUrl;
    // I DID NOT copy lat/lng! I need to fix that in ListPage.tsx too.

    // Assuming we fix ListPage.tsx to pass lat/lng:
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
