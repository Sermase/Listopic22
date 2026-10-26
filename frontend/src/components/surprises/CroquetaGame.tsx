import React, { useEffect, useRef, useState } from 'react';
import { ChatSheet } from '../chat/ChatSheet';
import { claimSecretBadge } from '../../services/SurpriseService';
import { triggerHaptic } from '../../utils/haptics';

const RECORD_KEY = 'listopic_croqueta_record';
const BADGE_AT = 20;
const W = 320;
const H = 420;
const PLATE_W = 74;

interface Drop {
    x: number;
    y: number;
    vy: number;
    bad: boolean;
}

interface Frame {
    plate: number;
    drops: Drop[];
    lives: number;
    score: number;
}

const readRecord = (): number => {
    try { return Number(localStorage.getItem(RECORD_KEY)) || 0; } catch { return 0; }
};

const clampPlate = (x: number) => Math.max(PLATE_W / 2, Math.min(W - PLATE_W / 2, x));

function paint(canvas: HTMLCanvasElement | null, f: Frame): void {
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '30px system-ui, "Apple Color Emoji", "Segoe UI Emoji"';
    f.drops.forEach((d) => ctx.fillText(d.bad ? '🌶️' : '🥟', d.x, d.y));
    ctx.font = '44px system-ui, "Apple Color Emoji", "Segoe UI Emoji"';
    ctx.fillText('🍽️', f.plate, H - 30);
    ctx.font = '16px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'left';
    ctx.fillText(`🥟 ${f.score}`, 10, 18);
    ctx.textAlign = 'right';
    ctx.fillText('❤️'.repeat(Math.max(0, f.lives)), W - 10, 18);
}

/**
 * Atrapa la croqueta: mueve el plato con el dedo (o el ratón / flechas) y
 * atrapa las croquetas; las guindillas 🌶️ y las que se caen quitan vidas.
 */
const CroquetaGame: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const plate = useRef(W / 2);
    const keys = useRef(0);
    const [state, setState] = useState<'ready' | 'playing' | 'over'>('ready');
    const [score, setScore] = useState(0);
    const [record, setRecord] = useState(readRecord);
    const [round, setRound] = useState(0);

    useEffect(() => {
        if (state !== 'playing') {
            paint(canvasRef.current, { plate: plate.current, drops: [], lives: 3, score: 0 });
            return;
        }
        const f: Frame = { plate: plate.current, drops: [], lives: 3, score: 0 };
        let last = 0;
        let nextDrop = 0;
        let raf = 0;
        const tick = (time: number) => {
            const dt = last ? Math.min(40, time - last) / 16.7 : 1;
            last = time;
            if (keys.current) plate.current = clampPlate(plate.current + keys.current * 7 * dt);
            f.plate = plate.current;
            const speedUp = 1 + f.score / 25;
            if (time > nextDrop) {
                f.drops.push({ x: 20 + Math.random() * (W - 40), y: -20, vy: (1.8 + Math.random() * 1.2) * speedUp, bad: Math.random() < Math.min(0.32, 0.12 + f.score / 120) });
                nextDrop = time + Math.max(330, 900 - f.score * 22);
            }
            f.drops = f.drops.filter((d) => {
                d.y += d.vy * dt;
                if (d.y > H - 52 && d.y < H - 12 && Math.abs(d.x - f.plate) < PLATE_W / 2 + 8) {
                    if (d.bad) { f.lives -= 1; void triggerHaptic('medium'); } else { f.score += 1; void triggerHaptic('light'); }
                    return false;
                }
                if (d.y > H + 20) {
                    if (!d.bad) f.lives -= 1;
                    return false;
                }
                return true;
            });
            paint(canvasRef.current, f);
            if (f.lives > 0) {
                raf = requestAnimationFrame(tick);
                return;
            }
            setScore(f.score);
            setState('over');
            void triggerHaptic('heavy');
            if (f.score > readRecord()) {
                try { localStorage.setItem(RECORD_KEY, String(f.score)); } catch { /* opcional */ }
                setRecord(f.score);
            }
            if (f.score >= BADGE_AT) void claimSecretBadge('CROQUETERO');
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [state, round]);

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') keys.current = -1;
            if (e.key === 'ArrowRight') keys.current = 1;
        };
        const up = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') keys.current = 0; };
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    }, []);

    const move = (clientX: number) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        plate.current = clampPlate(((clientX - rect.left) / rect.width) * W);
    };

    const start = () => {
        setScore(0);
        setRound((r) => r + 1);
        setState('playing');
    };

    return (
        <ChatSheet title="🥟 Atrapa la croqueta" onClose={onClose}>
            <div className="relative mx-auto mb-3 w-full max-w-[320px] overflow-hidden rounded-2xl border border-white/10" style={{ background: 'radial-gradient(circle at 50% 0%, var(--lt-accent-soft), transparent 70%), var(--lt-bg)' }}>
                <canvas
                    ref={canvasRef}
                    width={W}
                    height={H}
                    className="block w-full touch-none select-none"
                    onPointerMove={(e) => move(e.clientX)}
                    onPointerDown={(e) => move(e.clientX)}
                    aria-label="Juego: mueve el plato para atrapar croquetas"
                />
                {state !== 'playing' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 p-6 text-center">
                        {state === 'over' ? (
                            <>
                                <p className="text-3xl font-black text-white">{score} 🥟</p>
                                <p className="text-sm text-gray-300">{score >= record && score > 0 ? '¡Nuevo récord!' : `Tu récord: ${record}`}</p>
                            </>
                        ) : (
                            <p className="text-sm text-gray-200">Mueve el plato con el dedo. Atrapa las croquetas 🥟, esquiva las guindillas 🌶️ y no dejes caer ninguna.</p>
                        )}
                        <button type="button" onClick={start} className="rounded-xl bg-[var(--lt-accent)] px-6 py-2.5 text-sm font-bold text-white">
                            {state === 'over' ? 'Otra' : 'Jugar'}
                        </button>
                        {record > 0 && state === 'ready' && <p className="text-xs text-gray-400">Récord: {record}</p>}
                    </div>
                )}
            </div>
        </ChatSheet>
    );
};

export default CroquetaGame;
