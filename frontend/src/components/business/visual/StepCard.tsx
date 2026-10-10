/**
 * Una tarjeta-paso de 🎨 Imagen: baldosa de emoji, título, pill «Opcional» o
 * «✅ Listo» y una línea de ayuda. En móvil es un acordeón (una abierta a la
 * vez) y, cerrada, enseña un resumen («📸 Portada · foto propia ✅»).
 */
import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { SoftCard, StatusPill, kit } from '../kit';

export interface StepCardProps {
    emoji: string;
    title: string;
    help: string;
    done: boolean;
    /** Resumen cuando está cerrada (móvil). */
    summary: string;
    /** Acordeón (móvil). En escritorio todas abiertas. */
    collapsible: boolean;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
    id?: string;
}

const StepPill: React.FC<{ done: boolean }> = ({ done }) => (
    done
        ? <StatusPill emoji="✅" label="Listo" tone="success" size="sm" />
        : <StatusPill label="Opcional" size="sm" />
);

export const StepCard: React.FC<StepCardProps> = ({ emoji, title, help, done, summary, collapsible, open, onToggle, children, id }) => {
    const titleId = useId();
    const panelId = useId();
    const expanded = !collapsible || open;

    const emojiTile = (
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-glass)] text-xl leading-none">
            {emoji}
        </span>
    );

    return (
        <SoftCard as="section" id={id} aria-labelledby={titleId} className="scroll-mt-40 p-4 sm:p-5">
            {collapsible ? (
                <h3 className="m-0">
                    <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={panelId}
                        onClick={onToggle}
                        className={cn('flex min-h-11 w-full items-center gap-3 rounded-xl text-left', kit.focus)}
                    >
                        {emojiTile}
                        <span className="min-w-0 flex-1">
                            <span id={titleId} className="block text-lg font-black leading-tight text-[var(--lt-text)]">{title}</span>
                            <span className={cn('mt-0.5 block text-sm text-[var(--lt-text-muted)]', !open && 'truncate')}>{open ? help : summary}</span>
                        </span>
                        <StepPill done={done} />
                        <ChevronDown
                            aria-hidden="true"
                            className={cn('h-5 w-5 shrink-0 text-[var(--lt-text-muted)] transition-transform motion-reduce:transition-none', open && 'rotate-180')}
                        />
                    </button>
                </h3>
            ) : (
                <div className="flex items-start gap-3">
                    {emojiTile}
                    <div className="min-w-0 flex-1 pt-0.5">
                        <h3 id={titleId} className="text-lg font-black leading-tight text-[var(--lt-text)]">{title}</h3>
                        <p className="mt-0.5 text-sm text-[var(--lt-text-muted)]">{help}</p>
                    </div>
                    <div className="shrink-0 self-center"><StepPill done={done} /></div>
                </div>
            )}
            {/* Cerrada sigue montada: una subida o un enlace a medio comprobar no se pierden. */}
            <div id={panelId} hidden={!expanded} className="mt-4 space-y-4">
                {children}
            </div>
        </SoftCard>
    );
};
