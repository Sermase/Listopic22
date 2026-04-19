import React from 'react';

interface NonPonderableGaugeProps {
    score: number;
    label: string;
    size?: number;
}

export const NonPonderableGauge: React.FC<NonPonderableGaugeProps> = ({ score, label, size = 80 }) => {
    // Calculate circle properties
    const strokeWidth = 6;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;

    // Score is 0-10, map to percentage
    const percentage = Math.min(100, Math.max(0, (score / 10) * 100));
    const offset = circumference - (percentage / 100) * circumference;

    // Determine color based on score (Optional: can be neutral or dynamic)
    const getColor = (s: number) => {
        if (s >= 8) return 'text-emerald-400';
        if (s >= 6) return 'text-[var(--lt-accent)]';
        if (s >= 4) return 'text-yellow-400';
        return 'text-rose-400';
    };

    const colorClass = getColor(score);

    return (
        <div className="flex flex-col items-center justify-center p-3 bg-[#1e2538] rounded-2xl border border-white/5 shadow-sm hover:border-white/10 transition-all group">
            <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
                {/* Background Circle */}
                <svg className="w-full h-full transform -rotate-90">
                    <circle
                        className="text-gray-700"
                        strokeWidth={strokeWidth}
                        stroke="currentColor"
                        fill="transparent"
                        r={radius}
                        cx={size / 2}
                        cy={size / 2}
                        opacity={0.3}
                    />
                    {/* Progress Circle */}
                    <circle
                        className={`${colorClass} transition-all duration-1000 ease-out`}
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="transparent"
                        r={radius}
                        cx={size / 2}
                        cy={size / 2}
                    />
                </svg>

                {/* Score Number */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-xl font-bold font-mono ${colorClass}`}>
                        {score % 1 === 0 ? score : score.toFixed(1)}
                    </span>
                    <span className="text-[9px] text-gray-500 uppercase font-bold">/10</span>
                </div>
            </div>

            {/* Label */}
            <span className="mt-3 text-xs font-medium text-gray-300 text-center line-clamp-2 px-1 leading-tight group-hover:text-white transition-colors">
                {label}
            </span>
        </div>
    );
};
