import React, { useEffect, useRef, useState } from 'react';
import { ChatSheet } from './ChatSheet';
import { DishRow } from './DishRow';
import { searchDishes } from '../../lib/chatDishSearch';
import { useLocation } from '../../hooks/useLocation';
import type { DishRef } from '../../lib/chatExtras';

const CRAVINGS = ['🍟 Bravas', '🍕 Pizza', '🍔 Hamburguesa', '🥚 Tortilla', '🍰 Tarta de queso', '🌮 Nachos', '🍣 Sushi', '🥘 Paella'];

/** Ruleta del antojo: un plato bien valorado cerca, al azar. */
export const RouletteSheet: React.FC<{
    onClose: () => void;
    onInvite: (dish: DishRef) => void;
    onShare: (dish: DishRef) => Promise<void>;
}> = ({ onClose, onInvite, onShare }) => {
    const { location } = useLocation();
    const [craving, setCraving] = useState('');
    const [pool, setPool] = useState<DishRef[]>([]);
    const [shown, setShown] = useState<DishRef | null>(null);
    const [spinning, setSpinning] = useState(false);
    const [empty, setEmpty] = useState(false);
    const timer = useRef<number | null>(null);

    useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

    const spin = async (query: string) => {
        setCraving(query);
        setSpinning(true);
        setEmpty(false);
        try {
            let dishes = pool.length && query === craving ? pool : [];
            if (!dishes.length) {
                dishes = await searchDishes(query, location, { hitsPerPage: 15, aroundRadius: 5000, minScore: 7 });
                if (!dishes.length) dishes = await searchDishes(query, location, { hitsPerPage: 15, minScore: 6 });
                setPool(dishes);
            }
            if (!dishes.length) {
                setShown(null);
                setEmpty(true);
                setSpinning(false);
                return;
            }
            let ticks = 0;
            if (timer.current) window.clearInterval(timer.current);
            timer.current = window.setInterval(() => {
                ticks += 1;
                setShown(dishes[Math.floor(Math.random() * dishes.length)]);
                if (ticks >= 12 && timer.current) {
                    window.clearInterval(timer.current);
                    timer.current = null;
                    setSpinning(false);
                }
            }, 90);
        } catch (error) {
            console.error('Ruleta: búsqueda fallida', error);
            setSpinning(false);
            setEmpty(true);
        }
    };

    return (
        <ChatSheet title="🎰 Ruleta del antojo" onClose={onClose}>
            <p className="text-xs text-gray-400 mb-3">¿Qué te apetece? Te saco un sitio con buena nota cerca.</p>
            <div className="flex flex-wrap gap-1.5">
                {CRAVINGS.map((c) => {
                    const query = c.split(' ').slice(1).join(' ');
                    return (
                        <button
                            key={c}
                            type="button"
                            disabled={spinning}
                            onClick={() => spin(query)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${craving === query
                                ? 'bg-[var(--lt-accent)] border-transparent text-white'
                                : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}`}
                        >
                            {c}
                        </button>
                    );
                })}
            </div>

            {(shown || empty) && (
                <div className={`mt-4 rounded-2xl border p-3 transition-all ${spinning ? 'border-white/10 bg-white/5 scale-[0.98]' : 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)]'}`}>
                    {shown ? <DishRow dish={shown} /> : <p className="text-sm text-gray-300 text-center py-2">No encuentro ese antojo cerca. Prueba otro 🤷</p>}
                </div>
            )}

            {shown && !spinning && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                    <button type="button" onClick={() => spin(craving)} className="py-2.5 rounded-xl text-xs font-bold bg-white/5 text-gray-200">🎰 Otra</button>
                    <button type="button" onClick={async () => { await onShare(shown); onClose(); }} className="py-2.5 rounded-xl text-xs font-bold bg-white/5 text-gray-200">💬 Al chat</button>
                    <button type="button" onClick={() => onInvite(shown)} className="py-2.5 rounded-xl text-xs font-bold bg-[var(--lt-accent)] text-white">🍽️ Invitar</button>
                </div>
            )}
        </ChatSheet>
    );
};
