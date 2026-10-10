import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ConfirmProvider } from '../../../context/ConfirmContext';
import { BusinessDirtyProvider, useLeaveGuard, useReportDirty } from './BusinessDirtyContext';

const Section = ({ id, label, onDiscard }: { id: string; label: string; onDiscard?: () => void }) => {
    const [dirty, setDirty] = useState(false);
    useReportDirty(id, dirty, label, onDiscard ? () => { onDiscard(); setDirty(false); } : undefined);
    return (
        <button type="button" onClick={() => setDirty((value) => !value)}>
            {`editar ${id}`}
        </button>
    );
};

const Leave = ({ keys }: { keys?: string | string[] }) => {
    const { confirmLeave, dirty, dirtyLabels } = useLeaveGuard();
    const [result, setResult] = useState('—');
    return (
        <>
            <button type="button" onClick={async () => setResult(String(await confirmLeave(keys)))}>salir</button>
            <span data-testid="result">{result}</span>
            <span data-testid="dirty">{String(dirty)}</span>
            <span data-testid="labels">{dirtyLabels.join('|')}</span>
        </>
    );
};

const setup = (ui: React.ReactNode) => render(
    <ConfirmProvider>
        <BusinessDirtyProvider>{ui}</BusinessDirtyProvider>
    </ConfirmProvider>,
);

describe('BusinessDirtyContext', () => {
    it('confirmLeave resolves true without asking when nothing is dirty', async () => {
        setup(<><Section id="pets" label="🐾 Mascotas" /><Leave /></>);
        await act(async () => { fireEvent.click(screen.getByText('salir')); });
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('result').textContent).toBe('true');
    });

    it('asks with the dirty labels; «Seguir editando» keeps, «Salir» discards', async () => {
        const discard = vi.fn();
        setup(<><Section id="pets" label="🐾 Mascotas" onDiscard={discard} /><Section id="hours" label="🕒 Horarios" /><Leave /></>);
        fireEvent.click(screen.getByText('editar pets'));
        fireEvent.click(screen.getByText('editar hours'));
        expect(screen.getByTestId('dirty').textContent).toBe('true');
        expect(screen.getByTestId('labels').textContent).toBe('🐾 Mascotas|🕒 Horarios');

        await act(async () => { fireEvent.click(screen.getByText('salir')); });
        const dialog = screen.getByRole('alertdialog');
        expect(dialog).toHaveTextContent('¿Salir sin guardar?');
        expect(dialog).toHaveTextContent('Perderás los cambios en 🐾 Mascotas y 🕒 Horarios.');
        await act(async () => { fireEvent.click(screen.getByText('Seguir editando')); });
        expect(screen.getByTestId('result').textContent).toBe('false');
        expect(discard).not.toHaveBeenCalled();

        await act(async () => { fireEvent.click(screen.getByText('salir')); });
        await act(async () => { fireEvent.click(screen.getByText('Salir')); });
        expect(screen.getByTestId('result').textContent).toBe('true');
        expect(discard).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('labels').textContent).toBe('🕒 Horarios');
    });

    it('can scope the check to some keys', async () => {
        setup(<><Section id="pets" label="🐾 Mascotas" /><Leave keys="hours" /></>);
        fireEvent.click(screen.getByText('editar pets'));
        await act(async () => { fireEvent.click(screen.getByText('salir')); });
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('result').textContent).toBe('true');
    });

    it('removes an entry when its reporter unmounts', () => {
        const Toggle = () => {
            const [shown, setShown] = useState(true);
            return (
                <>
                    {shown && <Section id="pets" label="🐾 Mascotas" />}
                    <button type="button" onClick={() => setShown(false)}>cerrar</button>
                    <Leave />
                </>
            );
        };
        setup(<Toggle />);
        fireEvent.click(screen.getByText('editar pets'));
        expect(screen.getByTestId('dirty').textContent).toBe('true');
        fireEvent.click(screen.getByText('cerrar'));
        expect(screen.getByTestId('dirty').textContent).toBe('false');
    });

    it('adds one beforeunload listener only while something is dirty', () => {
        const add = vi.spyOn(window, 'addEventListener');
        const remove = vi.spyOn(window, 'removeEventListener');
        try {
            setup(<><Section id="pets" label="🐾 Mascotas" /><Section id="hours" label="🕒 Horarios" /></>);
            const beforeUnloadAdds = () => add.mock.calls.filter(([type]) => type === 'beforeunload').length;
            expect(beforeUnloadAdds()).toBe(0);

            fireEvent.click(screen.getByText('editar pets'));
            fireEvent.click(screen.getByText('editar hours'));
            expect(beforeUnloadAdds()).toBe(1);

            const event = new Event('beforeunload', { cancelable: true });
            window.dispatchEvent(event);
            expect(event.defaultPrevented).toBe(true);

            fireEvent.click(screen.getByText('editar pets'));
            fireEvent.click(screen.getByText('editar hours'));
            expect(remove.mock.calls.filter(([type]) => type === 'beforeunload').length).toBe(1);
        } finally {
            add.mockRestore();
            remove.mockRestore();
        }
    });

    it('outside the provider the hooks are inert', async () => {
        render(<><Section id="pets" label="🐾 Mascotas" /><Leave /></>);
        fireEvent.click(screen.getByText('editar pets'));
        await act(async () => { fireEvent.click(screen.getByText('salir')); });
        expect(screen.getByTestId('result').textContent).toBe('true');
        expect(screen.getByTestId('dirty').textContent).toBe('false');
    });
});
