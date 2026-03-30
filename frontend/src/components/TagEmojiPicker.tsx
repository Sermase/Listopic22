import React, { useEffect, useRef } from 'react';

const EMOJIS = [
    '🍕','🍔','🍣','🍜','🌮','🍷','🍺','🍰','🥗','🧋',
    '☕','🧁','🥩','🍦','🍫','🍿','🌯','🥐','🧆','🍱',
    '📍','🌍','🏖️','🏔️','🌆','🏠','🏪','🎭','🌳','🎪',
    '⭐','💫','🏆','🥇','🎯','✨','💎','🔥','❤️','👍',
    '🎵','🎬','📚','🎮','🛍️','💪','✈️','🎨','🎉','💡',
];

// Helper: split a tag string into emoji icon + label
export function splitTagEmoji(tag: string): { icon: string; label: string } {
    const chars = [...tag];
    const first = chars[0];
    if (first && first.codePointAt(0)! > 0x2500) {
        const rest = tag.slice(first.length).replace(/^\s+/, '');
        return { icon: first, label: rest };
    }
    return { icon: '', label: tag };
}

// Helper: combine icon + label into stored tag string
export function buildTagString(icon: string, label: string): string {
    const trimmed = label.trim();
    if (!trimmed) return '';
    return icon ? `${icon} ${trimmed}` : trimmed;
}

interface TagEmojiPickerProps {
    onSelect: (emoji: string) => void;
    onClose: () => void;
}

export const TagEmojiPicker: React.FC<TagEmojiPickerProps> = ({ onSelect, onClose }) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    return (
        <div
            ref={ref}
            className="absolute left-0 top-full mt-1 z-50 bg-[#1e253c] border border-white/10 rounded-xl p-2 shadow-xl"
        >
            <div className="grid grid-cols-10 gap-0.5">
                {EMOJIS.map(emoji => (
                    <button
                        key={emoji}
                        type="button"
                        onMouseDown={e => { e.preventDefault(); onSelect(emoji); onClose(); }}
                        className="w-8 h-8 flex items-center justify-center text-base hover:bg-white/10 rounded-lg transition-colors"
                    >
                        {emoji}
                    </button>
                ))}
            </div>
        </div>
    );
};
