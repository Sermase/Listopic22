import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Eye, Loader2, Monitor, RefreshCw, Share2, UserCheck, Users, X } from 'lucide-react';
import { getPageAnalytics, normalizeAnalyticsPath, type PageAnalyticsResult } from '../services/AnalyticsService';

const SOURCE_LABELS: Record<string, string> = {
    direct: 'Directo',
    internal: 'Navegación interna',
    search: 'Buscadores',
    social: 'Redes sociales',
    external: 'Web externa',
};

const DEVICE_LABELS: Record<string, string> = {
    mobile: 'Móvil',
    tablet: 'Tablet',
    desktop: 'Escritorio',
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const SHARE_CHANNEL_LABELS: Record<string, string> = {
    whatsapp: 'WhatsApp', clipboard: 'Enlace copiado', image: 'Tarjeta generada', chat: 'Chat de Listopic',
};

export const PageAnalyticsModal: React.FC<{ pathname: string; onClose: () => void }> = ({ pathname, onClose }) => {
    const [data, setData] = useState<PageAnalyticsResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const path = normalizeAnalyticsPath(pathname);

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            setData(await getPageAnalytics(path, 30));
        } catch (loadError) {
            console.error('PageAnalyticsModal: load failed', loadError);
            setError('No se pudieron cargar las estadísticas de esta página. Comprueba que tu cuenta Jefe tiene el claim admin activo.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [path]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const period = useMemo(() => {
        const daily = data?.daily || [];
        const last7 = daily.slice(-7);
        const views30 = sum(daily.map((row) => row.totalViews));
        const authenticated30 = sum(daily.map((row) => row.authenticatedViews));
        return {
            views7: sum(last7.map((row) => row.totalViews)),
            views30,
            shares30: sum(daily.map((row) => row.totalShares)),
            unique30: sum(daily.map((row) => row.uniqueSessions)),
            authenticatedPct: views30 > 0 ? Math.round((authenticated30 / views30) * 100) : 0,
            maxViews: Math.max(1, ...daily.map((row) => row.totalViews)),
        };
    }, [data]);

    return (
        <div className="pointer-events-auto fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Estadísticas de la página">
            <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Cerrar" />
            <div className="relative z-10 max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-[var(--lt-bg-deep)] p-5 shadow-2xl sm:p-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="flex items-center gap-2 text-xl font-black text-[var(--lt-text)]">
                            <Eye className="h-5 w-5 text-[var(--lt-accent)]" />
                            Ojo mágico
                        </h2>
                        <p className="mt-1 break-all font-mono text-xs text-[var(--lt-text-muted)]">{path}</p>
                    </div>
                    <div className="flex gap-1">
                        <button type="button" onClick={load} disabled={loading} className="rounded-full p-2 text-[var(--lt-text-muted)] hover:bg-white/10 hover:text-[var(--lt-text)]" aria-label="Actualizar">
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button type="button" onClick={onClose} className="rounded-full p-2 text-[var(--lt-text-muted)] hover:bg-white/10 hover:text-[var(--lt-text)]" aria-label="Cerrar">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {loading && !data ? (
                    <div className="grid min-h-64 place-items-center text-sm text-[var(--lt-text-muted)]">
                        <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Cargando analítica…</span>
                    </div>
                ) : error ? (
                    <div className="mt-5 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
                ) : data ? (
                    <div className="mt-5 space-y-5">
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                            {[
                                { label: 'Vistas totales', value: data.total.totalViews, icon: Eye },
                                { label: 'Últimos 7 días', value: period.views7, icon: BarChart3 },
                                { label: 'Sesiones únicas · 30 d', value: period.unique30, icon: Users },
                                { label: 'Compartidos · 30 d', value: period.shares30, icon: Share2 },
                                { label: 'Vistas con sesión', value: `${period.authenticatedPct}%`, icon: UserCheck },
                            ].map(({ label, value, icon: Icon }) => (
                                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--lt-text-muted)]"><Icon className="h-3.5 w-3.5 text-[var(--lt-accent)]" />{label}</div>
                                    <p className="mt-1 text-2xl font-black text-[var(--lt-text)]">{typeof value === 'number' ? value.toLocaleString('es-ES') : value}</p>
                                </div>
                            ))}
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <h3 className="text-sm font-bold text-[var(--lt-text)]">Vistas · últimos 30 días</h3>
                                <span className="text-xs text-[var(--lt-text-muted)]">{period.views30.toLocaleString('es-ES')} en el periodo</span>
                            </div>
                            <div className="flex h-28 items-end gap-1">
                                {data.daily.map((row) => (
                                    <div key={row.date} className="group relative flex h-full flex-1 items-end" title={`${row.date}: ${row.totalViews} vistas`}>
                                        <div
                                            className="w-full min-w-[2px] rounded-t bg-[var(--lt-accent)] opacity-65 transition-opacity group-hover:opacity-100"
                                            style={{ height: `${row.totalViews ? Math.max(5, (row.totalViews / period.maxViews) * 100) : 2}%` }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <Breakdown title="Origen" values={data.total.bySource} labels={SOURCE_LABELS} />
                            <Breakdown title="Dispositivo" values={data.total.byDevice} labels={DEVICE_LABELS} icon={<Monitor className="h-4 w-4" />} />
                            <Breakdown title="Cómo se comparte" values={data.total.byShareChannel} labels={SHARE_CHANNEL_LABELS} icon={<Share2 className="h-4 w-4" />} />
                        </div>

                        <div className="flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-[11px] text-[var(--lt-text-muted)]">Actualización inmediata al pulsar refrescar. No cuenta entorno local ni cuentas Jefe.</p>
                            <Link
                                to={`/developer?tab=analytics&path=${encodeURIComponent(path)}`}
                                onClick={onClose}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--lt-accent)] px-4 py-2 text-xs font-black text-white"
                            >
                                <BarChart3 className="h-4 w-4" /> Ver analítica profunda
                            </Link>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
};

const Breakdown: React.FC<{ title: string; values: Record<string, number>; labels: Record<string, string>; icon?: React.ReactNode }> = ({ title, values, labels, icon }) => {
    const rows = Object.entries(values).sort((a, b) => b[1] - a[1]);
    const total = Math.max(1, sum(rows.map(([, value]) => value)));
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--lt-text)]">{icon}{title}</h3>
            {rows.length === 0 ? <p className="text-xs text-[var(--lt-text-muted)]">Sin datos todavía.</p> : (
                <div className="space-y-2">
                    {rows.slice(0, 5).map(([key, value]) => (
                        <div key={key}>
                            <div className="mb-1 flex justify-between text-xs"><span className="text-[var(--lt-text-muted)]">{labels[key] || key}</span><span className="font-bold text-[var(--lt-text)]">{value.toLocaleString('es-ES')}</span></div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-[var(--lt-accent)]" style={{ width: `${(value / total) * 100}%` }} /></div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
