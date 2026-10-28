import React, { useState } from 'react';
import { Link2, Copy, Share2 } from 'lucide-react';
import { ChatService, type Chat } from '../../services/ChatService';
import { buildPublicRouteUrl } from '../../utils/publicUrl';
import { useToast } from '../../context/ToastContext';
import { haptic } from '../../utils/haptics';

/** Enlace para unirse al grupo: quien lo abre entra (tras iniciar sesión) sin que nadie le añada. */
export const JoinLinkBox: React.FC<{ chat: Chat; byName: string }> = ({ chat, byName }) => {
    const { showToast } = useToast();
    const [busy, setBusy] = useState(false);
    const code = chat.joinCode;
    const url = code ? buildPublicRouteUrl(`/g/${code}`) : '';

    const run = async (action: () => Promise<unknown>) => {
        setBusy(true);
        try {
            await action();
        } catch (error) {
            console.error(error);
            showToast({ variant: 'error', message: 'No se pudo cambiar el enlace.' });
        } finally {
            setBusy(false);
        }
    };
    const approval = Boolean(chat.joinApproval);
    const create = () => run(() => ChatService.createJoinLink(chat.id, chat.groupName || 'Grupo', byName, code, approval));
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            haptic('light');
            showToast({ variant: 'success', message: 'Enlace copiado' });
        } catch {
            showToast({ variant: 'info', message: url });
        }
    };
    const share = async () => {
        if (!navigator.share) return copy();
        try {
            await navigator.share({ title: chat.groupName || 'Listopic', text: `¡Únete a «${chat.groupName || 'nuestro grupo'}» en Listopic! 🍽️`, url });
        } catch {
            /* cancelado */
        }
    };

    if (!code) {
        return (
            <button
                type="button"
                onClick={create}
                disabled={busy}
                className="w-full mb-5 flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-left disabled:opacity-50"
            >
                <Link2 className="w-5 h-5 text-[var(--lt-accent)] shrink-0" />
                <span className="flex-1">
                    <span className="block text-sm font-bold text-white">Invitar con un enlace</span>
                    <span className="block text-xs text-gray-400">Quien lo abra entra directo al grupo</span>
                </span>
            </button>
        );
    }

    return (
        <div className="mb-5 rounded-xl bg-white/5 border border-white/10 p-3">
            <p className="flex items-center gap-2 text-sm font-bold text-white"><Link2 className="w-4 h-4 text-[var(--lt-accent)]" /> Enlace de invitación</p>
            <p className="mt-1 text-xs text-gray-400 truncate" data-testid="join-link">{url}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={share} className="py-2 rounded-xl bg-[var(--lt-accent)] text-white text-sm font-bold flex items-center justify-center gap-1.5">
                    <Share2 className="w-4 h-4" /> Compartir
                </button>
                <button type="button" onClick={copy} className="py-2 rounded-xl bg-white/10 text-white text-sm font-bold flex items-center justify-center gap-1.5">
                    <Copy className="w-4 h-4" /> Copiar
                </button>
            </div>
            <label className="mt-3 flex items-center gap-3 cursor-pointer">
                <span className="flex-1 min-w-0">
                    <span className="block text-sm text-white">Aprobar antes de entrar</span>
                    <span className="block text-[11px] text-gray-500">{approval ? 'Cualquiera del grupo acepta las solicitudes' : 'Quien tenga el enlace entra directo'}</span>
                </span>
                <input
                    type="checkbox"
                    role="switch"
                    checked={approval}
                    disabled={busy}
                    onChange={(e) => run(() => ChatService.setJoinApproval(chat.id, code, e.target.checked))}
                    className="peer sr-only"
                />
                <span aria-hidden className="relative w-10 h-6 rounded-full bg-white/15 transition-colors peer-checked:bg-[var(--lt-accent)] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
            </label>
            <div className="mt-2 flex justify-center gap-4 text-[11px] text-gray-500">
                <button type="button" onClick={create} disabled={busy} className="hover:text-gray-300 underline-offset-2 hover:underline">Cambiar enlace</button>
                <button type="button" onClick={() => run(() => ChatService.disableJoinLink(chat.id, code))} disabled={busy} className="hover:text-gray-300 underline-offset-2 hover:underline">Desactivar</button>
            </div>
        </div>
    );
};
