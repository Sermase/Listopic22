/**
 * Tarjeta discontinua «＋ Nueva sección»: un campo y chips rápidos que se
 * ocultan cuando ya tienes esa sección. «x/20» cerca del límite.
 *
 *   <NewSectionCard sections={names} ready={menu.ready} onAdd={(names) => addSections(names)} />
 */
import React, { useId, useState } from 'react';
import { Button } from '../../ui';
import { cn } from '../../../lib/utils';
import { kit } from '../kit';
import { MAX_MENU_SECTIONS } from './menuModel';
import { cleanSectionName, MAX_SECTION_NAME, QUICK_SECTIONS, sectionEmoji, sectionNameTaken } from './menuVisuals';

const COUNTER_FROM = MAX_MENU_SECTIONS - 5;

export const NewSectionCard: React.FC<{
    sections: string[];
    ready: boolean;
    onAdd: (names: string[]) => void;
}> = ({ sections, ready, onAdd }) => {
    const inputId = useId();
    const errorId = useId();
    const [draft, setDraft] = useState('');
    const [error, setError] = useState<string | null>(null);
    const full = sections.length >= MAX_MENU_SECTIONS;
    const quick = QUICK_SECTIONS.filter((name) => !sectionNameTaken(sections, name));

    const add = (raw: string): boolean => {
        const name = cleanSectionName(raw).slice(0, MAX_SECTION_NAME);
        if (!name || !ready) return false;
        const taken = sectionNameTaken(sections, name);
        if (taken) {
            setError(`Ya tienes la sección «${taken}».`);
            return false;
        }
        if (full) {
            setError(`Puedes tener hasta ${MAX_MENU_SECTIONS} secciones.`);
            return false;
        }
        setError(null);
        onAdd([name]);
        return true;
    };

    return (
        <section
            aria-labelledby={`${inputId}-title`}
            className="space-y-3 rounded-2xl border-2 border-dashed border-[var(--lt-border-strong)] p-3 sm:p-4"
        >
            <div className="flex items-center justify-between gap-2">
                <h3 id={`${inputId}-title`} className="text-sm font-black text-[var(--lt-text)]">＋ Nueva sección</h3>
                {sections.length >= COUNTER_FROM && (
                    <span className={cn('text-xs font-bold tabular-nums', full ? 'text-[var(--lt-danger)]' : 'text-[var(--lt-warning)]')}>
                        {sections.length}/{MAX_MENU_SECTIONS}
                    </span>
                )}
            </div>
            <form
                className="flex gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (add(draft)) setDraft('');
                }}
            >
                <label htmlFor={inputId} className="sr-only">Nombre de la sección nueva</label>
                <input
                    id={inputId}
                    value={draft}
                    onChange={(event) => {
                        setDraft(event.target.value);
                        setError(null);
                    }}
                    maxLength={MAX_SECTION_NAME}
                    disabled={!ready || full}
                    placeholder={full ? 'Has llegado al máximo de secciones' : 'Ej.: Para compartir'}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    className={cn(kit.input, 'min-w-0 flex-1', error && 'border-[var(--lt-danger)]')}
                />
                <Button type="submit" disabled={!ready || full || !draft.trim()} className="min-h-11 shrink-0">Añadir</Button>
            </form>
            {error && <p id={errorId} role="alert" className="text-sm font-semibold text-[var(--lt-danger)]">{error}</p>}
            {!ready && <p className="text-xs text-[var(--lt-text-muted)]">Cargando tus secciones…</p>}
            {ready && !full && quick.length > 0 && (
                <div className="flex flex-wrap gap-2" aria-label="Secciones rápidas">
                    {quick.map((name) => (
                        <button
                            key={name}
                            type="button"
                            onClick={() => add(name)}
                            className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold', kit.idle, kit.focus)}
                        >
                            <span aria-hidden="true">＋ {sectionEmoji(name)}</span>
                            {name}
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
};
