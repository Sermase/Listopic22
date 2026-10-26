import React, { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { orderedCriteriaEntries } from '../../lib/criteria';
import { formatScore, scoreTextColor } from '../../lib/scoreScale';
import {
    buildDuelRows,
    buildPlaceDuelRows,
    latestByUser,
    type ChatInvite,
    type DuelCriterion,
    type DuelRow,
    type PlaceReviewLike,
} from '../../lib/chatExtras';

/**
 * Las notas de la mesa cara a cara. Con plato: criterio a criterio (de su
 * lista). Sin plato: cada plato del sitio que haya valorado alguien de la mesa.
 * A ciegas: las de los demás solo se ven después de valorar tú.
 */
export const DuelTable: React.FC<{
    invite: ChatInvite;
    attendees: string[];
    uid: string;
    nameOf: (uid: string) => string;
    placeReviews: PlaceReviewLike[] | null;
    onRate?: () => void;
}> = ({ invite, attendees, uid, nameOf, placeReviews, onRate }) => {
    const [state, setState] = useState<{ loading: boolean; columns: string[]; rows: DuelRow[] }>({ loading: true, columns: [], rows: [] });
    const attendeesKey = attendees.join(',');

    useEffect(() => {
        let cancelled = false;
        const users = attendeesKey.split(',').filter(Boolean);
        (async () => {
            try {
                if (!invite.placeId) {
                    if (!cancelled) setState({ loading: false, columns: [], rows: [] });
                } else if (invite.itemName && invite.listId) {
                    const [listSnap, reviewsSnap] = await Promise.all([
                        getDoc(doc(db, 'lists', invite.listId)),
                        getDocs(query(
                            collection(db, 'lists', invite.listId, 'reviews'),
                            where('visibility', '==', 'public'),
                            where('placeId', '==', invite.placeId),
                        )),
                    ]);
                    const reviews = reviewsSnap.docs.map((d) => d.data() as PlaceReviewLike);
                    const latest = latestByUser(reviews, users, invite.itemName);
                    const columns = users.filter((u) => latest.has(u));
                    const criteria = orderedCriteriaEntries((listSnap.data()?.criteriaDefinition || {}) as Record<string, DuelCriterion>);
                    const rows = columns.length ? buildDuelRows(criteria, columns.map((u) => ({ ...latest.get(u)!, userId: u }))) : [];
                    if (!cancelled) setState({ loading: false, columns, rows });
                } else if (placeReviews) {
                    const reviewers = new Set(Array.from(latestByUser(placeReviews, users).values()).map((r) => r.userId));
                    const columns = users.filter((u) => reviewers.has(u));
                    const rows = buildPlaceDuelRows(placeReviews, columns);
                    if (!cancelled) setState({ loading: false, columns, rows });
                }
            } catch (error) {
                console.error('Notas de la mesa:', error);
                if (!cancelled) setState({ loading: false, columns: [], rows: [] });
            }
        })();
        return () => { cancelled = true; };
    }, [invite.itemName, invite.listId, invite.placeId, attendeesKey, placeReviews]);

    const missing = attendees.filter((a) => !state.columns.includes(a));

    if (state.loading) return <p className="text-sm text-gray-500 text-center py-4">Cargando notas…</p>;
    if (!state.columns.includes(uid)) {
        const others = state.columns.filter((c) => c !== uid);
        return (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-center" data-testid="duel-locked">
                <p className="text-3xl">🙈</p>
                <p className="mt-1 text-sm font-bold text-white">
                    {others.length ? `${others.length} de la mesa ya ${others.length === 1 ? 'ha' : 'han'} valorado` : 'Nadie de la mesa ha valorado todavía'}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                    {others.length
                        ? `${others.map(nameOf).join(', ')}. Sus notas se destapan cuando pongas la tuya, a ciegas.`
                        : 'Pon tu nota a ciegas: verás las de los demás según vayan valorando.'}
                </p>
                {onRate && (
                    <button type="button" onClick={onRate} className="mt-3 w-full py-2.5 rounded-xl text-sm font-bold bg-emerald-500 text-white">⭐ Valorar y ver las notas</button>
                )}
            </div>
        );
    }

    return (
        <div>
            <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm border-separate border-spacing-y-1">
                    <thead>
                        <tr>
                            <th className="text-left text-[10px] uppercase tracking-wider text-gray-500 font-bold px-1">{invite.itemName ? 'Criterio' : 'Plato'}</th>
                            {state.columns.map((c) => (
                                <th key={c} className="text-center text-xs font-bold text-white px-1 max-w-[5rem] truncate">{c === uid ? 'Tú' : nameOf(c)}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {state.rows.map((row) => {
                            const isOverall = row.id === '__overall';
                            const crown = row.best.length > 0 && row.best.length < row.values.filter((v) => v !== null).length;
                            return (
                                <tr key={row.id} className={isOverall ? 'bg-white/5' : ''}>
                                    <td className={`px-1 py-1 text-xs ${row.informative ? 'italic text-gray-500' : isOverall ? 'font-bold text-white' : 'text-gray-300'}`}>{row.label}</td>
                                    {row.values.map((v, i) => (
                                        <td key={i} className="text-center px-1 py-1">
                                            <span
                                                className={`${isOverall ? 'text-base' : 'text-sm'} font-bold`}
                                                style={{ color: row.informative ? 'var(--lt-text-muted)' : scoreTextColor(v) }}
                                            >
                                                {formatScore(v)}{crown && row.best.includes(i) ? ' 👑' : ''}
                                            </span>
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {missing.length > 0 && (
                <p className="text-[11px] text-gray-500 mt-2">Falta: {missing.map((m) => (m === uid ? 'tú' : nameOf(m))).join(', ')}</p>
            )}
        </div>
    );
};
