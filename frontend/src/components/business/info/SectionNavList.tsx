import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { BusinessInfoDocument, BusinessInfoSection } from '../../../types/businessInfo';
import { cn } from '../../../lib/utils';
import { StatusPill, kit } from '../kit';
import type { FichaSections } from './fichaModel';
import { SECTION_GROUPS, SECTION_META, SECTION_STATUS_META, sectionStatus, sectionSummary } from './sectionMeta';

export interface SectionNavProps {
    /** Lo guardado: de ahí salen el estado y el resumen. */
    saved: FichaSections;
    /** Secciones con cambios sin guardar. */
    dirty: Partial<Record<BusinessInfoSection, boolean>>;
    active?: BusinessInfoSection | null;
    onSelect: (section: BusinessInfoSection) => void;
    className?: string;
}

const docOf = (saved: FichaSections, section: BusinessInfoSection) => saved[section] as BusinessInfoDocument;

const DirtyDot: React.FC<{ withText?: boolean }> = ({ withText = false }) => (
    <span className="shrink-0 text-xs font-bold text-[var(--lt-warning)]" title="Cambios sin guardar">
        <span aria-hidden="true">●</span>
        {withText ? <span> Sin guardar</span> : <span className="sr-only">, sin guardar</span>}
    </span>
);

/** Escritorio: 4 grupos con sus filas (emoji, nombre, ➕/✏️/✅ y ● si hay cambios). */
export const SectionNavList: React.FC<SectionNavProps> = ({ saved, dirty, active, onSelect, className }) => (
    <nav aria-label="Secciones de tu ficha" className={cn('space-y-4', className)}>
        {SECTION_GROUPS.map((group) => (
            <div key={group.id} className="space-y-1">
                <h3 className="px-2.5 text-xs font-semibold text-[var(--lt-text-muted)]">{group.title}</h3>
                <ul className="space-y-1">
                    {group.sections.map((section) => {
                        const meta = SECTION_META[section];
                        const status = SECTION_STATUS_META[sectionStatus(docOf(saved, section))];
                        const isActive = active === section;
                        return (
                            <li key={section}>
                                <button
                                    type="button"
                                    aria-current={isActive ? 'true' : undefined}
                                    onClick={() => onSelect(section)}
                                    className={cn(
                                        'flex min-h-11 w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left text-sm font-semibold transition-colors',
                                        kit.focus,
                                        isActive
                                            ? kit.selected
                                            : 'border-transparent text-[var(--lt-text-muted)] hover:bg-[var(--lt-glass)] hover:text-[var(--lt-text)]',
                                    )}
                                >
                                    <span aria-hidden="true" className="w-6 shrink-0 text-center text-lg leading-none">{meta.emoji}</span>
                                    <span className="min-w-0 flex-1 truncate">{meta.title}</span>
                                    {dirty[section] && <DirtyDot />}
                                    <span aria-hidden="true" title={status.label} className="shrink-0 text-sm leading-none">{status.emoji}</span>
                                    <span className="sr-only">{`, ${status.label}`}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>
        ))}
    </nav>
);

/** Móvil: tarjetas por grupo con emoji, resumen en vivo y estado. Al tocar, se abre el editor. */
export const SectionOverviewCards: React.FC<SectionNavProps> = ({ saved, dirty, onSelect, className }) => (
    <div className={cn('space-y-6', className)}>
        {SECTION_GROUPS.map((group) => (
            <section key={group.id} aria-labelledby={`ficha-group-${group.id}`} className="space-y-3">
                <h3 id={`ficha-group-${group.id}`} className="text-sm font-black text-[var(--lt-text)]">{group.title}</h3>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {group.sections.map((section) => {
                        const meta = SECTION_META[section];
                        const doc = docOf(saved, section);
                        const status = SECTION_STATUS_META[sectionStatus(doc)];
                        const summary = sectionSummary(doc);
                        return (
                            <li key={section}>
                                <button
                                    type="button"
                                    onClick={() => onSelect(section)}
                                    className={cn(
                                        kit.surface,
                                        kit.focus,
                                        'flex h-full w-full items-start gap-3 p-4 text-left shadow-sm transition-colors hover:border-[var(--lt-accent-border)]',
                                    )}
                                >
                                    <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-glass)] text-xl leading-none">
                                        {meta.emoji}
                                    </span>
                                    <span className="min-w-0 flex-1 space-y-1.5">
                                        <span className="flex flex-wrap items-center gap-x-2">
                                            <span className="text-base font-black text-[var(--lt-text)]">{meta.title}</span>
                                            {dirty[section] && <DirtyDot withText />}
                                        </span>
                                        <span className="line-clamp-2 block text-sm text-[var(--lt-text-muted)]">{summary || meta.help}</span>
                                        <StatusPill size="sm" emoji={status.emoji} label={status.label} tone={status.tone} />
                                    </span>
                                    <ChevronRight aria-hidden="true" className="mt-2.5 h-4 w-4 shrink-0 text-[var(--lt-text-muted)]" />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </section>
        ))}
    </div>
);
