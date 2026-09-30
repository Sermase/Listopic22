import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CriteriaBuilder, type Criterion } from './CriteriaBuilder';

const criteria: Criterion[] = [
    { id: 'sabor', label: 'Sabor', minLabel: 'Malo', maxLabel: 'Bueno', isPonderable: true, step: 0.5 },
    { id: 'precio', label: 'Precio', minLabel: 'Caro', maxLabel: 'Barato', isPonderable: false, step: 0.5 },
];

describe('CriteriaBuilder con valoraciones (scoringLockedIds)', () => {
    it('no deja cambiar si cuenta para la nota ni quitar el criterio, pero sí renombrarlo', () => {
        const onChange = vi.fn();
        render(<CriteriaBuilder criteria={criteria} onChange={onChange} scoringLockedIds={['sabor', 'precio']} />);
        expect(screen.getByRole('note')).toHaveTextContent('ya tiene valoraciones');
        const toggles = screen.getAllByLabelText(/Cuenta para la nota:/);
        expect(toggles).toHaveLength(2);
        toggles.forEach((t) => expect(t).toBeDisabled());
        expect(screen.queryByRole('button', { name: /Quitar criterio/ })).not.toBeInTheDocument();
        fireEvent.change(screen.getByDisplayValue('Sabor'), { target: { value: 'Sabor intenso' } });
        expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'sabor', label: 'Sabor intenso' })]));
    });

    it('permite añadir un criterio nuevo, que sí se puede configurar y quitar', () => {
        let current = criteria;
        const onChange = vi.fn((next: Criterion[]) => { current = next; });
        const { rerender } = render(<CriteriaBuilder criteria={current} onChange={onChange} scoringLockedIds={['sabor', 'precio']} />);
        fireEvent.click(screen.getByRole('button', { name: /Agregar Criterio/ }));
        rerender(<CriteriaBuilder criteria={current} onChange={onChange} scoringLockedIds={['sabor', 'precio']} />);
        expect(screen.getAllByLabelText(/Cuenta para la nota:/)[2]).not.toBeDisabled();
        expect(screen.getAllByRole('button', { name: /Quitar criterio/ })).toHaveLength(1);
    });

    it('sin valoraciones todo es editable', () => {
        render(<CriteriaBuilder criteria={criteria} onChange={vi.fn()} />);
        screen.getAllByLabelText(/Cuenta para la nota:/).forEach((t) => expect(t).not.toBeDisabled());
        expect(screen.getAllByRole('button', { name: /Quitar criterio/ })).toHaveLength(2);
    });

    it('elegir ×3 guarda el peso y marca que cuenta; «No cuenta» lo apaga', () => {
        const onChange = vi.fn();
        render(<CriteriaBuilder criteria={criteria} onChange={onChange} />);
        const [sabor, precio] = screen.getAllByLabelText(/Cuenta para la nota:/) as HTMLSelectElement[];
        expect(sabor.value).toBe('1');
        expect(precio.value).toBe('0');
        fireEvent.change(sabor, { target: { value: '3' } });
        expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'sabor', weight: 3, isPonderable: true })]));
        fireEvent.change(sabor, { target: { value: '0' } });
        expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'sabor', weight: 0, isPonderable: false })]));
    });
});
