import React, { useRef, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { db } from '../firebase';
import { uploadListCover } from '../lib/listCover';
import { useToast } from '../context/ToastContext';

/**
 * Portada de una Lista o Minilista ya creada: se sube o se quita al momento
 * (Storage solo deja al dueño o a un jefe, igual que Editar lista).
 */
export const ListCoverField: React.FC<{ listId: string; initialUrl?: string | null; onChanged?: (url: string | null) => void }> = ({ listId, initialUrl, onChanged }) => {
    const { showToast } = useToast();
    const [url, setUrl] = useState<string | null>(initialUrl || null);
    const [busy, setBusy] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const pick = async (file: File | undefined) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast({ variant: 'error', message: 'Elige una imagen.' });
            return;
        }
        setBusy(true);
        try {
            const next = await uploadListCover(listId, file);
            setUrl(next);
            onChanged?.(next);
            showToast({ variant: 'success', message: 'Portada guardada' });
        } catch (error) {
            console.error('No se pudo subir la portada', error);
            showToast({ variant: 'error', message: 'No se pudo subir la portada.' });
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const remove = async () => {
        setBusy(true);
        try {
            await updateDoc(doc(db, 'lists', listId), { photoUrl: '', mainImageUrl: '', mainImagePath: '' });
            setUrl(null);
            onChanged?.(null);
        } catch (error) {
            console.error('No se pudo quitar la portada', error);
            showToast({ variant: 'error', message: 'No se pudo quitar la portada.' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <span className="block text-sm font-medium text-gray-400 mb-2">Portada</span>
            <div className="flex items-center gap-3">
                <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-xl border border-[var(--lt-border)] bg-[var(--lt-bg)]">
                    {url
                        ? <img src={url} alt="Portada" className="h-full w-full object-cover" />
                        : <div className="flex h-full w-full items-center justify-center text-[var(--lt-text-muted)]"><ImagePlus className="h-6 w-6" /></div>}
                    {busy && <div className="absolute inset-0 flex items-center justify-center bg-black/50"><Loader2 className="h-5 w-5 animate-spin text-white" /></div>}
                </div>
                <div className="flex flex-col gap-1.5">
                    <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="rounded-lg border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] px-3 py-1.5 text-sm font-bold text-[var(--lt-accent)] disabled:opacity-50">
                        {url ? 'Cambiar portada' : 'Subir portada'}
                    </button>
                    {url && (
                        <button type="button" disabled={busy} onClick={remove} className="inline-flex items-center gap-1 text-xs text-[var(--lt-text-muted)] hover:text-red-400 disabled:opacity-50">
                            <Trash2 className="h-3.5 w-3.5" /> Quitar
                        </button>
                    )}
                    <span className="text-[11px] text-[var(--lt-text-muted)]">Se guarda al momento.</span>
                </div>
                <input ref={inputRef} type="file" accept="image/*" className="hidden" aria-label="Elegir portada" onChange={(e) => void pick(e.target.files?.[0])} />
            </div>
        </div>
    );
};
