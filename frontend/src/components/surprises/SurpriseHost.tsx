import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { useAppConfig } from '../../context/AppConfigContext';
import { useTheme } from '../../context/ThemeContext';
import {
    ABUELA_EVERY_MS,
    RESPIN_EVENT,
    abuelaLine,
    SURPRISE_EVENT,
    fireSurprise,
    isSurpriseOn,
    prefersReducedMotion,
    type SurpriseEffect,
    type PollId,
    type PollSide,
} from '../../lib/surprises';
import { useShake } from './useShake';
import { haptic, type HapticKind } from '../../utils/haptics';
import { activeCharacter, pickGreeting } from '../../lib/themeCharacters';
import { ThemeGrace } from './ThemeGrace';
import { GRACE_MS, GRACE_STYLES } from './graceMeta';
import { ThemeAmbience } from './ThemeAmbience';
import { abuelaMemoryLine } from '../../lib/themeAmbience';
import { pickCharacterTip, readCharacterTips, tipText } from '../../lib/characterTips';
import { useAuth } from '../../context/AuthContext';

/** Cada cuánto el saludo del día es un chivatazo útil (si Inicio tiene alguno preparado). */
const TIP_CHANCE = 0.5;

// Cómo vibra cada sorpresa al salir (las burbujas, como digan; si no, suave).
const EFFECT_HAPTIC: Partial<Record<SurpriseEffect['kind'], HapticKind>> = {
    rain: 'success',
    broken: 'heavy',
    shake: 'heavy',
    croqueta: 'medium',
    roulette: 'heavy',
    poll: 'medium',
};

const CroquetaGame = lazy(() => import('./CroquetaGame'));
const ShakeRoulette = lazy(() => import('./ShakeRoulette'));
const FoodPoll = lazy(() => import('./FoodPoll'));

const STYLES = `
@keyframes lt-egg-fall { from { transform: translateY(-12vh) rotate(0deg); } to { transform: translateY(112vh) rotate(var(--spin)); } }
@keyframes lt-egg-pop { 0% { opacity: 0; transform: translate(-50%, -8px) scale(.9); } 8% { opacity: 1; transform: translate(-50%, 0) scale(1); } 90% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -6px); } }
@keyframes lt-egg-drop { 0% { transform: translate(-50%, -60vh) rotate(-20deg); } 70% { transform: translate(-50%, 0) rotate(8deg); } 100% { transform: translate(-50%, 0) rotate(0); } }
@keyframes lt-egg-shard-l { to { transform: translate(-140%, 40px) rotate(-55deg); opacity: 0; } }
@keyframes lt-egg-shard-r { to { transform: translate(40%, 50px) rotate(60deg); opacity: 0; } }
@keyframes lt-egg-shake { 0%,100% { transform: translate(0,0); } 20% { transform: translate(-6px, 2px); } 40% { transform: translate(5px,-3px); } 60% { transform: translate(-4px, 3px); } 80% { transform: translate(3px,-2px); } }
@keyframes lt-egg-heat { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 0; } }
.lt-egg-shaking #root { animation: lt-egg-shake 450ms linear 2; }
${GRACE_STYLES}`;

interface Running {
    key: number;
    effect: SurpriseEffect;
}

