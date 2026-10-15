import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface CardCarouselProps<T> {
    title: string;
    subtitle?: string;
    viewAllLink?: string;
    items: T[];
    renderItem: (item: T, index: number) => React.ReactNode;
    loading?: boolean;
    itemClassName?: string;
    icon?: React.ReactNode;
    accentClass?: string;
}

export function CardCarousel<T>({
    title,
    subtitle,
    viewAllLink,
    items,
    renderItem,
    loading,
    itemClassName = "min-w-[200px] md:min-w-[240px]",
    icon,
    accentClass = "bg-white/10",
}: CardCarouselProps<T>) {
    // Una sección sin contenido no aporta nada: se oculta en vez de decir
    // "Sin resultados por ahora".
    if (!loading && items.length === 0) return null;

    return (
        <section className="py-2">
            <div className="container mx-auto px-4 mb-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-base md:text-xl font-display font-bold leading-tight text-[var(--lt-text)]">
                        {icon && (
                            <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5 ${accentClass}`}>
                                {icon}
                            </span>
                        )}
                        <span className="truncate">{title}</span>
                    </h2>
                    {subtitle && (
                        <p className="mt-0.5 truncate text-xs text-[var(--lt-text-muted)] font-medium">
                            {subtitle}
                        </p>
                    )}
                </div>
                {viewAllLink && (
                    <Link
                        to={viewAllLink}
                        className="shrink-0 inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-xs font-bold text-[var(--lt-accent)] bg-[var(--lt-accent-soft)] hover:opacity-80 transition-opacity"
                    >
                        Ver todo <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                )}
            </div>

            <div className="relative group isolate">
                {/* Scroll Buttons (Glassmorphism) */}
                <button
                    aria-label="Anterior"
                    onClick={() => {
                        document.getElementById(`carousel-${title.replace(/\s+/g, '-')}`)?.scrollBy({ left: -320, behavior: 'smooth' });
                    }}
                    className="absolute -left-5 top-1/2 -translate-y-1/2 z-50 w-12 h-12 hidden md:flex bg-black/40 backdrop-blur-xl border border-white/10 rounded-full items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-[var(--lt-accent)] hover:scale-110 shadow-xl"
                >
                    <ChevronRight className="w-6 h-6 rotate-180" />
                </button>
                <button
                    aria-label="Siguiente"
                    onClick={() => {
                        document.getElementById(`carousel-${title.replace(/\s+/g, '-')}`)?.scrollBy({ left: 320, behavior: 'smooth' });
                    }}
                    className="absolute -right-5 top-1/2 -translate-y-1/2 z-50 w-12 h-12 hidden md:flex bg-black/40 backdrop-blur-xl border border-white/10 rounded-full items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-[var(--lt-accent)] hover:scale-110 shadow-xl"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>

                {/* Scroll Container */}
                <div
                    id={`carousel-${title.replace(/\s+/g, '-')}`}
                    className="flex overflow-x-auto gap-2 px-4 pb-4 snap-x snap-mandatory hide-scrollbar scroll-smooth"
                >
                    {loading ? (
                        Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="min-w-[280px] md:min-w-[320px] flex-shrink-0 snap-start rounded-2xl overflow-hidden lt-skeleton-card" aria-hidden="true">
                                <div className="h-40 bg-[var(--lt-skeleton-base)]" />
                                <div className="p-3 space-y-2">
                                    <div className="h-4 bg-[var(--lt-skeleton-base)] rounded w-3/4" />
                                    <div className="h-3 bg-[var(--lt-skeleton-base)] rounded w-1/2" />
                                    <div className="flex gap-2 pt-1">
                                        <div className="h-3 bg-[var(--lt-skeleton-base)] rounded w-12" />
                                        <div className="h-3 bg-[var(--lt-skeleton-base)] rounded w-12" />
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : items.length === 0 ? (
                        <div className="w-full px-4 py-8 text-center text-gray-600 text-sm">
                            Sin resultados por ahora
                        </div>
                    ) : (
                        items.map((item, index) => (
                            <div key={index} className={`${itemClassName} flex-shrink-0 snap-start`}>
                                {renderItem(item, index)}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </section>
    );
}
