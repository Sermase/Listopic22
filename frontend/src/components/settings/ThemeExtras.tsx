import React, { useState } from 'react';
import { useTheme, type ThemeId } from '../../context/ThemeContext';
import { THEME_CHARACTERS, THEME_GRACES, THEME_PERKS, isCharacterMuted, setCharacterMuted } from '../../lib/themeCharacters';
import { haptic } from '../../utils/haptics';
import { Knob } from './MyFilters';

/**
 * Preferencias → Tema, debajo de los temas: el personaje de cada tema especial
 * (se calla aquí, en este dispositivo) y las gracias de Medianoche y Mediodía,
 * que se ganan con su medalla.
 */
export const ThemeExtras: React.FC = () => {
    const { themes, graceUnlocked } = useTheme();
    const [, bump] = useState(0);
    const withCharacter = themes.filter((t) => THEME_CHARACTERS[t.id]);
    const perks = (Object.keys(THEME_PERKS) as ThemeId[]).map((id) => ({ id, perk: THEME_PERKS[id]!, label: themes.find((t) => t.id === id)?.label ?? id }));

    const toggle = (id: ThemeId, on: boolean) => {
        setCharacterMuted(id, !on);
        haptic('selection');
        bump((n) => n + 1);
    };

    return (
        <div className="mt-5 space-y-5">
            {withCharacter.length > 0 && (
                <section>
                    <h3 className="mb-1 px-1 text-[11px] font-bold uppercase tracking-widest text-[var(--lt-text-muted)]">Personajes</h3>
                    <p className="mb-2 px-1 text-xs text-[var(--lt-text-muted)]">Saludan al entrar y comentan al publicar. Cállalos los que quieras (en este dispositivo).</p>
                    <div className="divide-y divide-[var(--lt-border)] overflow-hidden rounded-2xl border border-[var(--lt-border)]">
                        {withCharacter.map((t) => {
                            const c = THEME_CHARACTERS[t.id]!;
                            const on = !isCharacterMuted(t.id);
                            return (
                                <label key={t.id} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-[var(--lt-glass)]">
                                    <span className="w-6 shrink-0 text-center text-lg" aria-hidden="true">{c.emoji}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-semibold text-[var(--lt-text)]">{c.name}</span>
                                        <span className="block truncate text-xs text-[var(--lt-text-muted)]">Tema {t.label}{THEME_GRACES[t.id] ? ` · gracia: ${THEME_GRACES[t.id]!.name.toLowerCase()}` : ''}</span>
                                    </span>
                                    <input type="checkbox" className="sr-only" checked={on} onChange={(e) => toggle(t.id, e.target.checked)} aria-label={`${c.name}: ${on ? 'habla' : 'callado'}`} />
                                    <Knob on={on} />
                                </label>
                            );
                        })}
                    </div>
                </section>
            )}

            <section>
                <h3 className="mb-1 px-1 text-[11px] font-bold uppercase tracking-widest text-[var(--lt-text-muted)]">Gracias con medalla</h3>
                <div className="divide-y divide-[var(--lt-border)] overflow-hidden rounded-2xl border border-[var(--lt-border)]">
                    {perks.map(({ id, perk, label }) => {
                        const got = graceUnlocked(id);
                        return (
                            <div key={id} className="flex items-start gap-3 px-4 py-3">
                                <span className={`w-6 shrink-0 text-center text-lg ${got ? '' : 'opacity-50 grayscale'}`} aria-hidden="true">{perk.icon}</span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold text-[var(--lt-text)]">{label} · «{perk.medal}» {got ? '✅' : '🔒'}</span>
                                    <span className="block text-xs leading-snug text-[var(--lt-text-muted)]">{got ? perk.what : `${perk.hint} ${perk.what}`}</span>
                                </span>
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
};
