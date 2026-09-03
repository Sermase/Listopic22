import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, Eye, Loader2, Monitor, RefreshCw, Search, Share2, UserCheck, Users, X } from 'lucide-react';
import {
    getAnalyticsOverview,
    getPageAnalytics,
    type AnalyticsOverviewResult,
    type PageAnalyticsResult,
} from '../../services/AnalyticsService';

const PAGE_TYPE_LABELS: Record<string, string> = {
    home: 'Inicio', search: 'Búsqueda', list: 'Lista', place: 'Lugar', item: 'Plato/elemento',
    profile: 'Perfil', users: 'Usuarios', information: 'Información', other: 'Otra',
};
const SOURCE_LABELS: Record<string, string> = {
    direct: 'Directo', internal: 'Interno', search: 'Buscadores', social: 'Social', external: 'Web externa',
};
const DEVICE_LABELS: Record<string, string> = { mobile: 'Móvil', tablet: 'Tablet', desktop: 'Escritorio' };
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const SHARE_CHANNEL_LABELS: Record<string, string> = {
    whatsapp: 'WhatsApp', clipboard: 'Enlace copiado', image: 'Tarjeta generada', chat: 'Chat de Listopic',
};

export const PageAnalyticsTab: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const selectedPath = searchParams.get('path');
    const [days, setDays] = useState<7 | 30 | 90>(30);
    const [overview, setOverview] = useState<AnalyticsOverviewResult | null>(null);
    const [detail, setDetail] = useState<PageAnalyticsResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            setOverview(await getAnalyticsOverview(days));
        } catch (loadError) {
            console.error('PageAnalyticsTab: overview failed', loadError);
            setError('No se pudo cargar la analítica. Si acabas de activar el rol Jefe, provisiona o refresca el claim admin.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!selectedPath) { setDetail(null); return; }
        let cancelled = false;
        setDetailLoading(true);
        getPageAnalytics(selectedPath, days)
            .then((result) => { if (!cancelled) setDetail(result); })
            .catch((loadError) => {
                console.error('PageAnalyticsTab: detail failed', loadError);
                if (!cancelled) setDetail(null);
            })
            .finally(() => { if (!cancelled) setDetailLoading(false); });
        return () => { cancelled = true; };
    }, [days, selectedPath]);

    const period = useMemo(() => {
        const daily = overview?.daily || [];
        const views = sum(daily.map((row) => row.totalViews));
        const authenticated = sum(daily.map((row) => row.authenticatedViews));
        return {
            views,
            shares: sum(daily.map((row) => row.totalShares)),
            unique: sum(daily.map((row) => row.uniqueSessions)),
            authenticated,
            authPct: views > 0 ? Math.round((authenticated / views) * 100) : 0,
            maxViews: Math.max(1, ...daily.map((row) => row.totalViews)),
        };
    }, [overview]);

    const filteredPages = useMemo(() => {
        const needle = search.trim().toLocaleLowerCase('es');
        if (!needle) return overview?.topPages || [];
        return (overview?.topPages || []).filter((page) => `${page.title} ${page.path} ${page.pageType}`.toLocaleLowerCase('es').includes(needle));
    }, [overview, search]);

    const choosePage = (path: string | null) => {
        const next = new URLSearchParams(searchParams);
        next.set('tab', 'analytics');
        if (path) next.set('path', path); else next.delete('path');
        setSearchParams(next, { replace: true });
    };

    return (
        <div className="mx-auto max-w-6xl space-y-5">
            <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="flex items-center gap-2 text-2xl font-black text-white"><BarChart3 className="h-6 w-6 text-violet-300" /> Analítica de páginas</h2>
                    <p className="mt-1 text-sm text-gray-400">Datos agregados al instante; pulsa actualizar para releerlos. El entorno local y las visitas de cuentas Jefe no se contabilizan.</p>
                </div>
                <div className="flex items-center gap-2">
                    <select value={days} onChange={(event) => setDays(Number(event.target.value) as 7 | 30 | 90)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
                        <option value={7}>7 días</option><option value={30}>30 días</option><option value={90}>90 días</option>
                    </select>
                    <button type="button" onClick={load} disabled={loading} className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-gray-300 hover:bg-white/10" aria-label="Actualizar">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
            {overview?.coverageCapped && <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-200">El periodo superó 10.000 filas diarias; el ranking de páginas puede ser parcial.</div>}

            {loading && !overview ? (
                <div className="grid min-h-72 place-items-center rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] text-gray-400"><span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</span></div>
            ) : overview ? (
                <>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                        <Metric label={`Vistas · ${days} d`} value={period.views} icon={Eye} />
                        <Metric label={`Sesiones únicas · ${days} d`} value={period.unique} icon={Users} />
                        <Metric label={`Compartidos · ${days} d`} value={period.shares} icon={Share2} />
                        <Metric label="Vistas autenticadas" value={`${period.authPct}%`} icon={UserCheck} />
                        <Metric label="Vistas históricas" value={overview.allTime.totalViews} icon={BarChart3} />
                    </div>

                    <div className="grid gap-5 lg:grid-cols-[1.45fr,1fr]">
                        <div className="rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] p-5">
                            <div className="mb-4 flex items-center justify-between"><h3 className="font-bold text-white">Evolución diaria</h3><span className="text-xs text-gray-500">Zona horaria: Europe/Madrid</span></div>
                            <div className="flex h-44 items-end gap-1">
                                {overview.daily.map((row) => (
                                    <div key={row.date} className="group relative flex h-full flex-1 items-end" title={`${row.date}: ${row.totalViews} vistas · ${row.uniqueSessions} sesiones`}>
                                        <div className="w-full min-w-[2px] rounded-t bg-violet-400/70 group-hover:bg-violet-300" style={{ height: `${row.totalViews ? Math.max(4, (row.totalViews / period.maxViews) * 100) : 1}%` }} />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                            <Breakdown title="Adquisición histórica" values={overview.allTime.bySource} labels={SOURCE_LABELS} />
                            <Breakdown title="Dispositivos históricos" values={overview.allTime.byDevice} labels={DEVICE_LABELS} icon={<Monitor className="h-4 w-4 text-violet-300" />} />
                            <Breakdown title="Cómo se comparte" values={overview.allTime.byShareChannel} labels={SHARE_CHANNEL_LABELS} icon={<Share2 className="h-4 w-4 text-violet-300" />} />
                        </div>
                    </div>

                    {selectedPath && (
                        <div className="rounded-2xl border border-violet-500/25 bg-violet-500/5 p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div><p className="text-xs font-black uppercase tracking-wider text-violet-300">Detalle de página</p><p className="mt-1 break-all font-mono text-sm text-white">{selectedPath}</p></div>
                                <button type="button" onClick={() => choosePage(null)} className="rounded-full p-2 text-gray-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
                            </div>
                            {detailLoading ? <p className="mt-4 flex items-center gap-2 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Cargando detalle…</p> : detail && (
                                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                                    <SmallMetric label="Vistas totales" value={detail.total.totalViews} />
                                    <SmallMetric label={`Vistas · ${days} d`} value={sum(detail.daily.map((row) => row.totalViews))} />
                                    <SmallMetric label={`Sesiones · ${days} d`} value={sum(detail.daily.map((row) => row.uniqueSessions))} />
                                    <SmallMetric label={`Compartidos · ${days} d`} value={sum(detail.daily.map((row) => row.totalShares))} />
                                    <SmallMetric label="Última vista" value={detail.total.lastViewedAtMs ? new Date(detail.total.lastViewedAtMs).toLocaleDateString('es-ES') : '—'} />
                                </div>
                            )}
                        </div>
                    )}

                    <div className="rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div><h3 className="font-bold text-white">Páginas con más tráfico</h3><p className="text-xs text-gray-500">Ranking del periodo seleccionado, hasta 100 páginas.</p></div>
                            <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar página…" className="rounded-xl border border-white/10 bg-black/25 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-violet-400/50" /></label>
                        </div>
                        <div className="mt-4 overflow-x-auto">
                            <table className="w-full min-w-[700px] text-sm">
                                <thead><tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-gray-500"><th className="px-3 py-2">Página</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2 text-right">Vistas</th><th className="px-3 py-2 text-right">Sesiones</th><th className="px-3 py-2 text-right">Compartidos</th><th className="px-3 py-2 text-right">Autenticadas</th><th className="px-3 py-2" /></tr></thead>
                                <tbody>{filteredPages.map((page) => (
                                    <tr key={page.path} className={`border-b border-white/5 hover:bg-white/[0.03] ${selectedPath === page.path ? 'bg-violet-500/10' : ''}`}>
                                        <td className="max-w-sm px-3 py-3"><p className="truncate font-bold text-white" title={page.title}>{page.title || page.path}</p><p className="truncate font-mono text-[10px] text-gray-500">{page.path}</p></td>
                                        <td className="px-3 py-3 text-gray-400">{PAGE_TYPE_LABELS[page.pageType] || page.pageType}</td>
                                        <td className="px-3 py-3 text-right font-bold text-white">{page.totalViews.toLocaleString('es-ES')}</td>
                                        <td className="px-3 py-3 text-right text-gray-300">{page.uniqueSessions.toLocaleString('es-ES')}</td>
                                        <td className="px-3 py-3 text-right text-gray-300">{page.totalShares.toLocaleString('es-ES')}</td>
                                        <td className="px-3 py-3 text-right text-gray-300">{page.totalViews ? `${Math.round((page.authenticatedViews / page.totalViews) * 100)}%` : '—'}</td>
                                        <td className="px-3 py-3"><div className="flex justify-end gap-1"><button type="button" onClick={() => choosePage(page.path)} className="rounded-lg p-2 text-violet-300 hover:bg-violet-500/10" title="Ver detalle"><Eye className="h-4 w-4" /></button><Link to={page.path} target="_blank" className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white" title="Abrir página">↗</Link></div></td>
                                    </tr>
                                ))}</tbody>
                            </table>
                            {filteredPages.length === 0 && <p className="py-10 text-center text-sm text-gray-500">Aún no hay páginas con datos en este periodo.</p>}
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
};

const Metric: React.FC<{ label: string; value: number | string; icon: React.ElementType }> = ({ label, value, icon: Icon }) => (
    <div className="rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] p-4"><div className="flex items-center gap-2 text-xs text-gray-400"><Icon className="h-4 w-4 text-violet-300" />{label}</div><p className="mt-2 text-3xl font-black text-white">{typeof value === 'number' ? value.toLocaleString('es-ES') : value}</p></div>
);
const SmallMetric: React.FC<{ label: string; value: number | string }> = ({ label, value }) => <div className="rounded-xl border border-white/10 bg-black/15 p-3"><p className="text-[11px] text-gray-500">{label}</p><p className="mt-1 text-xl font-black text-white">{typeof value === 'number' ? value.toLocaleString('es-ES') : value}</p></div>;
const Breakdown: React.FC<{ title: string; values: Record<string, number>; labels: Record<string, string>; icon?: React.ReactNode }> = ({ title, values, labels, icon }) => {
    const rows = Object.entries(values).sort((a, b) => b[1] - a[1]);
    const total = Math.max(1, sum(rows.map(([, value]) => value)));
    return <div className="rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] p-4"><h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">{icon}{title}</h3>{rows.length === 0 ? <p className="text-xs text-gray-500">Sin datos todavía.</p> : <div className="space-y-2">{rows.map(([key, value]) => <div key={key}><div className="mb-1 flex justify-between text-xs"><span className="text-gray-400">{labels[key] || key}</span><span className="font-bold text-white">{value.toLocaleString('es-ES')}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-violet-400" style={{ width: `${(value / total) * 100}%` }} /></div></div>)}</div>}</div>;
};
