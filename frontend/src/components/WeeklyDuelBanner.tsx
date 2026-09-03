import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, getCountFromServer, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { Swords, UtensilsCrossed } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { mapDuel, type Duel, type DuelSide } from '../types/duel';
import { useAuthPrompt } from '../context/AuthPromptContext';

// El Duelo de la semana: dos platos rivales, la comunidad vota. Se activa
// desde Developer (flag showWeeklyDuel) y los duelos se gestionan en
// Developer → Propuestas Pro.
export const WeeklyDuelBanner: React.FC = () => {
    const { user } = useAuth();
    const { openAuthPrompt } = useAuthPrompt();
    const [duel, setDuel] = useState<Duel | null>(null);
    const [votes, setVotes] = useState<{ a: number; b: number }>({ a: 0, b: 0 });
    const [myVote, setMyVote] = useState<'a' | 'b' | null>(null);
    const [voting, setVoting] = useState(false);

    const loadCounts = async (duelId: string) => {
        const [aSnap, bSnap] = await Promise.all([
            getCountFromServer(query(collection(db, 'duels', duelId, 'votes'), where('side', '==', 'a'))),
            getCountFromServer(query(collection(db, 'duels', duelId, 'votes'), where('side', '==', 'b'))),
        ]);
        setVotes({ a: aSnap.data().count, b: bSnap.data().count });
    };

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const snap = await getDocs(query(collection(db, 'duels'), where('status', '==', 'active'), limit(1)));
                if (cancelled || snap.empty) return;
                const active = mapDuel(snap.docs[0].id, snap.docs[0].data() as Record<string, unknown>);
                setDuel(active);
                await loadCounts(active.id);
                if (user) {
                    const voteSnap = await getDoc(doc(db, 'duels', active.id, 'votes', user.uid)).catch(() => null);
                    if (!cancelled && voteSnap?.exists()) {
                        const side = (voteSnap.data() as { side?: string }).side;
                        if (side === 'a' || side === 'b') setMyVote(side);
                    }
                }
            } catch (error) {
                console.warn('WeeklyDuelBanner: load failed', error);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [user]);

    if (!duel) return null;

    const total = votes.a + votes.b;
    const percentA = total > 0 ? Math.round((votes.a / total) * 100) : 50;
    const percentB = total > 0 ? 100 - percentA : 50;

    const vote = async (side: 'a' | 'b') => {
        if (!user) {
            openAuthPrompt('votar en el duelo semanal');
            return;
        }
        if (voting || myVote === side) return;
        setVoting(true);
        try {
            await setDoc(doc(db, 'duels', duel.id, 'votes', user.uid), {
                side,
                updatedAt: serverTimestamp(),
            });
            setMyVote(side);
            await loadCounts(duel.id);
        } catch (error) {
            console.warn('WeeklyDuelBanner: vote failed', error);
        } finally {
            setVoting(false);
        }
    };

    const SideCard: React.FC<{ side: DuelSide; id: 'a' | 'b'; percent: number; count: number }> = ({ side, id, percent, count }) => {
        const chosen = myVote === id;
        const card = (
            <div className={`relative flex-1 overflow-hidden rounded-2xl border transition-all ${
                chosen ? 'border-amber-400/60 shadow-lg shadow-amber-500/20 scale-[1.01]' : 'border-white/10'
            } bg-[var(--lt-card-strong)]`}>
                <div className="h-20 w-full overflow-hidden bg-white/5 sm:h-24">
                    {side.imageUrl ? (
                        <img src={side.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                        <div className="grid h-full w-full place-items-center text-amber-300">
                            <UtensilsCrossed className="h-7 w-7" />
                        </div>
                    )}
                </div>
                <div className="p-3">
                    <p className="truncate text-sm font-black text-[var(--lt-text)]">{side.label}</p>
                    {side.sublabel && <p className="truncate text-[11px] text-[var(--lt-text-muted)]">{side.sublabel}</p>}
                    {myVote && (
                        <div className="mt-2">
                            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-amber-400 transition-all duration-700" style={{ width: `${percent}%` }} />
                            </div>
                            <p className="mt-1 text-[11px] font-bold text-[var(--lt-text-muted)]">{percent}% · {count} voto{count === 1 ? '' : 's'}</p>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={(event) => { event.preventDefault(); void vote(id); }}
                        disabled={voting}
                        className={`mt-2 w-full rounded-xl px-3 py-1.5 text-xs font-black transition-colors ${
                            chosen
                                ? 'bg-amber-500 text-black'
                                : 'border border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
                        } disabled:opacity-50`}
                    >
                        {chosen ? 'Tu voto ✓' : user ? 'Votar' : 'Inicia sesión para votar'}
                    </button>
                </div>
            </div>
        );
        return side.link ? <Link to={side.link} className="flex-1 min-w-0">{card}</Link> : <div className="flex-1 min-w-0">{card}</div>;
    };

    return (
        <div className="mx-auto mt-6 w-full max-w-4xl">
            <div className="rounded-3xl border border-amber-500/20 bg-gradient-to-r from-amber-500/[0.06] via-transparent to-amber-500/[0.06] p-4">
                <div className="mb-3 flex items-center justify-center gap-2">
                    <Swords className="h-4 w-4 text-amber-400" />
                    <h3 className="text-sm font-black uppercase tracking-[0.16em] text-[var(--lt-text)]">
                        {duel.title || 'El Duelo de la semana'}
                    </h3>
                </div>
                <div className="flex items-stretch gap-3">
                    <SideCard side={duel.sideA} id="a" percent={percentA} count={votes.a} />
                    <div className="grid shrink-0 place-items-center">
                        <span className="rounded-full border border-amber-500/30 bg-[var(--lt-bg)] px-2.5 py-1 text-xs font-black text-amber-300">VS</span>
                    </div>
                    <SideCard side={duel.sideB} id="b" percent={percentB} count={votes.b} />
                </div>
            </div>
        </div>
    );
};
