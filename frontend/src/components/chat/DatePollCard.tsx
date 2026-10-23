import React from 'react';
import { AvatarStack, type Person } from './Avatars';
import { datePollTally, formatLongDay, formatTime, formatWhen, type ChatDatePoll, type DatePollRow, type DateVote } from '../../lib/chatExtras';

const weekday = (ms: number) => new Date(ms).toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '').toUpperCase();

/** Tarjeta del «¿Cuándo quedamos?»: cada uno marca ✅ o 🤔 y la mejor fecha se convierte en quedada. */
export const DatePollCard: React.FC<{
    poll: ChatDatePoll;
    uid: string;
    participants: string[];
    personOf: (uid: string) => Person;
    nameOf: (uid: string) => string;
    onVote: (optionId: string, vote: DateVote | null) => void;
    onConvert: (row: DatePollRow) => void;
    onOpenEvent: (inviteId: string) => void;
}> = ({ poll, uid, participants, personOf, nameOf, onVote, onConvert, onOpenEvent }) => {
    const { rows, bestId, voters } = datePollTally(poll);
    const mine = poll.votes?.[uid] || {};
    const best = rows.find((r) => r.id === bestId);
    const missing = participants.filter((p) => !voters.includes(p));

    return (
        <div className="w-[min(22rem,calc(100vw-5rem))] rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] p-3 text-gray-100 shadow-lg">
            <p className="text-[10px] font-bold tracking-widest text-[var(--lt-accent)]">📅 ¿CUÁNDO QUEDAMOS?</p>
            <p className="text-base font-extrabold leading-tight">
                {poll.place ? <>{poll.place.itemName ? `${poll.place.itemName} en ` : ''}{poll.place.placeName}</> : 'Marca las fechas que te valen'}
            </p>
            <div className="mt-2 space-y-1.5">
                {rows.map((row) => {
                    const vote = mine[row.id];
                    const isBest = row.id === bestId;
                    return (
                        <div key={row.id} className={`flex items-center gap-2.5 rounded-xl border p-2 ${isBest ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)]' : 'border-white/10'}`}>
                            <div className="w-11 shrink-0 text-center leading-none">
                                <p className="text-[9px] font-bold text-gray-400">{weekday(row.when)}</p>
                                <p className="text-lg font-black">{new Date(row.when).getDate()}</p>
                                <p className="text-[10px] text-gray-400">{formatTime(row.when)}</p>
                            </div>
                            <div className="flex-1 min-w-0">
                                {row.yes.length > 0 ? <AvatarStack people={row.yes.map(personOf)} size={22} /> : null}
                                <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                                    {isBest && '👑 '}
                                    {row.yes.length || row.maybe.length
                                        ? [row.yes.length && `✅ ${row.yes.length}`, row.maybe.length && `🤔 ${row.maybe.map(nameOf).join(', ')}`].filter(Boolean).join(' · ')
                                        : 'Nadie aún'}
                                </p>
                            </div>
                            {!poll.inviteId && (['yes', 'maybe'] as const).map((v) => (
                                <button
                                    key={v}
                                    type="button"
                                    onClick={() => onVote(row.id, vote === v ? null : v)}
                                    aria-label={`${v === 'yes' ? 'Me va bien' : 'Quizás'} el ${formatLongDay(row.when)}`}
                                    aria-pressed={vote === v}
                                    className={`w-9 h-9 shrink-0 rounded-xl text-base transition-all ${vote === v ? (v === 'yes' ? 'bg-emerald-500/30 ring-1 ring-emerald-400' : 'bg-amber-500/25 ring-1 ring-amber-400') : 'bg-white/5 opacity-60 hover:opacity-100'}`}
                                >
                                    {v === 'yes' ? '✅' : '🤔'}
                                </button>
                            ))}
                        </div>
                    );
                })}
            </div>
            {poll.inviteId ? (
                <button type="button" onClick={() => onOpenEvent(poll.inviteId!)} className="mt-3 w-full py-2.5 rounded-xl bg-white/10 text-sm font-bold">
                    📅 Ver la quedada
                </button>
            ) : best ? (
                <button type="button" onClick={() => onConvert(best)} className="mt-3 w-full py-2.5 rounded-xl bg-[var(--lt-accent)] text-white text-sm font-bold">
                    Quedar el {formatWhen(best.when)}
                </button>
            ) : null}
            {!poll.inviteId && missing.length > 0 && (
                <p className="mt-2 text-[10px] text-gray-500 truncate">Faltan: {missing.map(nameOf).join(', ')}</p>
            )}
        </div>
    );
};
