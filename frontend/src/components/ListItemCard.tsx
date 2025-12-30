import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, ChevronRight } from 'lucide-react';

interface ListItemCardProps {
    item: {
        id: string; // Group ID (usually placeId or itemId)
        name: string;
        placeId?: string;
        placeName?: string;
        placeCity?: string;
        placeAddress?: string;
        photoUrl?: string; // Best photo from reviews
        avgRating: number;
        reviewCount: number;
        criteriaAverages?: Record<string, number>;
        criteriaDefinition?: Record<string, any>;
    };
    rank?: number;
    isGrid?: boolean;
}

export const ListItemCard: React.FC<ListItemCardProps> = ({ item, rank, isGrid }) => {

    // Helper for score colors (Legacy logic)
    const getScoreColor = (score: number) => {
        if (score >= 9) return 'bg-emerald-500 text-emerald-50';
        if (score >= 7) return 'bg-indigo-500 text-indigo-50';
        if (score >= 5) return 'bg-amber-500 text-amber-50';
        return 'bg-red-500 text-red-50';
    };

    const getBarColor = (score: number) => {
        if (score >= 9) return 'bg-emerald-500';
        if (score >= 7) return 'bg-indigo-500';
        if (score >= 5) return 'bg-amber-500';
        return 'bg-red-500';
    };

    return (
        <article className={`group relative bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-indigo-500/30 rounded-xl overflow-hidden mb-3 transition-all hover:shadow-lg flex shadow-sm ${isGrid ? 'flex-col' : 'flex-col sm:flex-row'}`}>

            {/* Rank Badge (Optional) */}
            {rank && (
                <div className="absolute top-0 left-0 bg-black/60 backdrop-blur-md text-white text-xs font-bold px-2 py-1 rounded-br-lg z-20 border-r border-b border-white/10">
                    #{rank}
                </div>
            )}

            {/* Image Section */}
            <div className={`relative shrink-0 bg-gray-800 ${isGrid ? 'w-full h-48' : 'w-full sm:w-32 h-32'}`}>
                {item.photoUrl ? (
                    <img src={item.photoUrl} alt={item.name} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600 bg-gray-200 dark:bg-gray-800">
                        <MapPin className="w-8 h-8 opacity-50" />
                    </div>
                )}

                {/* Mobile Score Overlay */}
                <div className="absolute bottom-2 right-2 sm:hidden px-2 py-1 rounded-md bg-black/60 backdrop-blur text-white font-bold text-sm border border-white/10">
                    {item.avgRating.toFixed(1)}
                </div>
            </div>

            {/* Content Section */}
            <div className="flex-1 p-3 flex flex-col justify-between">
                <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                        <h3 className="font-display font-bold text-lg text-[var(--text-primary)] truncate pr-2 group-hover:text-indigo-500 transition-colors">
                            {item.placeId ? (
                                <Link to={`/place/${item.placeId}`} className="hover:underline inset-0">{item.name}</Link>
                            ) : (
                                item.name
                            )}
                        </h3>

                        {/* Improved Subtext: Place Name + City */}
                        <div className="text-xs text-[var(--text-secondary)] flex items-center flex-wrap gap-2 mt-1">
                            {item.placeName && item.placeName !== item.name && (
                                <span className="flex items-center gap-1 font-medium text-gray-400">
                                    <MapPin className="w-3 h-3" />
                                    <span className="truncate max-w-[150px]">{item.placeName}</span>
                                </span>
                            )}

                            {(item.placeCity || item.placeAddress) && (
                                <>
                                    <span className="text-gray-600">•</span>
                                    <span className="text-indigo-400/80 font-medium truncate max-w-[150px]">
                                        {item.placeCity || item.placeAddress}
                                    </span>
                                </>
                            )}
                        </div>

                        <div className="text-xs text-gray-500 mt-1">
                            {item.reviewCount} {item.reviewCount === 1 ? 'reseña' : 'reseñas'}
                        </div>
                    </div>

                    {/* Desktop Score */}
                    <div className={`hidden sm:flex flex-col items-center justify-center w-12 h-12 rounded-lg ${getScoreColor(item.avgRating)} shadow-lg`}>
                        <span className="font-display font-bold text-lg text-white">{item.avgRating.toFixed(1)}</span>
                    </div>
                </div>

                {/* Mini Criteria Bars (Legacy Compact Style) */}
                {item.criteriaAverages && item.criteriaDefinition && (
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
                        {Object.entries(item.criteriaAverages || {}).slice(0, 4).map(([key, score]) => {
                            const label = item.criteriaDefinition?.[key]?.label || key;
                            return (
                                <div key={key} className="flex flex-col">
                                    <div className="flex justify-between text-[10px] text-[var(--text-secondary)] mb-0.5">
                                        <span className="truncate max-w-[80%] opacity-80">{label}</span>
                                        <span className="font-mono opacity-100">{score.toFixed(1)}</span>
                                    </div>
                                    <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${getBarColor(score)}`}
                                            style={{ width: `${score * 10}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Interactions / CTA */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block">
                <ChevronRight className="w-5 h-5 text-[var(--text-secondary)]" />
            </div>
        </article>
    );
};
