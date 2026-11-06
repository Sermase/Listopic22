import React, { useEffect, useState } from 'react';
import type { GraceId } from '../../lib/themeCharacters';
import { rescueFry } from '../../lib/themeCharacters';
import { fireSurprise } from '../../lib/surprises';
import { haptic, type HapticKind } from '../../utils/haptics';

/**
 * Las gracias de cada tema: animaciones de unos segundos al publicar (y alguna de
 * ambiente en Inicio). Las pinta SurpriseHost; con «menos movimiento» no se pintan.
 */

const layer = 'pointer-events-none fixed inset-0 z-[11998] overflow-hidden';

/** Vibraciones con su momento (ms desde que empieza). */
function useBeats(beats: ReadonlyArray<[number, HapticKind]>) {
    useEffect(() => {
        const timers = beats.map(([at, kind]) => window.setTimeout(() => haptic(kind), at));
        return () => timers.forEach((t) => window.clearTimeout(t));
        // Solo al montar: cada gracia vibra una vez.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

// ── Medianoche: estrella fugaz ───────────────────────────────────────────────
const ShootingStar: React.FC<{ small?: boolean }> = ({ small }) => {
    useBeats(small ? [] : [[150, 'light'], [1300, 'success']]);
    const [twinkles] = useState(() => (small ? [] : Array.from({ length: 9 }, (_, i) => ({
        key: i, left: rand(8, 92), top: rand(6, 60), delay: rand(0.2, 1.8), size: rand(10, 20),
    }))));
    const streak = (delay: number, top: string, width: number, height: number, duration: number) => (
        <div className="absolute" style={{ right: '-12%', top, transform: 'rotate(152deg)', transformOrigin: 'left center' }}>
            <div
                style={{
                    width, height, borderRadius: 999,
                    background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(199,210,254,.55) 55%, #fff)',
                    boxShadow: '0 0 12px rgba(255,255,255,.9), 0 0 28px rgba(165,180,252,.7)',
                    opacity: 0,
                    animation: `lt-grace-streak ${duration}s ${delay}s cubic-bezier(.45,.05,.55,.95) forwards`,
                }}
            />
        </div>
    );
    return (
        <div className={layer} aria-hidden="true">
            {streak(0, small ? '8%' : '4%', small ? 120 : 260, small ? 2 : 3, small ? 1.3 : 1.6)}
            {!small && streak(0.45, '-6%', 150, 2, 1.4)}
            {twinkles.map((t) => (
                <span
                    key={t.key}
                    className="absolute text-white"
                    style={{ left: `${t.left}%`, top: `${t.top}%`, fontSize: t.size, opacity: 0, textShadow: '0 0 10px #c7d2fe', animation: `lt-grace-twinkle 1.3s ${t.delay}s ease-out forwards` }}
                >
                    ✦
                </span>
            ))}
        </div>
    );
};

// ── Mediodía: el sol sale y gira ─────────────────────────────────────────────
const Sunrise: React.FC = () => {
    useBeats([[100, 'light'], [1400, 'success']]);
    return (
        <div className={layer} aria-hidden="true">
            <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 32%, rgba(253,224,71,.35), rgba(251,146,60,.12) 40%, transparent 70%)', animation: 'lt-grace-wash 4s ease-out forwards' }} />
            <div className="absolute left-1/2 top-[22%]" style={{ animation: 'lt-grace-rise 4s cubic-bezier(.2,.8,.2,1) forwards' }}>
                <div className="relative h-40 w-40">
                    <div
                        className="absolute -inset-16 rounded-full"
                        style={{
                            background: 'repeating-conic-gradient(rgba(253,224,71,.55) 0 7deg, transparent 7deg 22.5deg)',
                            WebkitMaskImage: 'radial-gradient(circle, transparent 38%, #000 40%, transparent 72%)',
                            maskImage: 'radial-gradient(circle, transparent 38%, #000 40%, transparent 72%)',
                            animation: 'lt-grace-spin 9s linear infinite',
                        }}
                    />
                    <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle at 40% 38%, #fff7c2, #fde047 45%, #fb923c)', boxShadow: '0 0 40px 10px rgba(253,224,71,.65), 0 0 90px 30px rgba(251,146,60,.35)' }} />
                </div>
            </div>
        </div>
    );
};

// ── Brasa: chispazo de ascuas ────────────────────────────────────────────────
const Sparks: React.FC = () => {
    useBeats([[0, 'heavy'], [450, 'light'], [900, 'light']]);
    const [embers] = useState(() => Array.from({ length: 60 }, (_, i) => ({
        key: i, left: rand(4, 96), size: rand(4, 11), delay: rand(0, 1.1), duration: rand(1.6, 2.6), dx: `${Math.round(rand(-60, 60))}px`,
        color: ['#fde047', '#fb923c', '#f97316', '#ef4444'][i % 4],
    })));
    return (
        <div className={layer} aria-hidden="true">
            <div className="absolute inset-0" style={{ boxShadow: 'inset 0 -120px 120px -40px rgba(249,115,22,.55)', animation: 'lt-grace-wash 3.2s ease-out forwards' }} />
            {embers.map((e) => (
                <span
                    key={e.key}
                    className="absolute bottom-0 rounded-full"
                    style={{
                        left: `${e.left}%`, width: e.size, height: e.size, background: e.color,
                        boxShadow: `0 0 ${e.size * 2}px ${e.color}`, opacity: 0,
                        ['--dx' as string]: e.dx,
                        animation: `lt-grace-ember ${e.duration}s ${e.delay}s ease-out forwards`,
                    }}
                />
            ))}
        </div>
    );
};

// ── Heladería: helado de notas (una bola por criterio) ──────────────────────
const IceCream: React.FC<{ scoops: string[] }> = ({ scoops }) => {
    const list = scoops.length ? scoops : ['#f9a8d4', '#fde68a', '#a7f3d0'];
    const step = 0.45;
    useBeats(list.map((_, i) => [Math.round((i * step + 0.42) * 1000), 'light'] as [number, HapticKind]).concat([[Math.round((list.length * step + 0.5) * 1000), 'success']]));
    const size = 74;
    return (
        <div className={layer} aria-hidden="true" style={{ animation: 'lt-grace-fadeout 5s ease-out forwards' }}>
            <div className="absolute left-1/2 top-[58%] -translate-x-1/2">
                {/* Cucurucho de barquillo, por delante: la bola de abajo queda metida dentro. */}
                <div
                    className="absolute left-1/2 top-0 -translate-x-1/2"
                    style={{
                        width: 0, height: 0,
                        borderLeft: `${size * 0.55}px solid transparent`, borderRight: `${size * 0.55}px solid transparent`,
                        borderTop: `${size * 1.45}px solid #d9a35b`,
                        filter: 'drop-shadow(0 8px 16px rgba(0,0,0,.18))',
                        zIndex: 2,
                    }}
                />
                <div
                    className="absolute left-1/2 top-0 -translate-x-1/2"
                    style={{
                        width: size * 1.1, height: size * 1.45,
                        clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
                        zIndex: 2,
                        background: 'repeating-linear-gradient(45deg, rgba(120,72,24,.35) 0 2px, transparent 2px 13px), repeating-linear-gradient(-45deg, rgba(120,72,24,.35) 0 2px, transparent 2px 13px)',
                    }}
                />
                {list.map((color, i) => (
                    <div
                        key={i}
                        className="absolute left-1/2 rounded-full"
                        style={{
                            width: size, height: size * 0.92,
                            bottom: i * size * 0.62 - size * 0.18,
                            background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,.65), ${color} 45%)`,
                            boxShadow: `inset 0 -8px 0 rgba(0,0,0,.08), 0 4px 10px rgba(0,0,0,.12)`,
                            transform: 'translate(-50%, -70vh)',
                            animation: `lt-grace-drop .55s ${i * step}s cubic-bezier(.5,0,.6,1) forwards`,
                            zIndex: 1,
                        }}
                    />
                ))}
                <div
                    className="absolute left-1/2 text-3xl"
                    style={{ bottom: list.length * size * 0.62 - size * 0.05, zIndex: 3, transform: 'translate(-50%, -70vh)', animation: `lt-grace-drop .5s ${list.length * step + 0.1}s cubic-bezier(.5,0,.6,1) forwards` }}
                >
                    🍒
                </div>
            </div>
        </div>
    );
};

// ── Neón: el letrero se enciende letra a letra ───────────────────────────────
const NeonSign: React.FC<{ text: string }> = ({ text }) => {
    const letters = Array.from(text);
    useBeats([[80, 'light'], [Math.min(letters.length * 70, 1800) + 300, 'medium']]);
    return (
        <div className={`${layer} flex items-center justify-center`} aria-hidden="true">
            <div
                className="rounded-2xl px-6 py-4"
                style={{
                    border: '2px solid #f472b6',
                    boxShadow: '0 0 12px #ec4899, inset 0 0 14px rgba(236,72,153,.55), 0 0 40px rgba(168,85,247,.45)',
                    background: 'rgba(23,10,40,.72)',
                    animation: 'lt-grace-tube .9s steps(1) forwards, lt-grace-pop 4.2s ease-out forwards',
                }}
            >
                <p className="whitespace-nowrap text-center text-3xl tracking-wider text-white" style={{ fontFamily: "'Tilt Neon Variable', 'Tilt Neon', sans-serif" }}>
                    {letters.map((ch, i) => (
                        <span key={i} style={{ opacity: 0.12, animation: `lt-grace-neon-on .7s ${0.25 + i * 0.07}s forwards` }}>{ch}</span>
                    ))}
                </p>
            </div>
        </div>
    );
};

// ── Pizarra: escrito a tiza ──────────────────────────────────────────────────
const Chalk: React.FC<{ text: string }> = ({ text }) => {
    useBeats([[200, 'selection'], [700, 'selection'], [1300, 'medium']]);
    const [dust] = useState(() => Array.from({ length: 14 }, (_, i) => ({ key: i, left: rand(10, 90), delay: rand(0.3, 1.5), dx: `${Math.round(rand(-14, 14))}px` })));
    return (
        <div className={`${layer} flex items-center justify-center`} aria-hidden="true">
            <div
                className="relative rounded-md px-8 py-5"
                style={{
                    background: '#26332e',
                    border: '8px solid #8a5a32',
                    boxShadow: 'inset 0 0 30px rgba(0,0,0,.45), 0 18px 40px rgba(0,0,0,.4)',
                    transform: 'rotate(-2deg)',
                    animation: 'lt-grace-pop 4s ease-out forwards',
                }}
            >
                <p
                    className="whitespace-nowrap text-5xl font-bold text-[#f4f1e8]"
                    style={{ fontFamily: "'Caveat Variable', 'Caveat', cursive", textShadow: '0 0 1px rgba(255,255,255,.6)', clipPath: 'inset(0 100% 0 0)', animation: 'lt-grace-write 1.3s .25s steps(18) forwards' }}
                >
                    {text}
                </p>
                {dust.map((d) => (
                    <span key={d.key} className="absolute bottom-3 h-1 w-1 rounded-full bg-white/80" style={{ left: `${d.left}%`, opacity: 0, ['--dx' as string]: d.dx, animation: `lt-grace-dust 1.4s ${d.delay}s ease-out forwards` }} />
                ))}
            </div>
        </div>
    );
};

// ── Atardecer: brindis ───────────────────────────────────────────────────────
const Cheers: React.FC = () => {
    useBeats([[900, 'heavy'], [1050, 'success']]);
    return (
        <div className={`${layer} flex items-center justify-center`} aria-hidden="true">
            <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 45%, rgba(253,186,116,.4), rgba(244,114,182,.18) 35%, transparent 65%)', animation: 'lt-grace-wash 3.6s ease-out forwards' }} />
            <div className="relative flex items-center" style={{ animation: 'lt-grace-fadeout 3.6s ease-out forwards' }}>
                <span className="inline-block text-7xl" style={{ animation: 'lt-grace-swing-l 2s cubic-bezier(.3,.7,.3,1) forwards' }}>🥃</span>
                <span className="inline-block text-7xl" style={{ animation: 'lt-grace-swing-r 2s cubic-bezier(.3,.7,.3,1) forwards' }}>🥃</span>
                <span className="absolute left-1/2 top-[-30px] -translate-x-1/2 text-5xl" style={{ opacity: 0, animation: 'lt-grace-burst 2s ease-out forwards' }}>✨</span>
            </div>
        </div>
    );
};

// ── Laguna: la gaviota cruza con una patata (tócala y la suelta) ─────────────
const Gull: React.FC<{ ambient?: boolean }> = ({ ambient }) => {
    const [dropped, setDropped] = useState(false);
    // De ambiente vuela a una altura cualquiera; al publicar, siempre arriba.
    const [top] = useState(() => (ambient ? `${Math.round(rand(14, 40))}%` : '24%'));
    const rescue = () => {
        if (dropped) return;
        setDropped(true);
        haptic('success');
        const n = rescueFry();
        fireSurprise({ kind: 'bubble', emoji: '🍟', text: n === 1 ? '¡Patata rescatada! La gaviota no da crédito.' : `¡Patata rescatada! Ya le has quitado ${n}.` });
    };
    return (
        <div className={layer} aria-hidden="true">
            <div className="absolute left-0" style={{ top, animation: 'lt-grace-fly 5s linear forwards' }}>
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={rescue}
                    className="pointer-events-auto relative block p-3"
                    aria-label="Gaviota"
                >
                    <svg width="112" height="58" viewBox="0 0 78 40" style={{ overflow: 'visible', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.25))' }}>
                        <g style={{ transformOrigin: '39px 18px', animation: 'lt-grace-flap .5s ease-in-out infinite' }}>
                            <path d="M4 16 Q20 0 37 17 Q56 0 74 16 Q56 9 39 22 Q22 9 4 16Z" fill="#f8fafc" stroke="#475569" strokeWidth="1.5" strokeLinejoin="round" />
                            <path d="M4 16 Q11 12 15 13" fill="none" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" />
                            <path d="M74 16 Q67 12 63 13" fill="none" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" />
                        </g>
                        <ellipse cx="39" cy="22" rx="8" ry="5" fill="#f8fafc" stroke="#475569" strokeWidth="1.2" />
                        <path d="M46 22 L52 23 L46 25Z" fill="#f59e0b" />
                    </svg>
                    {!dropped && <span className="absolute left-[66px] top-[50px] text-3xl" style={{ transform: 'rotate(20deg)' }}>🍟</span>}
                </button>
            </div>
            {dropped && <DroppedFry />}
        </div>
    );
};

/** La patata cae donde estaba la gaviota (más o menos: en el centro). */
const DroppedFry: React.FC = () => (
    <span className="absolute left-1/2 top-[30%] text-3xl" style={{ animation: 'lt-grace-fall 1.4s cubic-bezier(.5,0,.75,0) forwards' }}>🍟</span>
);

export const ThemeGrace: React.FC<{ grace: GraceId; text?: string; scoops?: string[]; ambient?: boolean }> = ({ grace, text, scoops, ambient }) => {
    switch (grace) {
        case 'star': return <ShootingStar small={ambient} />;
        case 'sunrise': return <Sunrise />;
        case 'sparks': return <Sparks />;
        case 'icecream': return <IceCream scoops={scoops ?? []} />;
        case 'neon': return <NeonSign text={text || '★ PUBLICADO ★'} />;
        case 'chalk': return <Chalk text={text || '¡Marchando!'} />;
        case 'cheers': return <Cheers />;
        case 'gull': return <Gull ambient={ambient} />;
        default: return null;
    }
};
