import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LEGAL_VERSION } from '../../config/legal';

const authState = {
    user: { uid: 'ana' } as { uid: string } | null,
    profileLoaded: true,
    acceptedLegalVersion: null as string | null,
};
vi.mock('../../context/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../../firebase', () => ({ auth: {}, db: {} }));
const signOutMock = vi.fn(async () => undefined);
vi.mock('firebase/auth', () => ({ signOut: () => signOutMock() }));
const setDocMock = vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined);
vi.mock('firebase/firestore', () => ({
    doc: (_db: unknown, ...path: string[]) => path.join('/'),
    serverTimestamp: () => 'SERVER_TIME',
    setDoc: (...args: unknown[]) => setDocMock(...args),
}));

import { LegalAcceptanceGate } from './LegalAcceptanceGate';

const renderGate = (path = '/') => render(
    <MemoryRouter initialEntries={[path]}>
        <LegalAcceptanceGate />
    </MemoryRouter>,
);

describe('LegalAcceptanceGate', () => {
    beforeEach(() => {
        authState.user = { uid: `u${Math.random()}` };
        authState.profileLoaded = true;
        authState.acceptedLegalVersion = null;
        setDocMock.mockClear();
        signOutMock.mockClear();
    });

    it('no aparece sin sesión, con la versión vigente aceptada o leyendo los textos legales', () => {
        authState.user = null;
        expect(renderGate().container.textContent).toBe('');
        authState.user = { uid: 'bea' };
        authState.acceptedLegalVersion = LEGAL_VERSION;
        renderGate();
        expect(screen.queryByRole('dialog')).toBeNull();
        authState.acceptedLegalVersion = null;
        renderGate('/terms');
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('pide aceptar a una cuenta nueva y guarda versión, edad y método', async () => {
        renderGate();
        expect(screen.getByText('Antes de seguir')).toBeTruthy();
        const submit = screen.getByTestId('legal-accept-submit') as HTMLButtonElement;
        expect(submit.disabled).toBe(true);

        fireEvent.click(screen.getByTestId('legal-accept-terms'));
        expect(submit.disabled).toBe(true);
        fireEvent.click(screen.getByTestId('legal-accept-age'));
        expect(submit.disabled).toBe(false);

        fireEvent.click(submit);
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(setDocMock).toHaveBeenCalledWith(
            `users/${authState.user!.uid}`,
            { legalAcceptance: { version: LEGAL_VERSION, acceptedAt: 'SERVER_TIME', ageConfirmed: true, method: 'prompt' } },
            { merge: true },
        );
    });

    it('avisa de la actualización si aceptó una versión anterior y deja cerrar sesión', () => {
        authState.acceptedLegalVersion = '2000-01-01';
        renderGate();
        expect(screen.getByText('Hemos actualizado nuestras condiciones')).toBeTruthy();
        fireEvent.click(screen.getByText('No acepto, cerrar sesión'));
        expect(signOutMock).toHaveBeenCalled();
    });
});
