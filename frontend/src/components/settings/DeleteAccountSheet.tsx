import React, { useState } from 'react';
import { type User } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { functions, signOutAndForget } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { MyDataRequest } from '../profile/MyDataRequest';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

const REASONS = [
    'Ya no uso la app',
    'Quiero empezar desde cero',
    'Problemas de privacidad',
    'La app no cubre mis necesidades',
    'Otras razones',
    'Prefiero no decirlo',
];

const choiceClass = (on: boolean, danger = false) => `rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${on
    ? danger ? 'border-[var(--lt-danger)] bg-[var(--lt-danger-soft)] text-[var(--lt-text)]' : 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-[var(--lt-text)]'
    : 'border-[var(--lt-border)] bg-[var(--lt-glass)] text-[var(--lt-text-muted)]'}`;

const YesNo: React.FC<{ value: boolean | null; onChange: (v: boolean) => void }> = ({ value, onChange }) => (
    <div className="flex gap-2">
        <button type="button" aria-pressed={value === true} onClick={() => onChange(true)} className={`flex-1 ${choiceClass(value === true)}`}>Sí, mantenerlas</button>
        <button type="button" aria-pressed={value === false} onClick={() => onChange(false)} className={`flex-1 ${choiceClass(value === false, true)}`}>No, borrarlas</button>
    </div>
);

/** Eliminar la cuenta: motivo, qué se queda, escribir ELIMINAR. Solo se cierra con «atrás» o la ✕. */
export const DeleteAccountSheet: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { user } = useAuth();
    // Se monta al abrir: cada vez empieza de cero.
    return isOpen && user ? <DeleteAccountForm user={user} onClose={onClose} /> : null;
};

const DeleteAccountForm: React.FC<{ user: User; onClose: () => void }> = ({ user, onClose }) => {
    const [reason, setReason] = useState('');
    const [keepReviews, setKeepReviews] = useState<boolean | null>(null);
    const [keepSublists, setKeepSublists] = useState<boolean | null>(null);
    const [confirm, setConfirm] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const ready = !!reason && keepReviews !== null && keepSublists !== null && confirm.trim().toUpperCase() === 'ELIMINAR';

    const remove = async () => {
        setDeleting(true);
        setError(null);
        try {
            await httpsCallable(functions, 'deleteOwnAccount')({ keepReviews: keepReviews === true, keepSublists: keepSublists === true });
            await signOutAndForget('/');
        } catch (err) {
            const code = (err as { code?: string })?.code;
            setError(code === 'functions/unauthenticated' || code === 'auth/requires-recent-login'
                ? 'Por seguridad, cierra sesión, vuelve a entrar y repite el proceso.'
                : 'No se pudo eliminar la cuenta. Inténtalo de nuevo o escríbenos a istaricore@gmail.com.');
            setDeleting(false);
        }
    };

    return (
        <Modal
            isOpen
            onClose={() => { if (!deleting) onClose(); }}
            swipe={false}
            title="Eliminar cuenta"
            footer={(
                <div className="space-y-2">
                    {error && <p role="alert" className="text-xs text-[var(--lt-danger)]">{error}</p>}
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={onClose} disabled={deleting}>Cancelar</Button>
                        <Button variant="danger" onClick={remove} loading={deleting} disabled={!ready}>Eliminar mi cuenta</Button>
                    </div>
                </div>
            )}
        >
            <div className="space-y-5">
                <p className="rounded-2xl border border-[var(--lt-danger)]/30 bg-[var(--lt-danger-soft)] p-3 text-sm leading-relaxed text-[var(--lt-text)]">
                    <b>No se puede deshacer.</b> Se borran siempre tu perfil, tu foto, tus seguidores y seguidos, tus avisos, tus chats privados y tus mensajes en grupos.
                </p>

                <details className="rounded-xl">
                    <summary className="cursor-pointer text-sm font-semibold text-[var(--lt-accent)]">Antes, pide una copia de tus datos</summary>
                    <div className="mt-2"><MyDataRequest uid={user.uid} email={user.email} /></div>
                </details>

                <div>
                    <p className="mb-2 text-xs font-bold text-[var(--lt-text-muted)]">¿Por qué te vas?</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {REASONS.map((r) => (
                            <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)} className={`text-left ${choiceClass(reason === r)}`}>{r}</button>
                        ))}
                    </div>
                </div>

                <div>
                    <p className="text-xs font-bold text-[var(--lt-text-muted)]">¿Dejar tus aportaciones sin tu nombre?</p>
                    <p className="mb-2 mt-0.5 text-xs text-[var(--lt-text-muted)]">Reseñas, fotos, comentarios y mensajes en foros. Si dices que sí, se quedan firmadas como «Usuario eliminado».</p>
                    <YesNo value={keepReviews} onChange={setKeepReviews} />
                </div>

                <div>
                    <p className="text-xs font-bold text-[var(--lt-text-muted)]">¿Dejar tus minilistas?</p>
                    <p className="mb-2 mt-0.5 text-xs text-[var(--lt-text-muted)]">Si dices que sí, se quedan en la app sin autor.</p>
                    <YesNo value={keepSublists} onChange={setKeepSublists} />
                </div>

                <label className="block">
                    <span className="mb-1 block text-xs font-bold text-[var(--lt-text-muted)]">Escribe ELIMINAR para confirmar</span>
                    <input
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="ELIMINAR"
                        autoCapitalize="characters"
                        className="w-full rounded-xl border border-[var(--lt-danger)]/40 bg-[var(--lt-glass)] px-3 py-2.5 text-sm text-[var(--lt-text)] outline-none focus:border-[var(--lt-danger)]"
                    />
                </label>
            </div>
        </Modal>
    );
};
