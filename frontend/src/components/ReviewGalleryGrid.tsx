import React from 'react';
import { ChevronUp } from 'lucide-react';
import { ProgressiveImage } from './ProgressiveImage';
import { ReviewCard } from './ReviewCard';
import { type ReviewEntity } from '../hooks/useListDetails';

const getScoreBubbleClass = (score: number) => {
    if (score >= 7) return 'from-emerald-500 to-teal-500';
    if (score >= 5) return 'from-yellow-400 to-orange-500';
    return 'from-red-500 to-pink-500';
};

interface ReviewGalleryGridProps {
    reviews: ReviewEntity[];
    expandedReviewIds: string[];
    setExpandedReviewIds: React.Dispatch<React.SetStateAction<string[]>>;
    onDelete: (id: string) => void;
    onEdit: (review: ReviewEntity) => void;
}

export const ReviewGalleryGrid: React.FC<ReviewGalleryGridProps> = ({
    reviews,
    expandedReviewIds,
    setExpandedReviewIds,
    onDelete,
    onEdit,
}) => (
    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1 sm:gap-2">
        {reviews.map((review: any) => {
            const firstPhoto = review.photoUrls?.[0] || review.photoUrl || review.photos?.[0] || null;
            const isPlaceImage = !firstPhoto && !!review.placeMainImage;
            const photoUrl = firstPhoto || review.placeMainImage || null;
            const score = typeof review.overallRating === 'number' ? review.overallRating : Number(review.overallRating) || 0;
            const isExpanded = expandedReviewIds.includes(review.id);

            if (isExpanded) {
                return (
                    <div key={review.id} className="col-span-3 md:col-span-4 lg:col-span-5 mb-4 animate-[fade-in_0.2s_ease-out] flex flex-col">
                        <div className="flex justify-center mb-3">
                            <button
                                onClick={(e) => { e.stopPropagation(); setExpandedReviewIds(prev => prev.filter(id => id !== review.id)); }}
                                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 hover:from-indigo-500/20 hover:to-purple-500/20 text-gray-200 hover:text-white text-sm font-semibold rounded-full transition-all border border-indigo-500/30 hover:border-indigo-400/50 shadow-[0_0_15px_-3px_rgba(99,102,241,0.2)]"
                                aria-label="Cerrar reseña"
                            >
                                <ChevronUp className="w-4 h-4" />
                                <span>Cerrar reseña</span>
                            </button>
                        </div>
                        <ReviewCard review={review} onDelete={onDelete} onEdit={onEdit} />
                    </div>
                );
            }

            return (
                <div
                    key={review.id}
                    onClick={() => setExpandedReviewIds(prev => prev.includes(review.id) ? [] : [review.id])}
                    className="group relative aspect-square bg-gray-800 rounded-lg overflow-hidden cursor-pointer border border-[var(--lt-bg)] hover:border-indigo-500 transition-colors"
                >
                    {photoUrl ? (
                        <>
                            <ProgressiveImage
                                src={photoUrl}
                                alt={review.placeName || review.itemName || 'Lugar'}
                                containerClassName="w-full h-full"
                                className={`w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ${isPlaceImage ? 'opacity-40 saturate-50' : ''}`}
                            />
                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1.5 pt-6">
                                <p className="text-[10px] sm:text-xs text-white font-bold line-clamp-1 leading-tight drop-shadow-md">
                                    {review.placeName || review.itemName || 'Lugar'}
                                </p>
                                {review.itemName && review.itemName !== review.placeName && (
                                    <p className="text-[9px] sm:text-[10px] text-white/65 line-clamp-1 leading-tight mt-0.5">
                                        {review.itemName}
                                    </p>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-gradient-to-br from-[var(--lt-card-strong)] to-[var(--lt-bg)]">
                            <span className="text-[10px] sm:text-xs font-bold text-gray-300 line-clamp-1">
                                {review.placeName || review.itemName || 'Lugar'}
                            </span>
                            {review.itemName && review.itemName !== review.placeName && (
                                <span className="text-[9px] text-gray-500 line-clamp-1 w-full mt-0.5">
                                    {review.itemName}
                                </span>
                            )}
                        </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                    <div className={`absolute top-1 right-1 sm:top-2 sm:right-2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-r ${getScoreBubbleClass(score)} text-white font-black text-[10px] sm:text-xs flex items-center justify-center shadow-lg border border-[var(--lt-bg)]`}>
                        {score.toFixed(1)}
                    </div>
                </div>
            );
        })}
    </div>
);
