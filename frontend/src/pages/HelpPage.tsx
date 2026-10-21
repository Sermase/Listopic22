import React from 'react';
import { ChevronDown } from 'lucide-react';
import { HELP_TOPICS } from '../lib/helpTopics';
import { usePreferences, type UxPreferences } from '../context/PreferencesContext';
import { reopenWelcome } from '../lib/welcome';

const Toggle: React.FC<{ label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, hint, checked, onChange }) => (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-2.5">
        <span className="min-w-0">
            <span className="block text-sm font-semibold text-[var(--lt-text)]">{label}</span>
            {hint && <span className="mt-0.5 block text-xs leading-snug text-[var(--lt-text-muted)]">{hint}</span>}
        </span>
        <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-[var(--lt-accent)]' : 'bg-[var(--lt-border)]'}`}>
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
        </span>
    </label>
);

/** Ayuda y Mis preferencias en una sola página (sección según la ruta). */
export const HelpPage: React.FC<{ section?: 'ayuda' | 'preferencias' }> = ({ section = 'ayuda' }) => {
    const { prefs, setPref } = usePreferences();
    const set = (key: keyof UxPreferences) => (v: boolean) => setPref(key, v);

    const preferences = (
        <section className="space-y-2">
            <h2 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-[var(--lt-text-muted)]">Mis preferencias</h2>
            <Toggle label="🌾 Sin gluten" hint="Las listas filtran solas. Es lo que marca la gente: no es una garantía para alérgicos." checked={prefs.glutenFree} onChange={set('glutenFree')} />
            <Toggle label="🥦 Vegetariano" hint="Igual: solo lo marcado como vegetariano." checked={prefs.vegetarian} onChange={set('vegetarian')} />
            <Toggle label="ⓘ Ayudas en la app" hint="Los iconos ⓘ que explican cada parte." checked={prefs.showHelpTips} onChange={set('showHelpTips')} />
        </section>
    );

    return (
        <div className="min-h-screen bg-[var(--lt-bg)] px-4 pb-24 pt-safe-24">
            <div className="mx-auto max-w-2xl space-y-6 pt-4">
                <header>
                    <h1 className="font-display text-2xl font-bold text-[var(--lt-text)]">{section === 'preferencias' ? 'Preferencias' : 'Ayuda'}</h1>
                    <p className="mt-1 text-sm text-[var(--lt-text-muted)]">
                        {section === 'preferencias' ? 'Lo que Listopic tiene en cuenta siempre por ti.' : 'Cómo funciona cada parte de Listopic, en corto.'}
                    </p>
                </header>

                {section === 'preferencias' && preferences}

                <section className="space-y-2">
                    {section === 'preferencias' && <h2 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-[var(--lt-text-muted)]">Ayuda</h2>}
                    {HELP_TOPICS.map((t) => (
                        <details key={t.id} id={t.id} className="group rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)]">
                            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                                <span className="text-xl" aria-hidden="true">{t.emoji}</span>
                                <span className="flex-1 text-sm font-bold text-[var(--lt-text)]">{t.title}</span>
                                <ChevronDown className="h-4 w-4 text-[var(--lt-text-muted)] transition-transform group-open:rotate-180" />
                            </summary>
                            <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-[var(--lt-text)]">
                                {t.body.map((p) => <p key={p}>{p}</p>)}
                            </div>
                        </details>
                    ))}
                </section>

                {section === 'ayuda' && preferences}

                <button type="button" onClick={reopenWelcome} className="w-full rounded-xl border border-[var(--lt-border)] py-3 text-sm font-bold text-[var(--lt-text)] hover:border-[var(--lt-accent-border)]">
                    Ver otra vez la bienvenida
                </button>
            </div>
        </div>
    );
};

export default HelpPage;
