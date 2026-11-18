import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, limit, query, serverTimestamp, updateDoc, doc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useToast } from '../../context/ToastContext';
import { contestDatesLabel, contestPhase, featureScopeLabel, type ContestFeatureRequest, type ContestSettings, type FeatureStatus } from '../../lib/contest';

interface Row { id: string; name: string; contest: ContestSettings; request: ContestFeatureRequest; candidates: number }

const QUERY_KEY = ['developer', 'contestFeatureRequests'];

/**
 * Concursos que piden salir destacados en Inicio (y los ya destacados).
 * En «📥 Pendientes» solo aparece si hay alguno; en Mantenimiento → Concursos, siempre.
 */
export const ContestFeatureRequests: React.FC<{ hideWhenEmpty?: boolean }> = ({ hideWhenEmpty = false }) => {
    const { showToast } = useToast();
    const queryClient = useQueryClient();
    const { data: rows = [] } = useQuery({
        queryKey: QUERY_KEY,
        queryFn: async (): Promise<Row[]> => {
            const snap = await getDocs(query(collection(db, 'lists'), where('featureRequest.status', 'in', ['pending', 'approved']), limit(50)));
            return snap.docs.map((d) => {
                const data = d.data();
                return {
                    id: d.id,
                    name: String(data.name || d.id),
                    contest: data.contest || {},
                    request: data.featureRequest as ContestFeatureRequest,
                    candidates: Array.isArray(data.candidates) ? data.candidates.length : 0,
                };
            }).sort((a, b) => Number(a.request.status !== 'pending') - Number(b.request.status !== 'pending'));
        },
        staleTime: 60_000,
    });

    const decide = async (row: Row, status: FeatureStatus | null) => {
        try {
            await updateDoc(doc(db, 'lists', row.id), {
                'featureRequest.status': status ?? 'rejected',
                'featureRequest.decidedAt': serverTimestamp(),
            });
            await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
            showToast({ variant: 'success', message: status === 'approved' ? 'Concurso destacado.' : 'Hecho.' });
        } catch (e) {
            console.error('No se pudo decidir el destacado', e);
            showToast({ variant: 'error', message: 'No se pudo guardar.' });
        }
    };

    const pending = rows.filter((r) => r.request.status === 'pending');
    if (hideWhenEmpty && pending.length === 0) return null;
    const shown = hideWhenEmpty ? pending : rows;

    return (
        <section aria-label="Concursos destacados" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
            <h3 className="text-sm font-bold text-white">🏆 Concursos para destacar en Inicio {pending.length > 0 && <span className="ml-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">{pending.length}</span>}</h3>
            {shown.length === 0 && <p className="text-sm text-gray-400">Ninguna petición.</p>}
            <ul className="space-y-2">
                {shown.map((row) => {
                    const phase = contestPhase(row.contest);
                    return (
                        <li key={row.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 p-3 text-sm">
                            <span className="min-w-0 flex-1">
                                <Link to={`/list/${row.id}`} className="font-bold text-white hover:underline">{row.name}</Link>
                                <span className="block text-xs text-gray-400">
                                    {featureScopeLabel(row.request)} · {row.candidates} aspirantes{contestDatesLabel(row.contest) ? ` · ${contestDatesLabel(row.contest)}` : ''}{phase === 'after' ? ' · terminado' : ''}
                                </span>
                            </span>
                            {row.request.status === 'pending' ? (
                                <>
                                    <button type="button" onClick={() => decide(row, 'approved')} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500">Aceptar</button>
                                    <button type="button" onClick={() => decide(row, 'rejected')} className="px-3 py-1.5 rounded-lg bg-white/10 text-gray-200 text-xs font-bold hover:bg-white/20">Rechazar</button>
                                </>
                            ) : (
                                <>
                                    <span className="text-xs font-bold text-emerald-300">✅ Destacado</span>
                                    <button type="button" onClick={() => decide(row, 'rejected')} className="px-3 py-1.5 rounded-lg bg-white/10 text-gray-200 text-xs font-bold hover:bg-white/20">Quitar</button>
                                </>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};
