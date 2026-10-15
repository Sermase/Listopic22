import React, { useMemo } from 'react';
import { Stamp } from 'lucide-react';

interface PassportReview {
    placeId?: string;
    listCategoryName?: string;
    listCategory?: string;
    categoryId?: string;
    category?: string;
}

// Umbrales de sellos: bronce, plata y oro por sitios distintos reseñados.
const LEVELS = [
    { min: 10, label: 'Oro', className: 'border-amber-400/50 bg-amber-400/15 text-amber-200', ring: '#f59e0b' },
    { min: 5, label: 'Plata', className: 'border-slate-300/40 bg-slate-300/10 text-slate-200', ring: '#cbd5e1' },
    { min: 3, label: 'Bronce', className: 'border-orange-700/50 bg-orange-700/15 text-orange-300', ring: '#c2410c' },
] as const;

const CATEGORY_EMOJI: Array<[RegExp, string]> = [
    [/pizza/i, '🍕'], [/hamburg/i, '🍔'], [/sushi|japon/i, '🍣'], [/ramen|noodle/i, '🍜'],
    [/tarta|postre|dulce|pastel/i, '🍰'], [/café|cafe|brunch/i, '☕'], [/tapa|bar\b/i, '🍢'],
    [/vino|bodega/i, '🍷'], [/cerveza|birra/i, '🍺'], [/coctel|cóctel|copas/i, '🍸'],
    [/marisco|pescado/i, '🦐'], [/carne|asador|parrilla/i, '🥩'], [/taco|mexic/i, '🌮'],
    [/helado/i, '🍨'], [/pan|bolleria|bollería/i, '🥐'], [/veget|vegan/i, '🥗'],
];

const emojiFor = (category: string): string => {
    const match = CATEGORY_EMOJI.find(([pattern]) => pattern.test(category));
    return match ? match[1] : '🍽️';
};

const categoryOf = (review: PassportReview): string => String(
    review.listCategoryName || review.listCategory || review.category || review.categoryId || '',
).trim();

// Pasaporte de sabores: sellos por categoría según los sitios DISTINTOS que
// has reseñado. Se muestra solo en tu propio perfil (flag showTastePassport).
export const TastePassport: React.FC<{ reviews: PassportReview[] }> = ({ reviews }) => {
    const stamps = useMemo(() => {
        const placesByCategory = new Map<string, Set<string>>();
        reviews.forEach((review) => {
            const category = categoryOf(review);
            if (!category || !review.placeId) return;
            const key = category.toLowerCase();
            if (!placesByCategory.has(key)) placesByCategory.set(key, new Set());
            placesByCategory.get(key)!.add(review.placeId);
        });

        return Array.from(placesByCategory.entries())
            .map(([key, places]) => {
                const count = places.size;
                const level = LEVELS.find((entry) => count >= entry.min) || null;
                const next = [...LEVELS].reverse().find((entry) => count < entry.min) || null;
                const label = key.charAt(0).toUpperCase() + key.slice(1);
                return { key, label, count, level, next, emoji: emojiFor(key) };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 12);
    }, [reviews]);

    if (stamps.length === 0) return null;

    return (
        <div className="mb-4 rounded-2xl border border-amber-300/20 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-amber-500/10 p-4">
            <div className="mb-3 flex items-center gap-2">
                <Stamp className="h-4 w-4 text-amber-300" />
                <h3 className="text-sm font-black uppercase tracking-wider text-white">Pasaporte de sabores</h3>
                <span className="ml-auto text-[11px] text-gray-400">{stamps.length} categoría{stamps.length === 1 ? '' : 's'}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {stamps.map((stamp) => (
                    <div
                        key={stamp.key}
                        className={`relative rounded-2xl border px-2 py-3 text-center ${
                            stamp.level ? stamp.level.className : 'border-white/10 bg-white/5 text-gray-400'
                        }`}
                        title={stamp.level
                            ? `Sello de ${stamp.level.label}: ${stamp.count} sitios de ${stamp.label}`
                            : `${stamp.count} de ${stamp.next?.min ?? 3} sitios para el sello de ${stamp.label}`}
                    >
                        <div className="text-2xl leading-none" style={stamp.level ? { filter: `drop-shadow(0 0 6px ${stamp.level.ring}66)` } : { opacity: 0.75 }}>
                            {stamp.emoji}
                        </div>
                        <p className="mt-1.5 truncate text-[10px] font-bold uppercase tracking-wide">{stamp.label}</p>
                        <p className="text-[10px] opacity-80">
                            {stamp.level
                                ? `${stamp.level.label} · ${stamp.count}`
                                : `${stamp.count}/${stamp.next?.min ?? 3}`}
                        </p>
                    </div>
                ))}
            </div>
            <p className="mt-3 text-center text-[10px] uppercase tracking-wider text-gray-500">
                Bronce 3 · Plata 5 · Oro 10 sitios distintos por categoría
            </p>
        </div>
    );
};
