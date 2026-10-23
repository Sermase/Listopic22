import React, { useState } from 'react';
import { X } from 'lucide-react';
import { ChatSheet } from './ChatSheet';
import { CalendarPicker } from './CalendarPicker';
import { DishPicker } from './DishPicker';
import { DishRow } from './DishRow';
import { formatWhen, type PlaceRef } from '../../lib/chatExtras';

const MAX_DATES = 6;

/** Crear el «¿Cuándo quedamos?»: varias fechas y, si se quiere, el sitio. */
export const DatePollSheet: React.FC<{
    onClose: () => void;
    onSend: (whens: number[], place: PlaceRef | null) => Promise<void>;
}> = ({ onClose, onSend }) => {
    const [whens, setWhens] = useState<number[]>([]);
    const [draft, setDraft] = useState<number | null>(null);
    const [place, setPlace] = useState<PlaceRef | null>(null);
    const [pickingPlace, setPickingPlace] = useState(false);
    const [sending, setSending] = useState(false);

    const added = draft !== null && whens.includes(draft);
    const add = () => {
        if (draft === null || added || whens.length >= MAX_DATES) return;
        setWhens((list) => [...list, draft].sort((a, b) => a - b));
    };
    const send = async () => {
        setSending(true);
        try {
            await onSend(whens, place);
            onClose();
        } finally {
            setSending(false);
        }
    };

    return (
        <ChatSheet title="📅 ¿Cuándo quedamos?" onClose={onClose}>
            <p className="text-xs text-gray-400 mb-3">Propón varias fechas y que cada uno marque las que le valen.</p>

            {whens.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {whens.map((w) => (
                        <span key={w} className="flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] text-xs font-semibold text-white">
                            {formatWhen(w)}
                            <button type="button" onClick={() => setWhens((list) => list.filter((x) => x !== w))} aria-label={`Quitar ${formatWhen(w)}`} className="p-0.5 rounded-full hover:bg-white/10">
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            <CalendarPicker value={draft} onChange={setDraft} />
            <button
                type="button"
                onClick={add}
                disabled={draft === null || added || whens.length >= MAX_DATES}
                className="mt-2 w-full py-2.5 rounded-xl bg-white/10 text-white text-sm font-bold disabled:opacity-40"
            >
                {whens.length >= MAX_DATES ? `Máximo ${MAX_DATES} fechas` : added ? '✓ Añadida' : draft !== null ? `＋ Añadir ${formatWhen(draft)}` : 'Elige día y hora'}
            </button>

            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mt-5 mb-2">¿Dónde? <span className="normal-case font-normal">(opcional)</span></p>
            {place ? (
                <div className="rounded-xl bg-white/5 border border-white/10 p-2">
                    <DishRow
                        dish={{ ...place, itemName: place.itemName || 'Lo que surja' }}
                        trailing={<button type="button" onClick={() => setPlace(null)} className="text-xs text-[var(--lt-accent)] font-semibold px-2">Quitar</button>}
                    />
                </div>
            ) : pickingPlace ? (
                <DishPicker onPick={(dish) => { setPlace(dish); setPickingPlace(false); }} />
            ) : (
                <button type="button" onClick={() => setPickingPlace(true)} className="w-full py-2.5 rounded-xl border border-dashed border-white/15 text-sm text-gray-300 hover:bg-white/5">
                    ＋ Añadir sitio o plato
                </button>
            )}

            <div className="sticky bottom-0 -mx-5 px-5 pt-3 pb-1 mt-4 bg-gradient-to-t from-[var(--lt-card-strong)] via-[var(--lt-card-strong)] to-transparent">
                <button
                    type="button"
                    onClick={send}
                    disabled={whens.length < 2 || sending}
                    className="w-full py-3 rounded-xl font-bold text-white bg-[var(--lt-accent)] disabled:opacity-40 active:scale-[0.98] transition-all"
                >
                    {whens.length < 2 ? 'Añade al menos 2 fechas' : `Enviar · ${whens.length} fechas`}
                </button>
            </div>
        </ChatSheet>
    );
};
