import React from 'react';
import { usePreferences, type UxPreferences } from '../../context/PreferencesContext';
import { ALLERGEN_OPTIONS } from '../../services/BusinessProService';
import { APT_CONTRIBUTE_KEYS, type AptKey } from '../../lib/aptFor';

// «Mis filtros»: dieta, alérgenos, movilidad y mascotas. Privados; se aplican solos.

type BoolPref = { [K in keyof UxPreferences]: UxPreferences[K] extends boolean ? K : never }[keyof UxPreferences];
export type FilterGroupId = 'food' | 'mobility' | 'pets';

/** El interruptor que se ve (la casilla de verdad va oculta al lado). */
export const Knob: React.FC<{ on: boolean }> = ({ on }) => (
    <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-[var(--lt-accent)]' : 'bg-[var(--lt-border)]'}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </span>
);

export const Toggle: React.FC<{ label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, hint, checked, onChange }) => (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-2.5">
        <span className="min-w-0">
            <span className="block text-sm font-semibold text-[var(--lt-text)]">{label}</span>
            {hint && <span className="mt-0.5 block text-xs leading-snug text-[var(--lt-text-muted)]">{hint}</span>}
        </span>
        <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <Knob on={checked} />
    </label>
);

const Pill: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode; label: string }> = ({ on, onClick, children, label }) => (
    <button
        type="button"
        aria-pressed={on}
        aria-label={label}
        onClick={onClick}
        className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${on ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-[var(--lt-text)]' : 'border-[var(--lt-border)] text-[var(--lt-text-muted)]'}`}
    >
        {children}
    </button>
);

/** Una necesidad con dos casillas: filtrar lo que ves y aportar al valorar. */
const NeedRow: React.FC<{
    label: string; hint: string; filter: boolean; contribute?: boolean;
    onFilter: (v: boolean) => void; onContribute?: (v: boolean) => void;
}> = ({ label, hint, filter, contribute, onFilter, onContribute }) => (
    <div className="rounded-xl border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-2.5">
        <span className="block text-sm font-semibold text-[var(--lt-text)]">{label}</span>
        <span className="mt-0.5 block text-xs leading-snug text-[var(--lt-text-muted)]">{hint}</span>
        <div className="mt-2 flex flex-wrap gap-1.5">
            <Pill on={filter} onClick={() => onFilter(!filter)} label={`Filtrar: ${label}`}>👁️ Filtrar</Pill>
            {onContribute && <Pill on={!!contribute} onClick={() => onContribute(!contribute)} label={`Aportar: ${label}`}>✍️ Aportar</Pill>}
        </div>
    </div>
);

const HowItWorks: React.FC<{ lines: string[] }> = ({ lines }) => (
    <details className="rounded-xl px-1">
        <summary className="cursor-pointer text-xs font-semibold text-[var(--lt-accent)]">¿Cómo funciona?</summary>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-snug text-[var(--lt-text-muted)]">
            {lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
    </details>
);

const NAMES: Partial<Record<AptKey, string>> = {
    glutenFree: 'Sin gluten', lactoseFree: 'Sin lactosa', vegetarian: 'Vegetariano', vegan: 'Vegano',
    stepFree: 'Sin escalones', accessibleRestroom: 'Baño adaptado', petFriendly: 'Con mascota',
};
const GROUP_KEYS: Record<FilterGroupId, AptKey[]> = {
    food: ['glutenFree', 'lactoseFree', 'vegetarian', 'vegan'],
    mobility: ['stepFree', 'accessibleRestroom'],
    pets: ['petFriendly'],
};

/** Lo que tiene activo cada grupo, en corto («Sin gluten · 2 alérgenos»). */
export const FilterSummary: React.FC<{ group: FilterGroupId }> = ({ group }) => <>{filterSummary(group, usePreferences().prefs)}</>;

function filterSummary(group: FilterGroupId, prefs: UxPreferences): string {
    const parts = GROUP_KEYS[group].filter((key) => prefs[key as BoolPref]).map((key) => NAMES[key] || key);
    if (group === 'food' && prefs.allergens.length) parts.push(`${prefs.allergens.length} alérgeno${prefs.allergens.length === 1 ? '' : 's'}`);
    const contributing = GROUP_KEYS[group].some((key) => APT_CONTRIBUTE_KEYS.includes(key) && prefs.contribute.includes(key) && !prefs[key as BoolPref]);
    if (contributing) parts.push('aportas');
    return parts.length ? parts.join(' · ') : 'Nada';
}

/** Las casillas de un grupo de filtros. */
export const FilterGroup: React.FC<{ group: FilterGroupId }> = ({ group }) => {
    const { prefs, setPref } = usePreferences();

    const toggleAllergen = (value: string) => setPref(
        'allergens',
        prefs.allergens.includes(value) ? prefs.allergens.filter((a) => a !== value) : [...prefs.allergens, value],
    );
    // Filtrar marca también Aportar (se puede desmarcar); Aportar puede ir solo.
    const setContribute = (key: AptKey, on: boolean) => setPref(
        'contribute',
        on ? Array.from(new Set([...prefs.contribute, key])) : prefs.contribute.filter((k) => k !== key),
    );
    const need = (key: AptKey & BoolPref, label: string, hint: string) => {
        const canContribute = APT_CONTRIBUTE_KEYS.includes(key);
        return (
            <NeedRow
                label={label}
                hint={hint}
                filter={prefs[key]}
                contribute={canContribute && prefs.contribute.includes(key)}
                onFilter={(v) => {
                    setPref(key, v);
                    if (canContribute && v && !prefs.contribute.includes(key)) setContribute(key, true);
                }}
                onContribute={canContribute ? (v) => setContribute(key, v) : undefined}
            />
        );
    };

    if (group === 'food') return (
        <div className="space-y-2">
            {need('glutenFree', '🌾 Sin gluten', 'Listas y Buscar enseñan solo lo apto sin gluten; en La Carta se pliega lo que lleva gluten.')}
            {need('lactoseFree', '🥛 Sin lactosa', 'Listas enseñan solo lo apto sin lactosa; en La Carta se pliega lo que lleva lácteos.')}
            {need('vegetarian', '🥦 Vegetariano', 'Solo lo que lleva la etiqueta Vegetariano o Vegano. En tortillas, bravas o tartas, todo menos lo marcado con 🥩.')}
            {need('vegan', '🌱 Vegano', 'Solo lo que lleva la etiqueta Vegano.')}
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
            <HowItWorks lines={[
                'En las listas solo ves los platos que la gente ha marcado como sin gluten, sin lactosa, vegetarianos o veganos, o que otros celíacos o intolerantes han dado por aptos sin que nadie diga lo contrario. Lo que nadie ha marcado no sale.',
                'En Buscar, los platos se filtran igual; los sitios no se quitan, pero salen primero los que tienen algo sin gluten.',
                'En la carta oficial de un local, los platos con tus alérgenos se pliegan al final («Ocultos por tus alérgenos») y los que el local no ha indicado llevan un «?».',
                'El botón «Alérgenos» de la carta te deja mirar cualquier alérgeno, aunque no lo tengas marcado aquí.',
                'Si eres celíaco, verás arriba de la carta lo que dice el local de la contaminación cruzada.',
                'En cada pantalla aparece un chip con el filtro activo: tócalo (✕) para ver todo esa vez. Aquí sigue guardado.',
                '«Aportar»: al valorar un plato te sale una pregunta rápida («¿Lo pediste sin gluten?»). Tu respuesta es privada; los demás solo ven el recuento, sin nombres («✅ 4 celíacos: sin problemas»).',
                'Puedes aportar sin filtrar, por ejemplo si cocinas para alguien celíaco.',
            ]} />
        </div>
    );
    if (group === 'mobility') return (
        <div className="space-y-2">
            {need('stepFree', 'Entrada sin escalones', 'Se esconden los sitios donde consta que no la hay. Los que no tienen datos siguen saliendo.')}
            {need('accessibleRestroom', 'Baño adaptado', 'Igual: fuera solo donde consta que no lo hay.')}
            <HowItWorks lines={[
                'Los datos vienen de Google, de lo que indica el propio local y de lo que aporta la gente.',
                'En las listas solo se esconden los sitios donde consta que no hay entrada sin escalones o baño adaptado. Los que no tienen datos siguen saliendo, para que no te quedes sin nada.',
                'En Buscar no se quita nada: salen primero los que sí lo tienen.',
                '«Aportar»: al valorar te pregunta si había entrada sin escalones o baño adaptado. Es privado; solo se ve el recuento.',
            ]} />
        </div>
    );
    return (
        <div className="space-y-2">
            {need('petFriendly', 'Suelo ir con mi mascota', 'Las listas enseñan solo sitios que admiten mascotas.')}
            <HowItWorks lines={[
                'En las listas solo ves los sitios donde consta que admiten mascotas (lo indica Google o el local).',
                'En Buscar no se quita nada: salen primero los que las admiten.',
                'Si un día vas sin ella, quita el chip 🐾 en esa pantalla.',
                '«Aportar»: al valorar te pregunta si admiten mascotas.',
            ]} />
        </div>
    );
};
