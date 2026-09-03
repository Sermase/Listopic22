import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { LogIn } from 'lucide-react';
import { useAuth } from './AuthContext';
import { Modal } from '../components/ui/Modal';
import { AuthForm } from '../components/AuthForm';

interface AuthPromptContextValue {
    openAuthPrompt: (action?: string) => void;
    closeAuthPrompt: () => void;
}

const AuthPromptContext = createContext<AuthPromptContextValue>({
    openAuthPrompt: () => undefined,
    closeAuthPrompt: () => undefined,
});

// eslint-disable-next-line react-refresh/only-export-components
export const useAuthPrompt = () => useContext(AuthPromptContext);

export const AuthPromptProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [action, setAction] = useState('interactuar con este contenido');

    const openAuthPrompt = useCallback((requestedAction?: string) => {
        if (user) return;
        setAction(requestedAction?.trim() || 'interactuar con este contenido');
        setIsOpen(true);
    }, [user]);

    const closeAuthPrompt = useCallback(() => setIsOpen(false), []);

    const value = useMemo(() => ({ openAuthPrompt, closeAuthPrompt }), [closeAuthPrompt, openAuthPrompt]);

    return (
        <AuthPromptContext.Provider value={value}>
            {children}
            <Modal
                isOpen={isOpen}
                onClose={closeAuthPrompt}
                title={(
                    <span className="flex items-center gap-2">
                        <LogIn className="h-4 w-4 text-[var(--lt-accent)]" />
                        Accede a Listopic
                    </span>
                )}
                className="sm:max-w-md"
                bodyClassName="p-6 sm:p-8"
            >
                <p className="mb-5 text-center text-sm text-[var(--lt-text-muted)]">
                    Puedes seguir explorando sin cuenta. Para {action}, inicia sesión o regístrate.
                </p>
                <AuthForm onAuthenticated={closeAuthPrompt} />
            </Modal>
        </AuthPromptContext.Provider>
    );
};
