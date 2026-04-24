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
    return (
        <section className="py-2">
            <div className="container mx-auto px-4 mb-4 flex items-end justify-between">
                <div className="flex items-center gap-3">
                    {icon && (
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${accentClass}`}>
                            {icon}
                        </div>
                    )}
                    <div>
                        <h2 className="text-xl md:text-2xl font-display font-bold text-white mb-1">
                            {title}
                        </h2>
                        {subtitle && (
                            <p className="text-sm text-gray-400 font-medium">
                                {subtitle}
                            </p>
                        )}
                    </div>
                </div>
                {viewAllLink && (
                    <Link
                        to={viewAllLink}
                        className="text-sm font-bold text-[var(--lt-accent)] hover:text-[var(--lt-accent)] flex items-center gap-1 transition-colors shrink-0"
                    >
                        Ver todo <ChevronRight className="w-4 h-4" />
                    </Link>
                )}
            </div>

            <div className="relative group">
                {/* Scroll Buttons (Glassmorphism) */}
                <button
                    aria-label="Anterior"
                    onClick={() => {
                        document.getElementById(`carousel-${title.replace(/\s+/g, '-')}`)?.scrollBy({ left: -320, behavior: 'smooth' });
                    }}
                    className="absolute -left-5 top-1/2 -translate-y-1/2 z-50 w-12 h-12 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-[var(--lt-accent)] hover:scale-110 shadow-xl"
                >
                    <ChevronRight className="w-6 h-6 rotate-180" />
                </button>
                <button
                    aria-label="Siguiente"
                    onClick={() => {
                        document.getElementById(`carousel-${title.replace(/\s+/g, '-')}`)?.scrollBy({ left: 320, behavior: 'smooth' });
                    }}
                    className="absolute -right-5 top-1/2 -translate-y-1/2 z-50 w-12 h-12 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-[var(--lt-accent)] hover:scale-110 shadow-xl"
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
                            <div key={i} className="min-w-[280px] md:min-w-[320px] flex-shrink-0 snap-start rounded-2xl overflow-hidden bg-white/5 animate-pulse">
                                <div className="h-40 bg-white/10" />
                                <div className="p-3 space-y-2">
                                    <div className="h-4 bg-white/10 rounded w-3/4" />
                                    <div className="h-3 bg-white/5 rounded w-1/2" />
                                    <div className="flex gap-2 pt-1">
                                        <div className="h-3 bg-white/5 rounded w-12" />
                                        <div className="h-3 bg-white/5 rounded w-12" />
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
