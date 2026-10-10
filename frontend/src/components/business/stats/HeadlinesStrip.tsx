/**
 * Titulares de 📊 (spec §9.1): hasta 3 pegatinas con lo más llamativo del
 * periodo. En móvil se desplazan en horizontal; el de «Días tranquilos» lleva
 * a Promos.
 *
 *   <HeadlinesStrip status="ready" headlines={computeHeadlines(…)} onAction={() => goTo('sponsored')} />
 */
import React from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Skeleton } from '../../Skeleton';
import { kit } from '../kit';
import type { Headline } from './statsModel';

export interface HeadlinesStripProps {
    status: 'loading' | 'ready';
    headlines: readonly Headline[];
    onAction?: (action: NonNullable<Headline['action']>) => void;
    busy?: boolean;
}

const chipClass = 'inline-flex min-h-11 max-w-[85vw] shrink-0 snap-start items-center gap-2.5 rounded-2xl border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] px-3 py-2 text-left text-sm font-bold leading-snug text-[var(--lt-text)] sm:max-w-none';

export const HeadlinesStrip: React.FC<HeadlinesStripProps> = ({ status, headlines, onAction, busy = false }) => {
    if (status === 'loading') {
        return (
            <div aria-hidden="true" className="flex gap-2 overflow-hidden">
                <Skeleton className="h-12 w-64 shrink-0 rounded-2xl" />
                <Skeleton className="h-12 w-56 shrink-0 rounded-2xl" />
            </div>
        );
    }
    if (headlines.length === 0) return null;
    return (
        <section aria-label="Titulares" className={cn('transition-opacity', busy && 'opacity-60')}>
            <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
                {headlines.map((headline) => {
                    const content = (
                        <>
                            <span aria-hidden="true" className="text-[28px] leading-none">{headline.emoji}</span>
                            <span className="min-w-0">{headline.text}</span>
                        </>
                    );
                    return (
                        <li key={headline.key} className="flex shrink-0">
                            {headline.action && onAction ? (
                                <button
                                    type="button"
                                    onClick={() => onAction(headline.action!)}
                                    className={cn(chipClass, 'transition-colors hover:bg-[var(--lt-accent)]/20', kit.focus)}
                                >
                                    {content}
                                    <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--lt-accent)]" />
                                </button>
                            ) : (
                                <p className={chipClass}>{content}</p>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};
