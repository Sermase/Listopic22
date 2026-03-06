import React from 'react';
import { Link } from 'react-router-dom';

import { MapPin, ChevronRight, Users } from 'lucide-react';

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
        authorName?: string;
        authorPhoto?: string;
        listName?: string; // For items (to show which list they belong to)
        followersCount?: number;
        itemCount?: number;
        listId?: string;
    };
    rank?: number;
    isGrid?: boolean;
    groupingMode?: 'place' | 'dish' | 'list';
    listId?: string; // Outer phrasing, maybe redundant with item.listId but keeping for compat
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

    // New format for stats (similar to Carousels)
    const renderStats = () => {
        if (groupingMode === 'place' || groupingMode === 'dish') {
            // For Places/Items, usually we show review count (already there)
            return null;
        }
        // For Lists
        return (
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 font-medium">
                {item.itemCount !== undefined && (
                    <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {item.itemCount} lugares
                    </span>
                )}
                {item.followersCount !== undefined && (
                    <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {item.followersCount} seg.
                    </span>
                )}
            </div>
        );
    };

    const criteriaPreview = React.useMemo(() => {
        if (!item.criteriaAverages) return [];

        const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
        const definitionAny = item.criteriaDefinition as any;
        const averages = item.criteriaAverages;
        const averageKeys = Object.keys(averages);
        const keySet = new Set(averageKeys);
        const orderedKeys: string[] = [];

        const getLabel = (key: string) => {
            if (Array.isArray(definitionAny)) {
                const found = definitionAny.find((d: any) => d?.id === key);
                return found?.label || key;
            }
            if (definitionAny && typeof definitionAny === 'object') {
                return definitionAny[key]?.label || key;
            }
            return key;
        };

        if (Array.isArray(definitionAny)) {
            definitionAny.forEach((def: any) => {
                if (typeof def?.id === 'string' && keySet.has(def.id)) {
                    orderedKeys.push(def.id);
                }
            });
        } else if (definitionAny && typeof definitionAny === 'object') {
            orderedKeys.push(
                ...Object.keys(definitionAny)
                    .filter((key) => keySet.has(key))
                    .sort((a, b) => collator.compare(getLabel(a), getLabel(b)))
            );
        }

        const used = new Set(orderedKeys);
        const remaining = averageKeys
            .filter((key) => !used.has(key))
            .sort((a, b) => collator.compare(getLabel(a), getLabel(b)));

        return [...orderedKeys, ...remaining].map((key) => ({
            key,
            label: getLabel(key),
            score: averages[key]
        }));
    }, [item.criteriaAverages, item.criteriaDefinition]);

    // --- Render Content ---
    return (
        <article className={`group relative bg-[var(--card-bg)] transition-all overflow-hidden shadow-sm hover:shadow-xl 
            ${isGrid
                ? 'flex flex-row md:flex-col h-28 sm:h-32 md:h-64 rounded-xl' // Grid mode: Fixed height horizontal on mobile, Vertical on desktop
                : 'flex flex-row rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10'}`}>

            {/* --- GRID MODE (Rich Background Card - DESKTOP ONLY / Horizontal Mobile) --- */}
            {isGrid ? (
                <>
                    {/* Desktop View (Background Image Card) - Hidden on Mobile */}
                    <div className="hidden md:block absolute inset-0 bg-gray-900">
                        {item.photoUrl ? (
                            <img src={item.photoUrl} alt={item.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-60 group-hover:scale-105 transition-all duration-500" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-800 text-gray-700">
                                <MapPin className="w-12 h-12 opacity-20" />
                            </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1021] via-[#0b1021]/60 to-transparent" />
                    </div>

                    {/* Mobile View (Thumbnail Left) - Visible Only on Mobile */}
                    <div className="md:hidden w-28 h-28 shrink-0 relative bg-gray-800">
                        {item.photoUrl ? (
                            <img src={item.photoUrl} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-800 text-gray-700">
                                <MapPin className="w-8 h-8 opacity-20" />
                            </div>
                        )}
                        {/* Rank on Mobile Image */}
                        {rank && (
                            <div className="absolute top-0 left-0 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded-br-lg">
                                #{rank}
                            </div>
                        )}
                    </div>

                    {/* Content Container */}
                    <div className="relative flex-1 p-3 md:p-4 flex flex-col justify-between md:absolute md:inset-0 md:justify-end z-20 min-w-0">

                        {/* Tags - Top Left (Desktop) / Inline Top (Mobile) */}
                        <div className="flex flex-wrap gap-2 mb-1 md:mb-3 items-center md:absolute md:top-3 md:left-3 md:z-30 md:max-w-[90%] pointer-events-none">

                            {/* List Badge */}
                            {item.listName && (
                                <div className="pointer-events-auto shadow-sm md:shadow-lg">
                                    {item.listId ? (
                                        <Link
                                            to={`/list/${item.listId}`}
                                            onClick={(e) => e.stopPropagation()}
                                            className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold bg-black/60 backdrop-blur-md text-indigo-300 border border-white/10 truncate hover:text-indigo-200 transition-colors shadow-sm"
                                        >
                                            {item.listName}
                                        </Link>
                                    ) : (
                                        <span className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold bg-black/60 backdrop-blur-md text-indigo-300 border border-white/10 truncate shadow-sm">
                                            {item.listName}
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Place Badge */}
                            {(item.placeName || item.placeCity || item.placeAddress) && (
                                <div className="pointer-events-auto">
                                    <span className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold bg-black/60 backdrop-blur-md text-white border border-white/10 truncate shadow-sm">
                                        <MapPin className="w-3 h-3 mr-1 text-emerald-400" />
                                        {item.placeName || item.placeCity || item.placeAddress?.split(',')[0]}
                                    </span>
                                </div>
                            )}
                        </div>


                        {/* Main Content Info */}
                        <div className="pointer-events-auto md:mt-auto">
                            <h3 className="font-display font-bold text-sm sm:text-base md:text-xl text-[var(--text-primary)] md:text-white leading-tight mb-1 group-hover:text-indigo-500 md:group-hover:text-indigo-300 transition-colors line-clamp-2 md:drop-shadow-md">
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
                                    <Link to={`/list/${item.id}`} className="hover:underline inset-0">{item.name}</Link>
                                )}
                            </h3>

                            {/* Author info (List only) */}
                            {item.authorName && !item.placeName && (
                                <div className="flex items-center gap-1.5 opacity-90 mb-1">
                                    {item.authorPhoto && <img src={item.authorPhoto} className="w-4 h-4 rounded-full border border-gray-200 md:border-white/20" alt="" />}
                                    <span className="text-gray-500 md:text-gray-300 text-xs">por <span className="text-gray-700 md:text-white font-medium">{item.authorName}</span></span>
                                </div>
                            )}

                            {/* Stats Row */}
                            <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-800 md:border-white/10 pt-2 mt-2">
                                <div className="flex items-center gap-3 text-xs text-gray-500 md:text-gray-300 font-medium">
                                    {(item.reviewCount > 0 || (groupingMode !== 'place' && groupingMode !== 'dish')) && (
                                        <span className="flex items-center gap-1">
                                            <Users className="w-3 h-3 text-indigo-500 md:text-indigo-400" />
                                            {item.followersCount !== undefined ? item.followersCount : item.reviewCount}
                                        </span>
                                    )}
                                    {item.itemCount !== undefined && (
                                        <span className="flex items-center gap-1">
                                            <MapPin className="w-3 h-3 text-indigo-500 md:text-indigo-400" /> {item.itemCount}
                                        </span>
                                    )}
                                </div>
                                {/* Score */}
                                {groupingMode !== 'list' && (
                                    <div className={`flex items-center justify-center w-7 h-7 md:w-8 md:h-8 rounded-lg ${getScoreColor(item.avgRating)} shadow-sm md:shadow-lg font-bold text-white text-xs md:text-sm`}>
                                        {item.avgRating.toFixed(1)}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Desktop Rank Badge (Top Right) */}
                    {rank && (
                        <div className={`hidden md:block absolute top-0 right-0 z-20 px-3 py-1.5 rounded-bl-xl font-bold text-xs shadow-lg backdrop-blur-md
                            ${rank === 1 ? 'bg-yellow-500/80 text-white' :
                                rank === 2 ? 'bg-gray-400/80 text-white' :
                                    rank === 3 ? 'bg-orange-500/80 text-white' :
                                        'bg-black/40 text-white border-l border-b border-white/10'}`}>
                            #{rank}
                        </div>
                    )}
                </>
            ) : (
                /* --- LIST MODE (Horizontal Compact) --- */
                <>
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
                    <div className="relative shrink-0 bg-gray-800 w-24 h-24 sm:w-32 sm:h-32">
                        {item.photoUrl ? (
                            <img src={item.photoUrl} alt={item.name} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-600 bg-gray-200 dark:bg-gray-800">
                                <MapPin className="w-8 h-8 opacity-50" />
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
                                        <Link to={`/list/${item.id}`} className="hover:underline inset-0">{item.name}</Link>
                                    )}
                                </h3>

                                {/* Improved Subtext: Place Name + City */}
                                <div className="text-xs text-[var(--text-secondary)] flex flex-wrap gap-1 mt-1 leading-relaxed">
                                    {/* Place Context (Items/Places) */}
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

                                    {/* List Context Badge (for Items) */}
                                    {item.listName && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 truncate max-w-[120px]">
                                            {item.listName}
                                        </span>
                                    )}

                                    {/* Author Context (Lists) */}
                                    {item.authorName && !item.placeName && (
                                        <div className="flex items-center gap-2">
                                            {item.authorPhoto && <img src={item.authorPhoto} className="w-4 h-4 rounded-full" alt="" />}
                                            <span className="text-gray-400">por <span className="text-gray-300 font-medium">{item.authorName}</span></span>
                                        </div>
                                    )}
                                </div>

                                <div className="text-xs text-gray-500 mt-1">
                                    {item.reviewCount > 0 && `${item.reviewCount} ${item.reviewCount === 1 ? 'reseña' : 'reseñas'}`}
                                </div>

                                {/* List Stats */}
                                {renderStats()}
                            </div>

                            {/* Score Box - Visible on Mobile List View now */}
                            <div className={`flex flex-col items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg ${getScoreColor(item.avgRating)} shadow-lg shrink-0`}>
                                <span className="font-display font-bold text-base sm:text-lg text-white">{item.avgRating.toFixed(1)}</span>
                            </div>
                        </div>

                        {/* Mini Criteria Bars (Legacy Compact Style) */}
                        {criteriaPreview.length > 0 && (
                            <div className="mt-2 grid grid-cols-4 gap-x-2 gap-y-0.5 sm:grid-cols-4">
                                {criteriaPreview.slice(0, 4).map(({ key, label, score }) => {
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
                </>
            )}
        </article>
    );
};
