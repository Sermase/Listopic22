import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useAppConfig } from '../../context/AppConfigContext';
import { useTheme } from '../../context/ThemeContext';
import {
    RESPIN_EVENT,
    SURPRISE_EVENT,
    fireSurprise,
    isSurpriseOn,
    prefersReducedMotion,
    type SurpriseEffect,
    type TortillaSide,
} from '../../lib/surprises';
import { useShake } from './useShake';
import { triggerHaptic } from '../../utils/haptics';

const CroquetaGame = lazy(() => import('./CroquetaGame'));
const ShakeRoulette = lazy(() => import('./ShakeRoulette'));
const TortillaPoll = lazy(() => import('./TortillaPoll'));

const STYLES = `
@keyframes lt-egg-fall { from { transform: translateY(-12vh) rotate(0deg); } to { transform: translateY(112vh) rotate(var(--spin)); } }
@keyframes lt-egg-pop { 0% { opacity: 0; transform: translate(-50%, -8px) scale(.9); } 8% { opacity: 1; transform: translate(-50%, 0) scale(1); } 90% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -6px); } }
@keyframes lt-egg-drop { 0% { transform: translate(-50%, -60vh) rotate(-20deg); } 70% { transform: translate(-50%, 0) rotate(8deg); } 100% { transform: translate(-50%, 0) rotate(0); } }
@keyframes lt-egg-shard-l { to { transform: translate(-140%, 40px) rotate(-55deg); opacity: 0; } }
@keyframes lt-egg-shard-r { to { transform: translate(40%, 50px) rotate(60deg); opacity: 0; } }
@keyframes lt-egg-shake { 0%,100% { transform: translate(0,0); } 20% { transform: translate(-6px, 2px); } 40% { transform: translate(5px,-3px); } 60% { transform: translate(-4px, 3px); } 80% { transform: translate(3px,-2px); } }
@keyframes lt-egg-heat { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 0; } }
.lt-egg-shaking #root { animation: lt-egg-shake 450ms linear 2; }
`;

interface Running {
    key: number;
    effect: SurpriseEffect;
}

const Bubble: React.FC<{ emoji: string; text: string }> = ({ emoji, text }) => (
    <div
        role="status"
        className="fixed left-1/2 z-[12000] flex w-max max-w-[min(92vw,26rem)] items-center gap-2 rounded-2xl border border-[var(--lt-accent-border)] bg-[var(--lt-card-strong)] px-4 py-3 text-sm font-semibold text-[var(--lt-text)] shadow-2xl"
        style={{ top: 'calc(env(safe-area-inset-top) + 4.5rem)', animation: 'lt-egg-pop 6.5s ease-out forwards' }}
    >
        <span className="text-2xl" aria-hidden="true">{emoji}</span>
        <span>{text}</span>
    </div>
);

const Rain: React.FC<{ emoji: string; title?: string; still: boolean }> = ({ emoji, title, still }) => {
    const [drops] = useState(() => Array.from({ length: 40 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 2.2,
        duration: 2.6 + Math.random() * 1.4,
        size: 22 + Math.random() * 20,
        spin: `${Math.round(Math.random() * 540 - 270)}deg`,
        key: i,
    })));
    return (
        <>
            {!still && (
                <div className="pointer-events-none fixed inset-0 z-[11999] overflow-hidden" aria-hidden="true">
                    {drops.map((d) => (
                        <span
                            key={d.key}
                            className="absolute top-0"
                            style={{
                                left: `${d.left}%`,
                                fontSize: d.size,
                                animation: `lt-egg-fall ${d.duration}s ${d.delay}s ease-in forwards`,
                                transform: 'translateY(-12vh)',
                                ['--spin' as string]: d.spin,
                            }}
                        >
                            {emoji}
                        </span>
                    ))}
                </div>
            )}
            {title && <Bubble emoji={emoji} text={title} />}
        </>
    );
};

const Broken: React.FC<{ title?: string; still: boolean }> = ({ title, still }) => (
    <>
        {!still && (
            <div className="pointer-events-none fixed inset-0 z-[11999]" aria-hidden="true">
                <div className="absolute left-1/2 top-[38%] text-7xl" style={{ animation: 'lt-egg-drop 1100ms cubic-bezier(.5,0,.75,0) forwards' }}>
                    <span className="relative inline-block">
                        <span className="inline-block" style={{ clipPath: 'inset(0 50% 0 0)', animation: 'lt-egg-shard-l 1600ms 1120ms ease-out forwards' }}>🍽️</span>
                        <span className="absolute left-0 top-0 inline-block" style={{ clipPath: 'inset(0 0 0 50%)', animation: 'lt-egg-shard-r 1600ms 1120ms ease-out forwards' }}>🍽️</span>
                    </span>
                </div>
            </div>
        )}
        <Bubble emoji="💥" text={title || '¡Puaj!'} />
    </>
);

