import React from 'react';
import { Link } from 'react-router-dom';

import { MapPin, Users, Star, Bot } from 'lucide-react';
import { PlacePhotoPlaceholder } from './PlacePhotoPlaceholder';
import { ProgressiveImage } from './ProgressiveImage';
import { compareCriteria } from '../lib/criteria';
import { scoreBadge, scoreBadgeStyle } from '../lib/scoreScale';
import { MarqueeText } from './ui/MarqueeText';

type CriteriaDefinitionEntry = {
    id?: string;
    label?: string;
    order?: number;
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
        /** null = sin nota pública (p. ej. un sitio solo con valoraciones de bots). */
        avgRating: number | null;
        reviewCount: number;
        /** 'bot': la nota y el nº son de bots (solo con el filtro «Bots»). */
        scoreKind?: 'bot';
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
    /** Puesto con contexto, p. ej. «#3 en Valladolid» (uno solo, el principal). */
    contextRankLabel?: string | null;
    isGrid?: boolean;
    groupingMode?: 'place' | 'dish' | 'list';
    listId?: string; // Outer phrasing, maybe redundant with item.listId but keeping for compat
    disableLift?: boolean;
    /** Clave del elemento (lib/listElements): la misma en la Lista y en Buscar. */
    elementKey?: string;
    /** Elementos (groupingMode 'dish'): sitio como título y el elemento en la segunda línea. */
    placeFirst?: boolean;
}

// Sin nota pública: se dice, en vez de enseñar un 0.
const NO_PUBLIC_RATING = 'Sin nota pública todavía';

const ScoreBadge: React.FC<{ value: number | null; kind?: 'bot'; size: 'sm' | 'lg' }> = ({ value, kind, size }) => {
    if (value === null) {
        return (
            <span className="max-w-[5.5rem] shrink-0 text-right text-[10px] font-semibold leading-tight text-[var(--lt-text-muted)]">
                {NO_PUBLIC_RATING}
            </span>
        );
    }
    const box = size === 'sm'
        ? 'w-8 h-8 text-xs rounded-full font-display font-bold border border-white/10'
        : 'w-11 h-11 sm:w-12 sm:h-12 rounded-full shadow-lg font-display font-bold text-sm sm:text-base border border-white/10';
    return (
        <div
            className={`relative flex items-center justify-center shrink-0 ${box}`}
            style={scoreBadgeStyle(value)}
            title={kind === 'bot' ? 'Nota de bots (no es la nota pública)' : undefined}
        >
            {value.toFixed(1)}
            {kind === 'bot' && (
                <span className="absolute -top-1.5 -right-1.5 grid h-4 w-4 place-items-center rounded-full bg-[var(--lt-card-strong)] text-[var(--lt-text-muted)] ring-1 ring-[var(--lt-border)]">
                    <Bot className="h-2.5 w-2.5" aria-label="bots" />
                </span>
            )}
        </div>
    );
};

// El enlace del título cubre toda la tarjeta (::after); lo demás clicable va encima (relative z-10).
const TITLE_LINK = "block after:absolute after:inset-0 after:content-['']";

// Podio como en la Home: oro, plata y bronce; del cuarto en adelante, neutro.
const RANK_STYLE: Record<number, React.CSSProperties> = {
    0: { background: 'rgba(0,0,0,0.55)', color: '#fff', backdropFilter: 'blur(8px)' },
    1: { backgroundImage: 'linear-gradient(135deg, #fde68a, #f59e0b)', color: '#451a03' },
    2: { backgroundImage: 'linear-gradient(135deg, #f1f5f9, #94a3b8)', color: '#0f172a' },
    3: { backgroundImage: 'linear-gradient(135deg, #fdba74, #c2410c)', color: '#431407' },
};

const RankPill: React.FC<{ rank: number; small?: boolean }> = ({ rank, small }) => (
    <span
        className={`absolute left-1.5 top-1.5 z-10 flex items-center justify-center rounded-full border border-white/15 font-display font-black leading-none shadow-lg ${small ? 'h-6 min-w-6 px-1.5 text-[11px]' : 'h-7 min-w-7 px-1.5 text-xs'}`}
        style={RANK_STYLE[rank] ?? RANK_STYLE[0]}
        aria-label={`Puesto ${rank}`}
    >
        #{rank}
    </span>
);

