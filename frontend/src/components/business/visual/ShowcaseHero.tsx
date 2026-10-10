/**
 * La cabecera pública de la ficha (EntityHero + el mismo marcado que
 * PlacePage) con el borrador de 🎨 Imagen aplicado. Se pinta a tamaño real de
 * móvil o de escritorio y ShowcasePreview la escala para que quepa.
 *
 * Las clases van sin prefijos responsive (sm:, md:) porque el tamaño lo marca
 * el dispositivo elegido, no la pantalla de quien edita.
 */
import React from 'react';
import { MapPin, Plus, Star } from 'lucide-react';
import { EntityHero } from '../../EntityHero';
import { PlacePhotoPlaceholder } from '../../PlacePhotoPlaceholder';
import { cn } from '../../../lib/utils';
import { scoreBadgeStyle } from '../../../lib/scoreScale';
import type { BusinessVisualStyle } from '../../../services/BusinessProService';
import { heroStyleOf } from './heroStyles';
import { isValidAccent } from './visualMeta';
import type { PreviewDevice } from './previewDevice';

// Alto fijo (EntityHero lo pone en vh) igual a DEVICE_SIZE.
const DEVICE_CLASSES: Record<PreviewDevice, { hero: string; withImage: string; content: string; title: string; address: string; phrase: string; actions: string }> = {
    mobile: {
        hero: 'h-[360px]',
        // Con foto, EntityHero pinta: velo, copia desenfocada (lg:) y la foto (con bordes
        // difuminados en lg:). En un móvil no hay ni copia ni bordes, sea cual sea la pantalla de quien edita.
        withImage: '[&>div:nth-child(2)]:hidden! [&>div:nth-child(3)]:[mask-image:none]!',
        content: 'px-4 pb-8 pt-16 sm:px-4 sm:pb-8 [&>div]:flex-col! [&>div]:items-stretch! [&>div]:justify-start!',
        title: 'text-3xl',
        address: 'text-sm',
        phrase: 'text-sm',
        actions: 'items-stretch',
    },
    desktop: {
        hero: 'h-[440px]',
        // En el ordenador sí, aunque quien edita esté en un móvil.
        withImage: '[&>div:nth-child(2)]:block! [&>div:nth-child(3)]:[mask-image:linear-gradient(to_right,transparent,black_14%,black_86%,transparent)]!',
        content: 'px-8 pb-14 pt-24 sm:px-8 sm:pb-14 [&>div]:flex-row! [&>div]:items-end! [&>div]:justify-between!',
        title: 'text-6xl',
        address: 'text-lg',
        phrase: 'text-base',
        actions: 'items-end',
    },
};

export interface ShowcaseHeroProps {
    device: PreviewDevice;
    name: string;
    address?: string;
    heroText: string;
    accentColor: string;
    visualStyle: BusinessVisualStyle;
    /** Portada o, si no hay, la foto del local. */
    imageUrl?: string;
    onImageError?: () => void;
    rating: { average: number | null; count: number };
}

export const ShowcaseHero: React.FC<ShowcaseHeroProps> = ({
    device,
    name,
    address,
    heroText,
    accentColor,
    visualStyle,
    imageUrl,
    onImageError,
    rating,
}) => {
    const style = heroStyleOf(visualStyle);
    const classes = DEVICE_CLASSES[device];
    const accent = isValidAccent(accentColor) ? accentColor : undefined;
    const phrase = heroText.trim();

    return (
        <EntityHero
            // key: al cambiar de foto, ProgressiveImage empieza de cero (y vuelve a avisar si falla).
            key={imageUrl || 'sin-foto'}
            imageUrl={imageUrl}
            alt={name}
            onImageError={onImageError}
            fallback={<PlacePhotoPlaceholder compact />}
            // Sin la entrada animada de la ficha: la vista previa cambia a cada toque.
            className={cn('min-h-0! animate-none', classes.hero, imageUrl && classes.withImage, style.hero)}
            imageClassName={style.image}
            contentClassName={classes.content}
        >
            <div className="lt-entity-hero-title flex-1">
                <p className={cn('mb-2 line-clamp-2 font-display font-bold leading-tight text-[var(--lt-hero-title)]', classes.title, style.title)}>
                    {name}
                </p>
                {address && (
                    // Sin cn: «flex» y «line-clamp-1» juntos, igual que en PlacePage (twMerge quitaría uno).
                    <p className={`flex max-w-2xl items-center gap-2 font-light text-[var(--lt-hero-text)] line-clamp-1 ${classes.address}`}>
                        <MapPin className="h-4 w-4 shrink-0 text-[var(--lt-accent)]" aria-hidden="true" />
                        {address}
                    </p>
                )}
                {phrase && (
                    <p
                        className={cn('mt-3 max-w-2xl border-l-2 pl-3 italic leading-relaxed text-gray-100 line-clamp-2', classes.phrase, style.phrase)}
                        style={{ borderColor: accent || 'var(--lt-accent)' }}
                    >
                        {phrase}
                    </p>
                )}
            </div>
            <div className={cn('flex flex-col gap-2', classes.actions)}>
                <div className="flex items-center gap-2">
                    {rating.count > 0 && rating.average != null ? (
                        <span className="flex min-w-0 items-center gap-2 rounded-full border border-[var(--lt-border-strong)] bg-[var(--lt-glass)] py-1 pl-1 pr-3 text-sm font-bold text-[var(--lt-text)] backdrop-blur-md">
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5" style={scoreBadgeStyle(rating.average)}>
                                <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                                {rating.average.toFixed(1)}
                            </span>
                            <span className="truncate text-xs font-semibold text-[var(--lt-text-muted)]">
                                {rating.count} {rating.count === 1 ? 'valoración' : 'valoraciones'}
                            </span>
                        </span>
                    ) : (
                        <span className="rounded-full border border-[var(--lt-border-strong)] px-3 py-1 text-xs font-semibold text-[var(--lt-text-muted)]">
                            Sin valoraciones
                        </span>
                    )}
                    <span className={cn(
                        'flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-500/20',
                        device === 'mobile' ? 'ml-auto' : 'ml-2',
                    )}
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Valorar
                    </span>
                </div>
            </div>
        </EntityHero>
    );
};
