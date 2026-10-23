import React, { useState } from 'react';
import { X } from 'lucide-react';
import { ChatSheet } from './ChatSheet';
import { DishPicker } from './DishPicker';
import { DishRow } from './DishRow';
import type { DishRef } from '../../lib/chatExtras';

const MAX_OPTIONS = 4;

/** «¿Dónde comemos?»: de 2 a 4 platos para votar. */
export const PollSheet: React.FC<{ onClose: () => void; onSend: (options: DishRef[]) => Promise<void> }> = ({ onClose, onSend }) => {
    const [options, setOptions] = useState<DishRef[]>([]);
    const [sending, setSending] = useState(false);

    return (
        <ChatSheet title="🗳️ ¿Dónde comemos?" onClose={onClose}>
            <p className="text-xs text-gray-400 mb-3">Elige de 2 a 4 sitios y que vote la mesa.</p>
            <div className="space-y-1.5 mb-3">
                {options.map((dish, i) => (
                    <div key={i} className="rounded-xl bg-white/5 border border-white/10 p-2">
                        <DishRow
                            dish={dish}
                            trailing={(
                                <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))} className="p-1 text-gray-400 hover:text-white" aria-label="Quitar">
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        />
                    </div>
                ))}
            </div>
            {options.length < MAX_OPTIONS && (
                <DishPicker exclude={options} onPick={(dish) => setOptions([...options, dish])} />
            )}
            <button
                type="button"
                disabled={options.length < 2 || sending}
                onClick={async () => {
                    setSending(true);
                    try { await onSend(options); onClose(); } finally { setSending(false); }
                }}
                className="w-full mt-5 py-3 rounded-xl font-bold text-white bg-[var(--lt-accent)] disabled:opacity-40"
            >
                {sending ? 'Enviando…' : options.length < 2 ? 'Elige al menos 2' : 'Enviar encuesta'}
            </button>
        </ChatSheet>
    );
};
