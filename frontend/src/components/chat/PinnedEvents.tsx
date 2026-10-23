import React, { useState } from 'react';
import { ChevronDown, Pin } from 'lucide-react';
import { countdownLabel, formatWhen, type PinnedEvent } from '../../lib/chatExtras';

/** Quedadas abiertas fijadas arriba del chat hasta que llega el día. */
export const PinnedEvents: React.FC<{ events: Array<{ id: string } & PinnedEvent>; onOpen: (id: string) => void }> = ({ events, onOpen }) => {
    const [expanded, setExpanded] = useState(false);
    if (!events.length) return null;
    const shown = expanded ? events : events.slice(0, 1);

    return (
        <div className="border-b border-white/10 bg-[var(--lt-card-strong)]/95 backdrop-blur px-3 py-2 space-y-1.5">
            {shown.map((e) => (
                <button
                    key={e.id}
                    type="button"
                    onClick={() => onOpen(e.id)}
                    className="w-full flex items-center gap-3 rounded-2xl bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] px-2.5 py-2 text-left"
                >
                    {e.imageUrl
                        ? <img src={e.imageUrl} alt="" className="w-9 h-9 rounded-xl object-cover shrink-0" />
                        : <span className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">🍽️</span>}
                    <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--lt-accent)]">
                            <Pin className="w-3 h-3" /> {countdownLabel(e.when)}
                        </span>
                        <span className="block text-sm font-bold text-white truncate">{e.title}</span>
                    </span>
                    <span className="text-xs font-semibold text-gray-200 shrink-0">{formatWhen(e.when)}</span>
                </button>
            ))}
            {events.length > 1 && (
                <button type="button" onClick={() => setExpanded((v) => !v)} className="w-full flex items-center justify-center gap-1 text-[11px] text-gray-400">
                    {expanded ? 'Ver menos' : `+${events.length - 1} ${events.length === 2 ? 'quedada más' : 'quedadas más'}`}
                    <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
            )}
        </div>
    );
};
