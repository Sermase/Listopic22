import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChatSheet } from '../chat/ChatSheet';
import { DishRow } from '../chat/DishRow';
import { searchDishes } from '../../lib/chatDishSearch';
import { dishRoute, type DishRef } from '../../lib/chatExtras';
import { useLocation } from '../../hooks/useLocation';
import { triggerHaptic } from '../../utils/haptics';
import { RESPIN_EVENT } from '../../lib/surprises';

/** Media de más de 8 (Algolia no tiene «mayor que» con decimales exactos: 8,01). */
const MIN_SCORE = 8.01;

/** Al agitar el móvil en Inicio: un plato de nota alta cerca, al azar. */
const ShakeRoulette: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { location } = useLocation();
    const navigate = useNavigate();
    const [pool, setPool] = useState<DishRef[] | null>(null);
    const [shown, setShown] = useState<DishRef | null>(null);
    const [spinning, setSpinning] = useState(true);
    const timer = useRef<number | null>(null);

    const spin = (dishes: DishRef[]) => {
        if (!dishes.length) { setSpinning(false); return; }
        setSpinning(true);
        let ticks = 0;
        if (timer.current) window.clearInterval(timer.current);
        timer.current = window.setInterval(() => {
            ticks += 1;
            setShown(dishes[Math.floor(Math.random() * dishes.length)]);
            if (ticks >= 14 && timer.current) {
                window.clearInterval(timer.current);
                timer.current = null;
                setSpinning(false);
                void triggerHaptic('medium');
            }
        }, 85);
    };

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                let dishes = await searchDishes('', location, { hitsPerPage: 30, aroundRadius: 3000, minScore: MIN_SCORE });
                if (dishes.length < 3) dishes = await searchDishes('', location, { hitsPerPage: 30, aroundRadius: 10000, minScore: MIN_SCORE });
                if (!alive) return;
                setPool(dishes);
                spin(dishes);
            } catch (error) {
                console.error('Ruleta del destino', error);
                if (alive) { setPool([]); setSpinning(false); }
            }
        })();
        return () => { alive = false; if (timer.current) window.clearInterval(timer.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Agitar otra vez: otra vuelta con los mismos platos.
    const respin = useRef<() => void>(() => undefined);
    useEffect(() => { respin.current = () => { if (pool?.length && !spinning) spin(pool); }; });
    useEffect(() => {
        const onRespin = () => respin.current();
        window.addEventListener(RESPIN_EVENT, onRespin);
        return () => window.removeEventListener(RESPIN_EVENT, onRespin);
    }, []);

    const route = shown && !spinning ? dishRoute(shown) : null;

    return (
        <ChatSheet title="📳 El destino ha hablado" onClose={onClose}>
            <p className="mb-3 text-xs text-gray-400">Has agitado el móvil: un plato cerca con media de más de 8. Agita otra vez para otra vuelta.</p>
            {pool && pool.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-300">Por aquí no hay nada de más de 8… todavía. 🤷</p>
            ) : (
                <div className={`rounded-2xl border p-3 transition-all ${spinning ? 'scale-[0.98] border-white/10 bg-white/5' : 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)]'}`}>
                    {shown ? <DishRow dish={shown} /> : <p className="py-2 text-center text-sm text-gray-400">🎰 Girando…</p>}
                </div>
            )}
            {pool && pool.length > 0 && !spinning && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => spin(pool)} className="rounded-xl bg-white/5 py-2.5 text-xs font-bold text-gray-200">🎰 Otra</button>
                    <button
                        type="button"
                        disabled={!route}
                        onClick={() => { if (route) { onClose(); navigate(route); } }}
                        className="rounded-xl bg-[var(--lt-accent)] py-2.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                        🍽️ Ver plato
                    </button>
                </div>
            )}
        </ChatSheet>
    );
};

export default ShakeRoulette;
