import React from 'react';

interface ProfileStatCardProps {
    label: string;
    value: number | string;
    accent?: 'default' | 'level';
    levelProgressPercent?: number;
    onClick: () => void;
}

export const ProfileStatCard: React.FC<ProfileStatCardProps> = ({
    label,
    value,
    accent = 'default',
    levelProgressPercent = 0,
    onClick,
}) => (
    <button
        type="button"
        onClick={onClick}
        className={`group relative flex min-h-[78px] sm:min-h-[108px] min-w-0 flex-col items-center justify-center rounded-2xl border px-1.5 py-2 text-center transition-all hover:-translate-y-0.5 sm:px-3 sm:py-3 ${
            accent === 'level'
                ? 'lt-level-card overflow-hidden border-amber-400/35 bg-[#110804] shadow-[0_18px_40px_rgba(245,158,11,0.18)]'
                : 'lt-stat-card border-white/10 bg-[var(--lt-card-strong)]/80 hover:border-[var(--lt-accent-border)] hover:bg-[var(--lt-card)]'
        }`}
    >
        {accent === 'level' && (
            <>
                <div
                    className="pointer-events-none absolute inset-0"
                    style={{ background: 'rgba(160, 100, 20, 0.10)' }}
                />
                <div
                    className="pointer-events-none absolute bottom-0 left-0 right-0 transition-all duration-1000 ease-out"
                    style={{
                        height: `${levelProgressPercent}%`,
                        background: 'linear-gradient(0deg, hsl(28, 55%, 20%) 0%, hsl(35, 60%, 32%) 60%, hsl(40, 65%, 40%) 100%)',
                        boxShadow: '0 -2px 10px hsla(38, 60%, 35%, 0.30)',
                    }}
                />
            </>
        )}
        <span
            className={`lt-level-label relative z-10 text-[9px] sm:text-[10px] font-black uppercase leading-tight tracking-[0.14em] sm:tracking-[0.22em] ${
                accent === 'level'
                    ? 'text-amber-200/95'
                    : 'lt-stat-label text-gray-500 group-hover:text-gray-300'
            }`}
            style={accent === 'level' ? { textShadow: '0 1px 4px rgba(0,0,0,0.9)' } : undefined}
        >
            {label}
        </span>
        <div className="relative z-10 mt-2 min-w-0 w-full">
            <div
                className={`lt-level-value text-base font-black leading-none sm:text-2xl md:text-3xl ${
                    accent === 'level' ? 'text-white' : 'text-[var(--lt-text)]'
                }`}
                style={accent === 'level' ? { textShadow: '0 1px 6px rgba(0,0,0,0.9)' } : undefined}
            >
                {value}
            </div>
        </div>
    </button>
);
