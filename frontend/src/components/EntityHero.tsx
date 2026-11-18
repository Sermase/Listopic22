import React, { useState } from 'react';
import { cn } from '../lib/utils';
import { ProgressiveImage } from './ProgressiveImage';

interface EntityHeroProps {
  imageUrl?: string | null;
  alt: string;
  fallback?: React.ReactNode;
  children?: React.ReactNode;
  topSlot?: React.ReactNode;
  onImageLoad?: () => void;
  onImageError?: () => void;
  ready?: boolean;
  className?: string;
  contentClassName?: string;
  imageClassName?: string;
}

// Foto (o fondo) que se desvanece hacia abajo.
const HERO_FADE = 'absolute inset-0 [mask-image:linear-gradient(to_bottom,black_50%,transparent)]';

/** Fondo sin foto: degradado del tema, sin icono que choque con el título. */
const DefaultHeroBackground = () => (
  <div
    className="absolute inset-0"
    style={{ background: 'radial-gradient(120% 90% at 15% 0%, var(--lt-accent-soft), transparent 60%), linear-gradient(160deg, var(--lt-bg-deep, var(--lt-bg)) 0%, var(--lt-bg) 100%)' }}
  />
);

export const EntityHero: React.FC<EntityHeroProps> = ({
  imageUrl,
  alt,
  fallback,
  children,
  topSlot,
  onImageLoad,
  onImageError,
  ready = true,
  className,
  contentClassName,
  imageClassName,
}) => {
  // Si la foto falla, la cabecera se comporta como sin foto (más baja).
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const hasImage = !!imageUrl && failedUrl !== imageUrl;
  return (
  // Alto mínimo fijo, pero crece con lo que lleva: el botón de arriba (topSlot) y el
  // título van uno debajo del otro, nunca encima (antes un título largo se montaba).
  // Sin foto, más baja: no queda un hueco oscuro de media pantalla encima del título.
  <section className={cn(
    'lt-entity-hero relative flex w-full flex-col overflow-hidden group',
    // El alto mínimo va en index.css (.lt-entity-hero); sin foto, la variante --bare.
    !hasImage && 'lt-entity-hero--bare',
    ready || !imageUrl ? 'animate-hero-from-right' : '',
    className,
  )}>
    {/* El borde de abajo es transparente (foto y velos se desvanecen): debajo asoma
        el mismo fondo que el resto de la página y no queda una raya al final. */}
    <div
      className="absolute inset-0 z-10"
      style={{ background: 'linear-gradient(to top, transparent 0%, color-mix(in srgb, var(--lt-bg) 55%, transparent) 30%, var(--lt-hero-top, rgba(0,0,0,0.4)) 100%)' }}
    />

    {imageUrl ? (
      <div className={HERO_FADE}>
        {/* Pantallas anchas: la foto nítida va centrada (no se amplía a todo el
            ancho) y, detrás, la misma desenfocada rellena los lados. En móvil
            ocupa toda la cabecera recortando los laterales. */}
        <div
          aria-hidden
          className="absolute inset-0 hidden scale-110 bg-cover bg-center opacity-60 blur-2xl lg:block"
          style={{ backgroundImage: `url(${JSON.stringify(imageUrl)})` }}
        />
        <div className="absolute inset-0 lg:mx-auto lg:max-w-6xl lg:[mask-image:linear-gradient(to_right,transparent,black_14%,black_86%,transparent)]">
          <ProgressiveImage
            src={imageUrl}
            alt={alt}
            containerClassName="absolute inset-0 overflow-hidden"
            className={cn(
              'h-full w-full object-cover object-center opacity-80 transition-transform duration-700 group-hover:scale-105',
              imageClassName,
            )}
            onLoad={onImageLoad}
            onError={() => { setFailedUrl(imageUrl); onImageError?.(); }}
            fallback={fallback || <DefaultHeroBackground />}
          />
        </div>
      </div>
    ) : (
      <div className={HERO_FADE}>
        {fallback || <DefaultHeroBackground />}
      </div>
    )}

    {topSlot && (
      <div className="relative z-30 mx-auto w-full max-w-7xl px-4 sm:px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 5rem)' }}>
        {topSlot}
      </div>
    )}

    {children && (
      <div
        className={cn('relative z-20 mt-auto px-4 pb-12 sm:px-8 sm:pb-14', topSlot ? 'pt-4' : 'pt-24', contentClassName)}
        // Degradado en línea (no con bg-gradient-to-*): en el tema claro hay reglas
        // que fuerzan texto blanco dentro de cualquier bg-gradient-to-* y aquí el
        // fondo acaba siendo claro.
        style={{ background: 'linear-gradient(to top, transparent 0%, color-mix(in srgb, var(--lt-bg) 45%, transparent) 35%, transparent 100%)' }}
      >
        <div className="relative z-30 mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-end md:justify-between">
          {children}
        </div>
      </div>
    )}
  </section>
  );
};
