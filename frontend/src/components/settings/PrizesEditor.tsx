import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { useMyAbilities } from '../../hooks/useAbilities';
import { useGamification } from '../../context/GamificationContext';
import { presetBadge } from '../../config/badgePresets';
import { ABILITIES, PIN_EMOJIS, SIGNATURE_MAX, ringFor, type AbilityPrefs } from '../../lib/abilities';
import { useToast } from '../../context/ToastContext';


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
    const badgesForSignature = earnedBadgeIds.map((id) => presetBadge(id)).filter((b): b is NonNullable<typeof b> => Boolean(b));

    return (
        <div className="space-y-5">
            {has('cardSignature') && (
                <div>
                    <Label>✍️ Tu firma en las tarjetas</Label>
                    <div className="flex gap-2">
                        <input
                            value={phrase}
                            maxLength={SIGNATURE_MAX}
                            onChange={(e) => setPhrase(e.target.value)}
                            placeholder="Si no cruje, no es croqueta"
                            className="min-w-0 flex-1 rounded-xl border border-[var(--lt-border)] bg-[var(--lt-bg)] px-3 py-2 text-sm text-[var(--lt-text)] outline-none focus:border-[var(--lt-accent)]"
                        />
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
                    {badgesForSignature.length > 0 && (
                        <div className="mt-2">
                            <p className="mb-1 text-xs text-[var(--lt-text-muted)]">Tu medalla favorita, al lado:</p>
                            <div className="flex flex-wrap gap-1.5">
                                <button type="button" className={chip(!prefs.signatureBadge)} onClick={() => save({ signatureBadge: undefined })}>Ninguna</button>
                                {badgesForSignature.map((b) => (
                                    <button key={b.id} type="button" className={chip(prefs.signatureBadge === b.id)} onClick={() => save({ signatureBadge: b.id })}>
                                        {b.icon} {b.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
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
