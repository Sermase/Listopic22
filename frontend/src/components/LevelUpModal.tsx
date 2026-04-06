import React, { useEffect, useState, useRef } from 'react';
import { X, Sparkles, TrendingUp, ChevronRight } from 'lucide-react';
import type { LevelInfo } from '../utils/gamification';

interface LevelUpModalProps {
    isOpen: boolean;
    onClose: () => void;
    levelInfo: LevelInfo;
    previousLevel: number;
    xpGained: number;
    trigger?: string; // e.g. "Has publicado una reseña" 
}

/**
 * Elegant level-up celebration modal.
 * Triggers gold fill animation followed by 3D confetti and haptic pulses.
 */
export const LevelUpModal: React.FC<LevelUpModalProps> = ({
    isOpen,
    onClose,
    levelInfo,
    previousLevel,
    xpGained,
    trigger,
}) => {
    const [animPhase, setAnimPhase] = useState<'enter' | 'fill' | 'complete'>('enter');
    const [fillPercent, setFillPercent] = useState(0);
    const timerRef = useRef<number | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setAnimPhase('enter');
            setFillPercent(0);
            return;
        }

        // Phase 1: Entry animation (scale in)
        const t1 = window.setTimeout(() => {
            setAnimPhase('fill');
        }, 400);

        // Phase 2: Gold bar fill animation
        const t2 = window.setTimeout(() => {
            setFillPercent(levelInfo.progressPercent);
        }, 700);

        // Phase 3: Complete
        const t3 = window.setTimeout(() => {
            setAnimPhase('complete');
            const isLvlUp = previousLevel > 0 && levelInfo.level > previousLevel;
            if (isLvlUp) {
                import('canvas-confetti').then((confetti) => {
                    confetti.default({
                        particleCount: 150,
                        spread: 80,
                        origin: { y: 0.6 },
                        colors: ['#FFD700', '#FFA500', '#FF8C00', '#FF4500']
                    });
                });
                if (navigator.vibrate) navigator.vibrate([15, 30, 20]);
            } else {
                if (navigator.vibrate) navigator.vibrate([10]);
            }
        }, 1800);

        return () => {
            window.clearTimeout(t1);
            window.clearTimeout(t2);
            window.clearTimeout(t3);
        };
    }, [isOpen, levelInfo.progressPercent]);

    if (!isOpen) return null;

    const isLevelUp = previousLevel > 0 && levelInfo.level > previousLevel;

    // Dynamic gold intensity based on fill percentage: low fill = pale gold, high fill = rich deep gold
    const goldIntensity = Math.max(0.4, fillPercent / 100);
    const goldHue = 38 + (fillPercent / 100) * 8; // 38-46 range, more amber as it fills
    const goldSat = 70 + (fillPercent / 100) * 30;  // 70-100%
    const goldLight = 58 - (fillPercent / 100) * 12; // 58-46% — darker = richer gold

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 transition-all duration-700"
                style={{
                    background: animPhase === 'enter'
                        ? 'rgba(0,0,0,0)'
                        : `radial-gradient(ellipse at center, rgba(180,130,20,0.08) 0%, rgba(0,0,0,0.85) 100%)`,
                    backdropFilter: animPhase === 'enter' ? 'blur(0px)' : 'blur(12px)',
                }}
            />

            {/* Card */}
            <div
                className="relative w-full max-w-sm overflow-hidden rounded-3xl border shadow-2xl transition-all duration-600"
                style={{
                    background: 'linear-gradient(165deg, #1a1408 0%, #0f0d08 40%, #12100a 100%)',
                    borderColor: `hsla(${goldHue}, ${goldSat}%, ${goldLight}%, ${goldIntensity * 0.4})`,
                    boxShadow: animPhase !== 'enter'
                        ? `0 0 60px hsla(${goldHue}, ${goldSat}%, ${goldLight}%, ${goldIntensity * 0.15}), 0 25px 50px rgba(0,0,0,0.5)`
                        : '0 25px 50px rgba(0,0,0,0.5)',
                    transform: animPhase === 'enter' ? 'scale(0.9) translateY(20px)' : 'scale(1) translateY(0)',
                    opacity: animPhase === 'enter' ? 0 : 1,
                }}
            >
                {/* Close */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 p-1.5 rounded-full text-white/30 hover:text-white/80 hover:bg-white/5 transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Subtle top shimmer */}
                <div
                    className="absolute top-0 left-0 right-0 h-32 pointer-events-none transition-opacity duration-1000"
                    style={{
                        background: `radial-gradient(ellipse at 50% 0%, hsla(${goldHue}, ${goldSat}%, ${goldLight}%, ${goldIntensity * 0.12}) 0%, transparent 70%)`,
                        opacity: animPhase !== 'enter' ? 1 : 0,
                    }}
                />

                <div className="relative px-7 pt-8 pb-7">
                    {/* Header */}
                    <div className="text-center mb-6">
                        {trigger && (
                            <p
                                className="text-xs font-medium uppercase tracking-[0.25em] mb-4 transition-all duration-700"
                                style={{
                                    color: `hsla(${goldHue}, ${goldSat - 20}%, ${goldLight + 20}%, 0.6)`,
                                    opacity: animPhase !== 'enter' ? 1 : 0,
                                    transform: animPhase !== 'enter' ? 'translateY(0)' : 'translateY(8px)',
                                }}
                            >
                                {trigger}
                            </p>
                        )}

                        {isLevelUp ? (
                            <div
                                className="transition-all duration-700"
                                style={{
                                    opacity: animPhase !== 'enter' ? 1 : 0,
                                    transform: animPhase !== 'enter' ? 'translateY(0)' : 'translateY(12px)',
                                }}
                            >
                                <div className="flex items-center justify-center gap-2 mb-1">
                                    <Sparkles
                                        className="w-5 h-5 transition-all duration-1000"
                                        style={{ color: `hsl(${goldHue}, ${goldSat}%, ${goldLight}%)` }}
                                    />
                                    <span
                                        className="text-xs font-black uppercase tracking-[0.3em]"
                                        style={{ color: `hsl(${goldHue}, ${goldSat}%, ${goldLight}%)` }}
                                    >
                                        Nuevo nivel
                                    </span>
                                    <Sparkles
                                        className="w-5 h-5 transition-all duration-1000"
                                        style={{ color: `hsl(${goldHue}, ${goldSat}%, ${goldLight}%)` }}
                                    />
                                </div>
                                <h2 className="text-5xl font-black text-white tracking-tighter">
                                    Nivel {levelInfo.level}
                                </h2>
                            </div>
                        ) : (
                            <div
                                className="transition-all duration-700"
                                style={{
                                    opacity: animPhase !== 'enter' ? 1 : 0,
                                    transform: animPhase !== 'enter' ? 'translateY(0)' : 'translateY(12px)',
                                }}
                            >
                                <div className="flex items-center justify-center gap-2 mb-1">
                                    <TrendingUp className="w-4 h-4 text-amber-200/60" />
                                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200/60">
                                        Progreso
                                    </span>
                                </div>
                                <h2 className="text-4xl font-black text-white tracking-tighter">
                                    +{xpGained} XP
                                </h2>
                            </div>
                        )}
                    </div>

                    {/* Level badge + progress */}
                    <div
                        className="rounded-2xl border p-5 mb-5 transition-all duration-700"
                        style={{
                            background: `linear-gradient(135deg, hsla(${goldHue}, ${goldSat - 30}%, 12%, 1) 0%, hsla(${goldHue}, ${goldSat - 40}%, 8%, 1) 100%)`,
                            borderColor: `hsla(${goldHue}, ${goldSat}%, ${goldLight}%, ${goldIntensity * 0.25})`,
                            opacity: animPhase !== 'enter' ? 1 : 0,
                        }}
                    >
                        <div className="flex items-center gap-4 mb-4">
                            {/* Level number box — this is the "cuadrito" that fills with intense gold */}
                            <div
                                className="relative w-16 h-16 rounded-2xl overflow-hidden border transition-all duration-1000 shrink-0"
                                style={{
                                    borderColor: `hsla(${goldHue}, ${goldSat}%, ${goldLight}%, ${goldIntensity * 0.5})`,
                                    boxShadow: `0 0 30px hsla(${goldHue}, ${goldSat}%, ${goldLight}%, ${goldIntensity * 0.2}), inset 0 0 20px hsla(${goldHue}, ${goldSat}%, ${goldLight}%, ${goldIntensity * 0.05})`,
                                }}
                            >
                                {/* Gold fill that rises from bottom */}
                                <div
                                    className="absolute bottom-0 left-0 right-0 transition-all duration-[1400ms] ease-out"
                                    style={{
                                        height: `${fillPercent}%`,
                                        background: `linear-gradient(0deg, hsl(${goldHue}, ${goldSat}%, ${goldLight}%) 0%, hsla(${goldHue}, ${goldSat}%, ${goldLight + 15}%, 0.6) 100%)`,
                                        boxShadow: `0 -4px 20px hsla(${goldHue}, ${goldSat}%, ${goldLight}%, ${goldIntensity * 0.4})`,
                                    }}
                                />
                                {/* Level number overlay */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span
                                        className="text-2xl font-black drop-shadow-md transition-colors duration-1000"
                                        style={{
                                            color: fillPercent > 50
                                                ? `hsl(${goldHue}, 20%, 10%)`
                                                : `hsl(${goldHue}, ${goldSat - 20}%, ${goldLight + 25}%)`,
                                        }}
                                    >
                                        {levelInfo.level}
                                    </span>
                                </div>
                            </div>

                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white">
                                    Nivel {levelInfo.level}
                                </p>
                                <p className="text-xs text-white/40 mt-0.5">
                                    {levelInfo.xp} / {levelInfo.nextLevelXp} XP
                                </p>
                            </div>
                        </div>

                        {/* XP progress bar */}
                        <div className="h-2 rounded-full overflow-hidden bg-black/40">
                            <div
                                className="h-full rounded-full transition-all duration-[1400ms] ease-out"
                                style={{
                                    width: `${fillPercent}%`,
                                    background: `linear-gradient(90deg, hsl(${goldHue}, ${goldSat - 20}%, ${goldLight + 10}%) 0%, hsl(${goldHue}, ${goldSat}%, ${goldLight}%) 100%)`,
                                    boxShadow: `0 0 12px hsla(${goldHue}, ${goldSat}%, ${goldLight}%, ${goldIntensity * 0.5})`,
                                }}
                            />
                        </div>

                        <div className="flex justify-between mt-2">
                            <span className="text-[10px] text-white/30 font-medium">
                                {levelInfo.remainingXp} XP para nivel {levelInfo.level + 1}
                            </span>
                            <span
                                className="text-[10px] font-bold transition-colors duration-700"
                                style={{ color: `hsl(${goldHue}, ${goldSat - 10}%, ${goldLight + 10}%)` }}
                            >
                                {Math.round(fillPercent)}%
                            </span>
                        </div>
                    </div>

                    {/* CTA */}
                    <button
                        onClick={onClose}
                        className="w-full py-3 rounded-xl font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 group"
                        style={{
                            background: animPhase === 'complete'
                                ? `linear-gradient(135deg, hsl(${goldHue}, ${goldSat - 10}%, ${goldLight}%) 0%, hsl(${goldHue + 8}, ${goldSat}%, ${goldLight - 8}%) 100%)`
                                : 'rgba(255,255,255,0.05)',
                            color: animPhase === 'complete' ? `hsl(${goldHue}, 30%, 10%)` : 'rgba(255,255,255,0.4)',
                            boxShadow: animPhase === 'complete'
                                ? `0 8px 24px hsla(${goldHue}, ${goldSat}%, ${goldLight}%, 0.25)`
                                : 'none',
                        }}
                    >
                        Continuar
                        <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                </div>
            </div>
        </div>
    );
};
