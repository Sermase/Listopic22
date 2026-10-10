/**
 * Cálculos de 📊 Estadísticas, sin React (spec §9). Todo sale de lo que el
 * servidor ya guarda: nunca se inventan ceros. Las fechas son días de Madrid
 * («YYYY-MM-DD»), igual que la analítica (functions/modules/analytics.js).
 *
 *   const days = dailyStats(traffic);                 // 60 días, el último es hoy
 *   const summary = summarizeTraffic(days, 7);        // periodo actual + anterior
 *   computeDelta(summary.views, summary.prevViews);   // { arrow: '▲', text: '18 % vs. periodo anterior' }
 *   computeHeadlines({ traffic: …, bestItem });       // hasta 3 titulares
 */
import type { BusinessPlaceAnalyticsResult } from '../../../services/AnalyticsService';
import type { CanonicalPlaceItem } from '../../../services/CanonicalItemService';
import type {
    ItemSpotlight,
    ManagerPlaceReview,
    SponsoredMetrics,
    SponsoredPlacement,
} from '../../../services/BusinessProService';
import { formatScore, SCORE_BAND_EMOJI, SCORE_BAND_MIN, scoreBand, type ScoreBand } from '../../../lib/scoreScale';
import { mergeCampaigns, plural, type CampaignRow } from '../sponsored/sponsoredMeta';
import {
    MIN_RATINGS_FOR_STAR,
    MONTH_ABBR,
    SCORE_BANDS,
    WEEKDAY_ABBR,
    WEEKDAY_WINDOW_DAYS,
    WEEKDAYS,
} from './statsMeta';

const TIME_ZONE = 'Europe/Madrid';

// ── Fechas ──────────────────────────────────────────────────────────────────

let dayFormatter: Intl.DateTimeFormat | null = null;

/** Día de Madrid de un instante: «2026-10-04». */
export const dateKeyOf = (ms: number): string => {
    dayFormatter ??= new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts: Record<string, string> = {};
    dayFormatter.formatToParts(new Date(ms)).forEach((part) => {
        parts[part.type] = part.value;
    });
    return `${parts.year}-${parts.month}-${parts.day}`;
};

const parseKey = (key: string): { y: number; m: number; d: number } | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!match) return null;
    return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
};

const keyOfUtcDate = (date: Date): string => (
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
);

/**
 * Los últimos `count` días de Madrid, del más antiguo a hoy (como datesForPeriod
 * del servidor). Se cuenta por días de calendario, no restando 24 h, para que
 * los cambios de hora no repitan ni salten un día.
 */
export const lastDateKeys = (count: number, nowMs: number = Date.now()): string[] => {
    const today = parseKey(dateKeyOf(nowMs));
    if (!today) return [];
    return Array.from({ length: count }, (_, index) => (
        keyOfUtcDate(new Date(Date.UTC(today.y, today.m - 1, today.d - (count - 1 - index))))
    ));
};

/** Día de la semana de una fecha, con el lunes como 0. */
export const weekdayIndex = (key: string): number => {
    const date = parseKey(key);
    if (!date) return 0;
    const sundayFirst = new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay();
    return (sundayFirst + 6) % 7;
};

/** «sáb 4 oct» (o «4 oct» sin el día de la semana). */
export const formatDayLabel = (key: string, withWeekday = true): string => {
    const date = parseKey(key);
    if (!date) return key;
    const base = `${date.d} ${MONTH_ABBR[date.m - 1]}`;
    if (!withWeekday) return base;
    const sundayFirst = new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay();
    return `${WEEKDAY_ABBR[sundayFirst]} ${base}`;
};

/** Los últimos `count` meses («2026-10»), del más antiguo al actual. */
export const lastMonthKeys = (count: number, nowMs: number = Date.now()): string[] => {
    const today = parseKey(dateKeyOf(nowMs));
    if (!today) return [];
    return Array.from({ length: count }, (_, index) => {
        const back = count - 1 - index;
        const monthIndex = today.y * 12 + (today.m - 1) - back;
        const year = Math.floor(monthIndex / 12);
        const month = (monthIndex % 12) + 1;
        return `${year}-${String(month).padStart(2, '0')}`;
    });
};

export const monthLabelOf = (monthKey: string): string => MONTH_ABBR[Number(monthKey.slice(5, 7)) - 1] ?? monthKey;

// ── Números ─────────────────────────────────────────────────────────────────

