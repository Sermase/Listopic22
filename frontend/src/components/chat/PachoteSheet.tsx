import React, { useEffect, useState } from 'react';
import { ExternalLink, Send, Unlink } from 'lucide-react';
import { ChatSheet } from './ChatSheet';
import { Avatar, type Person } from './Avatars';
import { PachoteService, type PachoteAccess } from '../../services/PachoteService';
import {
    memberOfUser,
    myRow,
    pachoteJoinUrl,
    pachoteMoney,
    standing,
    toneClass,
    type PachoteGroup,
} from '../../lib/pachote';
import { useToast } from '../../context/ToastContext';

const fmtDay = (d: string) => {
    const t = new Date(`${d}T12:00`);
    return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

/** Las cuentas de un grupo de Pachote enlazado al chat, al día: tu saldo, quién paga a quién y lo último. */
export const PachoteSheet: React.FC<{
    gid: string;
    chatId: string;
    uid: string;
    personOf: (uid: string) => Person;
    onShare?: () => void;
    onClose: () => void;
}> = ({ gid, chatId, uid, personOf, onShare, onClose }) => {
    const { showToast } = useToast();
    const [group, setGroup] = useState<PachoteGroup | null | undefined>(undefined);
    const [access, setAccess] = useState<PachoteAccess | null | undefined>(undefined);
    const [busy, setBusy] = useState(false);

    useEffect(() => PachoteService.watchGroup(gid, setGroup), [gid]);
    useEffect(() => PachoteService.watchAccess(gid, uid, setAccess), [gid, uid]);

    const s = group?.summary;
    const mine = myRow(s, uid, access?.memberId);
    const st = mine ? standing(mine.bal, mine.lab) : null;
    const isAdmin = access?.role === 'admin';
    const max = Math.max(100, ...(s?.people || []).map((p) => Math.abs(p.bal)));
    const faceOf = (luid: string | null | undefined, name: string): Person => (luid ? { ...personOf(luid), name } : { name });

    const open = async () => {
        if (!group) return;
        // Abre la pestaña ya (los navegadores bloquean las que se abren tras esperar).
        const tab = window.open('', '_blank');
        setBusy(true);
        try {
            if (!access) await PachoteService.joinFromChat(gid, uid, memberOfUser(group, uid)?.id || null);
            await PachoteService.open(pachoteJoinUrl(gid, group.inviteToken), tab);
        } catch (error) {
            tab?.close();
            console.error(error);
            showToast({ variant: 'error', message: 'No se pudo entrar en las cuentas.' });
        } finally {
            setBusy(false);
        }
    };

    const unlink = async () => {
        setBusy(true);
        try {
            await PachoteService.unlink(gid, chatId);
            onClose();
        } catch (error) {
            console.error(error);
            showToast({ variant: 'error', message: 'No se pudo desenlazar.' });
            setBusy(false);
        }
    };

    return (
        <ChatSheet title="💸 Cuentas" onClose={onClose}>
            {group === undefined ? (
                <p className="py-10 text-center text-sm text-gray-400">Cargando…</p>
            ) : !group ? (
                <p className="py-10 text-center text-sm text-gray-400">Estas cuentas ya no están enlazadas a este chat.</p>
            ) : (
                <div className="space-y-4 pb-2">
                    <div className="flex items-center gap-3">
                        <span className="w-14 h-14 rounded-2xl bg-[var(--lt-accent-soft)] flex items-center justify-center text-3xl shrink-0">{group.emoji || '💸'}</span>
                        <div className="min-w-0">
                            <p className="text-lg font-extrabold text-white leading-tight truncate">{group.name}</p>
                            <p className="text-xs text-gray-400">
                                {group.members.filter((m) => !m.inactive).length} personas
                                {s ? ` · ${s.n} ${s.n === 1 ? 'gasto' : 'gastos'}` : ''}
                                {group.closed ? ' · 🔒 cerrado' : ''}
                            </p>
                        </div>
                    </div>

                    {!s ? (
                        <p className="rounded-2xl bg-white/5 p-3 text-sm text-gray-300">
                            El resumen aparecerá aquí en cuanto alguien abra las cuentas en Pachote.
                        </p>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-2xl bg-white/5 p-3">
                                    <p className="text-[11px] text-gray-400">Total gastado</p>
                                    <p className="text-xl font-black text-white tabular-nums">{pachoteMoney(s.spent)}</p>
                                </div>
                                <div className={`rounded-2xl border p-3 ${st ? toneClass[st.tone] : 'border-white/10 text-gray-400'}`}>
                                    <p className="text-[11px] opacity-80">{st ? st.label : 'Tu saldo'}</p>
                                    <p className="text-xl font-black tabular-nums">{st ? (st.amount || '👌') : '—'}</p>
                                    {!st && <p className="text-[10px]">No sales en estas cuentas</p>}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-dashed border-white/15 p-3">
                                <p className="text-[10px] font-bold tracking-widest text-[var(--lt-accent)] mb-1.5">PARA CUADRAR</p>
                                {s.tx.length ? (
                                    <ul className="space-y-1">
                                        {s.tx.slice(0, 8).map((t, i) => (
                                            <li key={i} className="flex items-center justify-between gap-2 text-sm">
                                                <span className="truncate text-gray-200">{t.from} <span className="text-gray-500">→</span> {t.to}</span>
                                                <b className="tabular-nums text-white shrink-0">{pachoteMoney(t.amt)}</b>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-emerald-300">✅ Todo cuadrado. Nadie debe nada.</p>
                                )}
                            </div>

                            {s.people.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-bold tracking-widest text-gray-400 mb-2">SALDOS</p>
                                    <ul className="space-y-2">
                                        {[...s.people].sort((a, b) => b.bal - a.bal).map((p) => {
                                            const w = Math.round((Math.abs(p.bal) / max) * 50);
                                            return (
                                                <li key={p.id} className="flex items-center gap-2">
                                                    <Avatar person={faceOf(p.luid, p.name)} size={26} />
                                                    <span className="w-20 shrink-0 truncate text-xs text-gray-200">{p.luid === uid || p.id === access?.memberId ? 'Tú' : p.name}</span>
                                                    <span className="relative flex-1 h-2 rounded-full bg-white/5">
                                                        <span className="absolute top-0 bottom-0 left-1/2 w-px bg-white/20" />
                                                        <span
                                                            className={`absolute top-0 bottom-0 rounded-full ${p.bal >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`}
                                                            style={p.bal >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }}
                                                        />
                                                    </span>
                                                    <span className={`w-20 shrink-0 text-right text-xs font-bold tabular-nums ${p.bal > 0 ? 'text-emerald-300' : p.bal < 0 ? 'text-rose-300' : 'text-gray-400'}`}>
                                                        {p.bal > 0 ? '+' : ''}{pachoteMoney(p.bal)}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            )}

                            {s.last.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-bold tracking-widest text-gray-400 mb-1.5">ÚLTIMOS GASTOS</p>
                                    <ul className="divide-y divide-white/5">
                                        {s.last.map((e, i) => (
                                            <li key={i} className="flex items-center gap-2.5 py-2">
                                                <span className="text-xl w-7 text-center">{e.cat || '🧾'}</span>
                                                <span className="flex-1 min-w-0">
                                                    <span className="block text-sm text-white truncate">{e.desc || 'Gasto'}</span>
                                                    <span className="block text-[11px] text-gray-400 truncate">pagó {e.by}{e.date ? ` · ${fmtDay(e.date)}` : ''}</span>
                                                </span>
                                                <b className="text-sm tabular-nums text-white">{pachoteMoney(e.amt)}</b>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </>
                    )}

                    <div className="flex gap-2 pt-1">
                        <button
                            type="button"
                            onClick={open}
                            disabled={busy || access === undefined}
                            className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-[var(--lt-accent)] py-3 text-sm font-bold text-white disabled:opacity-50"
                        >
                            <ExternalLink className="w-4 h-4" />
                            {access ? 'Abrir en Pachote' : 'Entrar en las cuentas'}
                        </button>
                        {onShare && (
                            <button
                                type="button"
                                onClick={onShare}
                                className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/15"
                            >
                                <Send className="w-4 h-4" /> Al chat
                            </button>
                        )}
                    </div>
                    {!access && access !== undefined && (
                        <p className="text-[11px] text-gray-500 text-center -mt-2">Estás en el chat: entras directo, sin link. Apuntar gastos se hace en Pachote.</p>
                    )}
                    {isAdmin && (
                        <button type="button" onClick={unlink} disabled={busy} className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 py-1">
                            <Unlink className="w-3.5 h-3.5" /> Desenlazar de este chat
                        </button>
                    )}
                </div>
            )}
        </ChatSheet>
    );
};
