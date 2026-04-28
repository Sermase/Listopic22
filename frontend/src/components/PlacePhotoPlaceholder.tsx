import React from 'react';
import { MapPin } from 'lucide-react';

interface PlacePhotoPlaceholderProps {
    className?: string;
    compact?: boolean;
}

export const PlacePhotoPlaceholder: React.FC<PlacePhotoPlaceholderProps> = ({ className = '', compact = false }) => {
    return (
        <div className={`w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center ${className}`}>
            <div className="flex flex-col items-center justify-center text-center px-2">
                <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-2">
                    <MapPin className="w-5 h-5 text-white/45" />
                </div>
                {!compact && (
                    <p className="text-[10px] uppercase tracking-wider text-white/45 font-semibold">
                        Sin foto del lugar
                    </p>
                )}
            </div>
        </div>
    );
};
