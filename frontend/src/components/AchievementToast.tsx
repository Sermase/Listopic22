import React, { useEffect, useState } from 'react';
import { Award, X } from 'lucide-react';

interface AchievementToastProps {
    isVisible: boolean;
    onDismiss: () => void;
    badgeName: string;
    badgeEmoji?: string;
    badgeDescription?: string;
    xpReward?: number;
}

/**
 * Subtle but stylish toast for badge achievements.
 * Slides in from the top with a golden glow, auto-dismisses.
 */
export const AchievementToast: React.FC<AchievementToastProps> = ({
    isVisible,
    onDismiss,
    badgeName,
    badgeEmoji,
    badgeDescription,
    xpReward,
}) => {
    const [phase, setPhase] = useState<'hidden' | 'entering' | 'visible' | 'leaving'>('hidden');

    useEffect(() => {
        if (isVisible) {
            setPhase('entering');
            const t1 = window.setTimeout(() => {
                setPhase('visible');
                import('canvas-confetti').then((confetti) => {
                    confetti.default({
                        particleCount: 75,
                        spread: 70,
                        origin: { y: 0 },
                        colors: ['#FFD700', '#FFA500', '#FF8C00']
                    });
                });
                if (navigator.vibrate) navigator.vibrate([20, 10, 20]);
            }, 50);
            const t2 = window.setTimeout(() => setPhase('leaving'), 5000);
            const t3 = window.setTimeout(() => {
                setPhase('hidden');
                onDismiss();
            }, 5500);
            return () => {
                window.clearTimeout(t1);
                window.clearTimeout(t2);
                window.clearTimeout(t3);
            };
        } else {
            setPhase('hidden');
        }
    }, [isVisible, onDismiss]);

    if (phase === 'hidden') return null;

    const isShowing = phase === 'visible';

    return (
        <div
            className="fixed top-4 left-1/2 z-[210] pointer-events-auto max-w-sm w-[calc(100vw-2rem)]"
            style={{
                transform: isShowing
                    ? 'translate(-50%, 0) scale(1)'
                    : phase === 'leaving'
                        ? 'translate(-50%, -20px) scale(0.95)'
                        : 'translate(-50%, -40px) scale(0.9)',
                opacity: isShowing ? 1 : 0,
                transition: phase === 'leaving'
                    ? 'all 500ms cubic-bezier(0.4, 0, 1, 1)'
                    : 'all 500ms cubic-bezier(0, 0, 0.2, 1)',
            }}
        >
            <div
                className="relative overflow-hidden rounded-2xl border backdrop-blur-xl shadow-2xl"
                style={{
                    background: 'linear-gradient(135deg, rgba(30, 22, 8, 0.95) 0%, rgba(16, 14, 10, 0.95) 100%)',
                    borderColor: 'rgba(200, 160, 60, 0.25)',
                    boxShadow: '0 0 40px rgba(180, 130, 20, 0.12), 0 20px 40px rgba(0,0,0,0.4)',
                }}
            >
                {/* Shimmer sweep */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background: isShowing
                            ? 'linear-gradient(105deg, transparent 30%, rgba(255,200,60,0.06) 50%, transparent 70%)'
                            : 'none',
                        animation: isShowing ? 'shimmer-sweep 2s ease-in-out 0.5s' : 'none',
                    }}
                />

                <div className="relative flex items-center gap-3 px-4 py-3.5">
                    {/* Badge icon */}
                    <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-700"
                        style={{
                            background: 'linear-gradient(135deg, rgba(200,160,40,0.15) 0%, rgba(200,160,40,0.05) 100%)',
                            borderColor: 'rgba(200,160,40,0.2)',
                            boxShadow: isShowing ? '0 0 20px rgba(200,160,40,0.15)' : 'none',
                        }}
                    >
                        {badgeEmoji ? (
                            <span className="text-xl">{badgeEmoji}</span>
                        ) : (
                            <Award className="w-5 h-5 text-amber-400" />
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-400/60">
                                Logro desbloqueado
                            </span>
                        </div>
                        <p className="text-sm font-bold text-white truncate mt-0.5">
                            {badgeName}
                        </p>
                        {badgeDescription && (
                            <p className="text-[11px] text-white/40 truncate mt-0.5">
                                {badgeDescription}
                            </p>
                        )}
                    </div>

                    {xpReward && xpReward > 0 && (
                        <div className="shrink-0 text-right">
                            <span className="text-xs font-black text-amber-400/70">
                                +{xpReward} XP
                            </span>
                        </div>
                    )}

                    <button
                        onClick={() => {
                            setPhase('leaving');
                            window.setTimeout(() => {
                                setPhase('hidden');
                                onDismiss();
                            }, 500);
                        }}
                        className="shrink-0 p-1 rounded-md text-white/20 hover:text-white/60 hover:bg-white/5 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
};
