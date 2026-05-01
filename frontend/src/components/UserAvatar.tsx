import React, { useEffect, useState } from 'react';

interface UserAvatarProps {
    photoUrl?: string | null;
    displayName?: string;
    userType?: string | string[];
    size?: 'xs' | 'sm' | 'md' | 'lg';
    className?: string;
}

type GradientDef = { classes: string; style?: React.CSSProperties };

const GRADIENT: Record<string, GradientDef> = {
    jefe:    { classes: 'from-emerald-400 via-green-400 to-teal-400' },
    critico: { classes: 'from-yellow-400 via-amber-400 to-orange-400' },
    bot:     { classes: 'from-slate-300 via-gray-300 to-zinc-400' },
    default: { classes: '', style: { backgroundImage: 'var(--lt-accent-grad)' } },
};

const SIZES = {
    xs: { wrap: 'w-6 h-6',   img: 'w-6 h-6',   pad: 'p-[1.5px]', text: 'text-[9px]' },
    sm: { wrap: 'w-8 h-8',   img: 'w-8 h-8',   pad: 'p-[2px]',   text: 'text-xs' },
    md: { wrap: 'w-10 h-10', img: 'w-10 h-10', pad: 'p-[2px]',   text: 'text-sm' },
    lg: { wrap: 'w-14 h-14', img: 'w-14 h-14', pad: 'p-[2.5px]', text: 'text-base' },
};

export function getUserTypeGradient(userType?: string | string[]): GradientDef {
    const types: string[] = Array.isArray(userType)
        ? userType
        : userType ? [userType] : [];
    if (types.includes('jefe'))    return GRADIENT.jefe;
    if (types.includes('critico')) return GRADIENT.critico;
    if (types.includes('bot'))     return GRADIENT.bot;
    return GRADIENT.default;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
    photoUrl,
    displayName,
    userType,
    size = 'md',
    className = '',
}) => {
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const grad = getUserTypeGradient(userType);
    const s = SIZES[size];
    const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || 'U')}&background=374151&color=fff`;
    const imageSrc = photoUrl && photoUrl !== failedSrc ? photoUrl : fallback;
    const gradClass = grad.classes ? `bg-gradient-to-tr ${grad.classes}` : '';

    useEffect(() => {
        setFailedSrc(null);
    }, [photoUrl]);

    return (
        <div className={`relative shrink-0 ${s.wrap} ${className}`}>
            {/* Glow blur */}
            <div
                className={`absolute inset-0 rounded-full opacity-70 blur-[3px] ${gradClass}`}
                style={grad.style}
            />
            {/* Ring + image */}
            <div
                className={`relative ${s.wrap} rounded-full ${s.pad} ${gradClass}`}
                style={grad.style}
            >
                <div className="w-full h-full rounded-full overflow-hidden bg-[var(--lt-card-strong)]">
                    <img
                        src={imageSrc}
                        alt={displayName || 'Usuario'}
                        onError={() => {
                            if (photoUrl) setFailedSrc(photoUrl);
                        }}
                        className="w-full h-full object-cover block"
                    />
                </div>
            </div>
        </div>
    );
};
