import React, { useEffect, useState } from 'react';
import { ChatSheet } from '../chat/ChatSheet';
import { useAuth } from '../../context/AuthContext';
import { useAuthPrompt } from '../../context/AuthPromptContext';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useLocation } from '../../hooks/useLocation';
import { claimSecretBadge, tortillaPoll, type TortillaResults, type TortillaTally } from '../../services/SurpriseService';
import type { TortillaSide } from '../../lib/surprises';

const pct = (t: TortillaTally, side: TortillaSide) => {
    const sum = t.con + t.sin;
    return sum ? Math.round((t[side] / sum) * 100) : 50;
};

const Bar: React.FC<{ label: string; tally: TortillaTally }> = ({ label, tally }) => {
    const con = pct(tally, 'con');
    const sum = tally.con + tally.sin;
    return (
        <div>
            <div className="mb-1 flex justify-between text-xs text-gray-400">
                <span>{label}</span>
                <span>{sum} {sum === 1 ? 'voto' : 'votos'}</span>
            </div>
            <div className="flex h-8 overflow-hidden rounded-xl text-xs font-bold text-white">
                <div className="flex items-center justify-start bg-amber-500/80 px-2 transition-all duration-700" style={{ width: `${Math.max(con, 12)}%` }}>🧅 {con}%</div>
                <div className="flex flex-1 items-center justify-end bg-sky-600/80 px-2">{100 - con}% 🚫</div>
            </div>
        </div>
    );
};

const VERDICT = (t: TortillaTally) => {
    const con = pct(t, 'con');
    if (t.con + t.sin < 3) return 'Aún no hay quórum.';
    if (con >= 60) return 'Aquí se es cebollista. 🧅';
    if (con <= 40) return 'Aquí manda la sincebollista. 🚫';
    return 'Guerra abierta: empate técnico. ⚔️';
};

/** La encuesta eterna: ¿tortilla con o sin cebolla? */
const TortillaPoll: React.FC<{ side?: TortillaSide; onClose: () => void }> = ({ side, onClose }) => {
    const { user } = useAuth();
    const { openAuthPrompt } = useAuthPrompt();
    const { profile } = useUserProfile(user?.uid);
    const { location } = useLocation();
    const [results, setResults] = useState<TortillaResults | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        tortillaPoll({}).then(setResults).catch(() => setError('No se pudo cargar la encuesta.'));
    }, []);

    const vote = async (choice: TortillaSide) => {
        if (!user) { onClose(); openAuthPrompt('votar en la encuesta de la tortilla'); return; }
        setBusy(true);
        setError(null);
        try {
            const res = await tortillaPoll({
                side: choice,
                lat: location?.latitude,
                lng: location?.longitude,
                city: (profile?.location || profile?.residence || '').trim() || undefined,
            });
            setResults(res);
            void claimSecretBadge('JUEZ_TORTILLA');
        } catch {
            setError('No se pudo guardar tu voto. Inténtalo luego.');
        } finally {
            setBusy(false);
        }
    };

    const mine = results?.mine ?? null;
    const options: Array<{ id: TortillaSide; label: string; emoji: string }> = [
        { id: 'con', label: 'Con cebolla', emoji: '🧅' },
        { id: 'sin', label: 'Sin cebolla', emoji: '🚫' },
    ];

    return (
        <ChatSheet title="⚔️ La gran pregunta" onClose={onClose}>
            <p className="mb-4 text-sm text-gray-300">
                Has invocado el debate eterno de España. Antes de seguir buscando: ¿la tortilla, <strong>con o sin cebolla</strong>?
            </p>
            <div className="grid grid-cols-2 gap-2">
                {options.map((o) => (
                    <button
                        key={o.id}
                        type="button"
                        disabled={busy}
                        aria-pressed={mine === o.id}
                        onClick={() => vote(o.id)}
                        className={`rounded-2xl border px-3 py-4 text-sm font-bold transition-all disabled:opacity-60 ${mine === o.id
                            ? 'border-transparent bg-[var(--lt-accent)] text-white'
                            : o.id === side && !mine
                                ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-white'
                                : 'border-white/10 bg-white/5 text-gray-200'}`}
                    >
                        <span className="block text-3xl">{o.emoji}</span>
                        {o.label}
                    </button>
                ))}
            </div>
            {mine && results && (
                <div className="mt-5 space-y-3 pb-2">
                    <Bar label="Toda España (y alrededores)" tally={results.total} />
                    {results.zone && <Bar label={results.zone.label ? `Por ${results.zone.label}` : 'Por tu zona'} tally={results.zone} />}
                    <p className="text-center text-sm font-semibold text-white">{VERDICT(results.zone && results.zone.con + results.zone.sin >= 3 ? results.zone : results.total)}</p>
                    <p className="text-center text-[11px] text-gray-500">Puedes cambiar de bando cuando quieras. De la zona solo guardamos un área de unos 10 km.</p>
                </div>
            )}
            {!mine && <p className="mt-3 pb-2 text-center text-[11px] text-gray-500">Vota para ver cómo va la guerra.</p>}
            {error && <p className="mt-2 text-center text-xs text-[var(--lt-danger)]">{error}</p>}
        </ChatSheet>
    );
};

export default TortillaPoll;
