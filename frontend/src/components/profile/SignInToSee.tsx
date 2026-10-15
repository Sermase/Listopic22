import React from 'react';
import { Lock } from 'lucide-react';

interface SignInToSeeProps {
    /** Qué se desbloquea al entrar, p. ej. "sus seguidores". */
    what: string;
    onSignIn: () => void;
}

/** Aviso para visitantes sin sesión donde el contenido necesita una cuenta. */
export const SignInToSee: React.FC<SignInToSeeProps> = ({ what, onSignIn }) => (
    <div className="py-12 px-4 text-center border border-dashed border-white/10 rounded-xl bg-white/5">
        <Lock className="w-5 h-5 mx-auto mb-2 text-gray-500" />
        <p className="text-gray-300 text-sm font-semibold mb-1">Inicia sesión para ver {what}</p>
        <p className="text-xs text-gray-500 mb-4">Es gratis y no muerde.</p>
        <button
            type="button"
            onClick={onSignIn}
            className="px-4 py-2 rounded-lg bg-[var(--lt-accent)] lt-on-accent text-sm font-bold hover:opacity-90 transition-opacity"
        >
            Iniciar sesión
        </button>
    </div>
);
