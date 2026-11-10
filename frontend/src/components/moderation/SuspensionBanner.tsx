import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

/**
 * Aviso de cuenta en revisión (suspensión cautelar). Pequeño y plegable: se
 * puede seguir leyendo; valorar, reaccionar, comentar y chatear no.
 */
export const SuspensionBanner: React.FC = () => {
    const { suspension } = useAuth();
    const [open, setOpen] = useState(false);
    if (!suspension) return null;
    return (
        <div role="status" className="mx-auto mt-2 w-full max-w-3xl px-4">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                className="w-full rounded-2xl border border-[var(--lt-warning)]/40 bg-[var(--lt-warning-soft)] px-4 py-2.5 text-left text-sm font-bold text-[var(--lt-warning)]"
            >
                ⏸️ Tu cuenta está en revisión {open ? '▴' : '▾'}
            </button>
            {open && (
                <div className="mt-1 rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)] px-4 py-3 text-sm text-[var(--lt-text)]">
                    <p>Mientras lo revisamos puedes leer, editar tu perfil, descargar tus datos o borrar tu cuenta, pero no valorar, reaccionar, comentar ni chatear.</p>
                    {suspension.reason && <p className="mt-2 text-[var(--lt-text-muted)]">Motivo: {suspension.reason}</p>}
                    <p className="mt-2 text-[var(--lt-text-muted)]">Si crees que es un error, escríbenos a istaricore@gmail.com.</p>
                </div>
            )}
        </div>
    );
};
