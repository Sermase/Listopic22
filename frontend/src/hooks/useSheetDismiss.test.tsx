import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { hasOpenSheet, useBackToClose, useSheetDismiss } from './useSheetDismiss';

const Sheet: React.FC<{ name: string; onClose: () => void }> = ({ name, onClose }) => {
    useBackToClose(true, onClose);
    return <div role="dialog" aria-label={name} />;
};

const Page: React.FC = () => {
    const [first, setFirst] = useState(false);
    const [second, setSecond] = useState(false);
    return (
        <>
            <button type="button" onClick={() => setFirst(true)}>abrir 1</button>
            <button type="button" onClick={() => setSecond(true)}>abrir 2</button>
            <button type="button" onClick={() => setFirst(false)}>cerrar 1</button>
            {first && <Sheet name="uno" onClose={() => setFirst(false)} />}
            {second && <Sheet name="dos" onClose={() => setSecond(false)} />}
        </>
    );
};

/** Simula «atrás»: el navegador cambia el estado y avisa con popstate. */
const goBack = (state: unknown) => act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state })); });

afterEach(() => vi.restoreAllMocks());

describe('useBackToClose', () => {
    it('al abrir deja una entrada en el historial y «atrás» cierra la de arriba', () => {
        const push = vi.spyOn(window.history, 'pushState');
        render(<Page />);
        fireEvent.click(screen.getByText('abrir 1'));
        fireEvent.click(screen.getByText('abrir 2'));
        expect(push).toHaveBeenCalledTimes(2);
        const firstState = push.mock.calls[0][0];
        expect(hasOpenSheet()).toBe(true);

        goBack(firstState);
        expect(screen.queryByRole('dialog', { name: 'dos' })).toBeNull();
        expect(screen.getByRole('dialog', { name: 'uno' })).toBeTruthy();

        goBack(null);
        expect(screen.queryByRole('dialog', { name: 'uno' })).toBeNull();
        expect(hasOpenSheet()).toBe(false);
    });

    it('al cerrarla con su botón quita su entrada del historial', () => {
        vi.useFakeTimers();
        const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
        render(<Page />);
        fireEvent.click(screen.getByText('abrir 1'));
        fireEvent.click(screen.getByText('cerrar 1'));
        act(() => { vi.runAllTimers(); });
        expect(back).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});

describe('useSwipeToClose', () => {
    const Swipe: React.FC<{ onClose: () => void }> = ({ onClose }) => {
        const ref = useSheetDismiss(onClose);
        return <div ref={ref} data-testid="panel" style={{ height: 400 }} />;
    };
    const touch = (el: Element, type: string, x: number, y: number) =>
        fireEvent(el, Object.assign(new Event(type, { bubbles: true, cancelable: true }), { touches: [{ clientX: x, clientY: y }] }));

    it('deslizar hacia abajo cierra; hacia un lado no', () => {
        vi.useFakeTimers();
        const onClose = vi.fn();
        render(<Swipe onClose={onClose} />);
        const panel = screen.getByTestId('panel');

        touch(panel, 'touchstart', 100, 100);
        touch(panel, 'touchmove', 160, 112);
        touch(panel, 'touchend', 160, 112);
        act(() => { vi.advanceTimersByTime(600); });
        expect(onClose).not.toHaveBeenCalled();

        touch(panel, 'touchstart', 100, 100);
        touch(panel, 'touchmove', 102, 120);
        touch(panel, 'touchmove', 102, 300);
        expect(panel.style.transform).toBe('translateY(180px)');
        touch(panel, 'touchend', 102, 300);
        act(() => { vi.advanceTimersByTime(200); });
        expect(onClose).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});
