import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface CardCarouselProps {
    title: string;
    subtitle?: string;
    viewAllLink?: string;
    items: any[];
    renderItem: (item: any, index: number) => React.ReactNode;
    loading?: boolean;
    itemClassName?: string;
}

export const CardCarousel: React.FC<CardCarouselProps> = ({
    title,
    subtitle,
    viewAllLink,
    items,
    renderItem,
    loading,
    itemClassName = "min-w-[200px] md:min-w-[240px]"
}) => {
    return (
        <section className="py-2">
            <div className="container mx-auto px-4 mb-4 flex items-end justify-between">
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
                {viewAllLink && (
                    <Link
                        to={viewAllLink}
                        className="text-sm font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                    >
                        Ver todo <ChevronRight className="w-4 h-4" />
                    </Link>
                )}
            </div>

            <div className="relative group">
                {/* Scroll Buttons */}
                {/* Scroll Buttons (Glassmorphism) */}
                <button
                    onClick={() => {
                        document.getElementById(`carousel-${title.replace(/\s+/g, '-')}`)?.scrollBy({ left: -320, behavior: 'smooth' });
                    }}
                    className="absolute -left-5 top-1/2 -translate-y-1/2 z-50 w-12 h-12 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-indigo-600 hover:scale-110 shadow-xl"
                >
                    <ChevronRight className="w-6 h-6 rotate-180" />
                </button>
                <button
                    onClick={() => {
                        document.getElementById(`carousel-${title.replace(/\s+/g, '-')}`)?.scrollBy({ left: 320, behavior: 'smooth' });
                    }}
                    className="absolute -right-5 top-1/2 -translate-y-1/2 z-50 w-12 h-12 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-indigo-600 hover:scale-110 shadow-xl"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>

                {/* Scroll Container */}
                <div
                    id={`carousel-${title.replace(/\s+/g, '-')}`}
                    className="flex overflow-x-auto gap-2 px-4 pb-4 snap-x snap-mandatory hide-scrollbar scroll-smooth"
                >
                    {loading ? (
                        // Skeleton Loaders
                        Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="min-w-[280px] md:min-w-[320px] h-64 bg-white/5 rounded-2xl animate-pulse flex-shrink-0 snap-start" />
                        ))
                    ) : (
                        items.map((item, index) => (
                            <div key={index} className={`${itemClassName} flex-shrink-0 snap-start`}>
                                {renderItem(item, index)}
                            </div>
                        ))
                    )}
                </div>

                {/* Fade Edges */}

            </div>
        </section>
    );
};
