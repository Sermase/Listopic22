import React, { useState } from 'react';
import { MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import { ProgressiveImage } from './ProgressiveImage';

interface ReviewPhotoCarouselProps {
    photoUrls?: string[];
    photoUrl?: string;
    placeMainImage?: string;
    itemName: string;
    placeName?: string;
    overallRating?: number;
    placeCity?: string;
}

export const ReviewPhotoCarousel: React.FC<ReviewPhotoCarouselProps> = ({
    photoUrls,
    photoUrl,
    placeMainImage,
    itemName,
    placeName,
    overallRating,
    placeCity,
}) => {
    const [carouselIdx, setCarouselIdx] = useState(0);

    const allPhotos = photoUrls?.length ? photoUrls : (photoUrl ? [photoUrl] : []);
    const hasPhotos = allPhotos.length > 0;
    const safeIdx = Math.min(carouselIdx, Math.max(0, allPhotos.length - 1));

    const goLeft = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCarouselIdx(i => (i - 1 + allPhotos.length) % allPhotos.length);
    };
    const goRight = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCarouselIdx(i => (i + 1) % allPhotos.length);
    };

    const bubbleColor = overallRating && overallRating >= 7
        ? 'from-emerald-500 to-teal-500'
        : overallRating && overallRating >= 5
            ? 'from-yellow-400 to-orange-500'
            : 'from-red-500 to-pink-500';

    return (
        <div className={`relative w-[calc(100%-1.5rem)] mx-auto rounded-[1.25rem] overflow-hidden bg-gray-900 shadow-inner group/image ${hasPhotos ? 'aspect-auto' : 'h-32 sm:h-40'}`}>
            {hasPhotos ? (
                <>
                    <ProgressiveImage
                        src={allPhotos[safeIdx]}
                        alt={itemName}
                        containerClassName="w-full h-auto"
                        className="w-full h-auto object-cover block"
                        fallback={
                            <div className="h-32 sm:h-40 w-full flex flex-col items-center justify-center text-gray-700 bg-gray-800/40">
                                <MapPin className="w-8 h-8 mb-1 opacity-20" />
                            </div>
                        }
                    />
                    {allPhotos.length > 1 && (
                        <>
                            <button onClick={goLeft} className="absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full p-1.5 transition-all">
                                <ChevronLeft className="w-4 h-4 text-white" />
                            </button>
                            <button onClick={goRight} className="absolute right-2 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full p-1.5 transition-all">
                                <ChevronRight className="w-4 h-4 text-white" />
                            </button>
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
                                {allPhotos.map((_, i) => (
                                    <button
                                        key={i}
                                        onClick={e => { e.stopPropagation(); setCarouselIdx(i); }}
                                        className={`w-1.5 h-1.5 rounded-full transition-all ${i === safeIdx ? 'bg-white scale-125' : 'bg-white/40'}`}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </>
            ) : (
                placeMainImage ? (
                    <ProgressiveImage
                        src={placeMainImage}
                        alt={placeName}
                        containerClassName="w-full h-full"
                        className="w-full h-full object-cover object-center opacity-60 group-hover/image:scale-105 transition-transform duration-700"
                        fallback={
                            <div className="w-full h-full flex flex-col items-center justify-center text-gray-700 bg-gray-800/10">
                                <MapPin className="w-8 h-8 mb-1 opacity-20" />
                            </div>
                        }
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-700 bg-gray-800/10">
                        <MapPin className="w-8 h-8 mb-1 opacity-20" />
                    </div>
                )
            )}

            <div className={`absolute ${(photoUrls?.length || photoUrl) ? 'top-4 right-4 flex-col items-end gap-2' : 'top-1/2 -translate-y-1/2 right-4 flex-row items-center gap-3'} flex z-10`}>
                {placeCity && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 border border-white/10 backdrop-blur-md shadow-lg transform transition-transform group-hover:scale-105">
                        <MapPin className="w-3.5 h-3.5 text-white/90" />
                        <span className="text-white font-bold text-xs uppercase tracking-wide">{placeCity}</span>
                    </div>
                )}
                <div className="relative w-16 h-16 flex items-center justify-center animate-blob transition-all duration-500 group-hover:scale-110">
                    <div className={`absolute inset-0 bg-gradient-to-br ${bubbleColor} opacity-90 blur-sm rounded-full`} />
                    <div className={`relative w-full h-full bg-gradient-to-br ${bubbleColor} flex items-center justify-center shadow-lg border-2 border-white/10 backdrop-blur-sm rounded-full`}>
                        <span className="text-white font-display font-bold text-2xl drop-shadow-md">
                            {overallRating?.toFixed(1) || '-'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};
