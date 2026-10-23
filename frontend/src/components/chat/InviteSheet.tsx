import React, { useState } from 'react';
import { ChatSheet } from './ChatSheet';
import { DishPicker } from './DishPicker';
import { DishRow } from './DishRow';
import { CalendarPicker } from './CalendarPicker';
import { ChatPicker, type ChatTarget } from './ChatPicker';
import { formatWhen, type ChatInvite, type PlaceRef } from '../../lib/chatExtras';

const Label: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
    <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2 mt-5 first:mt-0">
        <span className="w-5 h-5 rounded-full bg-white/10 text-white flex items-center justify-center text-[10px]">{n}</span>
        {children}
    </p>
);

/**
 * Crear la quedada: (a quién), qué y dónde, cuándo y una frase. Desde el chat
 * se busca el plato; desde un sitio o un plato llega ya puesto.
 */
export const InviteSheet: React.FC<{
    initial?: PlaceRef | null;
    /** Desde compartir: además hay que elegir a quién. */
    pickRecipientFor?: string;
    /** Platos del sitio para concretar (invitación desde la página del sitio). */
    dishOptions?: Array<{ itemName: string; listId?: string }>;
    /** Fecha ya elegida (p. ej. la ganadora del «¿Cuándo quedamos?»). */
    initialWhen?: number;
    onClose: () => void;
    onSend: (invite: ChatInvite, target: ChatTarget | null) => Promise<void>;
}> = ({ initial = null, pickRecipientFor, dishOptions = [], initialWhen, onClose, onSend }) => {
    const [place, setPlace] = useState<PlaceRef | null>(initial);
    const [target, setTarget] = useState<ChatTarget | null>(null);
    const [when, setWhen] = useState<number | null>(initialWhen ?? null);
    const [note, setNote] = useState('');
    const [sending, setSending] = useState(false);
    const fixedPlace = Boolean(initial);
    let step = 0;

    const ready = place && when && (!pickRecipientFor || target);
    const send = async () => {
        if (!place || !when || !ready) return;
        setSending(true);
        try {
            await onSend({ ...place, when, note: note.trim() || undefined }, target);
            onClose();
        } finally {
            setSending(false);
        }
    };

    return (
        <ChatSheet title="🍽️ Invitar a comer" onClose={onClose}>
            {pickRecipientFor && (
                <>
                    <Label n={++step}>¿A quién?</Label>
                    <ChatPicker uid={pickRecipientFor} value={target} onChange={setTarget} />
                </>
            )}

            <Label n={++step}>¿Qué y dónde?</Label>
            {place ? (
                <div className="rounded-xl bg-white/5 border border-white/10 p-2">
                    <DishRow
                        dish={{ ...place, itemName: place.itemName || 'Lo que más os apetezca' }}
                        trailing={!fixedPlace && <button type="button" onClick={() => setPlace(null)} className="text-xs text-[var(--lt-accent)] font-semibold px-2">Cambiar</button>}
                    />
                </div>
            ) : (
                <DishPicker onPick={setPlace} />
            )}
            {place && fixedPlace && dishOptions.length > 0 && (
                <div className="flex gap-1.5 mt-2 overflow-x-auto hide-scrollbar pb-1">
                    {[{ itemName: '', listId: undefined }, ...dishOptions.slice(0, 10)].map(({ itemName: name, listId }) => {
                        const active = (place.itemName || '') === name;
                        return (
                            <button
                                key={name || '_any'}
                                type="button"
                                onClick={() => setPlace({ ...place, itemName: name || undefined, listId: name ? listId : undefined })}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${active ? 'bg-[var(--lt-accent)] border-transparent text-white' : 'bg-white/5 border-white/10 text-gray-300'}`}
                            >
                                {name || '✨ Lo que surja'}
                            </button>
                        );
                    })}
                </div>
            )}

            <Label n={++step}>¿Cuándo?</Label>
            <CalendarPicker value={when} onChange={setWhen} />

            <Label n={++step}>Una frase <span className="normal-case font-normal">(opcional)</span></Label>
            <input
                type="text"
                value={note}
                maxLength={120}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Pago yo, tú pones la conversación 😎"
                className="w-full bg-[var(--lt-bg)] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--lt-accent-border)]"
            />

            <div className="sticky bottom-0 -mx-5 px-5 pt-3 pb-1 mt-4 bg-gradient-to-t from-[var(--lt-card-strong)] via-[var(--lt-card-strong)] to-transparent">
                <button
                    type="button"
                    onClick={send}
                    disabled={!ready || sending}
                    className="w-full py-3 rounded-xl font-bold text-white bg-[var(--lt-accent)] disabled:opacity-40 active:scale-[0.98] transition-all"
                >
                    {sending
                        ? 'Enviando…'
                        : !place ? 'Elige plato o sitio'
                            : !when ? 'Elige día y hora'
                                : pickRecipientFor && !target ? 'Elige a quién'
                                    : `Invitar · ${formatWhen(when)}`}
                </button>
            </div>
        </ChatSheet>
    );
};

/** Proponer otro día (o cambiarlo, si invitas tú). */
export const DateSheet: React.FC<{
    title: string;
    initial?: number;
    cta?: string;
    onClose: () => void;
    onSend: (when: number) => Promise<void>;
}> = ({ title, initial, cta = 'Proponer', onClose, onSend }) => {
    const [when, setWhen] = useState<number | null>(initial ?? null);
    const [sending, setSending] = useState(false);
    return (
        <ChatSheet title={title} onClose={onClose}>
            <CalendarPicker value={when} onChange={setWhen} />
            <button
                type="button"
                disabled={!when || sending || when === initial}
                onClick={async () => {
                    if (!when) return;
                    setSending(true);
                    try { await onSend(when); onClose(); } finally { setSending(false); }
                }}
                className="w-full mt-5 py-3 rounded-xl font-bold text-white bg-[var(--lt-accent)] disabled:opacity-40"
            >
                {sending ? 'Enviando…' : when ? `${cta} · ${formatWhen(when)}` : 'Elige día y hora'}
            </button>
        </ChatSheet>
    );
};
