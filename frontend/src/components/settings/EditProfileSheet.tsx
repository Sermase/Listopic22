import React, { useRef, useState } from 'react';
import { updateProfile, type User } from 'firebase/auth';
import { Camera } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { UserProfileEntity } from '../../hooks/useUserProfile';
import { isUserProfileServiceError, updateUserProfilePreferences } from '../../services/UserProfileService';
import { isUsernameValid } from '../../utils/username';
import { profilePhotoProblem, setGooglePhoto, uploadProfilePhoto } from '../../lib/profilePhoto';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

const inputClass = 'w-full rounded-xl border border-[var(--lt-border)] bg-[var(--lt-glass)] px-3 py-2.5 text-sm text-[var(--lt-text)] outline-none focus:border-[var(--lt-accent-border)] disabled:cursor-not-allowed disabled:opacity-60';

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
    <label className="block">
        <span className="mb-1 block text-xs font-bold text-[var(--lt-text-muted)]">{label}</span>
        {children}
        {hint && <span className="mt-1 block text-[11px] leading-snug text-[var(--lt-text-muted)]">{hint}</span>}
    </label>
);

type Props = { isOpen: boolean; onClose: () => void; profile: UserProfileEntity | null };

/** Editar perfil: foto, nombre, usuario, dónde vives y bio. Es un formulario: solo se cierra con «atrás» o la ✕. */
export const EditProfileSheet: React.FC<Props> = ({ isOpen, onClose, profile }) => {
    const { user } = useAuth();
    // Se monta al abrir: el formulario parte del perfil de ese momento y no se pisa mientras escribes.
    return isOpen && user && profile ? <EditProfileForm user={user} profile={profile} onClose={onClose} /> : null;
};

const EditProfileForm: React.FC<{ user: User; profile: UserProfileEntity; onClose: () => void }> = ({ user, profile, onClose }) => {
    const { showToast } = useToast();
    const fileRef = useRef<HTMLInputElement>(null);
    const [form, setForm] = useState(() => ({
        username: (profile.username || '').trim(),
        displayName: (profile.displayName || profile.username || '').trim(),
        name: (profile.name || '').trim(),
        surnames: (profile.surnames || '').trim(),
        location: (profile.location || profile.residence || '').trim(),
        bio: (profile.bio || '').trim(),
    }));
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const busy = saving || uploading;
    const usernameLocked = isUsernameValid((profile.username || '').trim());
    const photo = profile.photoUrl || user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(form.displayName || 'User')}&background=374151&color=fff`;
    const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
    const close = () => { if (!busy) onClose(); };

    const pickPhoto = async (file: File | undefined) => {
        if (!file) return;
        const problem = profilePhotoProblem(file);
        if (problem) {
            showToast({ variant: 'error', message: problem });
            return;
        }
        setUploading(true);
        try {
            await uploadProfilePhoto(user, file);
            showToast({ variant: 'success', message: 'Foto cambiada.' });
        } catch (e) {
            showToast({ variant: 'error', message: (e as Error).message });
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const pickGoogle = async () => {
        setUploading(true);
        try {
            await setGooglePhoto(user);
        } catch {
            showToast({ variant: 'error', message: 'No se pudo poner la foto de Google.' });
        } finally {
            setUploading(false);
        }
    };

    const save = async () => {
        const username = form.username.trim();
        if (!usernameLocked && !isUsernameValid(username)) {
            setError('Elige un usuario válido: sin espacios, de 18 caracteres como mucho y que no tenga nadie.');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const result = await updateUserProfilePreferences(
                { uid: user.uid, email: user.email, displayName: user.displayName, photoUrl: user.photoURL },
                {
                    username: usernameLocked ? undefined : username,
                    displayName: form.displayName,
                    name: form.name,
                    surnames: form.surnames,
                    location: form.location,
                    bio: form.bio,
                },
            );
            if (user.displayName !== result.displayName) {
                await updateProfile(user, { displayName: result.displayName }).catch(() => undefined);
            }
            showToast({ variant: 'success', message: 'Perfil guardado.' });
            onClose();
        } catch (e) {
            setError(isUserProfileServiceError(e) ? e.message : 'No se pudo guardar. Inténtalo de nuevo.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            isOpen
            onClose={close}
            swipe={false}
            title="Editar perfil"
            footer={(
                <div className="space-y-2">
                    {error && <p role="alert" className="text-xs text-[var(--lt-danger)]">{error}</p>}
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={close} disabled={busy}>Cancelar</Button>
                        <Button onClick={save} loading={saving} disabled={uploading}>Guardar</Button>
                    </div>
                </div>
            )}
        >
            <div className="space-y-4">
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={busy}
                        aria-label="Cambiar foto"
                        className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--lt-border)] bg-[var(--lt-accent-soft)] text-2xl font-bold text-[var(--lt-text)]"
                    >
                        {(form.displayName || '?').charAt(0).toUpperCase()}
                        <img key={photo} src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        <span className="absolute inset-x-0 bottom-0 flex justify-center bg-black/55 py-1 text-white">
                            {uploading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-b-transparent" /> : <Camera className="h-4 w-4" />}
                        </span>
                    </button>
                    <div className="min-w-0 space-y-1.5">
                        <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>Cambiar foto</Button>
                        {user.photoURL && profile.photoUrl !== user.photoURL && (
                            <button type="button" onClick={pickGoogle} disabled={busy} className="block text-xs font-semibold text-[var(--lt-accent)]">Usar la de Google</button>
                        )}
                        <p className="text-[11px] text-[var(--lt-text-muted)]">Imagen de hasta 5 MB.</p>
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
                </div>

                <Field label="Nombre visible" hint="Es el que ve la gente en tus reseñas.">
                    <input className={inputClass} value={form.displayName} onChange={set('displayName')} />
                </Field>
                <Field
                    label="Usuario"
                    hint={usernameLocked ? 'El usuario no se puede cambiar.' : 'Sin espacios y de 18 caracteres como mucho. Una vez guardado, ya no se cambia.'}
                >
                    <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--lt-text-muted)]">@</span>
                        <input className={`${inputClass} pl-7`} value={form.username} onChange={set('username')} disabled={usernameLocked} maxLength={18} autoCapitalize="none" autoCorrect="off" />
                    </div>
                </Field>
                <Field label="Sobre ti">
                    <textarea className={`${inputClass} resize-y`} rows={3} value={form.bio} onChange={set('bio')} placeholder="Opcional" />
                </Field>
                <Field label="Dónde vives">
                    <input className={inputClass} value={form.location} onChange={set('location')} placeholder="Opcional" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Nombre">
                        <input className={inputClass} value={form.name} onChange={set('name')} placeholder="Opcional" />
                    </Field>
                    <Field label="Apellidos">
                        <input className={inputClass} value={form.surnames} onChange={set('surnames')} placeholder="Opcional" />
                    </Field>
                </div>
            </div>
        </Modal>
    );
};
