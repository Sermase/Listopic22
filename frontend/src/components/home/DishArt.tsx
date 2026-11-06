import React from 'react';
import { dishArt } from '../../lib/dishArt';

/** Dibujo del plato o sitio cuando no hay foto (lib/dishArt). Ocupa todo su contenedor. */
export const DishArtTile: React.FC<{ names: ReadonlyArray<string | null | undefined>; className?: string; emojiClassName?: string }> = ({ names, className = '', emojiClassName = 'text-2xl' }) => {
    const art = dishArt(...names);
    return (
        <span
            className={`flex h-full w-full items-center justify-center ${className}`}
            style={{ backgroundImage: `radial-gradient(circle at 30% 25%, hsl(${art.hue} 85% 60% / 0.32), hsl(${art.hue} 70% 45% / 0.14) 70%)` }}
            aria-hidden="true"
        >
            <span className={`${emojiClassName} drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]`}>{art.emoji}</span>
        </span>
    );
};
