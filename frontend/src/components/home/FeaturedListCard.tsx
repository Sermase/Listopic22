import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MessageCircle, Users } from 'lucide-react';
import { ProgressiveImage } from '../ProgressiveImage';

interface FeaturedListCardProps {
    list: {
        id: string;
        name?: string;
        description?: string;
        itemCount?: number;
        reviewsInRangeCount?: number;
        reviewCount?: number;
        followersCount?: number;
        thumbnailUrl?: string;
        mainImageUrl?: string;
        photoUrl?: string;
        coverUrl?: string;
        imageUrl?: string;
    };
}

/** Portada de la home: la lista con más movimiento en tu zona. */
export const FeaturedListCard: React.FC<FeaturedListCardProps> = ({ list }) => {
    const image = list.mainImageUrl || list.coverUrl || list.photoUrl || list.imageUrl || list.thumbnailUrl;
    const reviews = list.reviewsInRangeCount ?? list.reviewCount ?? 0;

    return (
        <section className="w-full">
            <Link
                to={`/list/${list.id}`}
                className="lt-media-card group relative block h-56 overflow-hidden rounded-[1.75rem] border border-[var(--lt-border)] shadow-xl sm:h-72"
                style={{ boxShadow: '0 18px 40px -18px var(--lt-accent-shadow)' }}
            >
                {image ? (
                    <ProgressiveImage
                        src={image}
                        alt={list.name || ''}
                        containerClassName="absolute inset-0"
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                ) : (
                    <div className="absolute inset-0" style={{ backgroundImage: 'var(--lt-accent-grad)' }} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:p-6">
                    <div className="min-w-0">
                        <span className="mb-1.5 inline-block rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] backdrop-blur" style={{ color: 'var(--lt-success)' }}>
                            La lista del momento
                        </span>
                        <h2 className="line-clamp-2 font-display text-2xl font-bold leading-tight text-white drop-shadow sm:text-3xl">
                            {list.name}
                        </h2>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-white/80">
                            <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{reviews} {reviews === 1 ? 'valoración' : 'valoraciones'}</span>
                            {typeof list.itemCount === 'number' && <span>{list.itemCount} {list.itemCount === 1 ? 'sitio' : 'sitios'}</span>}
                            {!!list.followersCount && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{list.followersCount}</span>}
                        </div>
                    </div>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full lt-on-accent transition-transform group-hover:translate-x-1" style={{ backgroundImage: 'var(--lt-accent-grad)' }}>
                        <ArrowRight className="h-5 w-5" />
                    </span>
                </div>
            </Link>
        </section>
    );
};
