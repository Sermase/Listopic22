/**
 * Paso 🎨 Tu color (`accentColor`): muestras con nombre de comida, «🎨 El
 * mío» con selector y campo hex validado, y avisos si casi no se verá.
 * Con el valor vacío se marca «Listopic» (nunca una muestra falsa).
 */
import React from 'react';
import { cn } from '../../../lib/utils';
import { ChoiceCards, TextField, kit, type ChoiceOption } from '../kit';
import {
    CUSTOM_COLOR,
    HEX_ERROR,
    SWATCHES,
    isValidAccent,
    luminanceWarning,
    normalizeHex,
} from './visualMeta';

export type ColorMode = 'swatch' | 'custom';

export interface ColorStepProps {
    /** Último color válido del borrador ('' = Listopic). */
    value: string;
    mode: ColorMode;
    hexText: string;
    /** Ya salió del campo hex alguna vez (para no regañar mientras escribe). */
    hexTouched: boolean;
    onPickSwatch: (value: string) => void;
    onPickCustom: () => void;
    onHexText: (text: string) => void;
    onHexBlur: () => void;
}

const Dot: React.FC<{ color?: string; emoji: string; rainbow?: boolean }> = ({ color, emoji, rainbow }) => (
    <span
        aria-hidden="true"
        className="grid h-11 w-11 place-items-center rounded-full border border-[var(--lt-border-strong)] text-lg leading-none shadow-sm"
        style={rainbow
            ? { background: 'conic-gradient(#e4572e, #e0a526, #2f9e5b, #1f8ac0, #8e44ad, #e05a8a, #e4572e)' }
            : { background: color }}
    >
        <span className="drop-shadow-[0_1px_1px_rgb(0_0_0/0.45)]">{emoji}</span>
    </span>
);

export const ColorStep: React.FC<ColorStepProps> = ({
    value,
    mode,
    hexText,
    hexTouched,
    onPickSwatch,
    onPickCustom,
    onHexText,
    onHexBlur,
}) => {
    const customValid = mode === 'custom' && isValidAccent(value) ? value : undefined;
    const options: ChoiceOption<string>[] = [
        ...SWATCHES.map((swatch) => ({
            value: swatch.value,
            title: swatch.name,
            subtitle: swatch.value ? undefined : 'por defecto',
            preview: <Dot color={swatch.value || 'var(--lt-accent)'} emoji={swatch.emoji} />,
        })),
        {
            value: CUSTOM_COLOR,
            title: 'El mío',
            preview: customValid ? <Dot color={customValid} emoji="🎨" /> : <Dot rainbow emoji="🎨" />,
        },
    ];
    const choice = mode === 'custom' ? CUSTOM_COLOR : value;

    const hexValid = normalizeHex(hexText) != null;
    const hexError = mode === 'custom' && hexTouched && !hexValid ? HEX_ERROR : undefined;
    const warning = luminanceWarning(value);

    return (
        <>
            <ChoiceCards
                legend="Elige tu color"
                hideLegend
                variant="swatch"
                columns={6}
                options={options}
                value={choice}
                onChange={(next) => (next === CUSTOM_COLOR ? onPickCustom() : onPickSwatch(next))}
            />

            {mode === 'custom' && (
                <div className={cn(kit.inset, 'flex flex-wrap items-start gap-3 p-3')}>
                    <label className="flex min-h-11 shrink-0 flex-col gap-1.5">
                        <span className={kit.label}>Paleta</span>
                        <input
                            type="color"
                            // Sin color propio todavía, el selector parte de un gris neutro.
                            value={isValidAccent(value) ? value : '#808080'}
                            onChange={(event) => onHexText(event.target.value)}
                            className="h-11 w-14 cursor-pointer rounded-xl border border-[var(--lt-border-strong)] bg-[var(--lt-glass)] p-1"
                        />
                    </label>
                    <TextField
                        className="min-w-[10rem] flex-1"
                        label="Código del color"
                        value={hexText}
                        onChange={onHexText}
                        onBlur={onHexBlur}
                        placeholder="#e4572e"
                        autoComplete="off"
                        spellCheck={false}
                        error={hexError}
                        hint={hexError ? undefined : 'Tipo #e4572e (también vale #e52).'}
                    />
                </div>
            )}

            {warning && (
                <p role="status" className="text-sm font-semibold text-[var(--lt-warning)]">{warning}</p>
            )}

            <div className="space-y-1">
                <p className={kit.label}>¿Dónde se ve?</p>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--lt-text-muted)]">
                    <li className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true">💬</span>
                        La rayita de tu frase
                        <span aria-hidden="true" className="ml-1 inline-block h-4 w-1 rounded-full" style={{ background: value || 'var(--lt-accent)' }} />
                    </li>
                    <li className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true">📋</span>
                        Los títulos de las secciones de tu carta
                    </li>
                </ul>
            </div>
        </>
    );
};
