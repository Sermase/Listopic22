import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { RefreshCw, Trophy } from 'lucide-react';
import { contestDatesLabel, contestPhase, type ContestCandidate, type ContestSettings } from '../../lib/contest';
import { isItemUnavailable } from '../../lib/listElements';
import { setItemAvailability } from '../../services/reportModeration';
import { useToast } from '../../context/ToastContext';

interface ContestRow {
    id: string;
    name: string;
    contest: ContestSettings;
    official: boolean;
    candidates: (ContestCandidate & { unavailable: boolean })[];
}

const PHASE: Record<string, string> = { before: 'Aún no empieza', open: 'Abierto', after: 'Terminado' };

/** Concursos de Minilistas: fechas, estado y platos disponibles o no (el jefe los reactiva). */
export const ContestsCard: React.FC = () => {
    const { showToast } = useToast();
    const [busy, setBusy] = useState(false);
    const [rows, setRows] = useState<ContestRow[] | null>(null);
    const [pending, setPending] = useState<string | null>(null);

    const load = async () => {
        setBusy(true);
        try {
            const snap = await getDocs(query(collection(db, 'lists'), where('contest.closed', '==', true), limit(100)));
            const places = new Map<string, unknown>();
            const next: ContestRow[] = [];
            for (const listDoc of snap.docs) {
                const data = listDoc.data();
                const candidates = (Array.isArray(data.candidates) ? data.candidates : []) as ContestCandidate[];
                for (const c of candidates) {
                    if (!places.has(c.placeId)) places.set(c.placeId, (await getDoc(doc(db, 'places', c.placeId))).data() ?? null);
                }
                next.push({
                    id: listDoc.id,
                    name: String(data.name || listDoc.id),
                    contest: data.contest || {},
                    official: data.official === true,
                    candidates: candidates.map((c) => ({ ...c, unavailable: isItemUnavailable(places.get(c.placeId) as never, c.itemName) })),
                });
            }
            setRows(next);
        } catch (e) {
            console.error('No se pudieron leer los concursos', e);
            showToast({ variant: 'error', message: 'No se pudieron leer los concursos.' });
        } finally {
            setBusy(false);
        }
    };

    const toggle = async (row: ContestRow, c: ContestRow['candidates'][number]) => {
        setPending(`${row.id}|${c.key}`);
        try {
            await setItemAvailability({ placeId: c.placeId, itemName: c.itemName, unavailable: !c.unavailable });
            setRows((prev) => prev?.map((r) => r.id !== row.id ? r : { ...r, candidates: r.candidates.map((x) => x.key === c.key ? { ...x, unavailable: !c.unavailable } : x) }) ?? null);
        } catch (e) {
            console.error('No se pudo cambiar el plato', e);
            showToast({ variant: 'error', message: 'No se pudo cambiar el plato.' });
        } finally {
            setPending(null);
        }
    };

    return (
        <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" /> Concursos
            </h3>
            <p className="text-gray-400 mb-4 text-sm">Minilistas en modo concurso. Al acabar, si no siguen en la carta, sus platos pasan a «ya no lo sirven» (cada noche). Aquí se reactivan uno a uno.</p>
            <button onClick={load} disabled={busy} className="px-6 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2">
                <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /> {rows ? 'Volver a cargar' : 'Ver concursos'}
            </button>
            {rows && rows.length === 0 && <p className="mt-4 text-sm text-gray-400">No hay concursos.</p>}
            {rows && rows.length > 0 && (
                <ul className="mt-4 space-y-4">
                    {rows.map((row) => (
                        <li key={row.id} className="rounded-lg border border-white/10 p-3">
                            <div className="flex flex-wrap items-baseline gap-2">
                                <Link to={`/list/${row.id}`} className="font-bold text-white hover:underline">{row.name}</Link>
                                {row.official && <span className="text-xs text-emerald-300">✔️ Oficial</span>}
                                <span className="text-xs text-gray-400">{PHASE[contestPhase(row.contest)]}{contestDatesLabel(row.contest) ? ` · ${contestDatesLabel(row.contest)}` : ''}</span>
                                <span className="text-xs text-gray-400">· {row.contest.keepAvailable ? 'Siguen en la carta' : row.contest.closedOutAt ? 'Platos ya retirados' : 'Se retiran al acabar'}</span>
                            </div>
                            <ul className="mt-2 divide-y divide-white/5">
                                {row.candidates.map((c) => (
                                    <li key={c.key} className="flex items-center gap-2 py-1.5 text-sm">
                                        <span className="flex-1 min-w-0 truncate text-gray-200">{c.itemName} <span className="text-gray-500">· {c.placeName}</span></span>
                                        <button
                                            type="button"
                                            disabled={pending === `${row.id}|${c.key}`}
                                            onClick={() => toggle(row, c)}
                                            className={`shrink-0 px-2 py-1 rounded text-xs font-bold ${c.unavailable ? 'bg-gray-700 text-gray-300' : 'bg-emerald-700/60 text-emerald-100'}`}
                                            title={c.unavailable ? 'Ya no lo sirven: toca para reactivarlo' : 'Disponible: toca para marcarlo como retirado'}
                                        >
                                            {c.unavailable ? 'Retirado' : 'Disponible'}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
