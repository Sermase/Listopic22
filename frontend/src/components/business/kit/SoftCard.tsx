/**
 * Tarjeta neutra del kit (sustituye a las cajas `border-white/10 bg-white/[0.03]`).
 *
 *   <SoftCard className="p-4 sm:p-5 space-y-4">…</SoftCard>
 *   <SoftCard as="section" aria-labelledby="t">…</SoftCard>
 *   <SoftCard tone="warning">Solo un bloque tintado por pantalla.</SoftCard>
 *   <SoftCard interactive onClick={open}>…</SoftCard>
 *
 * `tone` solo tiñe el borde y el fondo. Sin padding: lo pone quien la usa.
 */
import React from 'react';
import { Card } from '../../ui/Card';
import { cn } from '../../../lib/utils';
import { toneSurfaceClass, type Tone } from './styles';

type SoftCardElement = 'div' | 'section' | 'article' | 'aside' | 'li' | 'form' | 'fieldset';

export interface SoftCardProps extends React.HTMLAttributes<HTMLElement> {
    as?: SoftCardElement;
    tone?: Tone;
    /** Clicable: borde de acento al pasar o enfocar. */
    interactive?: boolean;
}

const baseClass = 'rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card-strong)] text-[var(--lt-text)] shadow-sm';
const interactiveClass = 'cursor-pointer transition-colors hover:border-[var(--lt-accent-border)] focus-visible:border-[var(--lt-accent-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lt-accent-soft)]';

export const SoftCard = React.forwardRef<HTMLElement, SoftCardProps>(({
    as = 'div',
    tone = 'neutral',
    interactive = false,
    className,
    ...props
}, ref) => {
    const classes = cn(
        baseClass,
        tone !== 'neutral' && toneSurfaceClass[tone],
        interactive && interactiveClass,
        className,
    );
    if (as === 'div') {
        return <Card ref={ref as React.Ref<HTMLDivElement>} className={classes} {...(props as React.HTMLAttributes<HTMLDivElement>)} />;
    }
    const Element = as as React.ElementType;
    return <Element ref={ref} className={classes} {...props} />;
});

SoftCard.displayName = 'SoftCard';
