import React, { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import { latLngBounds, type LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Database, Loader2, MapPinned, RefreshCw, ShieldCheck } from 'lucide-react';
import {
    backfillReviewHeatmap,
    getAnalyticsHeatmaps,
    type AnalyticsHeatPoint,
    type AnalyticsHeatmapsResult,
    type ReviewHeatmapBackfillResult,
} from '../../services/AnalyticsService';

type PeriodDays = 7 | 30 | 90 | 365;

const DEFAULT_CENTER: LatLngExpression = [40.2, -3.7];

const FitAnalyticsBounds: React.FC<{ points: AnalyticsHeatPoint[] }> = ({ points }) => {
    const map = useMap();
    const signature = points.map((point) => `${point.lat},${point.lng}`).join('|');

    useEffect(() => {
        if (points.length === 0) return;
        if (points.length === 1) {
            map.setView([points[0].lat, points[0].lng], 9);
            return;
        }
        map.fitBounds(latLngBounds(points.map((point) => [point.lat, point.lng])), {
            padding: [28, 28],
            maxZoom: 11,
        });
        // signature representa exclusivamente las coordenadas visibles.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, signature]);
    return null;
};

const HeatMapPanel: React.FC<{
    title: string;
    description: string;
    points: AnalyticsHeatPoint[];
    color: string;
    emptyText: string;
}> = ({ title, description, points, color, emptyText }) => {
    const maxCount = Math.max(1, ...points.map((point) => point.count));

    return (
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[var(--lt-card-strong)]">
            <div className="border-b border-white/10 p-4">
                <h3 className="font-black text-white">{title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-gray-400">{description}</p>
            </div>
            <div className="relative h-[430px] bg-black/20">
                <MapContainer center={DEFAULT_CENTER} zoom={5} scrollWheelZoom className="h-full w-full listopic-map">
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <FitAnalyticsBounds points={points} />
                    {points.map((point) => (
                        <CircleMarker
                            key={point.id}
                            center={[point.lat, point.lng]}
                            radius={Math.max(8, Math.min(34, 8 + (Math.sqrt(point.count / maxCount) * 26)))}
                            pathOptions={{ color, fillColor: color, fillOpacity: 0.48, weight: 2 }}
                        >
                            <Popup>
                                <strong>{point.label || 'Zona aproximada'}</strong><br />
                                {point.count.toLocaleString('es-ES')} {point.placeId ? 'reseñas' : 'sesiones'}
                            </Popup>
                        </CircleMarker>
                    ))}
                </MapContainer>
                {points.length === 0 && (
                    <div className="pointer-events-none absolute inset-x-4 bottom-4 z-[500] rounded-xl border border-white/15 bg-black/75 px-4 py-3 text-center text-xs text-gray-200 backdrop-blur">
                        {emptyText}
                    </div>
                )}
            </div>
        </section>
    );
};

export const GeoAnalyticsTab: React.FC = () => {
    const [days, setDays] = useState<PeriodDays>(30);
    const [data, setData] = useState<AnalyticsHeatmapsResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [backfilling, setBackfilling] = useState(false);
    const [backfillResult, setBackfillResult] = useState<ReviewHeatmapBackfillResult | null>(null);

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            setData(await getAnalyticsHeatmaps(days));
        } catch (loadError) {
            console.error('GeoAnalyticsTab: load failed', loadError);
            setError('No se pudieron cargar los mapas. Comprueba que las Functions nuevas están desplegadas.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

    const rebuildReviews = async () => {
        if (!window.confirm('¿Reconstruir el histórico geográfico de reseñas? Esta operación lee las reseñas existentes una sola vez.')) return;
        setBackfilling(true);
        setBackfillResult(null);
        setError('');
        try {
            const result = await backfillReviewHeatmap();
            setBackfillResult(result);
            await load();
        } catch (backfillError) {
            console.error('GeoAnalyticsTab: backfill failed', backfillError);
            setError('No se pudo reconstruir el histórico de reseñas.');
        } finally {
            setBackfilling(false);
        }
    };

    const totals = useMemo(() => ({
        connections: data?.connections.reduce((sum, point) => sum + point.count, 0) || 0,
        reviews: data?.reviews.reduce((sum, point) => sum + point.count, 0) || 0,
    }), [data]);

    return (
        <div className="mx-auto max-w-7xl space-y-5">
            <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="flex items-center gap-2 text-2xl font-black text-white"><MapPinned className="h-6 w-6 text-cyan-300" /> Mapas analíticos</h2>
                    <p className="mt-1 max-w-3xl text-sm text-gray-400">Conexiones por zona aproximada y lugares donde se publican reseñas. Acceso exclusivo para cuentas Jefe.</p>
                </div>
                <div className="flex items-center gap-2">
                    <select value={days} onChange={(event) => setDays(Number(event.target.value) as PeriodDays)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
                        <option value={7}>7 días</option><option value={30}>30 días</option><option value={90}>90 días</option><option value={365}>1 año</option>
                    </select>
                    <button type="button" onClick={load} disabled={loading} className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-gray-300 hover:bg-white/10" aria-label="Actualizar">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                <Summary label="Sesiones visibles" value={totals.connections} />
                <Summary label="Reseñas geolocalizadas" value={totals.reviews} />
                <Summary label="Zonas protegidas" value={data?.suppressedConnections || 0} suffix="sesiones ocultas" />
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] p-4 text-sm text-cyan-100 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />La conexión se redondea a una cuadrícula aproximada de 0,1° y una zona solo aparece con al menos {data?.privacyThreshold || 3} sesiones. No se almacena la IP ni la coordenada precisa.</p>
                <button type="button" onClick={rebuildReviews} disabled={backfilling} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-cyan-300/25 bg-black/20 px-3 py-2 text-xs font-black hover:bg-black/30 disabled:opacity-60">
                    {backfilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />} Reconstruir reseñas
                </button>
            </div>

            {backfillResult && (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                    Histórico reconstruido: {backfillResult.scanned.toLocaleString('es-ES')} reseñas leídas, {backfillResult.aggregatedRows.toLocaleString('es-ES')} agrupaciones y {backfillResult.skipped.toLocaleString('es-ES')} sin coordenadas.
                </div>
            )}
            {error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
            {data?.coverageCapped && <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-200">El periodo alcanzó el límite de seguridad; el mapa puede ser parcial.</div>}

            {loading && !data ? (
                <div className="grid min-h-72 place-items-center rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] text-gray-400"><span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Cargando mapas…</span></div>
            ) : data ? (
                <div className="grid gap-5 xl:grid-cols-2">
                    <HeatMapPanel
                        title="Zonas de conexión"
                        description="Una sesión cuenta una vez al día. Las celdas con poco tráfico se ocultan para impedir que pueda reconocerse a una persona."
                        points={data.connections}
                        color="#8b5cf6"
                        emptyText={`Todavía no hay ninguna zona que alcance ${data.privacyThreshold} sesiones en este intervalo.`}
                    />
                    <HeatMapPanel
                        title="Lugares donde se publican reseñas"
                        description="Cada punto representa un lugar público; su intensidad es el número de reseñas publicadas dentro del intervalo."
                        points={data.reviews}
                        color="#f59e0b"
                        emptyText="Todavía no hay reseñas agregadas. Usa “Reconstruir reseñas” una vez para incorporar el histórico."
                    />
                </div>
            ) : null}
        </div>
    );
};

const Summary: React.FC<{ label: string; value: number; suffix?: string }> = ({ label, value, suffix }) => (
    <div className="rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</p>
        <p className="mt-2 text-3xl font-black text-white">{value.toLocaleString('es-ES')}</p>
        {suffix && <p className="mt-1 text-[11px] text-gray-500">{suffix}</p>}
    </div>
);
