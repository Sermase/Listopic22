import React, { useEffect, useState } from 'react';
import {
    collection, query, orderBy, limit, getDocs, where,
    Timestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { RefreshCw, Activity, Calendar, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UsageLog {
    id: string;
    action: string;
    label: string;
    userId: string | null;
    details: Record<string, any>;
    count: number;
    date: string;
    month: string;
    timestamp: Timestamp | null;
}

interface DayStat {
    date: string;
    month: string;
    total: number;
    byAction: Record<string, number>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
    nearby_search_google:  'bg-blue-500/20 text-blue-300 border-blue-500/30',
    text_search_google:    'bg-violet-500/20 text-violet-300 border-violet-500/30',
    place_details_google:  'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    reverse_geocode:       'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    photo_refresh:         'bg-amber-500/20 text-amber-300 border-amber-500/30',
    admin_bulk_update:     'bg-red-500/20 text-red-300 border-red-500/30',
    admin_single_update:   'bg-orange-500/20 text-orange-300 border-orange-500/30',
    client_text_search:    'bg-pink-500/20 text-pink-300 border-pink-500/30',
    client_nearby_search:  'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
    client_place_details:  'bg-teal-500/20 text-teal-300 border-teal-500/30',
};

const ACTION_DOTS: Record<string, string> = {
    nearby_search_google:  'bg-blue-400',
    text_search_google:    'bg-violet-400',
    place_details_google:  'bg-cyan-400',
    reverse_geocode:       'bg-emerald-400',
    photo_refresh:         'bg-amber-400',
    admin_bulk_update:     'bg-red-400',
    admin_single_update:   'bg-orange-400',
    client_text_search:    'bg-pink-400',
    client_nearby_search:  'bg-fuchsia-400',
    client_place_details:  'bg-teal-400',
};

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}
function monthStr() {
    return new Date().toISOString().slice(0, 7);
}
function daysAgoStr(n: number) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ApiUsageTab: React.FC = () => {
    const [logs, setLogs] = useState<UsageLog[]>([]);
    const [dayStats, setDayStats] = useState<DayStat[]>([]);
    const [monthTotal, setMonthTotal] = useState<number>(0);
    const [monthByAction, setMonthByAction] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(false);
    const [expandedLog, setExpandedLog] = useState<string | null>(null);
    const [actionFilter, setActionFilter] = useState<string>('all');

    const load = async () => {
        setLoading(true);
        try {
            await Promise.all([loadStats(), loadLogs()]);
        } finally {
            setLoading(false);
        }
    };

    const loadStats = async () => {
        const today  = todayStr();
        const month  = monthStr();
        const from30 = daysAgoStr(29);

        // Last 30 days + current month
        const statsSnap = await getDocs(
            query(
                collection(db, 'apiUsageStats'),
                where('date', '>=', from30),
                orderBy('date', 'asc'),
                limit(31),
            )
        );

        const days: DayStat[] = statsSnap.docs
            .filter(d => d.id.startsWith('day_'))
            .map(d => ({ ...(d.data() as DayStat) }));

        setDayStats(days);

        // Monthly total from its own doc
        const monthSnap = await getDocs(
            query(
                collection(db, 'apiUsageStats'),
                where('month', '==', month),
                limit(1),
            )
        );
        // Sum from daily docs for this month (more accurate than the monthly doc which may lag)
        const monthDays = days.filter(d => d.date.startsWith(month));
        const mTotal = monthDays.reduce((acc, d) => acc + (d.total || 0), 0);
        const mByAction: Record<string, number> = {};
        monthDays.forEach(d => {
            Object.entries(d.byAction || {}).forEach(([k, v]) => {
                mByAction[k] = (mByAction[k] || 0) + v;
            });
        });
        setMonthTotal(mTotal);
        setMonthByAction(mByAction);
    };

    const loadLogs = async () => {
        const snap = await getDocs(
            query(
                collection(db, 'apiUsageLogs'),
                orderBy('timestamp', 'desc'),
                limit(200),
            )
        );
        setLogs(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<UsageLog, 'id'>) })));
    };

    useEffect(() => { load(); }, []);

    const today = todayStr();
    const todayStat = dayStats.find(d => d.date === today);
    const todayTotal = todayStat?.total ?? 0;
    const todayByAction = todayStat?.byAction ?? {};

    const allActions = Array.from(new Set(logs.map(l => l.action))).sort();
    const filteredLogs = actionFilter === 'all' ? logs : logs.filter(l => l.action === actionFilter);

    // Max daily value for bar scaling
    const maxDayTotal = Math.max(...dayStats.map(d => d.total || 0), 1);

    return (
        <div className="space-y-6">

            {/* ── Header ───────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-bold text-[var(--lt-text)] flex items-center gap-2">
                        <Activity className="w-5 h-5 text-[var(--lt-accent)]" />
                        Monitoreo de API — Google Places
                    </h3>
                    <p className="text-xs text-[var(--lt-text-muted)] mt-1">
                        Lecturas reales enviadas a la API de Google. Las búsquedas servidas desde caché local no se cuentan.
                    </p>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="p-2 rounded-lg bg-white/5 border border-white/10 text-[var(--lt-text-muted)] hover:text-[var(--lt-text)] transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* ── Stats cards ──────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Hoy" value={todayTotal} icon={<Calendar className="w-4 h-4" />} accent="var(--lt-accent)" />
                <StatCard label="Este mes" value={monthTotal} icon={<TrendingUp className="w-4 h-4" />} accent="var(--lt-accent-2)" />
                {Object.entries(todayByAction).sort((a,b) => b[1]-a[1]).slice(0,2).map(([action, count]) => (
                    <StatCard
                        key={action}
                        label={ACTION_LABELS[action] ?? action}
                        value={count as number}
                        icon={<span className={`w-2.5 h-2.5 rounded-full ${ACTION_DOTS[action] ?? 'bg-gray-400'}`} />}
                        accent="#6b7280"
                    />
                ))}
            </div>

            {/* ── Daily bar chart (last 30 days) ───────────────────────── */}
            <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-5">
                <h4 className="text-sm font-bold text-[var(--lt-text)] mb-4">Últimos 30 días</h4>
                {dayStats.length === 0 && !loading ? (
                    <p className="text-xs text-[var(--lt-text-muted)]">Sin datos todavía. Se registrarán a partir de la próxima llamada a Google.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <div className="flex items-end gap-1 min-w-[600px] h-24">
                            {Array.from({ length: 30 }, (_, i) => {
                                const date = daysAgoStr(29 - i);
                                const stat = dayStats.find(d => d.date === date);
                                const total = stat?.total ?? 0;
                                const heightPct = total > 0 ? Math.max(4, Math.round((total / maxDayTotal) * 100)) : 2;
                                const isToday = date === today;
                                return (
                                    <div key={date} className="flex-1 flex flex-col items-center gap-1 group relative">
                                        <div className="w-full flex items-end justify-center" style={{ height: '80px' }}>
                                            <div
                                                className={`w-full rounded-t transition-all duration-300 ${isToday ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`}
                                                style={{
                                                    height: `${heightPct}%`,
                                                    backgroundImage: isToday ? 'var(--lt-accent-grad)' : undefined,
                                                    backgroundColor: isToday ? undefined : 'var(--lt-accent)',
                                                    minHeight: '2px',
                                                }}
                                            />
                                        </div>
                                        {/* Tooltip */}
                                        {total > 0 && (
                                            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-10 hidden group-hover:flex flex-col items-center pointer-events-none">
                                                <div className="bg-black/90 text-white text-[10px] font-mono px-2 py-1 rounded whitespace-nowrap shadow-lg border border-white/10">
                                                    {date}<br />{total} llamada{total !== 1 ? 's' : ''}
                                                    {stat?.byAction && Object.entries(stat.byAction).sort((a,b)=>b[1]-a[1]).map(([k,v]) => (
                                                        <div key={k} className="text-gray-400">{ACTION_LABELS[k] ?? k}: {v}</div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <span className="text-[8px] text-[var(--lt-text-muted)] rotate-45 origin-left translate-x-1 hidden sm:block">
                                            {date.slice(5)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Month breakdown by action ────────────────────────────── */}
            {Object.keys(monthByAction).length > 0 && (
                <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-5">
                    <h4 className="text-sm font-bold text-[var(--lt-text)] mb-3">Este mes por tipo de acción</h4>
                    <div className="space-y-2">
                        {Object.entries(monthByAction).sort((a,b) => b[1]-a[1]).map(([action, count]) => {
                            const pct = Math.round(((count as number) / monthTotal) * 100);
                            return (
                                <div key={action} className="flex items-center gap-3">
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-md border ${ACTION_COLORS[action] ?? 'bg-white/5 text-gray-300 border-white/10'} shrink-0 w-52 truncate`}>
                                        {ACTION_LABELS[action] ?? action}
                                    </span>
                                    <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{ width: `${pct}%`, backgroundImage: 'var(--lt-accent-grad)' }}
                                        />
                                    </div>
                                    <span className="text-xs font-mono text-[var(--lt-text-muted)] w-12 text-right">{count as number}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Recent logs ──────────────────────────────────────────── */}
            <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h4 className="text-sm font-bold text-[var(--lt-text)]">Logs recientes (últimas 200 entradas)</h4>
                    <select
                        value={actionFilter}
                        onChange={e => setActionFilter(e.target.value)}
                        className="bg-black/30 border border-white/10 text-[var(--lt-text)] text-xs rounded-lg px-3 py-1.5 outline-none focus:border-[var(--lt-accent-border)]"
                    >
                        <option value="all">Todas las acciones</option>
                        {allActions.map(a => (
                            <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
                        ))}
                    </select>
                </div>

                {loading && filteredLogs.length === 0 ? (
                    <div className="flex items-center gap-2 text-[var(--lt-text-muted)] text-sm py-6 justify-center">
                        <RefreshCw className="w-4 h-4 animate-spin" /> Cargando...
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <p className="text-xs text-[var(--lt-text-muted)] py-4 text-center">Sin registros todavía.</p>
                ) : (
                    <div className="space-y-1 max-h-[480px] overflow-y-auto pr-1">
                        {filteredLogs.map(log => (
                            <LogRow
                                key={log.id}
                                log={log}
                                expanded={expandedLog === log.id}
                                onToggle={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatCard: React.FC<{ label: string; value: number; icon: React.ReactNode; accent: string }> = ({ label, value, icon, accent }) => (
    <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-4 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-[var(--lt-text-muted)] text-xs">
            <span style={{ color: accent }}>{icon}</span>
            {label}
        </div>
        <span className="text-2xl font-bold text-[var(--lt-text)] font-mono">{value.toLocaleString()}</span>
    </div>
);

const LogRow: React.FC<{ log: UsageLog; expanded: boolean; onToggle: () => void }> = ({ log, expanded, onToggle }) => {
    const ts = log.timestamp?.toDate();
    const hasDetails = log.details && Object.keys(log.details).length > 0;

    return (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden">
            <button
                type="button"
                onClick={hasDetails ? onToggle : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left ${hasDetails ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default'} transition-colors`}
            >
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded border shrink-0 ${ACTION_COLORS[log.action] ?? 'bg-white/5 text-gray-300 border-white/10'}`}>
                    {log.label}
                </span>
                {log.count > 1 && (
                    <span className="text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20 px-1.5 py-0.5 rounded shrink-0">
                        ×{log.count}
                    </span>
                )}
                <span className="text-[11px] text-[var(--lt-text-muted)] font-mono truncate flex-1">
                    {log.userId ?? '—'}
                </span>
                <span className="text-[10px] text-[var(--lt-text-muted)] font-mono shrink-0 hidden sm:block">
                    {ts ? ts.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                </span>
                {hasDetails && (
                    <span className="text-[var(--lt-text-muted)] shrink-0">
                        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </span>
                )}
            </button>
            {expanded && hasDetails && (
                <div className="px-3 pb-2 border-t border-white/5">
                    <pre className="text-[10px] text-[var(--lt-text-muted)] font-mono bg-black/30 rounded p-2 mt-2 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(log.details, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
};

// ─── Labels (mirrors server-side ACTION_LABELS) ───────────────────────────────

const ACTION_LABELS: Record<string, string> = {
    nearby_search_google:  'Búsqueda cercana (Google)',
    text_search_google:    'Búsqueda por texto (Google)',
    place_details_google:  'Detalle de lugar (Google)',
    reverse_geocode:       'Geocodificación inversa',
    photo_refresh:         'Refresco de foto',
    admin_bulk_update:     'Actualización masiva (admin)',
    admin_single_update:   'Actualización individual (admin)',
    client_text_search:    'Búsqueda por texto (cliente)',
    client_nearby_search:  'Búsqueda cercana (cliente)',
    client_place_details:  'Detalle de lugar (cliente)',
};
