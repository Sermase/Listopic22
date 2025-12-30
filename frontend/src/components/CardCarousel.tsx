import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface CardCarouselProps {
    title: string;
    subtitle?: string;
    viewAllLink?: string;
    items: any[];
    renderItem: (item: any) => React.ReactNode;
    loading?: boolean;
}

export const CardCarousel: React.FC<CardCarouselProps> = ({
    title,
    subtitle,
    viewAllLink,
    items,
    renderItem,
    loading
}) => {
    return (
        <section className="py-6">
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
                {/* Scroll Container */}
                <div className="flex overflow-x-auto gap-4 px-4 pb-4 snap-x snap-mandatory hide-scrollbar">
                    {loading ? (
                        // Skeleton Loaders
                        Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="min-w-[280px] md:min-w-[320px] h-64 bg-white/5 rounded-2xl animate-pulse flex-shrink-0 snap-start" />
                        ))
                    ) : (
                        items.map((item, index) => (
                            <div key={index} className="min-w-[280px] md:min-w-[320px] flex-shrink-0 snap-start">
                                {renderItem(item)}
                            </div>
                        ))
                    )}
                </div>

                {/* Fade Edges (Optional visual enhancement) */}
                <div className="absolute top-0 right-0 bottom-0 w-12 bg-gradient-to-l from-[#0b1021] to-transparent pointer-events-none sm:hidden" />
            </div>
        </section>
    );
};
