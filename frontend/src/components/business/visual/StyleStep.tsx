/**
 * Paso 🖌️ Estilo de portada (`visualStyle`): tarjetas con una mini cabecera
 * hecha con tu foto y las mismas clases que aplica la ficha pública.
 */
import React from 'react';
import { cn } from '../../../lib/utils';
import type { BusinessVisualStyle } from '../../../services/BusinessProService';
import { ChoiceCards, type ChoiceOption } from '../kit';
import { HERO_STYLE_CLASSES } from './heroStyles';
import { STYLE_OPTIONS } from './visualMeta';

export interface StyleStepProps {
    value: BusinessVisualStyle;
    onChange: (style: BusinessVisualStyle) => void;
    /** Foto de la cabecera (portada o la del local) para las miniaturas. */
    imageUrl?: string;
    name: string;
}

const MiniHero: React.FC<{ style: BusinessVisualStyle; imageUrl?: string; name: string }> = ({ style, imageUrl, name }) => {
    const classes = HERO_STYLE_CLASSES[style];
    return (
        // Ocupa también el margen derecho de la tarjeta (allí va el ✓, encima de la foto).
        <span aria-hidden="true" className={cn('relative block aspect-video w-[calc(100%_+_1.5rem)] overflow-hidden rounded-xl bg-[var(--lt-bg-deep)]', classes.hero)}>
            {imageUrl ? (
                <img src={imageUrl} alt="" loading="lazy" className={cn('absolute inset-0 h-full w-full object-cover opacity-80', classes.image)} />
            ) : (
                <span className="absolute inset-0 grid place-items-center text-2xl">🍽️</span>
            )}
            <span className="absolute inset-0" style={{ background: 'linear-gradient(to top, var(--lt-bg) 0%, transparent 75%)' }} />
            <span className={cn('absolute inset-x-2 bottom-1.5 truncate font-display text-sm font-bold text-[var(--lt-hero-title)]', classes.title)}>
                {name}
            </span>
        </span>
    );
};

export const StyleStep: React.FC<StyleStepProps> = ({ value, onChange, imageUrl, name }) => {
    const options: ChoiceOption<BusinessVisualStyle>[] = STYLE_OPTIONS.map((option) => ({
        value: option.value,
        emoji: option.emoji,
        title: option.title,
        subtitle: option.subtitle,
        preview: <MiniHero style={option.value} imageUrl={imageUrl} name={name} />,
    }));
    return (
        <ChoiceCards
            legend="Elige el estilo de tu portada"
            hideLegend
            columns={4}
            options={options}
            value={value}
            onChange={onChange}
        />
    );
};
