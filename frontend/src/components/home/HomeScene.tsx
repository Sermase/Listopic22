import React from 'react';
import type { SceneMoment } from '../../lib/homeScene';

/**
 * Dibujo de la cabecera de Inicio: una calle con su bar; el cielo cambia con la
 * hora (mañana, mediodía con sombrillas, atardecer y luna de noche). El toldo y
 * el letrero van con el color del tema. El dibujo es ancho (720) y se recorta por
 * los lados en el móvil: lo importante va en el centro (180–540).
 */

const ACCENT = { fill: 'var(--lt-accent)' };

interface Palette {
    sky: [string, string, string];
    far: string;
    near: string;
    ground: string;
    window: string;
    facade: string;
    door: string;
    text: 'light' | 'dark';
}

const PALETTES: Record<SceneMoment, Palette> = {
    manana: { sky: ['#9bd3ff', '#cfe9ff', '#ffe5c4'], far: '#e9d8c4', near: '#d9c2a8', ground: '#b89a7c', window: '#fff6dc', facade: '#f4e3cf', door: '#8a6a52', text: 'dark' },
    mediodia: { sky: ['#4fb7f5', '#9fdcff', '#e8f7ff'], far: '#f7e6d2', near: '#efd2b4', ground: '#d9b48c', window: '#ffffff', facade: '#fff7ee', door: '#a0754f', text: 'dark' },
    tarde: { sky: ['#5b21b6', '#e0599f', '#ffb27a'], far: '#7a3a73', near: '#5e2a5c', ground: '#3d1a3f', window: '#ffd27a', facade: '#6e3168', door: '#2a1030', text: 'light' },
    noche: { sky: ['#14123f', '#2c2470', '#4a3688'], far: '#2a2160', near: '#211852', ground: '#120d33', window: '#ffd66b', facade: '#2d2170', door: '#120d33', text: 'light' },
};

const Buildings: React.FC<{ p: Palette; lit: boolean }> = ({ p, lit }) => (
    <g>
        {/* Al fondo */}
        <g fill={p.far}>
            <rect x="0" y="70" width="70" height="80" /><rect x="64" y="58" width="52" height="92" />
            <rect x="150" y="76" width="60" height="74" /><rect x="520" y="66" width="58" height="84" />
            <rect x="600" y="80" width="54" height="70" /><rect x="650" y="62" width="70" height="88" />
        </g>
        {/* Delante */}
        <g fill={p.near}>
            <rect x="108" y="84" width="76" height="66" /><rect x="186" y="96" width="62" height="54" />
            <rect x="476" y="90" width="66" height="60" /><rect x="560" y="100" width="80" height="50" />
        </g>
        <g fill={p.window} opacity={lit ? 0.95 : 0.8}>
            {[[16, 84], [36, 84], [74, 72], [92, 92], [122, 98], [146, 98], [160, 120], [198, 108], [222, 108],
                [488, 102], [512, 102], [532, 82], [574, 112], [600, 112], [664, 76], [690, 96]].map(([x, y]) => (
                <rect key={`${x}-${y}`} x={x} y={y} width="9" height="11" rx="1.5" />
            ))}
        </g>
    </g>
);

