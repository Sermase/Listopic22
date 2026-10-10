import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ChipGroup, type ChipGroupProps, type ChipOption } from './ChipGroup';
import { TileGrid } from './TileGrid';
import { EmojiTile } from './EmojiTile';

const LANGUAGES: ChipOption[] = [
    { value: 'Español', label: 'Español', emoji: '🇪🇸' },
    { value: 'Inglés', label: 'Inglés', emoji: '🇬🇧' },
    { value: 'Catalán/Valenciano', label: 'Catalán/Valenciano', emoji: '🗣️' },
];

const Harness = ({ initial, onChangeSpy, ...props }: Partial<ChipGroupProps> & { initial: string[]; onChangeSpy?: (next: string[]) => void }) => {
    const [value, setValue] = useState(initial);
    return (
        <>
            <ChipGroup
                legend="Idiomas"
                options={LANGUAGES}
                {...props}
                value={value}
                onChange={(next) => {
                    onChangeSpy?.(next);
                    setValue(next);
                }}
            />
            <output data-testid="value">{JSON.stringify(value)}</output>
        </>
    );
};

const chip = (name: RegExp | string) => screen.getByRole('button', { name });
const current = () => JSON.parse(screen.getByTestId('value').textContent || '[]');

describe('ChipGroup', () => {
    it('renders a fieldset with a legend, and clicking the legend toggles nothing', () => {
        const spy = vi.fn();
        render(<Harness initial={[]} onChangeSpy={spy} />);
        expect(screen.getByRole('group', { name: /Idiomas/ })).toBeInTheDocument();
        fireEvent.click(screen.getByText('Idiomas'));
        expect(spy).not.toHaveBeenCalled();
        expect(chip(/Español/)).toHaveAttribute('aria-pressed', 'false');
    });

    it('toggles options with aria-pressed and stores option.value', () => {
        render(<Harness initial={[]} />);
        fireEvent.click(chip(/Inglés/));
        expect(chip(/Inglés/)).toHaveAttribute('aria-pressed', 'true');
        expect(current()).toEqual(['Inglés']);
        fireEvent.click(chip(/Inglés/));
        expect(current()).toEqual([]);
    });

    it('matches stored values ignoring case and accents, and unchecking removes them', () => {
        render(<Harness initial={['español', 'CATALAN/VALENCIANO']} />);
        expect(chip(/Español/)).toHaveAttribute('aria-pressed', 'true');
        expect(chip(/Catalán\/Valenciano/)).toHaveAttribute('aria-pressed', 'true');
        // No aparecen como «otras»: casan con el catálogo.
        expect(screen.queryByText('Otras que añadiste')).not.toBeInTheDocument();
        fireEvent.click(chip(/Español/));
        expect(current()).toEqual(['CATALAN/VALENCIANO']);
    });

    it('ticks an option from a stored synonym (aliases) without rewriting it until the chip is touched', () => {
        const spy = vi.fn();
        render(
            <Harness
                initial={['Castellano', 'en', 'Klingon']}
                onChangeSpy={spy}
                options={[
                    { value: 'Español', label: 'Español', emoji: '🇪🇸', aliases: ['es', 'castellano'] },
                    { value: 'Inglés', label: 'Inglés', emoji: '🇬🇧', aliases: ['en', 'english'] },
                ]}
            />,
        );
        expect(chip(/Español/)).toHaveAttribute('aria-pressed', 'true');
        expect(chip(/Inglés/)).toHaveAttribute('aria-pressed', 'true');
        // Solo lo desconocido va a «Otras que añadiste».
        expect(screen.getByText('Otras que añadiste')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Quitar Castellano' })).not.toBeInTheDocument();
        expect(spy).not.toHaveBeenCalled();
        expect(current()).toEqual(['Castellano', 'en', 'Klingon']);
        // Desmarcar quita el sinónimo guardado; volver a marcar guarda el valor del catálogo.
        fireEvent.click(chip(/Español/));
        expect(current()).toEqual(['en', 'Klingon']);
        fireEvent.click(chip(/Español/));
        expect(current()).toEqual(['en', 'Klingon', 'Español']);
    });

    it('hides the legend with sr-only alone (no full-width absolute legend)', () => {
        render(<Harness initial={[]} hideLegend />);
        const legend = screen.getByText('Idiomas').closest('legend');
        expect(legend).toHaveClass('sr-only');
        expect(legend).not.toHaveClass('w-full');
    });

    it('shows the x/max counter and disables free chips at max with a hint', () => {
        render(<Harness initial={['Español']} max={2} />);
        expect(screen.getByText('1/2')).toBeInTheDocument();
        fireEvent.click(chip(/Inglés/));
        expect(screen.getByText('2/2')).toBeInTheDocument();
        const blocked = chip(/Catalán/);
        expect(blocked).toBeDisabled();
        expect(blocked).toHaveAttribute('title', '2 como máximo');
        expect(screen.getByText(/2 como máximo/, { selector: 'p' })).toBeInTheDocument();
        // Los marcados siguen pudiendo desmarcarse.
        expect(chip(/Inglés/)).not.toBeDisabled();
        fireEvent.click(chip(/Inglés/));
        expect(chip(/Catalán/)).not.toBeDisabled();
    });

    it('lists unknown stored values as removable chips', () => {
        render(<Harness initial={['Español', 'Klingon']} />);
        expect(screen.getByText('Otras que añadiste')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Quitar Klingon' }));
        expect(current()).toEqual(['Español']);
        expect(screen.queryByText('Otras que añadiste')).not.toBeInTheDocument();
    });

    it('adds a custom value with «Otro» on Enter, reusing a catalogue option when it matches', () => {
        render(<Harness initial={[]} allowOther />);
        fireEvent.click(chip(/Otro/));
        const input = screen.getByRole('textbox', { name: 'Añadir otra opción' });

        fireEvent.change(input, { target: { value: 'ingles' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(current()).toEqual(['Inglés']);

        fireEvent.change(input, { target: { value: '  Euskera ' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(current()).toEqual(['Inglés', 'Euskera']);
        expect(input).toHaveValue('');

        // Repetido (sin tildes ni mayúsculas): no se duplica.
        fireEvent.change(input, { target: { value: 'EUSKERA' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(current()).toEqual(['Inglés', 'Euskera']);
    });

    it('renders groups as disclosures and counts against the same max', () => {
        render(
            <Harness
                initial={['Terraza']}
                options={[]}
                max={30}
                groups={[
                    { key: 'comer', emoji: '🍽️', title: 'Comer y reservar', defaultOpen: true, options: [{ value: 'Terraza', label: 'Terraza', emoji: '⛱️' }] },
                    { key: 'bebidas', emoji: '🍷', title: 'Bebidas', options: [{ value: 'Café', label: 'Café', emoji: '☕' }] },
                ]}
            />,
        );
        expect(screen.getByRole('button', { name: /Comer y reservar/ })).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('button', { name: /Bebidas/ })).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('button', { name: /Café/ })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Bebidas/ }));
        fireEvent.click(screen.getByRole('button', { name: /Café/ }));
        expect(current()).toEqual(['Terraza', 'Café']);
        expect(screen.getByText('2/30')).toBeInTheDocument();
    });
});

describe('TileGrid + EmojiTile', () => {
    it('uses a legend (clicking it toggles nothing) and aria-pressed tiles with help outside the button', () => {
        const onToggle = vi.fn();
        render(
            <TileGrid legend="Movilidad" right="0 de 1">
                <EmojiTile emoji="🚪" label="Entrada sin escalones" selected={false} onToggle={onToggle} help="Sin escalones hasta la mesa." />
            </TileGrid>,
        );
        fireEvent.click(screen.getByText('Movilidad'));
        expect(onToggle).not.toHaveBeenCalled();

        const tile = screen.getByRole('button', { name: /Entrada sin escalones/, pressed: false });
        const help = screen.getByRole('button', { name: 'Más información: Entrada sin escalones' });
        expect(tile).not.toContainElement(help);
        fireEvent.click(help);
        expect(help).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('Sin escalones hasta la mesa.')).toBeVisible();
        expect(onToggle).not.toHaveBeenCalled();

        fireEvent.click(tile);
        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('hides the legend with sr-only alone (no full-width absolute legend)', () => {
        render(
            <TileGrid legend="Movilidad" hideLegend>
                <EmojiTile emoji="🚪" label="Entrada sin escalones" selected={false} onToggle={() => undefined} />
            </TileGrid>,
        );
        const legend = screen.getByText('Movilidad').closest('legend');
        expect(legend).toHaveClass('sr-only');
        expect(legend).not.toHaveClass('w-full');
    });
});
