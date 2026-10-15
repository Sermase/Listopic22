import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, MessageCircle, Users } from 'lucide-react';
import type { FeaturedListCard as FeaturedListData } from '../../lib/homeFeeds';
import { FEED_TITLES } from '../../lib/homeFeeds';
import { ProgressiveImage } from '../ProgressiveImage';

/** Portada de la home: una lista con movimiento en tu zona (rota cada día). */
export const FeaturedListCard: React.FC<{ list: FeaturedListData }> = ({ list }) => (
    <section className="w-full">
        <Link
            to={list.to}
            className="lt-media-card group relative block h-56 overflow-hidden rounded-[1.75rem] border border-[var(--lt-border)] shadow-xl sm:h-72"
            style={{ boxShadow: '0 18px 40px -18px var(--lt-accent-shadow)' }}
        >
            {list.photoUrl ? (
                <ProgressiveImage
                    src={list.photoUrl}
                    alt=""
                    containerClassName="absolute inset-0"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    fallback={<div className="absolute inset-0" style={{ backgroundImage: 'var(--lt-accent-grad)' }} />}
                />
            ) : (
                <div className="absolute inset-0" style={{ backgroundImage: 'var(--lt-accent-grad)' }} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:p-6">
                <div className="min-w-0">
                    <span className="mb-1.5 inline-block rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] backdrop-blur" style={{ color: 'var(--lt-success)' }}>
                        {FEED_TITLES.featured}
                    </span>
                    <h2 className="line-clamp-2 font-display text-2xl font-bold leading-tight text-white drop-shadow sm:text-3xl">
                        {list.title}
                    </h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-white/80">
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{list.inAreaPlaces} {list.inAreaPlaces === 1 ? 'sitio' : 'sitios'} en tu zona</span>
                        <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{list.inAreaReviews} {list.inAreaReviews === 1 ? 'valoración' : 'valoraciones'}</span>
                        {list.inAreaAuthors > 1 && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{list.inAreaAuthors}</span>}
                        {typeof list.rating === 'number' && <span>{list.rating.toFixed(1)} de media</span>}
                    </div>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full lt-on-accent transition-transform group-hover:translate-x-1" style={{ backgroundImage: 'var(--lt-accent-grad)' }}>
                    <ArrowRight className="h-5 w-5" />
                </span>
            </div>
        </Link>
    </section>
);