export const sumOf = <T,>(rows: readonly T[], pick: (row: T) => number): number => rows.reduce((total, row) => {
    const value = pick(row);
    return total + (Number.isFinite(value) ? value : 0);
}, 0);

/** Suma mapas de contadores ({ whatsapp: 2 } + { whatsapp: 1, chat: 1 }). */
export const addUp = <T,>(rows: readonly T[], pick: (row: T) => Record<string, number>): Record<string, number> => {
    const totals: Record<string, number> = {};
    rows.forEach((row) => {
        Object.entries(pick(row) || {}).forEach(([key, value]) => {
            if (typeof value === 'number' && Number.isFinite(value) && value > 0) totals[key] = (totals[key] || 0) + value;
        });
    });
    return totals;
};

/** Clave con más cuenta (la primera si empatan), o null si todo es 0. */
export const topKey = (map: Record<string, number>): string | null => {
    let best: string | null = null;
    Object.entries(map).forEach(([key, value]) => {
        if (value > 0 && (best === null || value > map[best])) best = key;
    });
    return best;
};

/** «18 %» (redondeado, con espacio como se escribe en España). */
export const formatPercent = (value: number): string => `${Math.round(value)} %`;

/** Parte de un total en %, 0 si el total es 0. */
export const percentOf = (part: number, total: number): number => (total > 0 ? (part / total) * 100 : 0);

export interface Delta {
    kind: 'up' | 'down' | 'same';
    arrow: '▲' | '▼' | '＝';
    text: string;
}

/** Comparación con el periodo anterior; null si no hay periodo anterior con el que comparar. */
export const computeDelta = (current: number, previous: number | null): Delta | null => {
    if (previous === null) return null;
    if (previous === 0) {
        return current === 0
            ? { kind: 'same', arrow: '＝', text: 'Igual que el periodo anterior' }
            : { kind: 'up', arrow: '▲', text: 'Antes no había ninguna' };
    }
    const percent = Math.round(((current - previous) / previous) * 100);
    if (percent === 0) return { kind: 'same', arrow: '＝', text: 'Igual que el periodo anterior' };
    return {
        kind: percent > 0 ? 'up' : 'down',
        arrow: percent > 0 ? '▲' : '▼',
        text: `${Math.abs(percent)} % vs. periodo anterior`,
    };
};

// ── Tráfico de la ficha ─────────────────────────────────────────────────────

export interface DayStats {
    date: string;
    views: number;
    sessions: number;
    authViews: number;
    anonViews: number;
    bySource: Record<string, number>;
    byDevice: Record<string, number>;
    /** Compartidos de la ficha y de sus platos (placeAnalyticsDaily). */
    shares: number;
    byShareChannel: Record<string, number>;
    byShareEntityType: Record<string, number>;
}

/** Une las vistas de /place/{id} con los compartidos relacionados, día a día. */
export const dailyStats = (traffic: BusinessPlaceAnalyticsResult): DayStats[] => {
    const related = new Map((traffic.relatedDaily || []).map((row) => [row.date, row]));
    return (traffic.page?.daily || []).map((row) => {
        const rel = related.get(row.date);
        return {
            date: row.date,
            views: row.totalViews || 0,
            sessions: row.uniqueSessions || 0,
            authViews: row.authenticatedViews || 0,
            anonViews: row.anonymousViews || 0,
            bySource: row.bySource || {},
            byDevice: row.byDevice || {},
            shares: rel?.totalShares || 0,
            byShareChannel: rel?.byShareChannel || {},
            byShareEntityType: rel?.byShareEntityType || {},
        };
    });
};

/** «sáb 4 oct · 12 visitas · 2 compartidos». */
export const dayDetail = (day: Pick<DayStats, 'date' | 'views' | 'shares'>): string => (
    `${formatDayLabel(day.date)} · ${plural(day.views, 'visita')} · ${plural(day.shares, 'compartido')}`
);

/** Periodo actual (los últimos `days`) y el anterior, si hay datos para él. */
export const slicePeriods = <T,>(rows: readonly T[], days: number): { current: T[]; previous: T[] | null } => ({
    current: rows.slice(-days),
    previous: rows.length >= days * 2 ? rows.slice(-days * 2, -days) : null,
});

export interface TrafficSummary {
    days: DayStats[];
    views: number;
    prevViews: number | null;
    sessions: number;
    shares: number;
    prevShares: number | null;
    authViews: number;
    anonViews: number;
    bySource: Record<string, number>;
    byDevice: Record<string, number>;
    byShareChannel: Record<string, number>;
    byShareEntityType: Record<string, number>;
    topShareChannel: string | null;
}

