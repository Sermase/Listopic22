import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, User } from 'lucide-react';
import { type ReviewEntity } from '../hooks/useListDetails';

interface ReviewCarouselItemProps {
    review: ReviewEntity;
    variant?: 'review' | 'item';
}

export const ReviewCarouselItem: React.FC<ReviewCarouselItemProps> = ({ review, variant = 'review' }) => {
    // Helper for score color (same as ReviewCard)
    const getScoreColor = (score: number) => {
        if (score >= 9) return 'bg-emerald-500 shadow-emerald-500/50 text-white';
        if (score >= 7) return 'bg-[#fcb900] shadow-amber-500/50 text-black'; // Specific yellow from image roughly
        if (score >= 5) return 'bg-indigo-500 shadow-indigo-500/50 text-white';
        return 'bg-rose-500 shadow-rose-500/50 text-white';
    };

    const scoreColorClass = getScoreColor(review.overallRating || 0);

    return (
        <article className="relative w-[220px] h-[160px] md:w-[260px] md:h-[190px] rounded-3xl overflow-hidden shadow-lg border border-white/5 group bg-gray-900 flex-shrink-0 transition-transform hover:scale-105 duration-300">
            {/* Background Image */}
            <div className="absolute inset-0">
                {review.photoUrl || review.placeMainImage ? (
                    <img
                        src={review.photoUrl || review.placeMainImage}
                        alt={review.itemName}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                        <MapPin className="w-10 h-10 text-gray-700" />
                    </div>
                )}
                {/* Gradient Overlay for Text Readability */}
                <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-[#0b1021]/95 via-[#0b1021]/40 to-transparent" />
            </div>

            {/* Top Elements */}
            <div className="absolute top-3 left-3 right-3 flex justify-between items-start z-10">

                {/* Top Left Pills */}
                {variant === 'review' ? (
                    <div className="flex flex-col items-start gap-1.5 max-w-[70%]">
                        {/* Author Bubble */}
                        <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-full pr-3 pl-1 py-1 shadow-lg">
                            <div className="w-6 h-6 rounded-full overflow-hidden border border-white/20 flex-shrink-0 bg-gray-700">
                                <img
                                    src={review.authorPhoto || `https://ui-avatars.com/api/?name=${review.authorName || 'User'}`}
                                    alt={review.authorName}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <span className="text-[10px] font-bold text-white truncate leading-none">
                                {review.authorName?.split(' ')[0] || 'Anónimo'}
                            </span>
                        </div>

                        {/* City Bubble (Small, Below) */}
                        {(review as any).placeCity && (
                            <div className="flex items-center gap-1 bg-black/40 backdrop-blur-md border border-white/10 rounded-full px-2 py-0.5 shadow-lg ml-0.5">
                                <MapPin className="w-2.5 h-2.5 text-white/70" />
                                <span className="text-[9px] font-bold text-white/90 truncate leading-none uppercase tracking-wide">
                                    {(review as any).placeCity}
                                </span>
                            </div>
                        )}
                    </div>
                ) : (
                    // Item Variant: Single City Bubble
                    (review as any).placeCity ? (
                        <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md border border-white/10 rounded-full px-2.5 py-1 shadow-lg max-w-[70%]">
                            <MapPin className="w-3 h-3 text-white/80" />
                            <span className="text-[10px] font-bold text-white truncate leading-none uppercase tracking-wide">
                                {(review as any).placeCity}
                            </span>
                        </div>
                    ) : null
                )}

                {/* Score Bubble */}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shadow-lg backdrop-blur-sm border border-white/10 ${scoreColorClass}`}>
                    <span className="font-display font-bold text-sm">
                        {review.overallRating?.toFixed(1) || '-'}
                    </span>
                </div>
            </div>

            {/* Bottom Content */}
            <div className="absolute bottom-3 left-3 right-3 z-10 text-left">
                <h3 className="text-white font-bold text-sm leading-tight mb-0.5 line-clamp-1 group-hover:text-indigo-300 transition-colors">
                    {review.itemName}
                </h3>

                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">
                        {review.placeName}
                    </span>
                </div>

                {/* Likes/Social indicator (Optional, requested "lo que sale en la foto" - usually location is key, maybe likes count?) */}
                {/* If the photo showed extra details, we can add them. For now Location + Title is standard. */}
            </div>

            {/* Full Card Link */}
            <Link
                to={review.placeId ? `/group/${review.placeId}/${encodeURIComponent(review.itemName)}` : '#'}
                className="absolute inset-0 z-20"
                aria-label={`Ver reseña de ${review.itemName}`}
            />
        </article >
    );
};
