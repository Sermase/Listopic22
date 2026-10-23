import React, { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { ChatService, type JoinRequest } from '../../services/ChatService';
import { Avatar } from './Avatars';

/** Solicitudes para entrar al grupo (enlace con aprobación): las acepta cualquiera del grupo. */
export const JoinRequests: React.FC<{ chatId: string; me: { uid: string; name: string } }> = ({ chatId, me }) => {
    const [requests, setRequests] = useState<JoinRequest[]>([]);
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => ChatService.listenJoinRequests(chatId, setRequests), [chatId]);

    if (requests.length === 0) return null;

    const answer = async (request: JoinRequest, accept: boolean) => {
        setBusy(request.uid);
        try {
            await ChatService.answerJoinRequest(chatId, request, accept, me);
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="px-3 pt-2 space-y-1.5">
            {requests.map((request) => (
                <div key={request.uid} className="flex items-center gap-3 rounded-2xl bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] px-3 py-2">
                    <Avatar person={{ name: request.name }} size={28} />
                    <p className="flex-1 min-w-0 text-sm text-white truncate">🙋 <b>{request.name}</b> quiere entrar</p>
                    <button
                        type="button"
                        onClick={() => answer(request, true)}
                        disabled={busy === request.uid}
                        className="px-3 py-1.5 rounded-xl bg-[var(--lt-accent)] text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                    >
                        <Check className="w-3.5 h-3.5" /> Aceptar
                    </button>
                    <button
                        type="button"
                        onClick={() => answer(request, false)}
                        disabled={busy === request.uid}
                        aria-label={`Rechazar a ${request.name}`}
                        className="p-1.5 rounded-xl bg-white/10 text-gray-300 disabled:opacity-50"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ))}
        </div>
    );
};
