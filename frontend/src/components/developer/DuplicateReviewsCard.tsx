import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { collectionGroup, getDocs, limit, orderBy, query, startAfter, documentId, type QueryConstraint, type QueryDocumentSnapshot, type QuerySnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { Copy, RefreshCw } from 'lucide-react';
import { groupDuplicateReviews, type DuplicateGroup } from '../../lib/reviewUniqueness';

interface ReviewRow {
    id: string;
    path: string;
    userId?: string;
    authorName?: string;
    listId?: string;
    sublistId?: string | null;
    visibility?: string;
    placeId?: string;
    placeName?: string;
    establishmentName?: string;
    itemName?: string;
    overallRating?: number;
    createdAt?: { toDate?: () => Date };
}

const PAGE = 100; // las reglas no dejan pedir más de 100 por consulta

/** Solo lectura: lista las reseñas repetidas (misma persona y mismo plato). No borra nada. */
export const DuplicateReviewsCard: React.FC = () => {
    const [busy, setBusy] = useState(false);
    const [scanned, setScanned] = useState<number | null>(null);
    const [groups, setGroups] = useState<DuplicateGroup<ReviewRow>[]>([]);
    const [error, setError] = useState<string | null>(null);

    const scan = async () => {
        setBusy(true);
        setError(null);
        try {
            const rows: ReviewRow[] = [];
            let last: QueryDocumentSnapshot | null = null;
            for (;;) {
                const constraints: QueryConstraint[] = [orderBy(documentId()), ...(last ? [startAfter(last)] : []), limit(PAGE)];
                const snap: QuerySnapshot = await getDocs(query(collectionGroup(db, 'reviews'), ...constraints));
                snap.docs.forEach((d) => {
                    if (d.ref.path.startsWith('lists/')) rows.push({ id: d.id, path: d.ref.path, ...(d.data() as Omit<ReviewRow, 'id' | 'path'>) });
                });
                if (snap.docs.length < PAGE) break;
                last = snap.docs[snap.docs.length - 1];
            }
            setScanned(rows.length);
            setGroups(groupDuplicateReviews(rows.map((r) => ({ ...r, listId: r.listId || r.path.split('/')[1] }))));
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const extra = groups.reduce((sum, g) => sum + g.reviews.length - 1, 0);

    return (
        <div className="p-4 rounded-xl border border-white/10 bg-black/20 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2"><Copy className="w-4 h-4 text-amber-300" /> Reseñas repetidas</h4>
                    <p className="text-xs text-gray-400">Misma persona y mismo plato en la misma lista. Solo muestra; no borra nada.</p>
                </div>
                <button
                    type="button"
                    onClick={scan}
                    disabled={busy}
                    className="px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-200 text-sm font-bold disabled:opacity-50 flex items-center gap-2"
                >
                    <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /> Buscar
                </button>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            {scanned !== null && (
                <p className="text-sm text-gray-300">
                    {scanned} reseñas revisadas · <strong className="text-white">{groups.length}</strong> platos repetidos ({extra} de sobra).
                </p>
            )}
            {groups.length > 0 && (
                <ul className="space-y-2">
                    {groups.map((g) => {
                        const first = g.reviews[0];
                        return (
                            <li key={g.key} className="rounded-lg bg-white/5 p-3 text-xs text-gray-300">
                                <div className="font-bold text-white">
                                    {first.authorName || first.userId} · {first.itemName} · {first.placeName || first.establishmentName}
                                    {first.placeId && first.itemName && (
                                        <Link to={`/group/${first.placeId}/${encodeURIComponent(first.itemName)}`} className="ml-2 text-[var(--lt-accent)] underline">ver</Link>
                                    )}
                                </div>
                                <div className="mt-1 space-y-0.5 text-gray-400">
                                    {g.reviews.map((r) => (
                                        <div key={r.path} className="font-mono break-all">
                                            {r.createdAt?.toDate?.().toLocaleDateString('es-ES') || '¿?'} · {typeof r.overallRating === 'number' ? r.overallRating.toFixed(1) : '–'} · {r.path}
                                        </div>
                                    ))}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};
