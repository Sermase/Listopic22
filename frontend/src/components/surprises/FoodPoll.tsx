import React, { useEffect, useState } from 'react';
import { ChatSheet } from '../chat/ChatSheet';
import { useAuth } from '../../context/AuthContext';
import { useAuthPrompt } from '../../context/AuthPromptContext';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useLocation } from '../../hooks/useLocation';
import { claimSecretBadge, foodPoll, type PollResults, type PollTally } from '../../services/SurpriseService';
import { markPollVoted, type PollId, type PollSide } from '../../lib/surprises';

interface PollCopy {
    title: string;
    intro: React.ReactNode;
    con: { label: string; emoji: string; tribe: string };
    sin: { label: string; emoji: string; tribe: string };
}

const POLLS: Record<PollId, PollCopy> = {
    tortilla: {
        title: '⚔️ La gran pregunta',
        intro: <>Has invocado el debate eterno de España. Antes de seguir buscando: ¿la tortilla, <strong>con o sin cebolla</strong>?</>,
        con: { label: 'Con cebolla', emoji: '🧅', tribe: 'Aquí se es cebollista. 🧅' },
        sin: { label: 'Sin cebolla', emoji: '🚫', tribe: 'Aquí manda la sincebollista. 🚫' },
    },
    pizza: {
        title: '🍍 El cisma de la piña',
        intro: <>Italia nos mira. Sin presión: ¿la pizza, <strong>con o sin piña</strong>?</>,
        con: { label: 'Con piña', emoji: '🍍', tribe: 'Territorio hawaiano. 🍍' },
        sin: { label: 'Sin piña', emoji: '🇮🇹', tribe: 'Aquí la piña va de postre. 🇮🇹' },
    },
};

const pct = (t: PollTally, side: PollSide) => {
    const sum = t.con + t.sin;
    return sum ? Math.round((t[side] / sum) * 100) : 50;
};

const Bar: React.FC<{ label: string; tally: PollTally; copy: PollCopy }> = ({ label, tally, copy }) => {
    const con = pct(tally, 'con');
    const sum = tally.con + tally.sin;
    return (
        <div>
            <div className="mb-1 flex justify-between text-xs text-gray-400">
                <span>{label}</span>
                <span>{sum} {sum === 1 ? 'voto' : 'votos'}</span>
            </div>
            <div className="flex h-8 overflow-hidden rounded-xl text-xs font-bold text-white">
                <div className="flex items-center justify-start bg-amber-500/80 px-2 transition-all duration-700" style={{ width: `${Math.max(con, 12)}%` }}>{copy.con.emoji} {con}%</div>
                <div className="flex flex-1 items-center justify-end bg-sky-600/80 px-2">{100 - con}% {copy.sin.emoji}</div>
            </div>
        </div>
    );
};

const verdict = (t: PollTally, copy: PollCopy) => {
    const con = pct(t, 'con');
    if (t.con + t.sin < 3) return 'Aún no hay quórum.';
    if (con >= 60) return copy.con.tribe;
    if (con <= 40) return copy.sin.tribe;
    return 'Guerra abierta: empate técnico. ⚔️';
};

/** Encuestas eternas: tortilla con o sin cebolla, pizza con o sin piña. */
const FoodPoll: React.FC<{ poll: PollId; side?: PollSide; onClose: () => void }> = ({ poll, side, onClose }) => {
    const copy = POLLS[poll];
    const { user } = useAuth();
    const { openAuthPrompt } = useAuthPrompt();
    const { profile } = useUserProfile(user?.uid);
    const { location } = useLocation();
    const [results, setResults] = useState<PollResults | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        foodPoll({ poll })
            .then((res) => { setResults(res); if (res.mine) markPollVoted(poll); })
            .catch(() => setError('No se pudo cargar la encuesta.'));
    }, [poll]);

    const vote = async (choice: PollSide) => {
        if (!user) { onClose(); openAuthPrompt('votar en la encuesta'); return; }
        setBusy(true);
        setError(null);
        try {
            const res = await foodPoll({
                poll,
                side: choice,
                lat: location?.latitude,
                lng: location?.longitude,
                city: (profile?.location || profile?.residence || '').trim() || undefined,
            });
            setResults(res);
            markPollVoted(poll);
            if (poll === 'tortilla') void claimSecretBadge('JUEZ_TORTILLA');
        } catch {
            setError('No se pudo guardar tu voto. Inténtalo luego.');
        } finally {
            setBusy(false);
        }
    };

    const mine = results?.mine ?? null;
    const options: PollSide[] = ['con', 'sin'];

    return (
        <ChatSheet title={copy.title} onClose={onClose}>
            <p className="mb-4 text-sm text-gray-300">{copy.intro}</p>
            <div className="grid grid-cols-2 gap-2">
                {options.map((id) => (
                    <button
                        key={id}
                        type="button"
                        disabled={busy}
                        aria-pressed={mine === id}
                        onClick={() => vote(id)}
                        className={`rounded-2xl border px-3 py-4 text-sm font-bold transition-all disabled:opacity-60 ${mine === id
                            ? 'border-transparent bg-[var(--lt-accent)] text-white'
                            : id === side && !mine
                                ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-white'
                                : 'border-white/10 bg-white/5 text-gray-200'}`}
                    >
                        <span className="block text-3xl">{copy[id].emoji}</span>
                        {copy[id].label}
                    </button>
                ))}
            </div>
            {mine && results && (
                <div className="mt-5 space-y-3 pb-2">
                    <Bar label="Toda España (y alrededores)" tally={results.total} copy={copy} />
                    {results.zone && <Bar label={results.zone.label ? `Por ${results.zone.label}` : 'Por tu zona'} tally={results.zone} copy={copy} />}
                    <p className="text-center text-sm font-semibold text-white">{verdict(results.zone && results.zone.con + results.zone.sin >= 3 ? results.zone : results.total, copy)}</p>
                    <p className="text-center text-[11px] text-gray-500">Puedes cambiar de bando cuando quieras. De la zona solo guardamos un área de unos 10 km.</p>
                </div>
            )}
            {!mine && <p className="mt-3 pb-2 text-center text-[11px] text-gray-500">Vota para ver cómo va la guerra.</p>}
            {error && <p className="mt-2 text-center text-xs text-[var(--lt-danger)]">{error}</p>}
        </ChatSheet>
    );
};

export default FoodPoll;