export const summarizeTraffic = (all: readonly DayStats[], days: number): TrafficSummary => {
    const { current, previous } = slicePeriods(all, days);
    const byShareChannel = addUp(current, (row) => row.byShareChannel);
    return {
        days: current,
        views: sumOf(current, (row) => row.views),
        prevViews: previous ? sumOf(previous, (row) => row.views) : null,
        sessions: sumOf(current, (row) => row.sessions),
        shares: sumOf(current, (row) => row.shares),
        prevShares: previous ? sumOf(previous, (row) => row.shares) : null,
        authViews: sumOf(current, (row) => row.authViews),
        anonViews: sumOf(current, (row) => row.anonViews),
        bySource: addUp(current, (row) => row.bySource),
        byDevice: addUp(current, (row) => row.byDevice),
        byShareChannel,
        byShareEntityType: addUp(current, (row) => row.byShareEntityType),
        topShareChannel: topKey(byShareChannel),
    };
};

export interface WeekdayStrength {
    /** 0 = lunes. */
    index: number;
    short: string;
    name: string;
    plural: string;
    total: number;
    /** Visitas de media ese día de la semana. */
    average: number;
}

/** Visitas en las 8 semanas para coronar un día (con menos, el 👑 sería casualidad). */
export const MIN_VIEWS_FOR_BEST_WEEKDAY = 14;

/**
 * Media de visitas por día de la semana en las últimas 8 semanas. Corona el
 * mejor solo si hay visitas suficientes para que signifique algo.
 */
export const weekdayStrengths = (all: readonly DayStats[], minViews = MIN_VIEWS_FOR_BEST_WEEKDAY): { days: WeekdayStrength[]; best: WeekdayStrength | null; max: number } => {
    const window = all.slice(-WEEKDAY_WINDOW_DAYS);
    const totals = WEEKDAYS.map(() => ({ total: 0, count: 0 }));
    window.forEach((row) => {
        const bucket = totals[weekdayIndex(row.date)];
        bucket.total += row.views;
        bucket.count += 1;
    });
    const days = WEEKDAYS.map((meta, index): WeekdayStrength => ({
        index,
        ...meta,
        total: totals[index].total,
        average: totals[index].count ? totals[index].total / totals[index].count : 0,
    }));
    const max = Math.max(0, ...days.map((day) => day.average));
    const windowViews = sumOf(window, (row) => row.views);
    const best = max > 0 && windowViews >= minViews ? days.find((day) => day.average === max) ?? null : null;
    return { days, best, max };
};

// ── Valoraciones ────────────────────────────────────────────────────────────

export interface ReviewCoverage {
    /** Se leyó el máximo: puede haber más. */
    capped: boolean;
    /** La lectura trae las más recientes (si no, son unas cualquiera). */
    newestFirst: boolean;
    /** Día de la valoración más antigua leída. */
    oldestKey: string | null;
}

export const reviewCoverage = (
    reviews: readonly ManagerPlaceReview[],
    { newestFirst, capped }: { newestFirst: boolean; capped: boolean },
): ReviewCoverage => {
    const dated = reviews.filter((review) => review.createdAtMs > 0);
    const oldest = dated.length ? Math.min(...dated.map((review) => review.createdAtMs)) : null;
    return {
        capped,
        newestFirst,
        oldestKey: oldest === null ? null : dateKeyOf(oldest),
    };
};

/** Cuántas valoraciones caen en esos días y si la cuenta puede quedarse corta. */
export const countReviewsIn = (
    reviews: readonly ManagerPlaceReview[],
    keys: readonly string[],
    coverage: ReviewCoverage,
): { count: number; partial: boolean } => {
    const wanted = new Set(keys);
    const count = reviews.filter((review) => review.createdAtMs > 0 && wanted.has(dateKeyOf(review.createdAtMs))).length;
    const partial = coverage.capped && (
        !coverage.newestFirst || (coverage.oldestKey !== null && keys.length > 0 && keys[0] <= coverage.oldestKey)
    );
    return { count, partial };
};

/** Valoraciones por día, alineadas con `keys`. */
export const reviewsPerDay = (reviews: readonly ManagerPlaceReview[], keys: readonly string[]): number[] => {
    const counts = new Map(keys.map((key) => [key, 0]));
    reviews.forEach((review) => {
        if (!review.createdAtMs) return;
        const key = dateKeyOf(review.createdAtMs);
        if (counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1);
    });
    return keys.map((key) => counts.get(key) || 0);
};

