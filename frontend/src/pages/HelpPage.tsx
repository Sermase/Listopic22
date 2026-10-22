import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { HELP_TOPICS } from '../lib/helpTopics';
import { usePreferences, type UxPreferences } from '../context/PreferencesContext';
import { reopenWelcome } from '../lib/welcome';
import { ALLERGEN_OPTIONS } from '../services/BusinessProService';

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

const PrefGroup: React.FC<{ emoji: string; title: string; count: number; howItWorks: string[]; children: React.ReactNode }> = ({ emoji, title, count, howItWorks, children }) => (
    <details open={count > 0} className="group rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)]">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
            <span className="text-xl" aria-hidden="true">{emoji}</span>
            <span className="flex-1 text-sm font-bold text-[var(--lt-text)]">{title}</span>
            {count > 0 && <span className="rounded-full bg-[var(--lt-accent-soft)] px-2 py-0.5 text-xs font-bold text-[var(--lt-accent)]">{count} activo{count === 1 ? '' : 's'}</span>}
            <ChevronDown className="h-4 w-4 text-[var(--lt-text-muted)] transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-2 px-3 pb-3">
            {children}
            <details className="rounded-xl px-1">
                <summary className="cursor-pointer text-xs font-semibold text-[var(--lt-accent)]">¿Cómo funciona?</summary>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-snug text-[var(--lt-text-muted)]">
                    {howItWorks.map((line) => <li key={line}>{line}</li>)}
                </ul>
            </details>
        </div>
    </details>
);

/** Ayuda y Mis preferencias en una sola página (sección según la ruta). */
export const HelpPage: React.FC<{ section?: 'ayuda' | 'preferencias' }> = ({ section = 'ayuda' }) => {
    const { prefs, setPref } = usePreferences();
    type BoolPref = { [K in keyof UxPreferences]: UxPreferences[K] extends boolean ? K : never }[keyof UxPreferences];
    const set = (key: BoolPref) => (v: boolean) => setPref(key, v);

    const toggleAllergen = (value: string) => setPref(
        'allergens',
        prefs.allergens.includes(value) ? prefs.allergens.filter((a) => a !== value) : [...prefs.allergens, value],
    );
    const foodCount = [prefs.glutenFree, prefs.vegetarian, prefs.vegan].filter(Boolean).length + prefs.allergens.length;
    const mobilityCount = [prefs.stepFree, prefs.accessibleRestroom].filter(Boolean).length;

    const preferences = (
        <section className="space-y-2">
            <h2 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-[var(--lt-text-muted)]">Mis preferencias</h2>
            <p className="text-xs leading-snug text-[var(--lt-text-muted)]">🔒 Son filtros privados: nadie más los ve y solo sirven para filtrar lo que ves (más en la <Link to="/privacy" className="underline">privacidad</Link>). Se aplican solos y en cada pantalla puedes quitarlos un momento.</p>
            <PrefGroup emoji="🍽️" title="Comida" count={foodCount} howItWorks={[
                'En las listas solo ves los platos que la gente ha marcado como sin gluten, vegetarianos o veganos. Lo que nadie ha marcado no sale.',
                'En Buscar, los platos se filtran igual; los sitios no se quitan, pero salen primero los que tienen algo sin gluten.',
                'En la carta oficial de un local, los platos con tus alérgenos se pliegan al final («Ocultos por tus alérgenos») y los que el local no ha indicado llevan un «?».',
                'El botón «Alérgenos» de la carta te deja mirar cualquier alérgeno, aunque no lo tengas marcado aquí.',
                'Si eres celíaco, verás arriba de la carta lo que dice el local de la contaminación cruzada.',
                'En cada pantalla aparece un chip con el filtro activo: tócalo (✕) para ver todo esa vez. Aquí sigue guardado.',
            ]}>
                <Toggle label="🌾 Sin gluten" hint="Listas y Buscar enseñan solo lo marcado sin gluten; en La Carta se pliega lo que lleva gluten." checked={prefs.glutenFree} onChange={set('glutenFree')} />
                <Toggle label="🥦 Vegetariano" hint="Solo lo marcado como vegetariano o vegano." checked={prefs.vegetarian} onChange={set('vegetarian')} />
                <Toggle label="🌱 Vegano" hint="Solo lo marcado como vegano." checked={prefs.vegan} onChange={set('vegan')} />
                <div className="rounded-xl border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-2.5">
                    <span className="block text-sm font-semibold text-[var(--lt-text)]">Soy alérgico o intolerante a…</span>
                    <span className="mt-0.5 block text-xs leading-snug text-[var(--lt-text-muted)]">En las cartas de los locales, los platos que lo llevan se pliegan.</span>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {ALLERGEN_OPTIONS.map((option) => {
                            const on = prefs.allergens.includes(option.value);
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => toggleAllergen(option.value)}
                                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${on ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-[var(--lt-text)]' : 'border-[var(--lt-border)] text-[var(--lt-text-muted)]'}`}
                                >
                                    <span aria-hidden="true">{option.emoji}</span> {option.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <p className="px-1 text-xs leading-snug text-[var(--lt-text-muted)]">⚠️ Lo indican el local o la gente: confirma siempre con el local.</p>
            </PrefGroup>
            <PrefGroup emoji="♿" title="Movilidad" count={mobilityCount} howItWorks={[
                'Los datos vienen de Google y de lo que indica el propio local.',
                'En las listas solo se esconden los sitios donde consta que no hay entrada sin escalones o baño adaptado. Los que no tienen datos siguen saliendo, para que no te quedes sin nada.',
                'En Buscar no se quita nada: salen primero los que sí lo tienen.',
            ]}>
                <Toggle label="Entrada sin escalones" hint="Se esconden los sitios donde consta que no la hay. Los que no tienen datos siguen saliendo." checked={prefs.stepFree} onChange={set('stepFree')} />
                <Toggle label="Baño adaptado" hint="Igual: fuera solo donde consta que no lo hay." checked={prefs.accessibleRestroom} onChange={set('accessibleRestroom')} />
            </PrefGroup>
            <PrefGroup emoji="🐾" title="Mascotas" count={prefs.petFriendly ? 1 : 0} howItWorks={[
                'En las listas solo ves los sitios donde consta que admiten mascotas (lo indica Google o el local).',
                'En Buscar no se quita nada: salen primero los que las admiten.',
                'Si un día vas sin ella, quita el chip 🐾 en esa pantalla.',
            ]}>
                <Toggle label="Suelo ir con mi mascota" hint="Las listas enseñan solo sitios que admiten mascotas." checked={prefs.petFriendly} onChange={set('petFriendly')} />
            </PrefGroup>
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
