import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Plus, Utensils, X } from 'lucide-react';
import { ProgressiveImage } from '../ProgressiveImage';
import { ElementRanks } from '../ElementRanks';
import { scoreBadgeStyle } from '../../lib/scoreScale';
import { useAuth } from '../../context/AuthContext';
import { useAuthPrompt } from '../../context/AuthPromptContext';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { dishReviewUrl } from './dishReviewUrl';
import { reviewItemId, type ReviewItemRef } from '../../lib/placeItems';

export interface DishQuickSheetDish {
    name: string;
    photo?: string | null;
    rating?: number | null;
    reviewCount: number;
    price?: string | null;
    description?: string | null;
    ingredients?: string | null;
    group?: string | null;
    discount?: string | null;
    available?: boolean;
    /** Chips de alérgenos ya pintados por la ficha del sitio. */
    allergens?: React.ReactNode;
    listId?: string | null;
    /** Ids del elemento (los mismos que agrupan La Carta): así salen también reseñas con un nombre antiguo. */
    itemIds?: string[];
}

interface SheetReview extends ReviewItemRef {
    id?: string;
    itemName?: string;
    listId?: string;
    listName?: string;
    comment?: string;
    authorName?: string;
    overallRating?: number;
    visibility?: string;
}

interface DishQuickSheetProps {
    placeId: string;
    dish: DishQuickSheetDish;
    reviews: SheetReview[];
    onClose: () => void;
}

const LAST_REVIEWS = 3;
const norm = (value: string | undefined) => (value ?? '').trim().toLowerCase();

/**
 * Ficha rápida de un plato de La Carta: lo esencial de un vistazo sin salir del
 * sitio. Lo que no existe (datos del dueño, puestos, reseñas) simplemente no sale.
 */
export const DishQuickSheet: React.FC<DishQuickSheetProps> = ({ placeId, dish, reviews, onClose }) => {
    useBodyScrollLock(true);
    const navigate = useNavigate();
    const { user } = useAuth();
    const { openAuthPrompt } = useAuthPrompt();

    const dishReviews = useMemo(() => {
        const ids = new Set(dish.itemIds ?? []);
        const isThisDish = (r: SheetReview) => (ids.size > 0 ? ids.has(reviewItemId(r)) : norm(r.itemName) === norm(dish.name));
        return reviews.filter((r) => isThisDish(r) && (r.visibility ?? 'public') === 'public');
    }, [reviews, dish.itemIds, dish.name]);
    const lists = useMemo(() => {
        const map = new Map<string, string>();
        dishReviews.forEach((r) => { if (r.listId && !map.has(r.listId)) map.set(r.listId, r.listName || 'Lista'); });
        return map;
    }, [dishReviews]);
    const lastWithText = dishReviews.filter((r) => r.comment?.trim()).slice(0, LAST_REVIEWS);
    const dishUrl = `/group/${placeId}/${encodeURIComponent(dish.name)}`;

    const rate = () => {
        if (!user) {
            openAuthPrompt('reseñar este plato');
            return;
        }
        navigate(dishReviewUrl(placeId, dish.name, dish.listId ?? [...lists.keys()][0]));
    };

    return (
        <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div role="dialog" aria-label={dish.name} className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[2rem] border border-[var(--lt-border)] bg-[var(--lt-card-strong)] shadow-2xl sm:max-w-md sm:rounded-3xl">
                <div className="relative h-44 shrink-0 bg-[var(--lt-card)]">
                    {dish.photo ? (
                        <ProgressiveImage src={dish.photo} alt={dish.name} containerClassName="h-full w-full" className="h-full w-full object-cover" />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-[var(--lt-text-muted)]"><Utensils className="h-10 w-10 opacity-40" /></div>
                    )}
                    <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white backdrop-blur-md">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                    <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                            <h2 className="font-display text-xl font-bold leading-tight text-[var(--lt-text)]">{dish.name}</h2>
                            <p className="mt-0.5 text-xs text-[var(--lt-text-muted)]">
                                {dish.reviewCount > 0 ? `${dish.reviewCount} ${dish.reviewCount === 1 ? 'reseña' : 'reseñas'}` : 'Aún sin reseñas'}
                                {dish.group ? ` · ${dish.group}` : ''}
                            </p>
                        </div>
                        {typeof dish.rating === 'number' && dish.reviewCount > 0 && (
                            <span className="shrink-0 rounded-full px-3 py-1.5 font-display text-lg font-bold tabular-nums" style={scoreBadgeStyle(dish.rating)}>
                                {dish.rating.toFixed(1)}
                            </span>
                        )}
                    </div>

                    {(dish.price || dish.discount || dish.available === false) && (
                        <div className="flex flex-wrap items-center gap-2">
                            {dish.price && <span className="rounded-full border border-[var(--lt-border)] px-2.5 py-1 text-sm font-black tabular-nums text-[var(--lt-text)]">{dish.price}</span>}
                            {dish.discount && <span className="rounded border border-emerald-500/25 bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-bold text-emerald-300">{dish.discount}</span>}
                            {dish.available === false && <span className="rounded border border-red-500/25 bg-red-500/15 px-1.5 py-0.5 text-[11px] font-bold text-red-300">No disponible</span>}
                        </div>
                    )}

                    {lists.size > 0 && (
                        <ElementRanks placeId={placeId} itemName={dish.name} listIds={[...lists.keys()]} listNames={Object.fromEntries(lists)} />
                    )}

                    {(dish.description || dish.ingredients || dish.allergens) && (
                        <div className="space-y-1.5 text-sm text-[var(--lt-text)]">
                            {dish.description && <p className="leading-relaxed">{dish.description}</p>}
                            {dish.ingredients && <p className="text-xs text-[var(--lt-text-muted)]"><span aria-hidden="true">🥕 </span><span className="sr-only">Ingredientes: </span>{dish.ingredients}</p>}
                            {dish.allergens && <div className="flex flex-wrap gap-1.5">{dish.allergens}</div>}
                        </div>
                    )}

                    {lastWithText.length > 0 && (
                        <div>
                            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--lt-text-muted)]">Últimas reseñas</p>
                            <ul className="space-y-2">
                                {lastWithText.map((r, i) => (
                                    <li key={r.id ?? i} className="rounded-xl border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-2">
                                        <p className="line-clamp-2 text-sm text-[var(--lt-text)]">{r.comment}</p>
                                        <p className="mt-1 flex items-center gap-2 text-[11px] text-[var(--lt-text-muted)]">
                                            <span className="truncate">{r.authorName || 'Anónimo'}</span>
                                            {typeof r.overallRating === 'number' && (
                                                <span className="rounded-full px-1.5 font-bold tabular-nums" style={scoreBadgeStyle(r.overallRating)}>{r.overallRating.toFixed(1)}</span>
                                            )}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <div className="flex shrink-0 gap-2 border-t border-[var(--lt-border)] p-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
                    <Link to={dishUrl} className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-[var(--lt-border)] py-3 text-sm font-bold text-[var(--lt-text)] hover:border-[var(--lt-accent-border)]">
                        Ver plato completo <ChevronRight className="h-4 w-4" />
                    </Link>
                    <button type="button" onClick={rate} className="flex flex-1 items-center justify-center gap-1 rounded-xl py-3 text-sm font-bold lt-on-accent" style={{ backgroundImage: 'var(--lt-accent-grad)' }}>
                        <Plus className="h-4 w-4" /> Valorar
                    </button>
                </div>
            </div>
        </div>
    );
};
