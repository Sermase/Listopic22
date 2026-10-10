/**
 * Pill de estado. Cada dominio aporta su mapa META (Record<clave, StatusMeta>):
 *
 *   const PROPOSAL_STATUS_META: Record<ProposalStatus, StatusMeta> = {
 *     pending: { emoji: '⏳', label: 'Pendiente', tone: 'warning' }, …
 *   };
 *   <StatusPill {...PROPOSAL_STATUS_META[p.status]} />
 *   <StatusPill emoji="✨" label="Business Pro" tone="promo" />
 */
import React from 'react';
import { cn } from '../../../lib/utils';
import { toneClass, type Tone } from './styles';

export interface StatusPillProps {
    emoji?: string;
    label: React.ReactNode;
    tone?: Tone;
    size?: 'sm' | 'md';
    className?: string;
    title?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ emoji, label, tone = 'neutral', size = 'md', className, title }) => (
    <span
        title={title}
        className={cn(
            'inline-flex max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-full font-bold',
            size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]',
            toneClass[tone],
            tone === 'neutral' && 'border border-[var(--lt-border)]',
            className,
        )}
    >
        {emoji && <span aria-hidden="true" className="leading-none">{emoji}</span>}
        <span className="truncate">{label}</span>
    </span>
);
