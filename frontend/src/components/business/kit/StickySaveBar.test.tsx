import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StickySaveBar } from './StickySaveBar';

const noop = () => undefined;

describe('StickySaveBar', () => {
    it('is hidden while clean and without error', () => {
        const { container } = render(<StickySaveBar dirty={false} saving={false} onSave={noop} onDiscard={noop} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the unsaved state, discard and an enabled save when dirty', () => {
        const onSave = vi.fn();
        const onDiscard = vi.fn();
        render(<StickySaveBar dirty saving={false} onSave={onSave} onDiscard={onDiscard} legal="Al guardar confirmas que es correcto y actual." />);
        expect(screen.getByRole('region', { name: 'Guardar cambios' })).toBeInTheDocument();
        expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument();
        expect(screen.getByText('Al guardar confirmas que es correcto y actual.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '💾 Guardar' }));
        fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onDiscard).toHaveBeenCalledTimes(1);
    });

    it('disables save with the reason when invalid', () => {
        const onSave = vi.fn();
        render(<StickySaveBar dirty saving={false} invalidReason="Falta la hora de cierre" onSave={onSave} onDiscard={noop} />);
        const save = screen.getByRole('button', { name: '💾 Guardar' });
        expect(save).toBeDisabled();
        expect(screen.getByText('Falta la hora de cierre')).toBeInTheDocument();
        fireEvent.click(save);
        expect(onSave).not.toHaveBeenCalled();
    });

    it('disables both buttons while saving', () => {
        render(<StickySaveBar dirty saving saveLabel="Guardar ficha" onSave={noop} onDiscard={noop} />);
        expect(screen.getByRole('button', { name: /Guardar ficha/ })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Descartar' })).toBeDisabled();
        expect(screen.getByText('Guardando…')).toBeInTheDocument();
    });

    it('stays visible with an error (even when clean) and offers the error action', () => {
        const reload = vi.fn();
        render(
            <StickySaveBar
                dirty={false}
                saving={false}
                error="🔄 Alguien cambió estos datos."
                errorAction={{ label: 'Recargar', onClick: reload }}
                onSave={noop}
                onDiscard={noop}
            />,
        );
        expect(screen.getByRole('alert')).toHaveTextContent('🔄 Alguien cambió estos datos.');
        fireEvent.click(screen.getByRole('button', { name: 'Recargar' }));
        expect(reload).toHaveBeenCalledTimes(1);
        // Sin cambios no se puede guardar ni descartar.
        expect(screen.getByRole('button', { name: '💾 Guardar' })).toBeDisabled();
        expect(screen.queryByRole('button', { name: 'Descartar' })).not.toBeInTheDocument();
    });

    it('in a Modal footer it is always rendered, with save disabled while clean', () => {
        render(<StickySaveBar placement="footer" dirty={false} saving={false} onSave={noop} onDiscard={noop} />);
        expect(screen.getByText('Todo guardado')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '💾 Guardar' })).toBeDisabled();
    });
});
