import React, { useRef } from 'react';
import { DESCRIPTION_IDEAS, INFO_LIMITS, LANGUAGE_OPTIONS } from '../../../constants/businessInfoOptions';
import { cn } from '../../../lib/utils';
import { ChipGroup, TextAreaField, TextField, kit } from '../kit';
import type { SectionFormProps } from './formTypes';
import { EmojiText, FormStack } from './formParts';

// Con sus sinónimos: «Castellano» o «es» guardados marcan 🇪🇸 Español (no van a «Otras que añadiste»).
const LANGUAGE_CHIPS = LANGUAGE_OPTIONS.map(({ value, label, emoji, aliases }) => ({ value, label, emoji, aliases: [...aliases, label] }));

/** 🪪 Identidad: «Cómo te presentas». */
export const IdentityForm: React.FC<SectionFormProps<'identity'>> = ({ doc, onChange, ctx }) => {
    const descriptionRef = useRef<HTMLTextAreaElement>(null);
    const displayName = doc.data.displayName?.es || '';
    const description = doc.data.description?.es || '';
    const placeName = ctx?.placeName?.trim();

    const setDescription = (es: string) => onChange({ description: { ...doc.data.description, es } });

    const insertIdea = (text: string) => {
        const current = description.replace(/\s+$/, '');
        const joined = current ? `${current}\n${text}` : text;
        const next = joined.slice(0, INFO_LIMITS.description);
        setDescription(next);
        // Al final del texto, para seguir escribiendo.
        requestAnimationFrame(() => {
            const area = descriptionRef.current;
            if (!area) return;
            area.focus();
            area.setSelectionRange(next.length, next.length);
        });
    };

    return (
        <FormStack>
            <TextField
                label={<EmojiText emoji="🏷️">Nombre visible</EmojiText>}
                value={displayName}
                onChange={(es) => onChange({ displayName: { ...doc.data.displayName, es } })}
                max={INFO_LIMITS.displayName}
                placeholder={placeName || 'El nombre de tu local'}
                hint={placeName ? `Déjalo vacío para usar «${placeName}».` : 'Déjalo vacío para usar el nombre de Google.'}
                autoComplete="organization"
            />

            <TextAreaField
                ref={descriptionRef}
                label={<EmojiText emoji="✍️">Descripción</EmojiText>}
                value={description}
                onChange={setDescription}
                max={INFO_LIMITS.description}
                rows={5}
                placeholder="Cuéntanos qué os hace especiales: la tortilla de la abuela, el vermut del domingo…"
                labelAside={(
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Ideas para empezar">
                        {DESCRIPTION_IDEAS.map((idea) => (
                            <button
                                key={idea.label}
                                type="button"
                                onClick={() => insertIdea(idea.text)}
                                className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors', kit.focus, kit.idle)}
                            >
                                <span aria-hidden="true">{idea.emoji}</span> {idea.label}
                            </button>
                        ))}
                    </div>
                )}
            />

            <ChipGroup
                legend={<EmojiText emoji="🗣️">Idiomas</EmojiText>}
                help="¿En qué idiomas os pueden atender?"
                options={LANGUAGE_CHIPS}
                value={doc.data.languages || []}
                onChange={(languages) => onChange({ languages })}
                max={INFO_LIMITS.languages}
                allowOther
                otherPlaceholder="Otro idioma"
                otherMaxLength={40}
            />
        </FormStack>
    );
};
