/**
 * Estado vacío con un emoji grande en un círculo discontinuo.
 *
 *   <EmptyState emoji="🍽️" title="Tu carta está vacía… ¡vamos a llenarla!"
 *     text="Empieza por las secciones típicas." actions={<Button>＋ Añadir primer plato</Button>} />
 *   <EmptyState size="sm" emoji="🫙" title="Nada por aquí todavía." />
 */
import React from 'react';
import { cn } from '../../../lib/utils';

export interface EmptyStateProps {
    emoji: string;
    title: React.ReactNode;
    text?: React.ReactNode;
    actions?: React.ReactNode;
    size?: 'sm' | 'md';
    /** Encabezado del título (por defecto h3). */
    as?: 'h2' | 'h3' | 'h4' | 'p';
    className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ emoji, title, text, actions, size = 'md', as: Title = 'h3', className }) => (
    <div className={cn('flex flex-col items-center text-center', size === 'md' ? 'gap-3 px-4 py-8' : 'gap-2 px-3 py-5', className)}>
        <span
            aria-hidden="true"
            className={cn(
                'grid place-items-center rounded-full border-2 border-dashed border-[var(--lt-border-strong)] bg-[var(--lt-glass)] leading-none',
                size === 'md' ? 'h-20 w-20 text-4xl' : 'h-14 w-14 text-2xl',
            )}
        >
            {emoji}
        </span>
        <Title className={cn('font-black text-[var(--lt-text)]', size === 'md' ? 'text-lg' : 'text-sm')}>{title}</Title>
        {text && <p className="max-w-md text-sm text-[var(--lt-text-muted)]">{text}</p>}
        {actions && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
);
