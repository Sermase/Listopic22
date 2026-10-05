import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { BarChart3, RefreshCw } from 'lucide-react';
import { db } from '../../firebase';

// Resultados de la beta «Lo quiero» (/planes y paywall de Business Pro).
// Un registro por local, o por usuario si aún no tiene local verificado.

interface InterestRow {
    id: string;
    plan: 'premium' | 'business_pro';
    billing: 'monthly' | 'yearly';
    placeName: string | null;
    hasPlace: boolean;
    clicks: number;
    lastAt: Date | null;
    trialGranted: boolean;
    trialExpiresAt: Date | null;
}

const toDate = (value: unknown): Date | null =>
    value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function'
        ? (value as { toDate: () => Date }).toDate()
        : null;

const mapRow = (id: string, data: Record<string, unknown>): InterestRow => ({
    id,
    plan: data.plan === 'business_pro' ? 'business_pro' : 'premium',
    billing: data.billing === 'yearly' ? 'yearly' : 'monthly',
    placeName: typeof data.placeName === 'string' ? data.placeName : null,
    hasPlace: typeof data.placeId === 'string' && data.placeId.length > 0,
    clicks: typeof data.clicks === 'number' ? data.clicks : 1,
    lastAt: toDate(data.lastAt),
    trialGranted: Boolean(data.trialGrantedAt),
    trialExpiresAt: toDate(data.trialExpiresAt),
});

export const PlanInterestStats: React.FC = () => {
    const [rows, setRows] = useState<InterestRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const snap = await getDocs(query(collection(db, 'planInterest'), limit(2000)));
            setRows(snap.docs.map((docSnap) => mapRow(docSnap.id, docSnap.data())));
        } catch (loadError) {
            console.error('PlanInterestStats: load failed', loadError);
            setError('No se pudo cargar el interés por los planes.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const stats = useMemo(() => {
        const now = Date.now();
        const summarize = (list: InterestRow[]) => ({
            total: list.length,
            yearly: list.filter((row) => row.billing === 'yearly').length,
            trials: list.filter((row) => row.trialGranted).length,
            activeTrials: list.filter((row) => row.trialExpiresAt && row.trialExpiresAt.getTime() > now).length,
        });
        const business = rows.filter((row) => row.plan === 'business_pro');
        return {
            business: summarize(business),
            businessWithoutPlace: business.filter((row) => !row.hasPlace).length,
            recent: [...rows].sort((a, b) => (b.lastAt?.getTime() || 0) - (a.lastAt?.getTime() || 0)).slice(0, 15),
        };
    }, [rows]);

    const tile = (label: string, value: number, hint?: string) => (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</p>
            <p className="mt-1 text-2xl font-black text-white">{value}</p>
            {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
        </div>
    );

    return (
        <div className="rounded-xl border border-white/10 bg-[var(--lt-card-strong)] p-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                        <BarChart3 className="h-5 w-5 text-amber-300" /> Beta «Lo quiero»
                    </h3>
                    <p className="mt-1 text-sm text-gray-400">Negocios que han pedido Business Pro gratis desde /planes o el paywall.</p>
                </div>
                <button
                    onClick={() => void load()}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
                </button>
            </div>

            {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {tile('Negocios que lo quieren', stats.business.total, `${stats.businessWithoutPlace} aún sin local verificado · ${stats.business.yearly} anual`)}
                {tile('Business Pro en prueba ahora', stats.business.activeTrials, `${stats.business.trials} pruebas en total`)}
            </div>

            {stats.recent.length > 0 && (
                <ul className="mt-5 divide-y divide-white/5 text-sm">
                    {stats.recent.map((row) => (
                        <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-gray-300">
                            <span>
                                {row.plan === 'premium' ? 'Premium' : `Business Pro${row.placeName ? ` · ${row.placeName}` : ' · sin local'}`}
                                <span className="text-gray-500"> · {row.billing === 'yearly' ? 'anual' : 'mensual'}{row.clicks > 1 ? ` · ${row.clicks} clics` : ''}</span>
                            </span>
                            <span className="text-xs text-gray-500">{row.lastAt ? row.lastAt.toLocaleDateString('es-ES') : ''}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
