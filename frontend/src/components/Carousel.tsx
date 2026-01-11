import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ListCard } from './ListCard';
import { type ListEntity } from '../hooks/useLists';

interface CarouselProps {
    title: string;
    lists: ListEntity[];
    loading?: boolean;
}

export const Carousel: React.FC<CarouselProps> = ({ title, lists, loading }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const { current } = scrollRef;
            const scrollAmount = direction === 'left' ? -320 : 320;
            current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
    };

    return (
        <section className="py-8">
            <div className="flex items-center justify-between mb-4 px-4 sm:px-6 lg:px-8">
                <h2 className="text-xl md:text-2xl font-bold text-white">{title}</h2>
                <div className="flex gap-2">
                    <button
                        onClick={() => scroll('left')}
                        className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors border border-white/5"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => scroll('right')}
                        className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors border border-white/5"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div
                ref={scrollRef}
                className="flex gap-4 overflow-x-auto pb-4 px-4 sm:px-6 lg:px-8 scrollbar-hide snap-x"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {loading ? (
                    Array(5).fill(0).map((_, i) => (
                        <div key={i} className="min-w-[280px] md:min-w-[320px] h-64 bg-[#151b2e] rounded-xl animate-pulse border border-white/5 shrink-0"></div>
                    ))
                ) : (
                    lists.map(list => (
                        <div key={list.id} className="min-w-[280px] md:min-w-[320px] snap-start">
                            <ListCard list={list} />
                        </div>
                    ))
                )}
            </div>
        </section>
    );
};
