import React from 'react';
import { formatScore, scoreBadgeStyle } from '../../lib/scoreScale';
import type { DishRef } from '../../lib/chatExtras';

/** Fila de plato: foto, nombre, sitio y nota. */
export const DishRow: React.FC<{ dish: DishRef; trailing?: React.ReactNode }> = ({ dish, trailing }) => (
    <div className="flex items-center gap-3 min-w-0">
        {dish.imageUrl ? (
            <img src={dish.imageUrl} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0 bg-white/5" loading="lazy" />
        ) : (
            <div className="w-11 h-11 rounded-lg shrink-0 bg-white/5 flex items-center justify-center text-lg">🍽️</div>
        )}
        <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white truncate">{dish.itemName}</p>
            <p className="text-xs text-gray-400 truncate">{[dish.placeName, dish.placeCity].filter(Boolean).join(' · ')}</p>
        </div>
        {typeof dish.score === 'number' && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-md shrink-0" style={scoreBadgeStyle(dish.score)}>
                {formatScore(dish.score)}
            </span>
        )}
        {trailing}
    </div>
);
