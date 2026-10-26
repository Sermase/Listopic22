import React, { useState } from 'react';
import { claimSecretBadge } from '../../services/SurpriseService';
import { fireSurprise } from '../../lib/surprises';
import { triggerHaptic } from '../../utils/haptics';

const DUDS: ReadonlyArray<[string, string]> = [
    ['🪰', 'Una mosca. Qué asco.'],
    ['🧦', '¿Un calcetín? ¿Quién ha sido?'],
    ['💸', 'La cuenta. Mejor tápalo.'],
    ['🐌', 'Un caracol. Era a la gallega.'],
    ['🦴', 'Solo queda el hueso.'],
    ['🧊', 'Un cubito. Del gazpacho, suponemos.'],
];
const PRIZES = ['🍝', '🥘', '🍕', '🍔', '🍰', '🧆'];

/** Plato perdido (404): levanta campanas hasta encontrar el plato. */
export const LostPlate: React.FC = () => {
    const [board] = useState(() => {
        const duds = [...DUDS].sort(() => Math.random() - 0.5).slice(0, 5);
        const prize = PRIZES[Math.floor(Math.random() * PRIZES.length)];
        const cells = duds.map(([emoji, text]) => ({ emoji, text, prize: false }));
        cells.splice(Math.floor(Math.random() * 6), 0, { emoji: prize, text: '¡Aquí estaba el plato perdido!', prize: true });
        return cells;
    });
    const [open, setOpen] = useState<number[]>([]);
    const [message, setMessage] = useState('Este enlace se ha perdido… igual que un plato. ¿Lo buscas?');
    const found = open.some((i) => board[i].prize);

    const lift = (i: number) => {
        if (found || open.includes(i)) return;
        setOpen((prev) => [...prev, i]);
        setMessage(board[i].text);
        void triggerHaptic(board[i].prize ? 'heavy' : 'light');
        if (board[i].prize) {
            fireSurprise({ kind: 'rain', emoji: board[i].emoji });
            void claimSecretBadge('DETECTIVE');
        }
    };

    return (
        <div className="mb-6">
            <p className="mb-3 min-h-[2.5rem] text-sm text-[var(--lt-text-muted)]" aria-live="polite">{message}</p>
            <div className="grid grid-cols-3 gap-3">
                {board.map((cell, i) => {
                    const up = open.includes(i);
                    return (
                        <button
                            key={i}
                            type="button"
                            onClick={() => lift(i)}
                            aria-label={up ? cell.text : 'Levantar campana'}
                            className="relative flex h-20 items-end justify-center rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)]"
                        >
                            <span className={`mb-2 text-3xl transition-opacity duration-300 ${up ? 'opacity-100' : 'opacity-0'}`}>{cell.emoji}</span>
                            <span
                                aria-hidden="true"
                                className="absolute bottom-2 left-1/2 h-10 w-16 rounded-t-full border border-white/30 shadow-lg transition-transform duration-500"
                                style={{
                                    background: 'linear-gradient(160deg, #f1f5f9, #94a3b8 60%, #475569)',
                                    transform: up ? 'translate(-50%, -46px) rotate(-18deg)' : 'translate(-50%, 0)',
                                    opacity: up ? 0.35 : 1,
                                }}
                            >
                                <span className="absolute -top-1.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-slate-300" />
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
