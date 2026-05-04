import React from 'react';
import { cn } from '../lib/utils';
import { ProgressiveImage } from './ProgressiveImage';

interface EntityHeroProps {
  imageUrl?: string | null;
  alt: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
  topSlot?: React.ReactNode;
  onImageLoad?: () => void;
  ready?: boolean;
  className?: string;
  contentClassName?: string;
  imageClassName?: string;
}

export const EntityHero: React.FC<EntityHeroProps> = ({
  imageUrl,
  alt,
  fallback,
  children,
  topSlot,
  onImageLoad,
  ready = true,
  className,
  contentClassName,
  imageClassName,
}) => (
  <section className={cn(
    'lt-entity-hero relative h-[42vh] w-full overflow-hidden group',
    ready || !imageUrl ? 'animate-hero-from-right' : '',
    className,
  )}>
    <div className="absolute inset-0 z-10 bg-gradient-to-t from-[var(--lt-bg)] via-[var(--lt-bg)]/60 to-black/40" />

    {imageUrl ? (
      <ProgressiveImage
        src={imageUrl}
        alt={alt}
        containerClassName="absolute inset-0 overflow-hidden"
        className={cn(
          'h-full w-full object-cover object-center opacity-80 transition-transform duration-700 group-hover:scale-105',
          imageClassName,
        )}
        onLoad={onImageLoad}
        fallback={fallback}
      />
    ) : (
      fallback || (
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-[var(--lt-bg)] to-[var(--lt-bg)]" />
      )
    )}

    {topSlot && (
      <div className="absolute inset-x-0 top-0 z-30 mx-auto max-w-7xl px-4 sm:px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 5rem)' }}>
        {topSlot}
      </div>
    )}

    <div className={cn(
      'absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[var(--lt-bg)] via-[var(--lt-bg)]/60 to-transparent px-4 pb-12 pt-24 sm:px-8 sm:pb-14',
      contentClassName,
    )}>
      <div className="relative z-30 mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-end md:justify-between">
        {children}
      </div>
    </div>
  </section>
);