const CHIP = 'inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold border';
const CHIP_ACCENT = `${CHIP} bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] border-[var(--lt-accent-border)]`;
const CHIP_NEUTRAL = `${CHIP} bg-[var(--lt-card)] text-[var(--lt-text-muted)] border-[var(--lt-border)]`;

export const ListItemCard: React.FC<ListItemCardProps> = ({ item, rank, contextRankLabel, isGrid, groupingMode = 'place', listId, disableLift = false, elementKey, placeFirst = false }) => {
    // Una misma etiqueta puede llegar repetida (varias valoraciones del elemento).
    const tags = Array.from(new Set(item.tags || []));
    const normalizedClosedStatus = String(item.placeClosedStatus || '').trim().toLowerCase();
    // Elemento en una Lista: con placeFirst el título es el sitio y debajo va el elemento.
    const swapTitle = Boolean(placeFirst && groupingMode === 'dish' && item.placeName && item.placeName !== item.name);
    const dishTitle = swapTitle ? item.placeName : item.name;
    const dishSubtitle = swapTitle ? item.name : item.placeName;
    const isPermanentlyClosed = normalizedClosedStatus === 'permanently_closed' || normalizedClosedStatus === 'closed_permanently';
    const photoPlaceholderVariant = groupingMode === 'dish' ? 'group' : 'place';


    // New format for stats (similar to Carousels)
    const renderStats = () => {
        if (groupingMode === 'place' || groupingMode === 'dish') {
            // For Places/Items, usually we show review count (already there)
            return null;
        }
        // For Lists
        return (
            <div className="flex items-center gap-3 mt-1.5 text-xs text-[var(--lt-text-muted)] font-medium">
                {item.reviewCount !== undefined && (
                    <span className="flex items-center gap-1">
                        <Star className="w-3 h-3" /> {item.reviewCount} valoraciones
                    </span>
                )}
                {item.itemCount !== undefined && (
                    <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {item.itemCount} sitios
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
                    .sort((a, b) => compareCriteria(a, definition[a], b, definition[b]))
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
    const titleHref = item.placeId
        ? (groupingMode === 'dish'
            ? `/group/${item.placeId}/${encodeURIComponent(item.name)}${listId ? `?listId=${listId}` : ''}`
            : `/place/${item.placeId}`)
        : `/list/${item.id}`;
    const listModeTitle = groupingMode === 'dish' ? (dishTitle || item.name) : item.name;
    const showSubtitle = Boolean(item.placeName && item.placeName !== item.name && dishSubtitle);
    const cityLabel = item.placeCity || item.placeAddress;
    const closedChip = item.placeClosedStatus ? (
        <span className={`inline-flex shrink-0 items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${isPermanentlyClosed
            ? 'bg-[var(--lt-danger-soft)] border-[var(--lt-danger)]/30 text-[var(--lt-danger)]'
            : 'bg-[var(--lt-warning-soft)] border-[var(--lt-warning)]/30 text-[var(--lt-warning)]'
            }`}>
            {isPermanentlyClosed ? '🔒 Cerrado' : '⏰ Temp.'}
        </span>
    ) : null;
    const photo = (
        item.photoUrl ? (
            <ProgressiveImage
                src={item.photoUrl}
                alt={item.name}
                containerClassName="absolute inset-0"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                fallback={<PlacePhotoPlaceholder compact variant={photoPlaceholderVariant} />}
            />
        ) : (
            <div className="absolute inset-0"><PlacePhotoPlaceholder compact variant={photoPlaceholderVariant} /></div>
        )
    );

    return (
        <article data-element-key={elementKey} className={`group relative flex flex-row overflow-hidden rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)] transition-[border-color,box-shadow,transform] duration-300 hover:border-[var(--lt-accent-border)] active:scale-[0.99] ${disableLift
            ? ''
            : 'md:hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-14px_var(--lt-accent-shadow)]'}
            ${isGrid ? 'min-h-[120px] md:min-h-[148px]' : 'min-h-[112px]'}`}>

            {/* --- GRID MODE (Horizontal compact — same on mobile and desktop) --- */}
            {isGrid ? (
                <>
                    {/* Thumbnail */}
                    <div className="w-28 md:w-36 shrink-0 self-stretch relative overflow-hidden bg-[var(--lt-card-strong)]">
                        {photo}
                        {rank && <RankPill rank={rank} small />}
                    </div>

                    {/* Content area */}
                    <div className="flex-1 p-3 flex flex-col gap-1 min-w-0">

                        {/* Context badges */}
                        {(contextRankLabel || item.listName || item.placeName || item.placeCity) && (
                            <div className="flex flex-wrap gap-1">
                                {contextRankLabel && (
                                    <span className={`${CHIP} lt-on-accent bg-[var(--lt-accent)] border-[var(--lt-accent-border)] font-black whitespace-nowrap`}>
                                        {contextRankLabel}
                                    </span>
                                )}
                                {item.listName && (
                                    item.listId ? (
                                        <Link
                                            to={`/list/${item.listId}`}
                                            onClick={(e) => e.stopPropagation()}
                                            className={`${CHIP_ACCENT} relative z-10 truncate max-w-[120px] hover:border-[var(--lt-accent)] transition-colors`}
                                        >
                                            {item.listName}
                                        </Link>
                                    ) : (
                                        <span className={`${CHIP_ACCENT} truncate max-w-[120px]`}>
                                            {item.listName}
                                        </span>
                                    )
                                )}
                                {(item.placeName || item.placeCity) && (
                                    <span className={`${CHIP_NEUTRAL} truncate max-w-[120px]`}>
                                        <MapPin className="w-2.5 h-2.5 mr-0.5 text-[var(--lt-success)] shrink-0" />
                                        <span className="truncate">{item.placeName || item.placeCity}</span>
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Title */}
                        <div className="flex items-center gap-1.5 min-w-0">
                            <h3 className="min-w-0 flex-1 font-display font-bold text-sm md:text-base text-[var(--lt-text)] leading-tight group-hover:text-[var(--lt-accent)] transition-colors">
                                <Link to={titleHref} className={TITLE_LINK}>
                                    <MarqueeText text={item.name} />
                                </Link>
                            </h3>
                            {closedChip}
                        </div>

                        {/* Author (lists) */}
                        {item.authorName && !item.placeName && (
                            <div className="flex items-center gap-1 min-w-0 text-xs text-[var(--lt-text-muted)]">
                                {item.authorPhoto && <img src={item.authorPhoto} className="w-4 h-4 rounded-full shrink-0 object-cover" alt="" />}
                                <span className="shrink-0">por</span>
                                <MarqueeText text={item.authorName} className="font-semibold text-[var(--lt-text)]" />
                            </div>
                        )}

                        {/* Tags (max 3 on mobile, 4 on desktop) */}
                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {tags.slice(0, 3).map(tag => (
                                    <span key={tag} className={`${CHIP_NEUTRAL} font-medium truncate max-w-[72px]`}>{tag}</span>
                                ))}
                                {tags.length > 3 && (
                                    <span className={`${CHIP_NEUTRAL} hidden md:inline-flex font-medium`}>{tags[3]}</span>
                                )}
                            </div>
                        )}

                        {/* Stats + Score */}
                        <div className="flex items-center justify-between border-t border-[var(--lt-border)] pt-1.5 mt-auto">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--lt-text-muted)] font-medium">
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
                                    <span className="flex items-center gap-0.5" title={item.scoreKind === 'bot' ? 'Valoraciones de bots' : undefined}>
                                        {item.scoreKind === 'bot'
                                            ? <Bot className="w-3 h-3 text-[var(--lt-text-muted)]" />
                                            : <Star className="w-3 h-3 text-[var(--lt-accent)]" />}
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
                                <ScoreBadge value={item.avgRating} kind={item.scoreKind} size="sm" />
                            )}
                        </div>
                    </div>
                </>
            ) : (
                /* --- LIST MODE (Horizontal Compact) --- */
                <>
                    {/* Foto con el puesto encima (podio como en la Home) */}
                    <div className="relative shrink-0 self-stretch overflow-hidden bg-[var(--lt-card-strong)] w-24 min-h-24 sm:w-32 sm:min-h-32">
                        {photo}
                        {rank && <RankPill rank={rank} />}
                    </div>

                    {/* Content Section */}
                    <div className="flex-1 p-3 flex flex-col gap-2 min-w-0">
                        <div className="flex items-start gap-2.5">
                            <div className="min-w-0 flex-1">
                                <h3 className="font-display font-bold text-base sm:text-lg text-[var(--lt-text)] leading-tight group-hover:text-[var(--lt-accent)] transition-colors">
                                    <Link to={titleHref} className={TITLE_LINK}>
                                        <MarqueeText text={listModeTitle} />
                                    </Link>
                                </h3>

                                {/* Subtítulo: sitio (o elemento) · ciudad */}
                                {(showSubtitle || cityLabel || closedChip) && (
                                    <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-[var(--lt-text-muted)]">
                                        {showSubtitle && (
                                            <>
                                                {!swapTitle && <MapPin className="w-3 h-3 shrink-0" />}
                                                <MarqueeText text={dishSubtitle || ''} className="font-medium" />
                                            </>
                                        )}
                                        {cityLabel && (
                                            <span className="min-w-0 shrink truncate font-semibold text-[var(--lt-accent)]">
                                                {showSubtitle && <span className="mr-1 text-[var(--lt-text-muted)]" aria-hidden>·</span>}
                                                {cityLabel}
                                            </span>
                                        )}
                                        {closedChip}
                                    </div>
                                )}

                                {/* Author Context (Lists) */}
                                {item.authorName && !item.placeName && (
                                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-[var(--lt-text-muted)]">
                                        {item.authorPhoto && <img src={item.authorPhoto} className="w-4 h-4 rounded-full shrink-0 object-cover" alt="" />}
                                        <span className="shrink-0">por</span>
                                        <MarqueeText text={item.authorName} className="font-semibold text-[var(--lt-text)]" />
                                    </div>
                                )}

                                {/* Meta compacta: valoraciones · puesto en la zona · Lista */}
                                {((groupingMode !== 'list' && item.reviewCount > 0) || contextRankLabel || item.listName) && (
                                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--lt-text-muted)]">
                                        {groupingMode !== 'list' && item.reviewCount > 0 && <span>{`${item.reviewCount} ${item.reviewCount === 1 ? 'valoración' : 'valoraciones'}${item.scoreKind === 'bot' ? ' de bots' : ''}`}</span>}
                                        {contextRankLabel && (
                                            <span className="rounded-full bg-[var(--lt-accent-soft)] px-1.5 py-0.5 font-bold text-[var(--lt-accent)]">{contextRankLabel}</span>
                                        )}
                                        {item.listName && (
                                            <span className={`${CHIP_ACCENT} truncate max-w-[120px]`}>
                                                {item.listName}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* List Stats */}
                                {renderStats()}
                            </div>

                            {groupingMode !== 'list' && (
                                <ScoreBadge value={item.avgRating} kind={item.scoreKind} size="lg" />
                            )}
                        </div>

                        {/* Tags */}
                        {tags.length > 0 && criteriaPreview.length === 0 && (
                            <div className="flex flex-wrap gap-1 mt-auto">
                                {tags.slice(0, 4).map(tag => (
                                    <span key={tag} className={`${CHIP_ACCENT} font-medium`}>
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Mini barras de criterios */}
                        {criteriaPreview.length > 0 && (
                            <div className="mt-auto grid grid-cols-4 gap-x-2 gap-y-0.5">
                                {criteriaPreview.slice(0, 4).map(({ key, label, score }) => {
                                    return (
                                        <div key={key} className="flex min-w-0 flex-col">
                                            <div className="flex justify-between items-end gap-1 text-[9px] text-[var(--lt-text-muted)] leading-none mb-1">
                                                <span className="truncate">{label}</span>
                                                <span className="font-bold text-[var(--lt-text)]">{score.toFixed(1)}</span>
                                            </div>
                                            <div className="h-1 bg-[var(--lt-border)] rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{ width: `${score * 10}%`, backgroundColor: scoreBadge(score).bg }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}
        </article>
    );
};
