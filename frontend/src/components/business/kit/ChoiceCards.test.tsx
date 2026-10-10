import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ChoiceCards, type ChoiceOption } from './ChoiceCards';
import { Switch } from './Switch';
import { Disclosure } from './Disclosure';

type Price = 'low' | 'medium' | 'high' | 'premium';

const PRICES: ChoiceOption<Price>[] = [
    { value: 'low', emoji: '🪙', title: '€ Económico' },
    { value: 'medium', emoji: '💶', title: '€€ Medio' },
    { value: 'high', emoji: '💰', title: '€€€ Alto', disabled: true },
    { value: 'premium', emoji: '💎', title: '€€€€ Premium' },
];

const Harness = ({ initial = null, clearable = false }: { initial?: Price | null; clearable?: boolean }) => {
    const [value, setValue] = useState<Price | null>(initial);
    return (
        <>
            {clearable ? (
                <ChoiceCards legend="Precio" options={PRICES} value={value} onChange={setValue} allowClear clearLabel="Quitar precio" />
            ) : (
                <ChoiceCards legend="Precio" options={PRICES} value={value} onChange={setValue} />
            )}
            <output data-testid="value">{String(value)}</output>
        </>
    );
};

const radio = (name: RegExp) => screen.getByRole('radio', { name });

describe('ChoiceCards', () => {
    it('is a labelled radiogroup with aria-checked radios and a single tab stop', () => {
        render(<Harness initial="medium" />);
        expect(screen.getByRole('radiogroup', { name: 'Precio' })).toBeInTheDocument();
        expect(radio(/Medio/)).toHaveAttribute('aria-checked', 'true');
        expect(radio(/Económico/)).toHaveAttribute('aria-checked', 'false');
        expect(radio(/Medio/)).toHaveAttribute('tabindex', '0');
        expect(radio(/Económico/)).toHaveAttribute('tabindex', '-1');
    });

    it('with nothing selected, the first enabled option is the tab stop', () => {
        render(<Harness />);
        expect(radio(/Económico/)).toHaveAttribute('tabindex', '0');
    });

    it('arrow keys move the selection and focus, skipping disabled options and wrapping', () => {
        render(<Harness initial="medium" />);
        radio(/Medio/).focus();
        fireEvent.keyDown(radio(/Medio/), { key: 'ArrowRight' });
        // «Alto» está desactivado: salta a «Premium».
        expect(screen.getByTestId('value').textContent).toBe('premium');
        expect(radio(/Premium/)).toHaveFocus();

        fireEvent.keyDown(radio(/Premium/), { key: 'ArrowDown' });
        expect(screen.getByTestId('value').textContent).toBe('low');
        expect(radio(/Económico/)).toHaveFocus();

        fireEvent.keyDown(radio(/Económico/), { key: 'ArrowLeft' });
        expect(screen.getByTestId('value').textContent).toBe('premium');

        fireEvent.keyDown(radio(/Premium/), { key: 'Home' });
        expect(screen.getByTestId('value').textContent).toBe('low');
        fireEvent.keyDown(radio(/Económico/), { key: 'End' });
        expect(screen.getByTestId('value').textContent).toBe('premium');
    });

    it('click selects; allowClear shows a clear link that sets null', () => {
        render(<Harness clearable />);
        expect(screen.queryByRole('button', { name: 'Quitar precio' })).not.toBeInTheDocument();
        fireEvent.click(radio(/Económico/));
        expect(screen.getByTestId('value').textContent).toBe('low');
        fireEvent.click(screen.getByRole('button', { name: 'Quitar precio' }));
        expect(screen.getByTestId('value').textContent).toBe('null');
    });
});

describe('Switch', () => {
    it('is a role=switch with aria-checked that toggles', () => {
        const Toggle = () => {
            const [on, setOn] = useState(false);
            return <Switch checked={on} onChange={setOn} label="Mostrar botón de reservar" onText="Sí" offText="No" />;
        };
        render(<Toggle />);
        const control = screen.getByRole('switch', { name: 'Mostrar botón de reservar' });
        expect(control).toHaveAttribute('aria-checked', 'false');
        fireEvent.click(control);
        expect(control).toHaveAttribute('aria-checked', 'true');
    });
});

describe('Disclosure', () => {
    it('remembers its open state with a storage key', () => {
        localStorage.clear();
        const { unmount } = render(<Disclosure title="Opciones avanzadas" storageKey="kit-test:adv">contenido</Disclosure>);
        const button = screen.getByRole('button', { name: /Opciones avanzadas/ });
        expect(button).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText('contenido')).not.toBeInTheDocument();
        fireEvent.click(button);
        expect(screen.getByText('contenido')).toBeVisible();
        unmount();

        render(<Disclosure title="Opciones avanzadas" storageKey="kit-test:adv">contenido</Disclosure>);
        expect(screen.getByRole('button', { name: /Opciones avanzadas/ })).toHaveAttribute('aria-expanded', 'true');
    });
});
