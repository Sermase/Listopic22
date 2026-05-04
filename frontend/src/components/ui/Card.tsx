import React from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, interactive = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] shadow-lg',
      interactive && 'transition-colors hover:border-[var(--lt-accent-border)] hover:bg-white/[0.07]',
      className,
    )}
    {...props}
  />
));

Card.displayName = 'Card';
