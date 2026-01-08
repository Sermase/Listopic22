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
    groupingMode?: 'place' | 'dish';
    listId?: string;
}

export const ListItemCard: React.FC<ListItemCardProps> = ({ item, rank, isGrid, groupingMode = 'place', listId }) => {

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
        <article className={`group relative bg-[var(--card-bg)] ${isGrid ? 'border border-[var(--border-color)] rounded-xl mb-3 hover:shadow-lg' : 'hover:bg-white/5'} transition-all overflow-hidden flex shadow-sm ${isGrid ? 'flex-col' : 'flex-row'}`}>

            {/* Rank Badge (Optional) */}
            {/* Rank Badge (Podium) */}
            {rank && (
                <div className={`absolute top-0 left-0 z-20 px-3 py-1.5 rounded-br-xl font-bold text-sm shadow-lg flex items-center justify-center min-w-[36px]
                    ${rank === 1 ? 'bg-yellow-400 text-yellow-950 shadow-yellow-500/20' :
                        rank === 2 ? 'bg-gray-200 text-gray-800 shadow-white/10' :
                            rank === 3 ? 'bg-orange-400 text-orange-950 shadow-orange-500/20' :
                                'bg-black/60 backdrop-blur-md text-white border-r border-b border-white/10 text-xs'
                    }`}>
                    <span className={rank <= 3 ? "scale-110 block" : ""}>#{rank}</span>
                </div>
            )}

            {/* Image Section */}
            <div className={`relative shrink-0 bg-gray-800 ${isGrid ? 'w-full h-48' : 'w-24 sm:w-32'}`}>
                {item.photoUrl ? (
                    <img src={item.photoUrl} alt={item.name} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600 bg-gray-200 dark:bg-gray-800">
                        <MapPin className="w-8 h-8 opacity-50" />
                    </div>
                )}

                {/* Mobile Score Overlay - Only show in Grid Mode on Mobile */}
                {isGrid && (
                    <div className="absolute bottom-2 right-2 sm:hidden px-2 py-1 rounded-md bg-black/60 backdrop-blur text-white font-bold text-sm border border-white/10">
                        {item.avgRating.toFixed(1)}
                    </div>
                )}
            </div>

            {/* Content Section */}
            <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <h3 className="font-display font-bold text-base sm:text-lg text-[var(--text-primary)] leading-tight line-clamp-2 pr-1 group-hover:text-indigo-500 transition-colors">
                            {item.placeId ? (
                                groupingMode === 'dish' ? (
                                    <Link
                                        to={`/group/${item.placeId}/${encodeURIComponent(item.name)}${listId ? `?listId=${listId}` : ''}`}
                                        className="hover:underline inset-0"
                                    >
                                        {item.name}
                                    </Link>
                                ) : (
                                    <Link to={`/place/${item.placeId}`} className="hover:underline inset-0">{item.name}</Link>
                                )
                            ) : (
                                item.name
                            )}
                        </h3>

                        {/* Improved Subtext: Place Name + City */}
                        <div className="text-xs text-[var(--text-secondary)] flex flex-wrap gap-1 mt-1 leading-relaxed">
                            {item.placeName && item.placeName !== item.name && (
                                <span className="flex items-center gap-1 font-medium text-gray-400 truncate max-w-full">
                                    <MapPin className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{item.placeName}</span>
                                </span>
                            )}

                            {(item.placeCity || item.placeAddress) && (
                                <>
                                    <span className="text-gray-600 hidden sm:inline">•</span>
                                    <span className="text-indigo-400/80 font-medium truncate max-w-full block sm:inline">
                                        {item.placeCity || item.placeAddress}
                                    </span>
                                </>
                            )}
                        </div>

                        <div className="text-xs text-gray-500 mt-1">
                            {item.reviewCount} {item.reviewCount === 1 ? 'reseña' : 'reseñas'}
                        </div>
                    </div>

                    {/* Score Box - Visible on Mobile List View now */}
                    <div className={`${isGrid ? 'hidden sm:flex' : 'flex'} flex-col items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg ${getScoreColor(item.avgRating)} shadow-lg shrink-0`}>
                        <span className="font-display font-bold text-base sm:text-lg text-white">{item.avgRating.toFixed(1)}</span>
                    </div>
                </div>

                {/* Mini Criteria Bars (Legacy Compact Style) */}
                {item.criteriaAverages && item.criteriaDefinition && (
                    <div className={`mt-2 grid ${isGrid ? 'grid-cols-2 gap-x-4' : 'grid-cols-4 gap-x-2'} gap-y-0.5 sm:grid-cols-4`}>
                        {Object.entries(item.criteriaAverages || {}).slice(0, 4).map(([key, score]) => {
                            const label = item.criteriaDefinition?.[key]?.label || key;
                            return (
                                <div key={key} className="flex flex-col">
                                    <div className="flex justify-between items-end text-[9px] text-[var(--text-secondary)] leading-none mb-0.5">
                                        <span className="truncate max-w-[70%] opacity-80">{label}</span>
                                        <span className="font-mono opacity-100 font-bold">{score.toFixed(1)}</span>
                                    </div>
                                    <div className="h-0.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
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