const Heat: React.FC = () => (
    <div
        className="pointer-events-none fixed inset-0 z-[11999]"
        aria-hidden="true"
        style={{ boxShadow: 'inset 0 0 120px 30px rgba(239, 68, 68, 0.55)', animation: 'lt-egg-heat 1800ms ease-out forwards' }}
    />
);

/**
 * Pinta las sorpresas que pide cualquier pantalla (fireSurprise) y escucha el
 * «agitar» en Inicio. Va una vez en App, por encima de todo.
 */
export const SurpriseHost: React.FC = () => {
    const config = useAppConfig();
    const { pathname } = useLocation();
    const { theme } = useTheme();
    const [running, setRunning] = useState<Running[]>([]);
    const [sheet, setSheet] = useState<{ kind: 'croqueta' | 'roulette' | 'tortilla'; side?: TortillaSide } | null>(null);
    const counter = useRef(0);
    const configRef = useRef(config);
    useEffect(() => { configRef.current = config; }, [config]);

    const remove = useCallback((key: number) => setRunning((list) => list.filter((r) => r.key !== key)), []);

    useEffect(() => {
        const onSurprise = (event: Event) => {
            const effect = (event as CustomEvent<SurpriseEffect>).detail;
            if (!effect) return;
            if (effect.kind === 'croqueta' && effect.gated && !isSurpriseOn(configRef.current, 'croqueta')) return;
            if (effect.kind === 'croqueta' || effect.kind === 'roulette' || effect.kind === 'tortilla') {
                setSheet({ kind: effect.kind, side: effect.kind === 'tortilla' ? effect.side : undefined });
                return;
            }
            const key = ++counter.current;
            setRunning((list) => [...list.slice(-2), { key, effect }]);
            if (effect.kind === 'shake') {
                void triggerHaptic('heavy');
                if (!prefersReducedMotion()) {
                    document.documentElement.classList.add('lt-egg-shaking');
                    window.setTimeout(() => document.documentElement.classList.remove('lt-egg-shaking'), 950);
                }
            }
            window.setTimeout(() => remove(key), effect.kind === 'shake' ? 1900 : 6700);
        };
        window.addEventListener(SURPRISE_EVENT, onSurprise);
        return () => window.removeEventListener(SURPRISE_EVENT, onSurprise);
    }, [remove]);

    // Agitar el móvil en Inicio: la ruleta del destino. Con la ruleta abierta, otra vuelta.
    const rouletteOpen = sheet?.kind === 'roulette';
    const shakeOn = ((pathname === '/' && !sheet) || rouletteOpen) && isSurpriseOn(config, 'shakeRoulette');
    useShake(shakeOn, () => {
        if (rouletteOpen) window.dispatchEvent(new Event(RESPIN_EVENT));
        else fireSurprise({ kind: 'roulette' });
    });

    // La abuela saluda una vez al día.
    useEffect(() => {
        if (theme !== 'abuela' || pathname !== '/') return;
        const today = new Date().toDateString();
        try {
            if (localStorage.getItem('listopic_abuela_hola') === today) return;
        } catch { return; }
        const t = window.setTimeout(() => {
            try { localStorage.setItem('listopic_abuela_hola', today); } catch { /* opcional */ }
            fireSurprise({ kind: 'bubble', emoji: '👵', text: '¿Has comido? Estás en los huesos.' });
        }, 1200);
        return () => window.clearTimeout(t);
    }, [theme, pathname]);

    const still = prefersReducedMotion();
    const close = () => setSheet(null);

    return (
        <>
            {createPortal(
                <>
                    <style>{STYLES}</style>
                    {running.map(({ key, effect }) => {
                        switch (effect.kind) {
                            case 'rain': return <Rain key={key} emoji={effect.emoji} title={effect.title} still={still} />;
                            case 'broken': return <Broken key={key} title={effect.title} still={still} />;
                            case 'shake': return <Heat key={key} />;
                            case 'bubble': return <Bubble key={key} emoji={effect.emoji} text={effect.text} />;
                            default: return null;
                        }
                    })}
                </>,
                document.body,
            )}
            <Suspense fallback={null}>
                {sheet?.kind === 'croqueta' && <CroquetaGame onClose={close} />}
                {sheet?.kind === 'roulette' && <ShakeRoulette onClose={close} />}
                {sheet?.kind === 'tortilla' && <TortillaPoll side={sheet.side} onClose={close} />}
            </Suspense>
        </>
    );
};
