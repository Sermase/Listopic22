/**
 * DeveloperSidebar: barra lateral de Developer agrupada en secciones
 * (Bandeja · Moderación · Negocios y planes · Contenido · Sistema · Analítica)
 * con contadores:
 *   review > 0     → pastilla con el número (color según la pestaña)
 *   attention > 0  → punto ámbar con el número
 *   0 y 0          → nada
 * En móvil es un cajón que se abre desde la cabecera de <main>.
 *
 * Props
 *   activeTab: DeveloperActiveTab
 *   onSelect: (tab) => void          DeveloperPage hace goToTab(tab) y cierra el cajón
 *   open: boolean; onClose: () => void
 *   badges?: Record<SidebarBadgeTab, SidebarBadge>   de useDeveloperPendingCounts
 */
import React from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { SidebarBadge, SidebarBadgeTab } from '../../hooks/useDeveloperInbox';
import { DEVELOPER_NAV_SECTIONS, type DeveloperBadgeTone } from './developerNav';
import type { DeveloperActiveTab } from './developerTabs';

export interface DeveloperSidebarProps {
    activeTab: DeveloperActiveTab;
    onSelect: (tab: DeveloperActiveTab) => void;
    open: boolean;
    onClose: () => void;
    badges?: Partial<Record<SidebarBadgeTab, SidebarBadge>>;
}

const REVIEW_TONE_CLASS: Record<DeveloperBadgeTone, string> = {
    accent: 'bg-[var(--lt-accent)] text-white',
    red: 'bg-red-500 text-white',
    amber: 'border border-amber-500/40 bg-amber-500/15 text-amber-300',
};

const formatCount = (value: number): string => (value > 99 ? '99+' : String(value));

const NavBadge: React.FC<{ badge?: SidebarBadge; tone: DeveloperBadgeTone }> = ({ badge, tone }) => {
    if (!badge) return null;
    if (badge.review > 0) {
        const label = `${badge.review} por revisar${badge.attention > 0 ? ` y ${badge.attention} piden atención` : ''}`;
        return (
            <span
                title={label}
                className={cn('min-w-5 shrink-0 rounded-full px-1.5 py-0.5 text-center text-[11px] font-black leading-none tabular-nums', REVIEW_TONE_CLASS[tone])}
            >
                <span aria-hidden="true">{formatCount(badge.review)}</span>
                <span className="sr-only">{label}</span>
            </span>
        );
    }
    if (badge.attention > 0) {
        const label = `${badge.attention} piden atención`;
        return (
            <span title={label} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold tabular-nums text-amber-300">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-400" />
                <span aria-hidden="true">{formatCount(badge.attention)}</span>
                <span className="sr-only">{label}</span>
            </span>
        );
    }
    return null;
};

export const DeveloperSidebar: React.FC<DeveloperSidebarProps> = ({ activeTab, onSelect, open, onClose, badges }) => (
    <>
        {open && (
            <button
                type="button"
                aria-label="Cerrar menú"
                onClick={onClose}
                className="fixed inset-0 z-30 bg-black/50 md:hidden"
            />
        )}
        <nav
            aria-label="Herramientas de Developer"
            className={cn(
                'fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col overflow-y-auto border-r border-[var(--lt-border)] bg-[var(--lt-card-strong)] pb-6 pt-20 transition-transform duration-300 ease-in-out md:static md:translate-x-0 md:pt-4',
                open ? 'translate-x-0' : '-translate-x-full',
            )}
        >
            <div className="mb-2 flex items-center justify-between px-6 md:hidden">
                <h2 className="text-lg font-bold text-white">Menú Dev</h2>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Cerrar menú"
                    className="rounded-lg p-1.5 text-[var(--lt-text-muted)] hover:bg-white/10 hover:text-[var(--lt-text)]"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>

            {DEVELOPER_NAV_SECTIONS.map((section) => (
                <div key={section.id} className="pt-3">
                    <p className="px-6 pb-1 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--lt-text-muted)] opacity-80">
                        {section.label}
                    </p>
                    {section.items.map((item) => {
                        const active = item.id === activeTab;
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                aria-current={active ? 'page' : undefined}
                                onClick={() => onSelect(item.id)}
                                className={cn(
                                    'flex w-full items-center gap-3 border-l-2 px-6 py-2 text-left text-sm transition-colors',
                                    active
                                        ? cn(item.activeClass, 'font-semibold text-white')
                                        : 'border-transparent text-[var(--lt-text-muted)] hover:bg-white/5 hover:text-[var(--lt-text)]',
                                )}
                            >
                                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                {item.badgeKey && <NavBadge badge={badges?.[item.badgeKey]} tone={item.badgeTone ?? 'amber'} />}
                            </button>
                        );
                    })}
                </div>
            ))}
        </nav>
    </>
);
