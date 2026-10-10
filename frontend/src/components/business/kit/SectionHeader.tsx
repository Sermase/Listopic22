/**
 * Cabecera de tarjeta o sección: baldosa de emoji de 40px, título, una línea
 * de ayuda y un hueco a la derecha (contador, pill o acción). Sin pill Pro.
 *
 *   <SectionHeader emoji="🐾" title="Mascotas" help="¿Se puede venir con mascota?" />
 *   <SectionHeader as="h3" emoji="📖" title="Tu carta" right={<StatusPill … />} id="carta-title" />
 */
import React from 'react';
import { cn } from '../../../lib/utils';

export interface SectionHeaderProps {
    emoji: string;
    title: React.ReactNode;
    help?: React.ReactNode;
    right?: React.ReactNode;
    as?: 'h1' | 'h2' | 'h3' | 'h4';
    /** id del título, para `aria-labelledby` de la tarjeta. */
    id?: string;
    className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ emoji, title, help, right, as: Heading = 'h2', id, className }) => (
    <div className={cn('flex items-start gap-3', className)}>
        <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-glass)] text-xl leading-none"
        >
            {emoji}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
            <Heading id={id} className="text-lg font-black leading-tight text-[var(--lt-text)]">{title}</Heading>
            {help && <p className="mt-0.5 text-sm text-[var(--lt-text-muted)]">{help}</p>}
        </div>
        {right && <div className="flex shrink-0 items-center gap-2 self-center">{right}</div>}
    </div>
);
