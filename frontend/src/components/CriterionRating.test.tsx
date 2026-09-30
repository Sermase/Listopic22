import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { CriterionRating } from './CriterionRating';

const Harness = ({ counts = true, initial }: { counts?: boolean; initial?: number }) => {
    const [value, setValue] = useState<number | undefined>(initial);
    return (
        <>
            <CriterionRating
                criterion={{ id: 'sabor', label: 'Sabor', step: 0.5, labelMin: 'Soso', labelMax: 'Brutal' }}
                value={value}
                counts={counts}
                onChange={setValue}
            />
            <output data-testid="value">{value === undefined ? 'vacío' : String(value)}</output>
        </>
    );
};

describe('CriterionRating', () => {
    it('empieza sin puntuar: no hay 5 por defecto', () => {
        render(<Harness />);
        expect(screen.getByText('Sin puntuar')).toBeInTheDocument();
        expect(screen.getByTestId('value')).toHaveTextContent('vacío');
        expect(screen.getByLabelText('Sabor')).toHaveAttribute('aria-valuetext', 'Sin puntuar');
    });

    it('mover el deslizador puntúa', () => {
        render(<Harness />);
        fireEvent.change(screen.getByLabelText('Sabor'), { target: { value: '8.5' } });
        expect(screen.getByTestId('value')).toHaveTextContent('8.5');
        expect(screen.queryByText('Sin puntuar')).not.toBeInTheDocument();
    });

    it('tocarlo sin moverlo deja el 5 elegido a propósito', () => {
        render(<Harness />);
        fireEvent.pointerUp(screen.getByLabelText('Sabor'));
        expect(screen.getByTestId('value')).toHaveTextContent('5');
    });

    it('con teclado, Enter puntúa el valor mostrado', () => {
        render(<Harness />);
        fireEvent.keyDown(screen.getByLabelText('Sabor'), { key: 'Enter' });
        expect(screen.getByTestId('value')).toHaveTextContent('5');
    });

    it('muestra los extremos con sus etiquetas', () => {
        render(<Harness />);
        expect(screen.getByText(/Soso/)).toBeInTheDocument();
        expect(screen.getByText(/Brutal/)).toBeInTheDocument();
    });

    it('un criterio obligatorio no se puede quitar; uno opcional sí', () => {
        const { unmount } = render(<Harness initial={7} />);
        expect(screen.queryByRole('button', { name: 'Quitar' })).not.toBeInTheDocument();
        unmount();
        render(<Harness counts={false} initial={7} />);
        fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));
        expect(screen.getByTestId('value')).toHaveTextContent('vacío');
        expect(screen.getByText('Sin puntuar')).toBeInTheDocument();
    });
});
