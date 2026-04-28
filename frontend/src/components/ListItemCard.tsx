import React from 'react';
import { Link } from 'react-router-dom';

import { MapPin, ChevronRight, Users, Star } from 'lucide-react';
import { PlacePhotoPlaceholder } from './PlacePhotoPlaceholder';

type CriteriaDefinitionEntry = {
    id?: string;
    label?: string;
};

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
        criteriaDefinition?: Record<string, CriteriaDefinitionEntry> | CriteriaDefinitionEntry[];
        authorName?: string;
        authorPhoto?: string;
        listName?: string; // For items (to show which list they belong to)
        followersCount?: number;
        itemCount?: number;
        listId?: string;
        placeClosedStatus?: string | null;
        tags?: string[];
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
        if (score >= 7) return 'bg-[var(--lt-accent)] text-indigo-50';
        if (score >= 5) return 'bg-amber-500 text-amber-50';
        return 'bg-red-500 text-red-50';
    };

    const getBarColor = (score: number) => {
        if (score >= 9) return 'bg-emerald-500';
        if (score >= 7) return 'bg-[var(--lt-accent)]';
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
                {item.reviewCount !== undefined && (
                    <span className="flex items-center gap-1">
                        <Star className="w-3 h-3" /> {item.reviewCount} reseñas
                    </span>
                )}
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
        const definition = item.criteriaDefinition;
        const averages = item.criteriaAverages;
        const averageKeys = Object.keys(averages);
        const keySet = new Set(averageKeys);
        const orderedKeys: string[] = [];

        const getLabel = (key: string) => {
            if (Array.isArray(definition)) {
                const found = definition.find((d) => d?.id === key);
                return found?.label || key;
            }
            if (definition) {
                return definition[key]?.label || key;
            }
            return key;
        };

        if (Array.isArray(definition)) {
            definition.forEach((def) => {
                if (typeof def?.id === 'string' && keySet.has(def.id)) {
                    orderedKeys.push(def.id);
                }
            });
        } else if (definition) {
            orderedKeys.push(
                ...Object.keys(definition)
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
        <article className={`group relative glass-card
            ${isGrid
                ? 'flex flex-row min-h-[120px] md:min-h-[148px]'
                : 'flex flex-row min-h-[120px]'}`}>

            {/* --- GRID MODE (Horizontal compact — same on mobile and desktop) --- */}
            {isGrid ? (
                <>
                    {/* Thumbnail */}
                    <div className="w-28 md:w-36 shrink-0 self-stretch relative bg-gray-800">
                        {item.photoUrl ? (
                            <img src={item.photoUrl} alt={item.name} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                        ) : (
                            <PlacePhotoPlaceholder compact />
                        )}
                        {rank && (
                            <div className="absolute top-0 left-0 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded-br-lg">
                                #{rank}
                            </div>
                        )}
                    </div>

                    {/* Content area */}
                    <div className="flex-1 p-3 flex flex-col justify-between min-w-0">

                        {/* Context badges */}
                        <div className="flex flex-wrap gap-1 mb-1">
                            {item.listName && (
                                item.listId ? (
                                    <Link
                                        to={`/list/${item.listId}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] border border-[var(--lt-accent-border)] truncate hover:text-[var(--lt-accent)] transition-colors max-w-[120px]"
                                    >
                                        {item.listName}
                                    </Link>
                                ) : (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] border border-[var(--lt-accent-border)] truncate max-w-[120px]">
                                        {item.listName}
                                    </span>
                                )
                            )}
                            {(item.placeName || item.placeCity) && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/5 text-gray-300 border border-white/10 truncate max-w-[120px]">
                                    <MapPin className="w-2.5 h-2.5 mr-0.5 text-emerald-400 shrink-0" />
                                    {item.placeName || item.placeCity}
                                </span>
                            )}
                        </div>

                        {/* Title */}
                        <div className="mb-1">
                            <h3 className="font-display font-bold text-sm md:text-base text-[var(--text-primary)] leading-tight group-hover:text-[var(--lt-accent)] transition-colors line-clamp-2">
                                {item.placeId ? (
                                    groupingMode === 'dish' ? (
                                        <Link to={`/group/${item.placeId}/${encodeURIComponent(item.name)}${listId ? `?listId=${listId}` : ''}`} className="hover:underline">{item.name}</Link>
                                    ) : (
                                        <Link to={`/place/${item.placeId}`} className="hover:underline">{item.name}</Link>
                                    )
                                ) : (
                                    <Link to={`/list/${item.id}`} className="hover:underline">{item.name}</Link>
                                )}
                            </h3>
                            {item.placeClosedStatus && (
                                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold border mt-0.5 ${
                                    item.placeClosedStatus === 'permanently_closed'
                                        ? 'bg-red-500/15 border-red-500/30 text-red-400'
                                        : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                                }`}>
                                    {item.placeClosedStatus === 'permanently_closed' ? '🔒 Cerrado' : '⏰ Temp.'}
                                </span>
                            )}
                        </div>

                        {/* Author (lists) */}
                        {item.authorName && !item.placeName && (
                            <div className="flex items-center gap-1 mb-1">
                                {item.authorPhoto && <img src={item.authorPhoto} className="w-4 h-4 rounded-full" alt="" />}
                                <span className="text-gray-500 text-xs truncate">por <span className="text-gray-400 font-medium">{item.authorName}</span></span>
                            </div>
                        )}

                        {/* Tags (max 3 on mobile, 4 on desktop) */}
                        {item.tags && item.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1">
                                {item.tags.slice(0, 3).map(tag => (
                                    <span key={tag} className="px-1.5 py-0.5 bg-white/5 text-gray-400 border border-white/10 rounded text-[10px] font-medium truncate max-w-[72px]">{tag}</span>
                                ))}
                                {item.tags.length > 3 && (
                                    <span className="hidden md:inline px-1.5 py-0.5 bg-white/5 text-gray-400 border border-white/10 rounded text-[10px]">{item.tags[3]}</span>
                                )}
                            </div>
                        )}

                        {/* Stats + Score */}
                        <div className="flex items-center justify-between border-t border-white/5 pt-1.5 mt-auto">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 font-medium">
                                {groupingMode === 'list' ? (
                                    <>
                                        <span className="flex items-center gap-0.5">
                                            <Star className="w-3 h-3 text-[var(--lt-accent)]" /> {item.reviewCount}
                                        </span>
                                        {item.followersCount !== undefined && (
                                            <span className="flex items-center gap-0.5">
                                                <Users className="w-3 h-3 text-[var(--lt-accent)]" /> {item.followersCount}
                                            </span>
                                        )}
                                    </>
                                ) : item.reviewCount > 0 && (
                                    <span className="flex items-center gap-0.5">
                                        <Star className="w-3 h-3 text-[var(--lt-accent)]" />
                                        {item.reviewCount}
                                    </span>
                                )}
                                {item.itemCount !== undefined && (
                                    <span className="flex items-center gap-0.5">
                                        <MapPin className="w-3 h-3 text-[var(--lt-accent)]" /> {item.itemCount}
                                    </span>
                                )}
                            </div>
                            {groupingMode !== 'list' && (
                                <div className={`flex items-center justify-center w-7 h-7 rounded-lg ${getScoreColor(item.avgRating)} font-bold text-white text-xs shrink-0`}>
                                    {item.avgRating.toFixed(1)}
                                </div>
                            )}
                        </div>
                    </div>
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
                            <PlacePhotoPlaceholder compact />
                        )}
                    </div>

                    {/* Content Section */}
                    <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                        <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0 flex-1">
                                <h3 className="font-display font-bold text-base sm:text-lg text-[var(--text-primary)] leading-tight line-clamp-2 pr-1 group-hover:text-[var(--lt-accent)] transition-colors">
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
                                            <span className="text-[var(--lt-accent)]/80 font-medium truncate max-w-full block sm:inline">
                                                {item.placeCity || item.placeAddress}
                                            </span>
                                        </>
                                    )}

                                    {/* List Context Badge (for Items) */}
                                    {item.listName && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] border border-[var(--lt-accent-border)] truncate max-w-[120px]">
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
                            {groupingMode !== 'list' && (
                                <div className={`flex flex-col items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg ${getScoreColor(item.avgRating)} shadow-lg shrink-0`}>
                                    <span className="font-display font-bold text-base sm:text-lg text-white">{item.avgRating.toFixed(1)}</span>
                                </div>
                            )}
                        </div>

                        {/* Tags */}
                        {item.tags && item.tags.length > 0 && criteriaPreview.length === 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {item.tags.slice(0, 4).map(tag => (
                                    <span key={tag} className="px-1.5 py-0.5 bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] border border-[var(--lt-accent-border)] rounded text-[10px] font-medium">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}

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
