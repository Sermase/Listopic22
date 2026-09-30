import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ConfirmProvider, useConfirm } from './ConfirmContext';

const Harness = () => {
    const confirm = useConfirm();
    const [result, setResult] = useState('pendiente');
    return (
        <>
            <button type="button" onClick={async () => setResult(String(await confirm({ title: '¿Borrar la foto?', confirmLabel: 'Borrar', destructive: true })))}>
                abrir
            </button>
            <span data-testid="result">{result}</span>
        </>
    );
};

const setup = () => render(<ConfirmProvider><Harness /></ConfirmProvider>);

describe('ConfirmProvider', () => {
    it('resuelve true al confirmar', async () => {
        setup();
        fireEvent.click(screen.getByText('abrir'));
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
        await act(async () => { fireEvent.click(screen.getByText('Borrar')); });
        expect(screen.getByTestId('result').textContent).toBe('true');
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('resuelve false al cancelar o pulsar Escape', async () => {
        setup();
        fireEvent.click(screen.getByText('abrir'));
        await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
        expect(screen.getByTestId('result').textContent).toBe('false');

        fireEvent.click(screen.getByText('abrir'));
        await act(async () => { fireEvent.click(screen.getAllByText('Cancelar')[0]); });
        expect(screen.getByTestId('result').textContent).toBe('false');
    });
});
