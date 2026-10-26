import React, { useEffect, useState } from 'react';
import { Link2, Plus } from 'lucide-react';
import { PachoteService } from '../../services/PachoteService';
import { myRow, pachoteMoney, standing, toneClass, type PachoteGroup } from '../../lib/pachote';
import type { Chat } from '../../services/ChatService';
import { useToast } from '../../context/ToastContext';

type Person = { uid: string; name: string };

const EMOJIS = ['💸', '🏖️', '🏠', '🍻', '🍽️', '🚗', '⛰️', '🎉'];

const Row: React.FC<{ gid: string; fallback: string; uid: string; onOpen: () => void }> = ({ gid, fallback, uid, onOpen }) => {
    const [group, setGroup] = useState<PachoteGroup | null | undefined>(undefined);
    useEffect(() => PachoteService.watchGroup(gid, setGroup), [gid]);
    const s = group?.summary;
    const mine = myRow(s, uid);
    const st = mine ? standing(mine.bal, mine.lab) : null;
    return (
        <button type="button" onClick={onOpen} className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-left">
            <span className="text-2xl w-8 text-center">{group?.emoji || '💸'}</span>
            <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-white truncate">{group?.name || fallback}</span>
                <span className="block text-[11px] text-gray-400">
                    {group === null ? 'Sin acceso' : s ? `${pachoteMoney(s.spent)} · ${s.n} ${s.n === 1 ? 'gasto' : 'gastos'}` : 'Sin gastos aún'}
                </span>
            </span>
            {st && (
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${toneClass[st.tone]}`}>
                    {st.tone === 'zero' ? 'En paz' : `${st.tone === 'pos' ? '+' : '−'}${st.amount}`}
                </span>
            )}
        </button>
    );
};

/** «💸 Cuentas» del chat: los grupos de Pachote enlazados, crear unos con la gente del chat o enlazar uno tuyo. */
export const PachotePanel: React.FC<{
    chat: Chat;
    chatName: string;
    me: Person;
    people: Person[];
    onOpen: (gid: string) => void;
}> = ({ chat, chatName, me, people, onOpen }) => {
    const { showToast } = useToast();
    const [mode, setMode] = useState<'idle' | 'create' | 'link'>('idle');
    const [name, setName] = useState('');
    const [emoji, setEmoji] = useState(EMOJIS[0]);
    const [busy, setBusy] = useState(false);
    const [mine, setMine] = useState<PachoteGroup[] | null>(null);
    const links = Object.entries(chat.pachote || {});

    useEffect(() => {
        if (mode !== 'link') return;
        let alive = true;
        setMine(null);
        PachoteService.linkableGroups(me.uid).then((g) => { if (alive) setMine(g); }).catch(() => alive && setMine([]));
        return () => { alive = false; };
    }, [mode, me.uid]);

    const run = async (action: () => Promise<unknown>, error: string) => {
        setBusy(true);
        try {
            await action();
            setMode('idle');
        } catch (e) {
            console.error(e);
            showToast({ variant: 'error', message: error });
        } finally {
            setBusy(false);
        }
    };

    const create = () => run(async () => {
        const gid = await PachoteService.createForChat({ chatId: chat.id, name: name.trim() || chatName, emoji, me, people });
        onOpen(gid);
    }, 'No se pudieron crear las cuentas.');

    return (
        <div className="mb-5">
            <h4 className="text-xs font-bold uppercase text-gray-400 mb-2 tracking-wider">💸 Cuentas con Pachote</h4>
            {links.length === 0 && (
                <p className="mb-2 text-xs text-[var(--lt-text-muted)]">Pachote apunta los gastos del grupo y dice quién debe a quién, a pachas.</p>
            )}
            {links.length > 0 && (
                <div className="space-y-1.5 mb-2">
                    {links.map(([gid, l]) => <Row key={gid} gid={gid} fallback={l.name} uid={me.uid} onOpen={() => onOpen(gid)} />)}
                </div>
            )}

            {mode === 'create' ? (
                <div className="rounded-xl border border-white/10 p-3 space-y-2.5">
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={chatName}
                        maxLength={60}
                        aria-label="Nombre de las cuentas"
                        className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--lt-accent-border)]"
                    />
                    <div className="flex gap-1" role="radiogroup" aria-label="Icono">
                        {EMOJIS.map((e) => (
                            <button
                                key={e}
                                type="button"
                                role="radio"
                                aria-checked={emoji === e}
                                onClick={() => setEmoji(e)}
                                className={`flex-1 aspect-square rounded-lg text-lg ${emoji === e ? 'bg-[var(--lt-accent-soft)] ring-1 ring-[var(--lt-accent-border)]' : 'bg-white/5'}`}
                            >
                                {e}
                            </button>
                        ))}
                    </div>
                    <p className="text-[11px] text-gray-400">Con {people.length} {people.length === 1 ? 'persona' : 'personas'}: {people.map((p) => (p.uid === me.uid ? 'tú' : p.name.split(' ')[0])).join(', ')}. Luego se apuntan los gastos en Pachote.</p>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setMode('idle')} className="flex-1 rounded-xl bg-white/5 py-2 text-sm text-gray-300">Cancelar</button>
                        <button type="button" onClick={create} disabled={busy} className="flex-1 rounded-xl bg-[var(--lt-accent)] py-2 text-sm font-bold text-white disabled:opacity-50">Crear cuentas</button>
                    </div>
                </div>
            ) : mode === 'link' ? (
                <div className="rounded-xl border border-white/10 p-3 space-y-1.5">
                    {mine === null ? (
                        <p className="text-xs text-gray-400 text-center py-2">Buscando tus grupos…</p>
                    ) : mine.length === 0 ? (
                        <p className="text-xs text-gray-400">No tienes grupos de Pachote libres. Si ya lo usas, entra allí con tu cuenta de Listopic (👤 → Tu cuenta) y aparecerán aquí.</p>
                    ) : mine.map((g) => (
                        <button
                            key={g.id}
                            type="button"
                            disabled={busy}
                            onClick={() => run(() => PachoteService.linkToChat(g, chat.id, me, people), 'No se pudo enlazar.')}
                            className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 text-left disabled:opacity-50"
                        >
                            <span className="text-xl">{g.emoji || '💸'}</span>
                            <span className="flex-1 text-sm text-white truncate">{g.name}</span>
                            <span className="text-xs font-bold text-[var(--lt-accent)]">Enlazar</span>
                        </button>
                    ))}
                    <button type="button" onClick={() => setMode('idle')} className="w-full text-xs text-gray-500 pt-1">Cancelar</button>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => { setName(''); setMode('create'); }} className="flex items-center justify-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 py-2.5 text-xs font-bold text-white">
                        <Plus className="w-4 h-4 text-[var(--lt-accent)]" /> Crear cuentas
                    </button>
                    <button type="button" onClick={() => setMode('link')} className="flex items-center justify-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 py-2.5 text-xs font-bold text-white">
                        <Link2 className="w-4 h-4 text-[var(--lt-accent)]" /> Enlazar unas mías
                    </button>
                </div>
            )}
        </div>
    );
};