const Bubble: React.FC<{ emoji: string; text: string; to?: string }> = ({ emoji, text, to }) => (
    <div
        role="status"
        className={`${to ? 'pointer-events-auto' : 'pointer-events-none'} fixed left-1/2 z-[12000] flex w-max max-w-[min(92vw,26rem)] items-center gap-2 rounded-2xl border border-[var(--lt-accent-border)] bg-[var(--lt-card-strong)] px-4 py-3 text-sm font-semibold text-[var(--lt-text)] shadow-2xl`}
        style={{ top: 'calc(env(safe-area-inset-top) + 4.5rem)', animation: `lt-egg-pop ${to ? 9 : 6.5}s ease-out forwards` }}
    >
        <span className="text-2xl" aria-hidden="true">{emoji}</span>
        <span>{text}</span>
        {to && (
            <Link to={to} className="ml-1 shrink-0 rounded-full bg-[var(--lt-accent-soft)] px-2.5 py-1 text-xs font-bold text-[var(--lt-accent)]">
                Ver ›
            </Link>
        )}
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
    const { theme, graceUnlocked } = useTheme();
    const { user } = useAuth();
    const uid = user && !user.isAnonymous ? user.uid : null;
    const [running, setRunning] = useState<Running[]>([]);
    const [sheet, setSheet] = useState<{ kind: 'croqueta' | 'roulette' | 'poll'; poll?: PollId; side?: PollSide } | null>(null);
    const counter = useRef(0);
    const configRef = useRef(config);
    useEffect(() => { configRef.current = config; }, [config]);

    const remove = useCallback((key: number) => setRunning((list) => list.filter((r) => r.key !== key)), []);

    useEffect(() => {
        const onSurprise = (event: Event) => {
            const effect = (event as CustomEvent<SurpriseEffect>).detail;
            if (!effect) return;
            if (effect.kind === 'croqueta' && effect.gated && !isSurpriseOn(configRef.current, 'croqueta')) return;
            haptic(EFFECT_HAPTIC[effect.kind] ?? (effect.kind === 'bubble' ? effect.haptic ?? 'light' : 'light'));
            if (effect.kind === 'poll') {
                setSheet({ kind: 'poll', poll: effect.poll, side: effect.side });
                return;
            }
            if (effect.kind === 'croqueta' || effect.kind === 'roulette') {
                setSheet({ kind: effect.kind });
                return;
            }
            const key = ++counter.current;
            setRunning((list) => [...list.slice(-2), { key, effect }]);
            if (effect.kind === 'shake') {
                if (!prefersReducedMotion()) {
                    document.documentElement.classList.add('lt-egg-shaking');
                    window.setTimeout(() => document.documentElement.classList.remove('lt-egg-shaking'), 950);
                }
            }
            const ms = effect.kind === 'shake' ? 1900 : effect.kind === 'grace' ? GRACE_MS[effect.grace] + 300 : effect.kind === 'bubble' && effect.to ? 9200 : 6700;
            window.setTimeout(() => remove(key), ms);
        };
        window.addEventListener(SURPRISE_EVENT, onSurprise);
        return () => window.removeEventListener(SURPRISE_EVENT, onSurprise);
    }, [remove]);

    // Agitar el móvil en Inicio: la ruleta del destino. Con la ruleta abierta, otra vuelta.
    const rouletteOpen = sheet?.kind === 'roulette';
    const shakeOn = ((pathname === '/' && !sheet) || rouletteOpen) && isSurpriseOn(config, 'shakeRoulette');
    useShake(shakeOn, () => {
        if (rouletteOpen) { haptic('heavy'); window.dispatchEvent(new Event(RESPIN_EVENT)); }
        else fireSurprise({ kind: 'roulette' });
    });

    // El personaje del tema saluda una vez al día al entrar en Inicio. La Abuela, además,
    // suelta una frase cada 2 minutos o así; los demás solo hablan cuando haces algo.
    const characterFlag = theme === 'abuela' ? 'abuela' : 'themeCharacters';
    const charactersOn = isSurpriseOn(config, characterFlag);
    useEffect(() => {
        if (!charactersOn || pathname !== '/') return;
        const character = activeCharacter(theme);
        if (!character) return;
        const key = `listopic_hola_${theme}`;
        const today = new Date().toDateString();
        try {
            if (localStorage.getItem(key) === today) return;
        } catch { return; }
        const t = window.setTimeout(() => {
            try { localStorage.setItem(key, today); } catch { /* opcional */ }
            // De vez en cuando, en vez de saludar, un chivatazo útil con enlace.
            const tip = Math.random() < TIP_CHANCE ? pickCharacterTip(readCharacterTips(uid)) : null;
            if (tip) fireSurprise({ kind: 'bubble', emoji: character.emoji, text: tipText(character, tip), to: tip.to });
            else fireSurprise({ kind: 'bubble', emoji: character.emoji, text: pickGreeting(character) });
        }, 1200);
        return () => window.clearTimeout(t);
    }, [charactersOn, theme, pathname, uid]);

    const sheetOpen = sheet !== null;
    const chatty = charactersOn && theme === 'abuela';
    useEffect(() => {
        if (!chatty || sheetOpen) return;
        let t = 0;
        const next = () => {
            const wait = ABUELA_EVERY_MS.min + Math.random() * (ABUELA_EVERY_MS.max - ABUELA_EVERY_MS.min);
            t = window.setTimeout(() => {
                // Con la pestaña escondida no habla: no se acumulan frases. Callada en Preferencias, tampoco.
                if (document.visibilityState === 'visible' && activeCharacter('abuela')) {
                    // A veces se acuerda de lo último que valoraste.
                    const memory = Math.random() < 0.25 ? abuelaMemoryLine() : null;
                    fireSurprise({ kind: 'bubble', emoji: '👵', text: memory ?? abuelaLine() });
                }
                next();
            }, wait);
        };
        next();
        return () => window.clearTimeout(t);
    }, [chatty, sheetOpen]);

    // Gracias de ambiente en Inicio: estrellas fugaces en Medianoche (con su medalla)
    // y la gaviota de Laguna, que cruza de vez en cuando con una patata.
    const gracesOn = isSurpriseOn(config, 'themeGraces');
    const ambient = theme === 'dark' ? { grace: 'star' as const, min: 70_000, max: 140_000 }
        : theme === 'lagoon' ? { grace: 'gull' as const, min: 150_000, max: 260_000 }
            : null;
    const ambientOn = gracesOn && !!ambient && graceUnlocked(theme) && pathname === '/' && !sheetOpen && !prefersReducedMotion();
    const ambientGrace = ambient?.grace;
    const ambientMin = ambient?.min ?? 0;
    const ambientMax = ambient?.max ?? 0;
    useEffect(() => {
        if (!ambientOn || !ambientGrace) return;
        let t = 0;
        const next = (first: boolean) => {
            const wait = first ? 9_000 + Math.random() * 12_000 : ambientMin + Math.random() * (ambientMax - ambientMin);
            t = window.setTimeout(() => {
                if (document.visibilityState === 'visible') fireSurprise({ kind: 'grace', grace: ambientGrace, ambient: true });
                next(false);
            }, wait);
        };
        next(true);
        return () => window.clearTimeout(t);
    }, [ambientOn, ambientGrace, ambientMin, ambientMax]);

    // Mediodía (con su medalla): el sol del fondo sigue la hora real, de este a oeste.
    const sunOn = gracesOn && theme === 'light' && graceUnlocked('light');
    useEffect(() => {
        if (!sunOn) return;
        const root = document.documentElement;
        const place = () => {
            const now = new Date();
            const hours = now.getHours() + now.getMinutes() / 60;
            // De 7 a 21 h cruza el cielo; de noche se queda escondido abajo a la derecha.
            const t = Math.min(1, Math.max(0, (hours - 7) / 14));
            const x = 8 + t * 84;
            const y = hours < 7 || hours > 21 ? 30 : 3 + (1 - Math.sin(Math.PI * t)) * 16;
            root.style.setProperty('--lt-sun-x', `${x.toFixed(1)}%`);
            root.style.setProperty('--lt-sun-y', `${y.toFixed(1)}%`);
        };
        place();
        const timer = window.setInterval(place, 10 * 60_000);
        return () => {
            window.clearInterval(timer);
            root.style.removeProperty('--lt-sun-x');
            root.style.removeProperty('--lt-sun-y');
        };
    }, [sunOn]);

    const still = prefersReducedMotion();
    const close = () => setSheet(null);

    return (
        <>
            <ThemeAmbience theme={theme} gracesOn={gracesOn} charactersOn={charactersOn} />
            {createPortal(
                <>
                    <style>{STYLES}</style>
                    {running.map(({ key, effect }) => {
                        switch (effect.kind) {
                            case 'rain': return <Rain key={key} emoji={effect.emoji} title={effect.title} still={still} />;
                            case 'broken': return <Broken key={key} title={effect.title} still={still} />;
                            case 'shake': return <Heat key={key} />;
                            case 'bubble': return <Bubble key={key} emoji={effect.emoji} text={effect.text} to={effect.to} />;
                            case 'grace': return still ? null : <ThemeGrace key={key} grace={effect.grace} text={effect.text} scoops={effect.scoops} ambient={effect.ambient} />;
                            default: return null;
                        }
                    })}
                </>,
                document.body,
            )}
            <Suspense fallback={null}>
                {sheet?.kind === 'croqueta' && <CroquetaGame onClose={close} />}
                {sheet?.kind === 'roulette' && <ShakeRoulette onClose={close} />}
                {sheet?.kind === 'poll' && sheet.poll && <FoodPoll poll={sheet.poll} side={sheet.side} onClose={close} />}
            </Suspense>
        </>
    );
};
