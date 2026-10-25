import React, { useEffect, useState } from 'react';
import { PachoteService } from '../../services/PachoteService';
import { myRow, pachoteMoney, standing, toneClass, type PachoteGroup } from '../../lib/pachote';

/** Tarjeta viva de unas cuentas de Pachote en el chat: siempre muestra cómo van ahora, no cuando se envió. */
export const PachoteCard: React.FC<{ gid: string; name: string; uid: string; onOpen: () => void }> = ({ gid, name, uid, onOpen }) => {
    const [group, setGroup] = useState<PachoteGroup | null | undefined>(undefined);
    useEffect(() => PachoteService.watchGroup(gid, setGroup), [gid]);

    const s = group?.summary;
    const mine = myRow(s, uid);
    const st = mine ? standing(mine.bal, mine.lab) : null;

    return (
        <button
            type="button"
            onClick={onOpen}
            disabled={group === null}
            className="w-[min(20rem,calc(100vw-5rem))] text-left rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] p-3 text-gray-100 shadow-lg enabled:hover:border-[var(--lt-accent-border)] transition-colors"
        >
            <p className="text-[10px] font-bold tracking-widest text-[var(--lt-accent)]">💸 CUENTAS · PACHOTE</p>
            <div className="flex items-center gap-2 mt-0.5">
                <span className="text-2xl">{group?.emoji || '💸'}</span>
                <p className="flex-1 min-w-0 text-base font-extrabold leading-tight truncate">{group?.name || name}</p>
            </div>
            {group === null ? (
                <p className="mt-1 text-xs text-gray-400">Estas cuentas ya no están enlazadas al chat.</p>
            ) : !s ? (
                <p className="mt-1 text-xs text-gray-400">{group === undefined ? 'Cargando…' : 'Aún sin resumen: ábrelas en Pachote.'}</p>
            ) : (
                <>
                    <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-gray-400">Total <b className="text-white tabular-nums">{pachoteMoney(s.spent)}</b> · {s.n} {s.n === 1 ? 'gasto' : 'gastos'}</span>
                        {st && (
                            <span className={`ml-auto rounded-full border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${toneClass[st.tone]}`}>
                                {st.label}{st.amount ? ` ${st.amount}` : ''}
                            </span>
                        )}
                    </div>
                    {s.tx.length ? (
                        <p className="mt-1.5 text-xs text-gray-300 truncate">
                            {s.tx[0].from} → {s.tx[0].to} <b className="tabular-nums">{pachoteMoney(s.tx[0].amt)}</b>
                            {s.tx.length > 1 && <span className="text-gray-500"> · y {s.tx.length - 1} {s.tx.length === 2 ? 'pago' : 'pagos'} más</span>}
                        </p>
                    ) : (
                        <p className="mt-1.5 text-xs text-emerald-300">✅ Todo cuadrado</p>
                    )}
                </>
            )}
            {group !== null && <p className="mt-2 text-center text-xs font-bold text-[var(--lt-accent)]">Ver las cuentas ›</p>}
        </button>
    );
};
