import React from 'react';
import { Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getPlaceTypeLabel } from '../utils/placeTypeLabels';
import { PlacePhotoPlaceholder } from './PlacePhotoPlaceholder';
import { ProgressiveImage } from './ProgressiveImage';

interface PlaceCardProps {
    place: {
        objectID: string;
        name: string;
        address?: string;
        city?: string;
        averageRating?: number; // Algolia field
        googleRating?: number;
        photoUrl?: string; // If available
        types?: string[];
        priceLevel?: number;
    };
}

export const PlaceCard: React.FC<PlaceCardProps> = ({ place }) => {
    const rating = place.averageRating || place.googleRating || 0;

    return (
        <Link
            to={`/place/${place.objectID}`}
            className="block h-full group"
        >
            <div className="glass-card h-full flex flex-col">
                {/* Image Placeholder or Actual Image */}
                <div className="h-32 bg-gray-800 relative">
                    {place.photoUrl ? (
                        <ProgressiveImage
                            src={place.photoUrl}
                            alt={place.name}
                            containerClassName="w-full h-full"
                            className="w-full h-full object-cover"
                            fallback={<PlacePhotoPlaceholder compact />}
                        />
                    ) : (
                        <PlacePhotoPlaceholder compact />
                    )}
                    {rating > 0 && (
                        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-0.5 rounded text-xs font-bold text-white flex items-center gap-1">
                            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                            {rating.toFixed(1)}
                        </div>
                    )}
                </div>

                <div className="p-4 flex-1 flex flex-col">
                    <h3 className="text-white font-bold text-lg mb-1 group-hover:text-[var(--lt-accent)] transition-colors line-clamp-1">{place.name}</h3>
                    <p className="text-gray-400 text-sm mb-3 line-clamp-1">{place.address || place.city}</p>

                    <div className="mt-auto flex flex-wrap gap-2">
                        {place.types?.slice(0, 3).map((t) => (
                            <span key={t} className="px-2 py-0.5 bg-white/5 rounded text-xs text-gray-400 border border-white/5">
                                {getPlaceTypeLabel(t)}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </Link>
    );
};
