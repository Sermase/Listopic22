import React, { useEffect, useMemo, useState } from 'react';
import { Check, Search, Users } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { ChatService, type Chat } from '../../services/ChatService';
import { algoliaClient, INDEX_NAMES } from '../../services/algoliaClient';

export type ChatTarget = { chatId: string; label: string } | { userId: string; label: string };

interface UserHit {
    objectID: string;
    username?: string;
    displayName?: string;
    photoUrl?: string;
}

/** Elegir un chat tuyo o buscar a alguien (si no hay chat, se crea al enviar). */
export const ChatPicker: React.FC<{ uid: string; value: ChatTarget | null; onChange: (target: ChatTarget) => void }> = ({ uid, value, onChange }) => {
    const [chats, setChats] = useState<Chat[]>([]);
    const [names, setNames] = useState<Record<string, { name: string; photoUrl?: string }>>({});
    const [query, setQuery] = useState('');
    const [hits, setHits] = useState<UserHit[]>([]);

    useEffect(() => ChatService.subscribeToChats(uid, setChats), [uid]);

    useEffect(() => {
        const missing = chats
            .filter((c) => c.type === 'private')
            .map((c) => c.participants.find((p) => p !== uid))
            .filter((id): id is string => Boolean(id) && !names[id as string]);
        if (!missing.length) return;
        let cancelled = false;
        Promise.all(missing.map(async (id) => {
            const snap = await getDoc(doc(db, 'publicProfiles', id)).catch(() => null);
            const data = snap?.exists() ? snap.data() : {};
            return [id, { name: String(data.displayName || data.username || 'Alguien'), photoUrl: data.photoUrl as string | undefined }] as const;
        })).then((entries) => {
            if (!cancelled) setNames((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
        });
        return () => { cancelled = true; };
    }, [chats, uid, names]);

    useEffect(() => {
        const q = query.trim();
        const timer = setTimeout(async () => {
            if (q.length < 2) { setHits([]); return; }
            try {
                const response = await algoliaClient.search({ requests: [{ indexName: INDEX_NAMES.users, query: q, hitsPerPage: 5 }] });
                setHits(((response.results[0] as { hits?: UserHit[] }).hits || []).filter((h) => h.objectID !== uid));
            } catch {
                setHits([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [query, uid]);

    const rows = useMemo(() => chats.slice(0, 8).map((chat) => {
        const other = chat.type === 'private' ? chat.participants.find((p) => p !== uid) : undefined;
        return {
            chat,
            label: chat.type === 'group' ? (chat.groupName || 'Grupo') : (other ? names[other]?.name || '…' : 'Chat'),
            photoUrl: chat.type === 'group' ? chat.groupPhoto : (other ? names[other]?.photoUrl : undefined),
        };
    }), [chats, names, uid]);

    const isSelected = (target: { chatId?: string; userId?: string }) =>
        !!value && (('chatId' in value && value.chatId === target.chatId) || ('userId' in value && value.userId === target.userId));

    const rowClass = (selected: boolean) =>
        `w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${selected ? 'bg-[var(--lt-accent-soft)] ring-1 ring-[var(--lt-accent-border)]' : 'hover:bg-white/5'}`;

    const avatar = (label: string, photoUrl?: string, group = false) => (
        <span className="w-9 h-9 rounded-full overflow-hidden bg-[var(--lt-accent-soft)] flex items-center justify-center text-sm font-bold text-[var(--lt-accent)] shrink-0">
            {photoUrl ? <img src={photoUrl} alt="" className="w-full h-full object-cover" /> : group ? <Users className="w-4 h-4" /> : label.charAt(0).toUpperCase()}
        </span>
    );

    return (
        <div>
            <div className="relative mb-2">
                <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar a alguien…"
                    className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white focus:outline-none focus:border-[var(--lt-accent-border)]"
                />
            </div>
            <div className="space-y-0.5 max-h-56 overflow-y-auto">
                {hits.map((hit) => {
                    const label = hit.displayName || hit.username || 'Alguien';
                    const existing = chats.find((c) => c.type === 'private' && c.participants.includes(hit.objectID));
                    const target: ChatTarget = existing ? { chatId: existing.id, label } : { userId: hit.objectID, label };
                    const selected = isSelected(existing ? { chatId: existing.id } : { userId: hit.objectID });
                    return (
                        <button key={hit.objectID} type="button" onClick={() => onChange(target)} className={rowClass(selected)}>
                            {avatar(label, hit.photoUrl)}
                            <span className="flex-1 min-w-0">
                                <span className="block text-sm font-semibold text-white truncate">{label}</span>
                                {hit.username && <span className="block text-[11px] text-gray-500 truncate">@{hit.username}</span>}
                            </span>
                            {selected && <Check className="w-4 h-4 text-[var(--lt-accent)]" />}
                        </button>
                    );
                })}
                {!hits.length && rows.map(({ chat, label, photoUrl }) => {
                    const selected = isSelected({ chatId: chat.id });
                    return (
                        <button key={chat.id} type="button" onClick={() => onChange({ chatId: chat.id, label })} className={rowClass(selected)}>
                            {avatar(label, photoUrl, chat.type === 'group')}
                            <span className="flex-1 min-w-0">
                                <span className="block text-sm font-semibold text-white truncate">{label}</span>
                                <span className="block text-[11px] text-gray-500">{chat.type === 'group' ? `Grupo · ${chat.participants.length}` : 'Chat'}</span>
                            </span>
                            {selected && <Check className="w-4 h-4 text-[var(--lt-accent)]" />}
                        </button>
                    );
                })}
                {!hits.length && !rows.length && <p className="text-xs text-gray-500 py-3 text-center">Aún no tienes chats: busca a alguien.</p>}
            </div>
        </div>
    );
};