export type RatedBand = Exclude<ScoreBand, 'none'>;

/** Cuántas valoraciones hay en cada tramo de nota (🤩 … 😬). */
export const bandCounts = (reviews: readonly ManagerPlaceReview[]): Record<RatedBand, number> => {
    const counts = Object.fromEntries(SCORE_BANDS.map((band) => [band, 0])) as Record<RatedBand, number>;
    reviews.forEach((review) => {
        const band = scoreBand(review.overallRating);
        if (band !== 'none') counts[band] += 1;
    });
    return counts;
};

export interface MonthBucket {
    key: string;
    label: string;
    count: number;
    average: number | null;
}

/** Valoraciones y nota media de cada uno de los últimos `months` meses. */
export const monthlyReviews = (reviews: readonly ManagerPlaceReview[], months = 6, nowMs: number = Date.now()): MonthBucket[] => {
    const keys = lastMonthKeys(months, nowMs);
    const buckets = new Map(keys.map((key) => [key, { count: 0, total: 0, rated: 0 }]));
    reviews.forEach((review) => {
        if (!review.createdAtMs) return;
        const bucket = buckets.get(dateKeyOf(review.createdAtMs).slice(0, 7));
        if (!bucket) return;
        bucket.count += 1;
        if (typeof review.overallRating === 'number') {
            bucket.total += review.overallRating;
            bucket.rated += 1;
        }
    });
    return keys.map((key) => {
        const bucket = buckets.get(key)!;
        return { key, label: monthLabelOf(key), count: bucket.count, average: bucket.rated ? bucket.total / bucket.rated : null };
    });
};

// ── Platos ──────────────────────────────────────────────────────────────────

export interface RankedItem {
    id: string;
    name: string;
    average: number | null;
    /** Valoraciones con nota. */
    ratings: number;
    /** Valoraciones (con o sin nota; incluye las que no son públicas, T6). */
    reviews: number;
    photos: number;
}

export const rankedItem = (item: CanonicalPlaceItem): RankedItem => {
    const stats = item.stats || {};
    const reviews = typeof stats.reviewCount === 'number' ? stats.reviewCount : 0;
    const average = typeof stats.averageRating === 'number' && Number.isFinite(stats.averageRating) ? stats.averageRating : null;
    return {
        id: item.id,
        name: (item.canonicalName || '').trim() || item.id,
        average,
        ratings: typeof stats.ratingCount === 'number' ? stats.ratingCount : (average !== null ? reviews : 0),
        reviews,
        photos: typeof stats.photoCount === 'number' ? stats.photoCount : 0,
    };
};

const starCandidates = (items: readonly CanonicalPlaceItem[]): RankedItem[] => items
    .map(rankedItem)
    .filter((item) => item.average !== null && item.ratings >= MIN_RATINGS_FOR_STAR);

/** Nota mínima para el podio y el titular de «Tu estrella» (desde «😍 Muy bueno»). */
export const STAR_MIN_AVERAGE = SCORE_BAND_MIN.good;

/**
 * Mejor nota (con al menos 3 valoraciones y desde «Muy bueno»); empate → más
 * valoraciones. Los de menos nota van a «Con margen de mejora», no al podio.
 */
export const topItemsByScore = (items: readonly CanonicalPlaceItem[], limit: number): RankedItem[] => starCandidates(items)
    .filter((item) => item.average! >= STAR_MIN_AVERAGE)
    .sort((a, b) => (b.average! - a.average!) || (b.ratings - a.ratings) || a.name.localeCompare(b.name, 'es'))
    .slice(0, limit);

/** Más valorados; empate → mejor nota. */
export const topItemsByCount = (items: readonly CanonicalPlaceItem[], limit: number): RankedItem[] => items
    .map(rankedItem)
    .filter((item) => item.reviews > 0)
    .sort((a, b) => (b.reviews - a.reviews) || ((b.average ?? -1) - (a.average ?? -1)) || a.name.localeCompare(b.name, 'es'))
    .slice(0, limit);

/** Platos con nota por debajo de «Muy bueno» (los más flojos primero), sin repetir los del podio. */
export const itemsToImprove = (items: readonly CanonicalPlaceItem[], exclude: ReadonlySet<string>, limit: number): RankedItem[] => starCandidates(items)
    .filter((item) => item.average! < STAR_MIN_AVERAGE && !exclude.has(item.id))
    .sort((a, b) => (a.average! - b.average!) || (b.ratings - a.ratings))
    .slice(0, limit);

