import type { GraceId } from '../../lib/themeCharacters';

// Duraciones y animaciones de las gracias de los temas (las pinta ThemeGrace).

/** Cuánto dura cada gracia en pantalla (ms); SurpriseHost la quita después. */
export const GRACE_MS: Record<GraceId, number> = {
    star: 3200,
    sunrise: 4200,
    sparks: 3600,
    icecream: 5200,
    neon: 4400,
    chalk: 4200,
    cheers: 3800,
    gull: 5200,
};

export const GRACE_STYLES = `
@keyframes lt-grace-streak { 0% { transform: translateX(0); opacity: 0; } 8% { opacity: 1; } 75% { opacity: 1; } 100% { transform: translateX(160vmax); opacity: 0; } }
@keyframes lt-grace-twinkle { 0% { opacity: 0; transform: scale(.2) rotate(0deg); } 45% { opacity: 1; transform: scale(1.1) rotate(45deg); } 100% { opacity: 0; transform: scale(.4) rotate(90deg); } }
@keyframes lt-grace-rise { 0% { transform: translate(-50%, 70vh) scale(.8); } 35% { transform: translate(-50%, 0) scale(1); } 80% { opacity: 1; } 100% { transform: translate(-50%, -4vh) scale(1.05); opacity: 0; } }
@keyframes lt-grace-spin { to { transform: rotate(360deg); } }
@keyframes lt-grace-wash { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 0; } }
@keyframes lt-grace-ember { 0% { transform: translate(0, 0) scale(1); opacity: 0; } 10% { opacity: 1; } 100% { transform: translate(var(--dx), -75vh) scale(.3); opacity: 0; } }
@keyframes lt-grace-drop { 0% { transform: translate(-50%, -70vh); } 70% { transform: translate(-50%, 4px) scale(1.08, .9); } 85% { transform: translate(-50%, -3px) scale(.97, 1.04); } 100% { transform: translate(-50%, 0) scale(1); } }
@keyframes lt-grace-fadeout { 0%, 82% { opacity: 1; } 100% { opacity: 0; } }
@keyframes lt-grace-pop { 0% { transform: scale(.85); opacity: 0; } 12% { transform: scale(1); opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; } }
@keyframes lt-grace-neon-on { 0% { opacity: .12; text-shadow: none; } 30% { opacity: 1; text-shadow: 0 0 6px #fff, 0 0 14px #f472b6, 0 0 30px #ec4899; } 42% { opacity: .2; text-shadow: none; } 58%, 100% { opacity: 1; text-shadow: 0 0 6px #fff, 0 0 14px #f472b6, 0 0 30px #ec4899, 0 0 52px #a855f7; } }
@keyframes lt-grace-tube { 0% { opacity: 0; } 20% { opacity: .8; } 26% { opacity: .1; } 34%, 100% { opacity: 1; } }
@keyframes lt-grace-write { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes lt-grace-dust { 0% { opacity: 0; transform: translate(0, 0); } 20% { opacity: .9; } 100% { opacity: 0; transform: translate(var(--dx), 40px); } }
@keyframes lt-grace-swing-l { 0% { transform: translate(-60vw, 0) rotate(-25deg); } 45% { transform: translate(-28px, 0) rotate(12deg); } 52% { transform: translate(-34px, 0) rotate(4deg); } 100% { transform: translate(-34px, 0) rotate(4deg); } }
@keyframes lt-grace-swing-r { 0% { transform: translate(60vw, 0) scaleX(-1) rotate(-25deg); } 45% { transform: translate(28px, 0) scaleX(-1) rotate(12deg); } 52% { transform: translate(34px, 0) scaleX(-1) rotate(4deg); } 100% { transform: translate(34px, 0) scaleX(-1) rotate(4deg); } }
@keyframes lt-grace-burst { 0%, 42% { opacity: 0; transform: scale(.3); } 55% { opacity: 1; transform: scale(1.1); } 100% { opacity: 0; transform: scale(1.5); } }
@keyframes lt-grace-fly { 0% { transform: translate(-25vw, 0); } 25% { transform: translate(20vw, -3vh); } 50% { transform: translate(55vw, 2vh); } 75% { transform: translate(85vw, -2vh); } 100% { transform: translate(125vw, 0); } }
@keyframes lt-grace-flap { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(-.55); } }
@keyframes lt-grace-fall { to { transform: translateY(70vh) rotate(260deg); opacity: 0; } }
`;