/** El bar del centro, con toldo de rayas del color del tema y su letrero. */
const Bar: React.FC<{ p: Palette; glow?: boolean }> = ({ p, glow }) => (
    // Un poco más abajo: el letrero no choca con el saludo.
    <g transform="translate(0 14)">
        <rect x="282" y="74" width="156" height="76" fill={p.facade} />
        <path d="M274 74h172l-9 22H283z" style={ACCENT} />
        <g fill="#ffffff" opacity=".92">
            {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M${290 + i * 26} 74h12l${i < 3 ? -1.5 : 1.5} 22h-12z`} />)}
        </g>
        <rect x="314" y="52" width="92" height="18" rx="5" fill={glow ? '#0d1431' : '#ffffff'} stroke="var(--lt-accent)" strokeWidth="2" />
        <text x="360" y="65" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif" fontWeight="800" fontSize="10.5" letterSpacing="2" style={{ fill: glow ? '#fde68a' : 'var(--lt-accent)' }}>LISTOPIC</text>
        <rect x="296" y="104" width="50" height="34" rx="3" fill={p.window} opacity={glow ? 0.9 : 0.75} />
        <rect x="372" y="104" width="46" height="46" rx="3" fill={p.door} />
        <circle cx="410" cy="128" r="2" fill="#fbbf24" />
    </g>
);

const Steam: React.FC<{ x: number; y: number }> = ({ x, y }) => (
    <g className="lt-scene-steam" stroke="#ffffff" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".7">
        <path d={`M${x} ${y}c-3-5 3-7 0-12`} /><path d={`M${x + 7} ${y}c-3-5 3-7 0-12`} style={{ animationDelay: '.8s' }} />
    </g>
);

/** Mesa de terraza con lo que toque. */
const Table: React.FC<{ x: number; p: Palette; children?: React.ReactNode }> = ({ x, p, children }) => (
    <g>
        <ellipse cx={x} cy="134" rx="30" ry="5" fill={p.ground} opacity=".9" />
        <rect x={x - 2} y="134" width="4" height="14" fill={p.ground} />
        <ellipse cx={x} cy="132" rx="26" ry="4.5" fill="#ffffff" opacity=".95" />
        {children}
    </g>
);

/** Un plato de los de verdad: el emoji del mejor valorado cerca (lib/dishArt). */
const Dish: React.FC<{ x: number; emoji: string }> = ({ x, emoji }) => (
    <g>
        <ellipse cx={x} cy="130.5" rx="13" ry="3.2" fill="#ffffff" />
        <text x={x} y="129" textAnchor="middle" fontSize="17">{emoji}</text>
    </g>
);

const Umbrella: React.FC<{ x: number }> = ({ x }) => (
    <g>
        <rect x={x - 1.2} y="92" width="2.4" height="42" fill="#9ca3af" />
        <path d={`M${x - 34} 98q34-26 68 0z`} style={ACCENT} />
        <path d={`M${x - 34} 98q17-6 34 0q17-6 34 0`} fill="#ffffff" opacity=".35" />
    </g>
);

const Stars: React.FC = () => (
    <g fill="#ffffff">
        {[[40, 30], [118, 18], [212, 36], [262, 14], [300, 40], [418, 20], [452, 44], [560, 26], [610, 46], [690, 20], [236, 58], [530, 50]].map(([x, y], i) => (
            <circle key={i} className="lt-scene-star" cx={x} cy={y} r={i % 3 === 0 ? 1.6 : 1.1} style={{ animationDelay: `${(i % 5) * 0.6}s` }} />
        ))}
    </g>
);

const SCENE_STYLES = `
@keyframes lt-scene-steam { 0% { transform: translateY(0); opacity: 0; } 30% { opacity: .7; } 100% { transform: translateY(-8px); opacity: 0; } }
@keyframes lt-scene-twinkle { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
.lt-scene-steam path { animation: lt-scene-steam 2.6s ease-out infinite; }
.lt-scene-star { animation: lt-scene-twinkle 3.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .lt-scene-steam path, .lt-scene-star { animation: none; } }
`;

/**
 * `dishes`: emojis de los platos mejor valorados cerca, para las mesas. Nada de cafés
 * ni cañas inventados: en las mesas solo hay lo que se valora en Listopic.
 */
export const HomeScene: React.FC<{ moment: SceneMoment; dishes?: readonly string[]; children?: React.ReactNode }> = ({ moment, dishes = [], children }) => {
    const p = PALETTES[moment];
    const first = dishes[0] ?? '🍽️';
    const second = dishes[1] ?? first;
    const id = `lt-sky-${moment}`;
    return (
        <div className="relative h-[176px] overflow-hidden rounded-3xl border border-[var(--lt-border)] shadow-lg sm:h-[200px]">
            <style>{SCENE_STYLES}</style>
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 720 150" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
                <defs>
                    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor={p.sky[0]} /><stop offset=".6" stopColor={p.sky[1]} /><stop offset="1" stopColor={p.sky[2]} />
                    </linearGradient>
                    <radialGradient id={`${id}-glow`} cx=".5" cy=".5" r=".5">
                        <stop offset="0" stopColor="#fff7d6" stopOpacity=".9" /><stop offset="1" stopColor="#fff7d6" stopOpacity="0" />
                    </radialGradient>
                </defs>
                <rect width="720" height="150" fill={`url(#${id})`} />

                {moment === 'noche' && (
                    <>
                        <Stars />
                        <circle cx="478" cy="30" r="34" fill={`url(#${id}-glow)`} opacity=".5" />
                        <circle cx="478" cy="30" r="15" fill="#fef3c7" />
                        <circle cx="472" cy="26" r="2.6" fill="#fde68a" /><circle cx="483" cy="35" r="1.8" fill="#fde68a" />
                    </>
                )}
                {moment === 'manana' && (
                    <>
                        <circle cx="236" cy="58" r="40" fill={`url(#${id}-glow)`} />
                        <circle cx="236" cy="58" r="16" fill="#fdba74" />
                        <g fill="#ffffff" opacity=".85"><ellipse cx="460" cy="30" rx="26" ry="8" /><ellipse cx="478" cy="25" rx="14" ry="8" /><ellipse cx="150" cy="22" rx="20" ry="6" /></g>
                    </>
                )}
                {moment === 'mediodia' && (
                    <>
                        <circle cx="486" cy="26" r="44" fill={`url(#${id}-glow)`} />
                        <circle cx="486" cy="26" r="17" fill="#fde047" />
                        <g fill="#ffffff" opacity=".9"><ellipse cx="250" cy="22" rx="24" ry="7" /><ellipse cx="266" cy="17" rx="13" ry="7" /><ellipse cx="620" cy="34" rx="22" ry="6" /></g>
                    </>
                )}
                {moment === 'tarde' && (
                    <>
                        <circle cx="470" cy="96" r="54" fill={`url(#${id}-glow)`} opacity=".7" />
                        <circle cx="470" cy="96" r="24" fill="#fde68a" opacity=".95" />
                        <g fill="#ffffff" opacity=".35"><ellipse cx="230" cy="40" rx="34" ry="5" /><ellipse cx="560" cy="30" rx="26" ry="4" /></g>
                    </>
                )}

                <Buildings p={p} lit={moment === 'noche' || moment === 'tarde'} />
                <rect y="146" width="720" height="4" fill={p.ground} />

                {moment === 'manana' && (
                    <>
                        <Bar p={p} />
                        <Table x={248} p={p}><Dish x={248} emoji={first} /></Table>
                        <Steam x={242} y={110} />
                    </>
                )}
                {moment === 'mediodia' && (
                    <>
                        <Bar p={p} />
                        <Umbrella x={246} /><Table x={246} p={p}><Dish x={246} emoji={first} /></Table>
                        <Umbrella x={474} /><Table x={474} p={p}><Dish x={474} emoji={second} /></Table>
                    </>
                )}
                {moment === 'tarde' && (
                    <>
                        <Bar p={p} glow />
                        <Table x={248} p={p}><Dish x={248} emoji={first} /></Table>
                        <Table x={474} p={p}><Dish x={474} emoji={second} /></Table>
                    </>
                )}
                {moment === 'noche' && (
                    <>
                        <Bar p={p} glow />
                        <Table x={248} p={p}><Dish x={248} emoji={first} /></Table>
                        <Steam x={242} y={110} />
                    </>
                )}
            </svg>
            <div className={`relative px-4 pt-3 sm:px-5 sm:pt-4 ${p.text === 'light' ? 'text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.45)]' : 'text-slate-900 [text-shadow:0_1px_8px_rgba(255,255,255,0.6)]'}`}>
                {children}
            </div>
        </div>
    );
};
