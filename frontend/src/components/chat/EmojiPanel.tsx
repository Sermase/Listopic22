import React, { useState } from 'react';
import { EMOJI_GROUPS } from '../../lib/chatExtras';

/** Panel de emojis sobre el campo de texto. No abre el teclado. */
export const EmojiPanel: React.FC<{ onPick: (emoji: string) => void }> = ({ onPick }) => {
    const [tab, setTab] = useState(0);
    return (
        <div className="border-t border-white/10 bg-[var(--lt-card-strong)] px-3 pt-2 pb-1">
            <div className="flex gap-1 mb-1.5">
                {EMOJI_GROUPS.map((g, i) => (
                    <button
                        key={g.label}
                        type="button"
                        onClick={() => setTab(i)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${tab === i ? 'bg-white/10 text-white' : 'text-gray-400'}`}
                    >
                        {g.label}
                    </button>
                ))}
            </div>
            <div className="grid grid-cols-8 md:grid-cols-10 gap-0.5 max-h-40 overflow-y-auto">
                {EMOJI_GROUPS[tab].emojis.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => onPick(emoji)} className="text-2xl leading-none p-1.5 rounded-lg hover:bg-white/10 active:scale-110">
                        {emoji}
                    </button>
                ))}
            </div>
        </div>
    );
};
