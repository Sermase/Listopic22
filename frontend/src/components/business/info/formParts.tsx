import React from 'react';
import { cn } from '../../../lib/utils';
import type { InfoFlag } from '../../../constants/businessInfoOptions';
import { EmojiTile, kit } from '../kit';

// Piezas pequeñas que comparten los formularios de la Ficha (lo grande está en ../kit).

/** Emoji (oculto a lectores de pantalla) + texto. */
export const EmojiText: React.FC<{ emoji: string; children: React.ReactNode }> = ({ emoji, children }) => (
    <>
        <span aria-hidden="true">{emoji}</span> {children}
    </>
);

/**
 * Preguntas de un formulario, separadas por una línea fina (sin cajas de colores).
 * Cada pregunta va en su propio <div>: el relleno no puede ir en el <fieldset>
 * (su <legend> se pinta encima del borde y quedaría pegada a la línea).
 */
export const FormStack: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <div className={cn('divide-y divide-[var(--lt-border)]', className)}>
        {React.Children.toArray(children).map((child, index) => (
            <div key={React.isValidElement(child) && child.key != null ? child.key : index} className="min-w-0 py-6 first:pt-0 last:pb-0">
                {child}
            </div>
        ))}
    </div>
);

/** Enlace con aspecto de texto que lleva a otra parte («Detállalo en 👨‍👩‍👧 Familias →»). */
export const GoLink: React.FC<{ onClick?: () => void; children: React.ReactNode; className?: string }> = ({ onClick, children, className }) => {
    if (!onClick) return null;
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-left text-sm font-semibold text-[var(--lt-accent)] underline-offset-4 hover:underline',
                kit.focus,
                className,
            )}
        >
            {children}
        </button>
    );
};

/** Una baldosa por cada booleano del catálogo. */
export function FlagTiles<K extends string>({
    options,
    data,
    onToggle,
    useShort = true,
    hidden,
}: {
    options: Array<InfoFlag<K>>;
    data: Partial<Record<K, unknown>>;
    onToggle: (key: K, next: boolean) => void;
    /** Etiqueta corta (dentro de un grupo con título). */
    useShort?: boolean;
    /** Claves que no se pintan. */
    hidden?: ReadonlyArray<K>;
}) {
    return (
        <>
            {options.filter((option) => !hidden?.includes(option.key)).map((option) => {
                const on = data[option.key] === true;
                return (
                    <EmojiTile
                        key={option.key}
                        emoji={option.emoji}
                        label={useShort ? option.short || option.label : option.label}
                        cornerBadge={option.cornerBadge}
                        help={option.hint}
                        selected={on}
                        onToggle={() => onToggle(option.key, !on)}
                    />
                );
            })}
        </>
    );
}
