import React, { useEffect, useState } from 'react';
import { Check, Search, Users, X } from 'lucide-react';
import { ChatSheet } from './ChatSheet';
import { algoliaClient, INDEX_NAMES } from '../../services/algoliaClient';
import { Avatar } from './Avatars';

interface UserHit {
    objectID: string;
    username?: string;
    displayName?: string;
    photoUrl?: string;
}

/** Nuevo chat: una persona (chat privado) o varias con nombre de grupo. */
export const NewChatSheet: React.FC<{
    uid: string;
    onClose: () => void;
    onPrivate: (userId: string) => Promise<void>;
    onGroup: (name: string, userIds: string[]) => Promise<void>;
}> = ({ uid, onClose, onPrivate, onGroup }) => {
    const [query, setQuery] = useState('');
    const [hits, setHits] = useState<UserHit[]>([]);
    const [selected, setSelected] = useState<UserHit[]>([]);
    const [groupName, setGroupName] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const q = query.trim();
        const timer = setTimeout(async () => {
            if (q.length < 2) { setHits([]); return; }
            try {
                const response = await algoliaClient.search({ requests: [{ indexName: INDEX_NAMES.users, query: q, hitsPerPage: 8 }] });
                setHits(((response.results[0] as { hits?: UserHit[] }).hits || []).filter((h) => h.objectID !== uid));
            } catch {
                setHits([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [query, uid]);

    const toggle = (hit: UserHit) => setSelected((prev) => (prev.some((p) => p.objectID === hit.objectID)
        ? prev.filter((p) => p.objectID !== hit.objectID)
        : [...prev, hit]));
    const label = (h: UserHit) => h.displayName || h.username || 'Alguien';
    const isGroup = selected.length > 1;

    const create = async () => {
        if (!selected.length) return;
        setBusy(true);
        try {
            if (isGroup) await onGroup(groupName.trim() || selected.map(label).join(', ').slice(0, 40), selected.map((s) => s.objectID));
            else await onPrivate(selected[0].objectID);
            onClose();
        } finally {
            setBusy(false);
        }
    };

    return (
        <ChatSheet title="💬 Nuevo chat" onClose={onClose}>
            <div className="relative mb-2">
                <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Busca por nombre o @usuario"
                    className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white focus:outline-none focus:border-[var(--lt-accent-border)]"
                />
            </div>
            {selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {selected.map((s) => (
                        <button key={s.objectID} type="button" onClick={() => toggle(s)} className="inline-flex items-center gap-1 pl-1 pr-2 py-1 rounded-full bg-[var(--lt-accent-soft)] text-xs text-white">
                            <Avatar person={{ name: label(s), photoUrl: s.photoUrl }} size={20} />{label(s)}<X className="w-3 h-3 opacity-70" />
                        </button>
                    ))}
                </div>
            )}
            <div className="space-y-0.5 max-h-64 overflow-y-auto">
                {query.trim().length < 2 && <p className="text-xs text-gray-500 py-3 text-center">Elige una persona para un chat, o varias para un grupo.</p>}
                {hits.map((hit) => {
                    const isOn = selected.some((s) => s.objectID === hit.objectID);
                    return (
                        <button key={hit.objectID} type="button" onClick={() => toggle(hit)} className={`w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left ${isOn ? 'bg-[var(--lt-accent-soft)]' : 'hover:bg-white/5'}`}>
                            <Avatar person={{ name: label(hit), photoUrl: hit.photoUrl }} size={36} />
                            <span className="flex-1 min-w-0">
                                <span className="block text-sm font-semibold text-white truncate">{label(hit)}</span>
                                {hit.username && <span className="block text-[11px] text-gray-500 truncate">@{hit.username}</span>}
                            </span>
                            {isOn && <Check className="w-4 h-4 text-[var(--lt-accent)]" />}
                        </button>
                    );
                })}
            </div>
            {isGroup && (
                <div className="mt-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Nombre del grupo</p>
                    <input
                        type="text"
                        value={groupName}
                        maxLength={60}
                        onChange={(e) => setGroupName(e.target.value)}
                        placeholder="Los de las bravas 🍟"
                        className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--lt-accent-border)]"
                    />
                </div>
            )}
            <button
                type="button"
                onClick={create}
                disabled={!selected.length || busy}
                className="w-full mt-4 py-3 rounded-xl font-bold text-white bg-[var(--lt-accent)] disabled:opacity-40"
            >
                {busy ? 'Creando…' : isGroup ? `Crear grupo (${selected.length + 1})` : selected.length ? `Chatear con ${label(selected[0])}` : 'Elige a alguien'}
            </button>
        </ChatSheet>
    );
};
