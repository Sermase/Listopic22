import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { useMyAbilities } from '../../hooks/useAbilities';
import { useGamification } from '../../context/GamificationContext';
import { presetBadge } from '../../config/badgePresets';
import { ABILITIES, PIN_EMOJIS, SIGNATURE_MAX, SIGNATURE_SUGGESTIONS, ringFor, signatureBadgeOptions, signatureFor, type AbilityPrefs } from '../../lib/abilities';
import { useToast } from '../../context/ToastContext';
import '@fontsource-variable/caveat';

const HAND_FONT = { fontFamily: "'Caveat Variable', cursive" } as const;


const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-[var(--lt-text-muted)]">{children}</p>
);

const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${on
    ? 'border-[var(--lt-accent)] bg-[var(--lt-accent-soft)] text-[var(--lt-text)]'
    : 'border-[var(--lt-border)] text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]'}`;

/** Preferencias → Mis premios: lo que se elige de los premios de medallas (firma, chincheta y aro). */
export const PrizesEditor: React.FC = () => {
    const { has, prefs, savePrefs } = useMyAbilities();
    const { earnedBadgeIds } = useGamification();
    const { showToast } = useToast();
    const [phrase, setPhrase] = useState(prefs.signature || '');
    const owned = ABILITIES.filter((a) => has(a.id));

    const save = (patch: Partial<AbilityPrefs>, message = 'Guardado') => {
        void savePrefs(patch)
            .then(() => showToast({ variant: 'success', message }))
            .catch(() => showToast({ variant: 'error', message: 'No se pudo guardar.' }));
    };

    if (!owned.length) {
        return <p className="text-sm text-[var(--lt-text-muted)]">Aún no tienes premios. Algunas medallas traen uno: míralas en tu perfil.</p>;
    }

    const ring = ringFor(prefs, has('goldRing'), has('colorRing'));
    const badgesForSignature = signatureBadgeOptions(earnedBadgeIds, presetBadge);
    const signatureBadgeOn = badgesForSignature.some((b) => b.id === prefs.signatureBadge);

    return (
        <div className="space-y-5">
            {has('cardSignature') && (
                <div>
                    <Label>✍️ Tu firma en las tarjetas</Label>
                    {(() => {
                        const current = signatureFor(prefs, earnedBadgeIds, presetBadge);
                        return (
                            <p className="mb-2 rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-bg)] px-3 py-2 text-center">
                                {current ? (
                                    <>
                                        {current.text && <span className="block text-2xl leading-tight text-[var(--lt-accent)]" style={HAND_FONT}>“{current.text}”</span>}
                                        {current.badge && <span className="block text-[11px] font-semibold text-[var(--lt-text-muted)]">{current.badge}</span>}
                                    </>
                                ) : (
                                    <span className="text-xs text-[var(--lt-text-muted)]">Aún sin firma: escribe una frase o elige una medalla.</span>
                                )}
                            </p>
                        );
                    })()}
                    <div className="flex gap-2">
                        <div className="relative min-w-0 flex-1">
                            <input
                                value={phrase}
                                maxLength={SIGNATURE_MAX}
                                onChange={(e) => setPhrase(e.target.value)}
                                placeholder="Si no cruje, no es croqueta"
                                aria-label="Tu frase"
                                className="w-full rounded-xl border border-[var(--lt-border)] bg-[var(--lt-bg)] py-2 pl-3 pr-12 text-sm text-[var(--lt-text)] outline-none focus:border-[var(--lt-accent)]"
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] tabular-nums text-[var(--lt-text-muted)]">{phrase.length}/{SIGNATURE_MAX}</span>
                        </div>
                        <button
                            type="button"
                            disabled={phrase.trim() === (prefs.signature || '')}
                            onClick={() => save({ signature: phrase.trim() || undefined }, 'Firma guardada')}
                            className="shrink-0 rounded-xl px-3 py-2 text-xs font-bold lt-on-accent disabled:opacity-40"
                            style={{ backgroundImage: 'var(--lt-accent-grad)' }}
                        >
                            Guardar
                        </button>
                    </div>
                    <p className="mb-1 mt-2 text-xs text-[var(--lt-text-muted)]">O coge una idea:</p>
                    <div className="flex flex-wrap gap-1.5">
                        {SIGNATURE_SUGGESTIONS.map((idea) => (
                            <button key={idea} type="button" className={chip(phrase === idea)} onClick={() => setPhrase(idea)}>
                                {idea}
                            </button>
                        ))}
                    </div>
                    {badgesForSignature.length > 0 && (
                        <>
                            <p className="mb-1 mt-3 text-xs text-[var(--lt-text-muted)]">Y si quieres, una medalla debajo:</p>
                            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Medalla de la firma">
                                <button type="button" role="radio" aria-checked={!signatureBadgeOn} className={chip(!signatureBadgeOn)} onClick={() => save({ signatureBadge: undefined }, 'Firma guardada')}>
                                    Sin medalla
                                </button>
                                {badgesForSignature.map((b) => {
                                    const on = prefs.signatureBadge === b.id;
                                    return (
                                        <button key={b.id} type="button" role="radio" aria-checked={on} className={chip(on)} onClick={() => save({ signatureBadge: b.id }, 'Firma guardada')}>
                                            {b.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                    <p className="mt-2 text-[11px] text-[var(--lt-text-muted)]">Es la de siempre: al crear una tarjeta puedes cambiarla solo para esa.</p>
                </div>
            )}

            {has('customPin') && (
                <div>
                    <Label>📍 Chincheta de tu mapa</Label>
                    <div className="flex flex-wrap gap-1.5">
                        <button type="button" className={chip(!prefs.pinEmoji)} onClick={() => save({ pinEmoji: undefined })}>Ninguna</button>
                        {PIN_EMOJIS.map((emoji) => (
                            <button key={emoji} type="button" aria-label={`Chincheta ${emoji}`} className={`${chip(prefs.pinEmoji === emoji)} text-base leading-none`} onClick={() => save({ pinEmoji: emoji })}>
                                {emoji}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {(has('goldRing') || has('colorRing')) && (
                <div>
                    <Label>⭕ Aro de tu foto</Label>
                    <div className="flex flex-wrap gap-1.5">
                        {has('goldRing') && <button type="button" className={chip(ring === 'gold')} onClick={() => save({ ring: 'gold' })}>🏆 Dorado</button>}
                        {has('colorRing') && <button type="button" className={chip(ring === 'theme')} onClick={() => save({ ring: 'theme' })}>🎨 Color de mi tema</button>}
                        <button type="button" className={chip(ring === null)} onClick={() => save({ ring: 'off' })}>Sin aro</button>
                    </div>
                </div>
            )}

            <div>
                <Label>Tus premios</Label>
                <ul className="divide-y divide-[var(--lt-border)] overflow-hidden rounded-2xl border border-[var(--lt-border)]">
                    {owned.map((a) => (
                        <li key={a.id} className="flex items-start gap-3 px-3 py-2.5">
                            <span className="w-6 shrink-0 text-center text-lg" aria-hidden="true">{a.emoji}</span>
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1 text-sm font-semibold text-[var(--lt-text)]">{a.name} <Check className="h-3.5 w-3.5 text-[var(--lt-accent)]" /></span>
                                <span className="block text-xs text-[var(--lt-text-muted)]">{a.where}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};
