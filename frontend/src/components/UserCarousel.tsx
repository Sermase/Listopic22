import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { UserCard } from './UserCard';
import { type UserProfileEntity } from '../hooks/useUserProfile';

interface UserCarouselProps {
    title: string;
    users: UserProfileEntity[];
    loading?: boolean;
}

export const UserCarousel: React.FC<UserCarouselProps> = ({ title, users, loading }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const { current } = scrollRef;
            const scrollAmount = direction === 'left' ? -300 : 300;
            current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
    };

    return (
        <section className="py-8 border-t border-white/5">
            <div className="flex items-center justify-between mb-6 px-4 sm:px-6 lg:px-8">
                <h2 className="text-xl md:text-2xl font-bold text-white bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
                    {title}
                </h2>
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
                className="flex gap-4 overflow-x-auto pb-8 px-4 sm:px-6 lg:px-8 scrollbar-hide snap-x"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {loading ? (
                    Array(5).fill(0).map((_, i) => (
                        <div key={i} className="min-w-[200px] h-64 bg-[#151b2e] rounded-xl animate-pulse border border-white/5 shrink-0"></div>
                    ))
                ) : (
                    users.map(user => (
                        <div key={user.uid} className="min-w-[200px] w-[200px] snap-start">
                            <UserCard user={user} />
                        </div>
                    ))
                )}
            </div>
        </section>
    );
};
