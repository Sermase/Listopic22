import React, { useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import {
    DEFAULT_RESERVATION_BUTTON_TEXT,
    INFO_LIMITS,
    RESERVATION_BUTTON_TEXTS,
    RESERVATION_PROVIDER_OPTIONS,
} from '../../../constants/businessInfoOptions';
import type { ReservationProvider } from '../../../types/businessInfo';
import { cn } from '../../../lib/utils';
import { ChoiceCards, Disclosure, EmojiChip, Switch, TextAreaField, TextField, type ChoiceOption } from '../kit';
import type { SectionFormProps } from './formTypes';
import { EmojiText, FormStack } from './formParts';
import { extractWidgetSrc, isLikelyUrl, isWidgetCode, serverUrl, withProtocol } from './fichaModel';

type OpenMode = 'widget' | 'link';

const PROVIDER_CHOICES: Array<ChoiceOption<ReservationProvider>> = RESERVATION_PROVIDER_OPTIONS.map((option) => ({
    value: option.value,
    emoji: option.emoji,
    title: option.label,
}));

const MODE_CHOICES: Array<ChoiceOption<OpenMode>> = [
    { value: 'widget', emoji: '🪟', title: 'Dentro de Listopic', subtitle: 'Con el widget de tu proveedor' },
    { value: 'link', emoji: '↗️', title: 'En una pestaña nueva', subtitle: 'Con el enlace a tu página de reservas' },
];

/** El botón tal y como sale en la ficha pública. */
const ReservationButtonPreview: React.FC<{ text: string; enabled: boolean }> = ({ text, enabled }) => (
    <div className="space-y-1.5">
        <p className="text-xs font-semibold text-[var(--lt-text-muted)]">Así se verá en tu ficha:</p>
        <div
            role="img"
            aria-label={enabled ? `Vista previa del botón: ${text}` : 'El botón está oculto en tu ficha'}
            className={cn(
                'flex min-h-12 w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-[var(--lt-accent)] px-4 py-3 text-sm font-black text-white shadow-lg shadow-[var(--lt-accent-shadow)] transition-opacity',
                !enabled && 'opacity-35 grayscale',
            )}
        >
            <CalendarCheck className="h-5 w-5" aria-hidden="true" />
            <span className="truncate">{text}</span>
        </div>
        {!enabled && <p className="text-xs text-[var(--lt-text-muted)]">Ahora mismo no se muestra.</p>}
    </div>
);

/** 📅 Reservas: el botón de reservar de la ficha. */
export const ReservationsForm: React.FC<SectionFormProps<'reservations'>> = ({ doc, onChange }) => {
    const embedUrl = doc.data.embedUrl || '';
    const externalUrl = doc.data.externalUrl || '';
    const [mode, setMode] = useState<OpenMode>(() => (embedUrl ? 'widget' : 'link'));
    const [touched, setTouched] = useState(false);
    const enabled = doc.data.enabled === true;
    const buttonText = doc.data.buttonText || '';
    const hasLink = Boolean(embedUrl.trim() || externalUrl.trim());

    const mainValue = mode === 'widget' ? embedUrl : externalUrl;
    const mainValid = mode === 'widget' ? isLikelyUrl(extractWidgetSrc(embedUrl)) : isLikelyUrl(externalUrl);
    const mainError = touched && mainValue.trim() && !mainValid ? '✋ Este enlace no parece válido' : undefined;
    const mainHint = !mainValue.trim()
        ? undefined
        : mode === 'widget'
            ? (isWidgetCode(embedUrl) ? '✅ Widget detectado: se abrirá dentro de Listopic.' : '✅ Se abrirá dentro de Listopic.')
            : '↗️ Se abrirá en una pestaña nueva.';

    const changeMode = (next: OpenMode) => {
        if (next === mode) return;
        setMode(next);
        if (next === 'link') {
            onChange({ externalUrl: externalUrl.trim() || serverUrl(extractWidgetSrc(embedUrl)), embedUrl: '' });
        } else {
            onChange({ embedUrl: externalUrl, externalUrl: '' });
        }
    };

    const changeMain = (text: string) => {
        if (mode === 'link' && isWidgetCode(text)) {
            // Han pegado el código de un widget: se abrirá dentro.
            setMode('widget');
            onChange({ embedUrl: text, externalUrl: '' });
            return;
        }
        onChange(mode === 'widget' ? { embedUrl: text } : { externalUrl: text, embedUrl: '' });
    };

    const blurMain = () => {
        setTouched(true);
        if (mode === 'link' || !isWidgetCode(embedUrl)) {
            const fixed = withProtocol(mainValue);
            if (fixed !== mainValue) onChange(mode === 'widget' ? { embedUrl: fixed } : { externalUrl: fixed });
        }
    };

    return (
        <FormStack>
            <div className="space-y-3">
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] sm:items-center">
                    <Switch
                        checked={enabled}
                        onChange={(next) => onChange({ enabled: next })}
                        label={<EmojiText emoji="📅">Mostrar botón de reservar</EmojiText>}
                        description="Un botón grande en tu ficha para reservar mesa."
                        className="min-h-14"
                    />
                    <ReservationButtonPreview text={buttonText.trim() || DEFAULT_RESERVATION_BUTTON_TEXT} enabled={enabled && hasLink} />
                </div>
                {enabled && !hasLink && (
                    <p className="text-sm font-semibold text-[var(--lt-warning)]">
                        <span aria-hidden="true">⚠️ </span>Sin enlace no se mostrará el botón.
                    </p>
                )}
            </div>

            <ChoiceCards
                legend={<EmojiText emoji="🍽️">¿Con quién reservas?</EmojiText>}
                options={PROVIDER_CHOICES}
                value={doc.data.provider || 'custom'}
                variant="compact"
                onChange={(provider) => onChange({ provider })}
            />

            <div className="space-y-4">
                <ChoiceCards
                    legend={<EmojiText emoji="🚪">¿Dónde se abre la reserva?</EmojiText>}
                    options={MODE_CHOICES}
                    value={mode}
                    columns={2}
                    onChange={changeMode}
                />
                {mode === 'widget' ? (
                    <TextAreaField
                        label={<EmojiText emoji="🔗">Enlace o código del widget</EmojiText>}
                        value={embedUrl}
                        onChange={changeMain}
                        onBlur={blurMain}
                        rows={3}
                        max={1200}
                        placeholder={'Pega el enlace o el código <iframe> que te da tu proveedor'}
                        hint={mainHint}
                        error={mainError}
                        spellCheck={false}
                    />
                ) : (
                    <TextField
                        label={<EmojiText emoji="🔗">Enlace de reservas</EmojiText>}
                        type="url"
                        inputMode="url"
                        value={externalUrl}
                        onChange={changeMain}
                        onBlur={blurMain}
                        placeholder="https://…"
                        hint={mainHint}
                        error={mainError}
                        spellCheck={false}
                    />
                )}
                {mode === 'widget' && (
                    <Disclosure title="Opciones avanzadas" emoji="⚙️" flat={false}>
                        <TextField
                            label="Enlace de respaldo"
                            type="url"
                            inputMode="url"
                            value={externalUrl}
                            onChange={(next) => onChange({ externalUrl: next })}
                            onBlur={() => {
                                const fixed = withProtocol(externalUrl);
                                if (fixed !== externalUrl) onChange({ externalUrl: fixed });
                            }}
                            placeholder="https://…"
                            hint="Por si el widget no carga. Si lo dejas vacío, se usará el del widget."
                            error={externalUrl.trim() && !isLikelyUrl(externalUrl) ? '✋ Este enlace no parece válido' : undefined}
                        />
                    </Disclosure>
                )}
            </div>

            <div className="space-y-3">
                <TextField
                    label={<EmojiText emoji="🔤">Texto del botón</EmojiText>}
                    value={buttonText}
                    onChange={(next) => onChange({ buttonText: next })}
                    max={INFO_LIMITS.reservationButtonText}
                    placeholder={DEFAULT_RESERVATION_BUTTON_TEXT}
                    hint={`Si lo dejas vacío, pondrá «${DEFAULT_RESERVATION_BUTTON_TEXT}».`}
                />
                <div className="flex flex-wrap gap-2" role="group" aria-label="Textos rápidos">
                    {RESERVATION_BUTTON_TEXTS.map((text) => (
                        <EmojiChip
                            key={text}
                            label={text}
                            size="sm"
                            selected={buttonText.trim() === text}
                            onToggle={() => onChange({ buttonText: buttonText.trim() === text ? '' : text })}
                        />
                    ))}
                </div>
            </div>
        </FormStack>
    );
};