// ── Titulares ───────────────────────────────────────────────────────────────

export interface Headline {
    key: string;
    emoji: string;
    text: string;
    /** Pestaña a la que lleva al tocarlo. */
    action?: 'sponsored';
}

export interface HeadlineInput {
    /** null mientras carga o si falló: sin tráfico no hay titulares de visitas ni el de «empezando». */
    traffic: {
        views: number;
        prevViews: number | null;
        /** Visitas de todo lo leído (60 días): decide el «estamos empezando». */
        totalViews: number;
        searchViews: number;
        topShareChannel: string | null;
        bestWeekdayPlural: string | null;
    } | null;
    bestItem: RankedItem | null;
}

/** «1 de cada 3 visitas…», o una frase redonda si son más de la mitad. */
const searchHeadline = (share: number): string => {
    if (share >= 0.8) return 'Casi todas tus visitas llegan desde buscadores';
    if (share >= 0.5) return 'Más de la mitad de tus visitas llega desde buscadores';
    return `1 de cada ${Math.round(1 / share)} visitas llega desde buscadores`;
};

const MIN_VIEWS_FOR_HEADLINE = 10;

/** Hasta `max` titulares, en el orden de la spec (§9.1). */
export const computeHeadlines = ({ traffic, bestItem }: HeadlineInput, max = 3): Headline[] => {
    const list: Headline[] = [];
    if (traffic && traffic.prevViews !== null && traffic.prevViews > 0) {
        const percent = Math.round(((traffic.views - traffic.prevViews) / traffic.prevViews) * 100);
        if (percent >= 10 && traffic.views >= MIN_VIEWS_FOR_HEADLINE) {
            list.push({ key: 'streak', emoji: '🔥', text: `¡Tu ficha está en racha! +${percent} % visitas` });
        } else if (percent <= -10 && traffic.prevViews >= MIN_VIEWS_FOR_HEADLINE) {
            list.push({ key: 'calm', emoji: '🧊', text: 'Días tranquilos… ¿Le damos un impulso? 📣', action: 'sponsored' });
        }
    }
    if (bestItem && bestItem.average !== null) {
        list.push({
            key: 'star',
            emoji: '🥇',
            text: `Tu estrella es ${bestItem.name} · ${formatScore(bestItem.average)} ${SCORE_BAND_EMOJI[scoreBand(bestItem.average)]}`,
        });
    }
    if (traffic && traffic.views >= MIN_VIEWS_FOR_HEADLINE && traffic.searchViews / traffic.views >= 0.25) {
        list.push({ key: 'search', emoji: '🔎', text: searchHeadline(traffic.searchViews / traffic.views) });
    }
    if (traffic?.topShareChannel === 'whatsapp') {
        list.push({ key: 'whatsapp', emoji: '💚', text: 'Te recomiendan sobre todo por WhatsApp' });
    }
    if (traffic?.bestWeekdayPlural) {
        list.push({ key: 'weekday', emoji: '📅', text: `Los ${traffic.bestWeekdayPlural} es cuando más te miran` });
    }
    if (list.length === 0 && traffic && traffic.totalViews < MIN_VIEWS_FOR_HEADLINE) {
        list.push({ key: 'empty', emoji: '🌱', text: 'Estamos empezando a recoger datos. Vuelve en unos días 😉' });
    }
    return list.slice(0, max);
};

// ── Campañas ────────────────────────────────────────────────────────────────

export interface CampaignSummary {
    /** Vistas y clics sumados de las campañas en marcha o terminadas. */
    totals: SponsoredMetrics;
    /** Filas para la tarjeta (sin las rechazadas), recientes primero. */
    rows: CampaignRow[];
}

export const summarizeCampaigns = (placements: SponsoredPlacement[], spotlights: ItemSpotlight[]): CampaignSummary => {
    const rows = mergeCampaigns(placements, spotlights).filter((row) => row.status !== 'rejected');
    const measured = rows.filter((row) => row.status === 'active' || row.status === 'ended');
    const metricsOf = (row: CampaignRow) => (row.kind === 'spotlight' ? row.spotlight.metrics : row.placement.metrics);
    return {
        totals: {
            impressions: sumOf(measured, (row) => metricsOf(row).impressions),
            clicks: sumOf(measured, (row) => metricsOf(row).clicks),
        },
        rows,
    };
};
