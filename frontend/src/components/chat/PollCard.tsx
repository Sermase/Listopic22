import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DishRow } from './DishRow';
import { dishRoute, pollTally, type ChatPoll, type DishRef } from '../../lib/chatExtras';

export const PollCard: React.FC<{
    poll: ChatPoll;
    uid: string;
    isMine: boolean;
    nameOf: (uid: string) => string;
    onVote: (optionId: string | null) => void;
    onInviteWinner: (dish: DishRef) => void;
}> = ({ poll, uid, isMine, nameOf, onVote, onInviteWinner }) => {
    const navigate = useNavigate();
    const { counts, total, winnerId } = pollTally(poll);
    const myVote = poll.votes?.[uid] || null;
    const winner = poll.options.find((o) => o.id === winnerId);

    return (
        <div className="w-[min(18rem,78vw)] rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] p-3 text-gray-100 shadow-lg">
            <p className="text-[10px] font-bold tracking-widest text-[var(--lt-accent)]">🗳️ ENCUESTA</p>
            <p className="text-base font-extrabold mb-2">{poll.question}</p>
            <div className="space-y-1.5">
                {poll.options.map((option) => {
                    const count = counts[option.id] || 0;
                    const pct = total ? Math.round((count / total) * 100) : 0;
                    const voters = Object.entries(poll.votes || {}).filter(([, v]) => v === option.id).map(([who]) => (who === uid ? 'Tú' : nameOf(who)));
                    const route = dishRoute(option);
                    return (
                        <div key={option.id} className={`relative rounded-xl border overflow-hidden ${myVote === option.id ? 'border-[var(--lt-accent-border)]' : 'border-white/10'}`}>
                            <div className="absolute inset-y-0 left-0 bg-[var(--lt-accent-soft)] transition-all" style={{ width: `${pct}%` }} />
                            <button type="button" onClick={() => onVote(myVote === option.id ? null : option.id)} className="relative w-full text-left p-2">
                                <DishRow dish={option} trailing={<span className="text-xs font-bold w-6 text-right shrink-0">{count || ''}</span>} />
                                {voters.length > 0 && <p className="text-[10px] text-gray-400 mt-1 truncate">{voters.join(', ')}</p>}
                            </button>
                            {route && (
                                <button type="button" onClick={() => navigate(route)} className="relative block w-full text-left px-2 pb-1.5 -mt-1 text-[10px] text-gray-400 hover:text-white">Ver plato →</button>
                            )}
                        </div>
                    );
                })}
            </div>
            <p className="text-[10px] text-gray-500 mt-2">{total === 1 ? '1 voto' : `${total} votos`} · toca para votar</p>
            {isMine && winner && (
                <button type="button" onClick={() => onInviteWinner(winner)} className="w-full mt-2 py-2 rounded-xl text-xs font-bold bg-[var(--lt-accent)] text-white">
                    🍽️ Invitar a {winner.placeName}
                </button>
            )}
        </div>
    );
};
