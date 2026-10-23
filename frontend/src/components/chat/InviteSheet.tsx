import React, { useState } from 'react';
import { ChatSheet } from './ChatSheet';
import { DishPicker } from './DishPicker';
import { DishRow } from './DishRow';
import { WhenPicker } from './WhenPicker';
import type { ChatInvite, DishRef } from '../../lib/chatExtras';

/** Crear la invitación: qué, dónde (va con el plato), cuándo y una frase. */
export const InviteSheet: React.FC<{
    initialDish?: DishRef | null;
    onClose: () => void;
    onSend: (invite: ChatInvite) => Promise<void>;
}> = ({ initialDish = null, onClose, onSend }) => {
    const [dish, setDish] = useState<DishRef | null>(initialDish);
    const [when, setWhen] = useState<number | null>(null);
    const [note, setNote] = useState('');
    const [sending, setSending] = useState(false);

    const send = async () => {
        if (!dish || !when) return;
        setSending(true);
        try {
            await onSend({ ...dish, when, note: note.trim() || undefined });
            onClose();
        } finally {
            setSending(false);
        }
    };

    return (
        <ChatSheet title="🍽️ Invitar a comer" onClose={onClose}>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">¿Qué y dónde?</p>
            {dish ? (
                <div className="rounded-xl bg-white/5 border border-white/10 p-2 mb-4">
                    <DishRow
                        dish={dish}
                        trailing={<button type="button" onClick={() => setDish(null)} className="text-xs text-[var(--lt-accent)] font-semibold px-2">Cambiar</button>}
                    />
                </div>
            ) : (
                <div className="mb-4"><DishPicker onPick={setDish} /></div>
            )}

            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">¿Cuándo?</p>
            <WhenPicker value={when} onChange={setWhen} />

            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mt-4 mb-2">Una frase <span className="normal-case font-normal">(opcional)</span></p>
            <input
                type="text"
                value={note}
                maxLength={120}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Pago yo, tú pones la conversación 😎"
                className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--lt-accent-border)]"
            />

            <button
                type="button"
                onClick={send}
                disabled={!dish || !when || sending}
                className="w-full mt-5 py-3 rounded-xl font-bold text-white bg-[var(--lt-accent)] disabled:opacity-40 active:scale-[0.98] transition-all"
            >
                {sending ? 'Enviando…' : 'Enviar invitación'}
            </button>
        </ChatSheet>
    );
};

/** Proponer otra fecha (o cambiarla, si invitas tú). */
export const DateSheet: React.FC<{
    title: string;
    initial?: number;
    onClose: () => void;
    onSend: (when: number) => Promise<void>;
}> = ({ title, initial, onClose, onSend }) => {
    const [when, setWhen] = useState<number | null>(initial ?? null);
    const [sending, setSending] = useState(false);
    return (
        <ChatSheet title={title} onClose={onClose}>
            <WhenPicker value={when} onChange={setWhen} />
            <button
                type="button"
                disabled={!when || sending}
                onClick={async () => {
                    if (!when) return;
                    setSending(true);
                    try { await onSend(when); onClose(); } finally { setSending(false); }
                }}
                className="w-full mt-5 py-3 rounded-xl font-bold text-white bg-[var(--lt-accent)] disabled:opacity-40"
            >
                {sending ? 'Enviando…' : 'Proponer'}
            </button>
        </ChatSheet>
    );
};
