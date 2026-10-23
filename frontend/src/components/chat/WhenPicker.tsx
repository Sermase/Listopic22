import React, { useState } from 'react';
import { fromDatetimeLocal, quickWhenOptions, toDatetimeLocal } from '../../lib/chatExtras';

/** Atajos («Mañana 14:00») y, si no vale ninguno, fecha y hora a mano. */
export const WhenPicker: React.FC<{ value: number | null; onChange: (ms: number | null) => void }> = ({ value, onChange }) => {
    const [now] = useState(() => Date.now());
    const options = quickWhenOptions(now);
    return (
        <div>
            <div className="flex flex-wrap gap-1.5 mb-2">
                {options.map((o) => (
                    <button
                        key={o.label}
                        type="button"
                        onClick={() => onChange(o.ms)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${value === o.ms
                            ? 'bg-[var(--lt-accent)] border-transparent text-white'
                            : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}`}
                    >
                        {o.label}
                    </button>
                ))}
            </div>
            <input
                type="datetime-local"
                value={value ? toDatetimeLocal(value) : ''}
                min={toDatetimeLocal(now)}
                onChange={(e) => onChange(fromDatetimeLocal(e.target.value))}
                className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--lt-accent-border)] [color-scheme:dark]"
            />
        </div>
    );
};
