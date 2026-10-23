import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { ChatSheet } from './ChatSheet';
import { orderedCriteriaEntries } from '../../lib/criteria';
import { formatScore, scoreTextColor } from '../../lib/scoreScale';
import { buildDuelRows, reviewRoute, type ChatInvite, type DuelCriterion, type DuelReview, type DuelRow } from '../../lib/chatExtras';

const fold = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

const millis = (value: unknown): number => {
    const v = value as { toMillis?: () => number; seconds?: number } | null;
    if (v && typeof v.toMillis === 'function') return v.toMillis();
    if (v && typeof v.seconds === 'number') return v.seconds * 1000;
    return 0;
};

/** Las notas de la mesa, criterio a criterio, cara a cara. */
export const DuelModal: React.FC<{
    invite: ChatInvite;
    attendees: string[];
    uid: string;
    nameOf: (uid: string) => string;
    onClose: () => void;
}> = ({ invite, attendees, uid, nameOf, onClose }) => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [columns, setColumns] = useState<string[]>([]);
    const [rows, setRows] = useState<DuelRow[]>([]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!invite.listId || !invite.placeId) { setLoading(false); return; }
            try {
                const [listSnap, reviewsSnap] = await Promise.all([
                    getDoc(doc(db, 'lists', invite.listId)),
                    getDocs(query(
                        collection(db, 'lists', invite.listId, 'reviews'),
                        where('visibility', '==', 'public'),
                        where('placeId', '==', invite.placeId),
                    )),
                ]);
                const target = fold(invite.itemName);
                const latest = new Map<string, DuelReview & { t: number }>();
                reviewsSnap.docs.forEach((d) => {
                    const data = d.data() as Record<string, unknown>;
                    const who = typeof data.userId === 'string' ? data.userId : '';
                    const name = fold(data.itemName);
                    if (!attendees.includes(who) || name !== target) return;
                    const t = millis(data.createdAt);
                    const prev = latest.get(who);
                    if (prev && prev.t >= t) return;
                    latest.set(who, {
                        userId: who,
                        t,
                        overallRating: typeof data.overallRating === 'number' ? data.overallRating : undefined,
                        scores: (data.scores && typeof data.scores === 'object' ? data.scores : {}) as Record<string, unknown>,
                    });
                });
                const ordered = attendees.filter((a) => latest.has(a)).map((a) => latest.get(a)!);
                const criteria = orderedCriteriaEntries((listSnap.data()?.criteriaDefinition || {}) as Record<string, DuelCriterion>);
                if (!cancelled) {
                    setColumns(ordered.map((r) => r.userId));
                    setRows(ordered.length ? buildDuelRows(criteria, ordered) : []);
                }
            } catch (error) {
                console.error('DuelModal: no se pudieron leer las notas', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [invite, attendees]);

    const missing = attendees.filter((a) => !columns.includes(a));
    const iMiss = missing.includes(uid);

    return (
        <ChatSheet title="🥊 Notas de la mesa" onClose={onClose}>
            <p className="text-xs text-gray-400 mb-3">{invite.itemName} · {invite.placeName}</p>
            {loading ? (
                <p className="text-sm text-gray-500 text-center py-6">Cargando notas…</p>
            ) : columns.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Nadie de la mesa lo ha valorado todavía. ¡Estrénate! 😋</p>
            ) : (
                <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-sm border-separate border-spacing-y-1">
                        <thead>
                            <tr>
                                <th className="text-left text-[10px] uppercase tracking-wider text-gray-500 font-bold px-1">Criterio</th>
                                {columns.map((c) => (
                                    <th key={c} className="text-center text-xs font-bold text-white px-1 max-w-[5rem] truncate">{c === uid ? 'Tú' : nameOf(c)}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => {
                                const isOverall = row.id === '__overall';
                                return (
                                    <tr key={row.id} className={isOverall ? 'bg-white/5' : ''}>
                                        <td className={`px-1 py-1 text-xs ${row.informative ? 'italic text-gray-500' : isOverall ? 'font-bold text-white' : 'text-gray-300'}`}>{row.label}</td>
                                        {row.values.map((v, i) => (
                                            <td key={i} className="text-center px-1 py-1">
                                                <span
                                                    className={`${isOverall ? 'text-base' : 'text-sm'} font-bold ${row.best.includes(i) ? 'underline decoration-2 underline-offset-4' : ''}`}
                                                    style={{ color: row.informative ? 'var(--lt-text-muted)' : scoreTextColor(v) }}
                                                >
                                                    {formatScore(v)}{row.best.includes(i) && row.best.length < row.values.length ? ' 👑' : ''}
                                                </span>
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            {!loading && missing.length > 0 && (
                <p className="text-[11px] text-gray-500 mt-3">Falta: {missing.map((m) => (m === uid ? 'tú' : nameOf(m))).join(', ')}</p>
            )}
            {!loading && iMiss && (
                <button type="button" onClick={() => navigate(reviewRoute(invite))} className="w-full mt-3 py-3 rounded-xl font-bold text-white bg-[var(--lt-accent)]">⭐ Valorar ahora</button>
            )}
        </ChatSheet>
    );
};
