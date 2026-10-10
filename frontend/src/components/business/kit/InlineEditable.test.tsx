import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { InlineEditable, InlinePriceEditor } from './InlineEditable';

const deferred = () => {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

/** Como en la carta: el valor solo cambia si el guardado sale bien. */
const PriceHarness = ({ initial, onCommit }: { initial: string; onCommit: (next: string) => Promise<unknown> }) => {
    const [price, setPrice] = useState(initial);
    return (
        <InlinePriceEditor
            label="Precio de Croquetas"
            value={price}
            onCommit={async (next) => {
                await onCommit(next);
                setPrice(next);
            }}
        />
    );
};

const pill = () => screen.getByRole('button', { name: /Precio de Croquetas/ });
const input = () => screen.getByRole('textbox', { name: 'Precio de Croquetas' });

afterEach(() => {
    vi.useRealTimers();
});

describe('InlineEditable / InlinePriceEditor', () => {
    it('turns into a focused input and commits the normalized value on Enter', async () => {
        const onCommit = vi.fn().mockResolvedValue(undefined);
        render(<PriceHarness initial="" onCommit={onCommit} />);
        expect(pill()).toHaveTextContent('＋ Precio');

        fireEvent.click(pill());
        expect(input()).toHaveFocus();
        fireEvent.change(input(), { target: { value: '6,5' } });
        await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }); });

        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith('6,50 €');
        expect(pill()).toHaveTextContent('6,50 €');
        expect(pill()).toHaveTextContent('✅');
        expect(pill()).toHaveFocus();
    });

    it('commits on blur', async () => {
        const onCommit = vi.fn().mockResolvedValue(undefined);
        render(<PriceHarness initial="5,00 €" onCommit={onCommit} />);
        fireEvent.click(pill());
        fireEvent.change(input(), { target: { value: '7' } });
        await act(async () => { fireEvent.blur(input()); });
        expect(onCommit).toHaveBeenCalledWith('7,00 €');
        expect(pill()).toHaveTextContent('7,00 €');
    });

    it('Escape cancels without committing (and does not reach document listeners)', async () => {
        const onCommit = vi.fn().mockResolvedValue(undefined);
        const onDocumentKey = vi.fn();
        document.addEventListener('keydown', onDocumentKey);
        render(<PriceHarness initial="5,00 €" onCommit={onCommit} />);
        fireEvent.click(pill());
        fireEvent.change(input(), { target: { value: '9' } });
        await act(async () => { fireEvent.keyDown(input(), { key: 'Escape' }); });
        document.removeEventListener('keydown', onDocumentKey);

        expect(onCommit).not.toHaveBeenCalled();
        expect(onDocumentKey).not.toHaveBeenCalled();
        expect(pill()).toHaveTextContent('5,00 €');
    });

    it('skips the commit when the value does not change (also after normalizing)', async () => {
        const onCommit = vi.fn().mockResolvedValue(undefined);
        render(<PriceHarness initial="6,50 €" onCommit={onCommit} />);

        fireEvent.click(pill());
        await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }); });
        expect(onCommit).not.toHaveBeenCalled();

        fireEvent.click(pill());
        fireEvent.change(input(), { target: { value: '6.5' } });
        await act(async () => { fireEvent.blur(input()); });
        expect(onCommit).not.toHaveBeenCalled();
        expect(pill()).toHaveTextContent('6,50 €');
    });

    it('shows a spinner while saving, then reverts with a danger ring and calls onError on failure', async () => {
        const save = deferred();
        const onError = vi.fn();
        const Harness = () => {
            const [value, setValue] = useState('Postres');
            return (
                <InlineEditable
                    label="Nombre de la sección"
                    value={value}
                    onError={onError}
                    onCommit={async (next) => {
                        await save.promise;
                        setValue(next);
                    }}
                />
            );
        };
        render(<Harness />);
        const button = () => screen.getByRole('button', { name: /Nombre de la sección/ });
        fireEvent.click(button());
        const field = screen.getByRole('textbox', { name: 'Nombre de la sección' });
        fireEvent.change(field, { target: { value: 'Dulces' } });
        fireEvent.keyDown(field, { key: 'Enter' });

        expect(button()).toHaveAttribute('aria-busy', 'true');
        expect(button()).toHaveTextContent('Dulces');
        expect(button()).toBeDisabled();

        await act(async () => {
            save.reject(new Error('boom'));
            await save.promise.catch(() => undefined);
        });

        expect(onError).toHaveBeenCalledTimes(1);
        expect(button()).toHaveTextContent('Postres');
        expect(button()).toHaveTextContent('No se pudo guardar');
        expect(button().className).toContain('ring-[var(--lt-danger)]');
    });

    it('keeps free text prices as typed (up to 40 characters)', async () => {
        const onCommit = vi.fn().mockResolvedValue(undefined);
        render(<PriceHarness initial="" onCommit={onCommit} />);
        fireEvent.click(pill());
        expect(input()).toHaveAttribute('maxLength', '40');
        expect(input()).toHaveAttribute('inputMode', 'decimal');
        fireEvent.change(input(), { target: { value: '12 €/kg' } });
        await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }); });
        expect(onCommit).toHaveBeenCalledWith('12 €/kg');
    });

    it('does not flash ✅ under reduced motion', async () => {
        const original = window.matchMedia;
        window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query })) as unknown as typeof window.matchMedia;
        try {
            const onCommit = vi.fn().mockResolvedValue(undefined);
            render(<PriceHarness initial="" onCommit={onCommit} />);
            fireEvent.click(pill());
            fireEvent.change(input(), { target: { value: '3' } });
            await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }); });
            expect(pill()).toHaveTextContent('3,00 €');
            expect(pill()).not.toHaveTextContent('✅');
        } finally {
            window.matchMedia = original;
        }
    });
});
