import React from 'react';
import { MapPin, MessageSquare, Utensils } from 'lucide-react';

interface PlacePhotoPlaceholderProps {
    className?: string;
    compact?: boolean;
    variant?: 'place' | 'group' | 'review';
}

export const PlacePhotoPlaceholder: React.FC<PlacePhotoPlaceholderProps> = ({ className = '', compact = false, variant = 'place' }) => {
    const config = {
        place: {
            icon: MapPin,
            label: 'Sin foto del lugar',
            gradient: 'from-slate-900 via-slate-800 to-slate-900',
        },
        group: {
            icon: Utensils,
            label: 'Sin foto del grupo',
            gradient: 'from-zinc-950 via-stone-900 to-slate-950',
        },
        review: {
            icon: MessageSquare,
            label: 'Sin foto de reseña',
            gradient: 'from-indigo-950 via-slate-900 to-slate-950',
        },
    }[variant];
    const Icon = config.icon;

    return (
        <div className={`w-full h-full bg-gradient-to-br ${config.gradient} flex items-center justify-center ${className}`}>
            <div className="flex flex-col items-center justify-center text-center px-2">
                <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-2">
                    <Icon className="w-5 h-5 text-white/45" />
                </div>
                {!compact && (
                    <p className="text-[10px] uppercase tracking-wider text-white/45 font-semibold">
                        {config.label}
                    </p>
                )}
            </div>
        </div>
    );
};
