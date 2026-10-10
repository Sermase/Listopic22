/**
 * Paso 💬 Tu frase (`heroText`): contador (el servidor corta a 300, en la
 * ficha se ven 2 líneas), emoji en el cursor e ideas para empezar.
 */
import React, { useId, useRef, useState } from 'react';
import { useConfirm } from '../../../context/ConfirmContext';
import { cn } from '../../../lib/utils';
import { TextAreaField, kit } from '../kit';
import { ActionChip } from './visualParts';
import { HERO_TEXT_MAX, HERO_TEXT_SOFT_MAX, PHRASE_EMOJI, PHRASE_IDEAS, type PhraseIdea } from './visualMeta';

export interface PhraseStepProps {
    value: string;
    onChange: (value: string) => void;
}

export const PhraseStep: React.FC<PhraseStepProps> = ({ value, onChange }) => {
    const confirm = useConfirm();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const paletteId = useId();
    const tooLong = value.length > HERO_TEXT_SOFT_MAX;

    const insertEmoji = (emoji: string) => {
        const field = textareaRef.current;
        const start = field?.selectionStart ?? value.length;
        const end = field?.selectionEnd ?? value.length;
        const next = `${value.slice(0, start)}${emoji}${value.slice(end)}`;
        setEmojiOpen(false);
        if (next.length > HERO_TEXT_MAX) return;
        onChange(next);
        const caret = start + emoji.length;
        requestAnimationFrame(() => {
            field?.focus();
            field?.setSelectionRange(caret, caret);
        });
    };

    const pickIdea = async (idea: PhraseIdea) => {
        const current = value.trim();
        if (current === idea.text) return;
        if (current) {
            const ok = await confirm({
                title: '¿Reemplazar tu frase?',
                message: `Se cambiará por «${idea.text}».`,
                confirmLabel: 'Reemplazar',
                cancelLabel: 'Dejar la mía',
            });
            if (!ok) return;
        }
        onChange(idea.text);
    };

    return (
        <>
            <TextAreaField
                ref={textareaRef}
                label="Tu frase"
                labelHidden
                value={value}
                onChange={onChange}
                max={HERO_TEXT_MAX}
                softMax={HERO_TEXT_SOFT_MAX}
                rows={3}
                placeholder="Ej. Cocina honesta, producto local y brunch de fin de semana"
                labelAside={(
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            aria-expanded={emojiOpen}
                            aria-controls={paletteId}
                            onClick={() => setEmojiOpen((open) => !open)}
                            className={cn(
                                'inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors',
                                kit.focus,
                                emojiOpen ? kit.selected : kit.idle,
                            )}
                        >
                            <span aria-hidden="true" className="text-lg leading-none">😊</span>
                            Añadir emoji
                        </button>
                        <div
                            id={paletteId}
                            hidden={!emojiOpen}
                            role="group"
                            aria-label="Emoji para tu frase"
                            onKeyDown={(event) => {
                                if (event.key === 'Escape') setEmojiOpen(false);
                            }}
                            className={cn(kit.inset, 'basis-full p-1.5')}
                        >
                            <div className="grid grid-cols-6 gap-1 min-[420px]:grid-cols-8 sm:grid-cols-12">
                                {PHRASE_EMOJI.map((emoji) => (
                                    <button
                                        key={emoji}
                                        type="button"
                                        aria-label={`Añadir ${emoji}`}
                                        onClick={() => insertEmoji(emoji)}
                                        className={cn('grid h-11 place-items-center rounded-lg text-xl leading-none transition-colors hover:bg-[var(--lt-accent-soft)]', kit.focus)}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                hint={(
                    <>
                        {tooLong && (
                            <span className="mb-1 block font-semibold text-[var(--lt-warning)]">⚠️ En la ficha solo se ven 2 líneas</span>
                        )}
                        Aparece bajo el nombre, en cursiva y con la rayita de tu color.
                    </>
                )}
            />

            <div className="space-y-2">
                <p className={kit.label}>¿Sin ideas? Toca una <span aria-hidden="true">👇</span></p>
                <div className="flex flex-wrap gap-2">
                    {PHRASE_IDEAS.map((idea) => (
                        <ActionChip
                            key={idea.text}
                            emoji={idea.emoji}
                            label={idea.text}
                            pressed={value.trim() === idea.text}
                            onClick={() => void pickIdea(idea)}
                        />
                    ))}
                </div>
            </div>
        </>
    );
};
