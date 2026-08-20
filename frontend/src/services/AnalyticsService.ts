import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { ShareEntityPayload } from '../types/share';

export type AnalyticsDevice = 'mobile' | 'tablet' | 'desktop';
export type AnalyticsSource = 'direct' | 'internal' | 'search' | 'social' | 'external';
export type AnalyticsShareChannel = 'whatsapp' | 'clipboard' | 'image' | 'chat';

export interface AnalyticsBreakdown {
    path: string;
    title: string;
    pageType: string;
    totalViews: number;
    uniqueSessions: number;
    authenticatedViews: number;
    anonymousViews: number;
    totalShares: number;
    shareActions: number;
    byDevice: Record<string, number>;
    bySource: Record<string, number>;
    byShareChannel: Record<string, number>;
    byShareEntityType: Record<string, number>;
    firstViewedAtMs: number | null;
    lastViewedAtMs: number | null;
    lastSharedAtMs: number | null;
}

export interface AnalyticsDailyRow extends AnalyticsBreakdown {
    date: string;
}

export interface PageAnalyticsResult {
    path: string;
    days: number;
    total: AnalyticsBreakdown;
    daily: AnalyticsDailyRow[];
}

export interface AnalyticsOverviewResult {
    days: number;
    fromDate: string;
    coverageCapped: boolean;
    allTime: AnalyticsBreakdown;
    daily: AnalyticsDailyRow[];
    topPages: AnalyticsBreakdown[];
}

export interface PlaceAnalyticsDaily {
    date: string;
    reviews: number;
    totalShares: number;
    shareActions: number;
    byShareChannel: Record<string, number>;
    byShareEntityType: Record<string, number>;
}

export interface BusinessPlaceAnalyticsResult {
    placeId: string;
    days: number;
    page: PageAnalyticsResult;
    relatedDaily: PlaceAnalyticsDaily[];
}

export interface AnalyticsHeatPoint {
    id: string;
    lat: number;
    lng: number;
    count: number;
    label?: string;
    placeId?: string;
}

export interface AnalyticsHeatmapsResult {
    days: number;
    fromDate: string;
    privacyThreshold: number;
    coverageCapped: boolean;
    suppressedConnections: number;
    connections: AnalyticsHeatPoint[];
    reviews: AnalyticsHeatPoint[];
}

export interface ReviewHeatmapBackfillResult {
    scanned: number;
    aggregatedRows: number;
    skipped: number;
    coverageCapped: boolean;
}

const SESSION_STORAGE_KEY = 'listopicAnalyticsSession';
let trackedInitialRoute = false;

export const normalizeAnalyticsPath = (pathname: string): string => {
    const withoutQuery = pathname.split(/[?#]/, 1)[0] || '/';
    const normalized = withoutQuery.replace(/\/{2,}/g, '/').replace(/\/$/, '');
    return normalized || '/';
};

export const isTrackableAnalyticsPath = (pathname: string): boolean => {
    const path = normalizeAnalyticsPath(pathname);
    return path === '/'
        || path === '/search'
        || path === '/users'
        || /^\/list\/[^/]+$/.test(path)
        || /^\/place\/[^/]+$/.test(path)
        || /^\/group\/[^/]+(?:\/.*)?$/.test(path)
        || /^\/profile\/[^/]+$/.test(path)
        || ['/about', '/privacy', '/terms', '/child-safety', '/istari-core'].includes(path);
};

const newSessionId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
};

const newEventId = (): string => newSessionId();

export const getAnalyticsSessionId = (): string => {
    try {
        const current = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (current && current.length >= 16) return current;
        const created = newSessionId();
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, created);
        return created;
    } catch {
        return newSessionId();
    }
};

const detectDevice = (): AnalyticsDevice => {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1100) return 'tablet';
    return 'desktop';
};

const detectInitialSource = (): AnalyticsSource => {
    if (!document.referrer) return 'direct';
    try {
        const referrer = new URL(document.referrer);
        if (referrer.hostname === window.location.hostname) return 'internal';
        if (/(google|bing|duckduckgo|yahoo|ecosia)\./i.test(referrer.hostname)) return 'search';
        if (/(instagram|facebook|tiktok|twitter|x\.com|linkedin|pinterest)\./i.test(referrer.hostname)) return 'social';
        return 'external';
    } catch {
        return 'external';
    }
};

export const recordPageView = async (pathname: string): Promise<void> => {
    if (import.meta.env.DEV || !isTrackableAnalyticsPath(pathname)) return;
    const source = trackedInitialRoute ? 'internal' : detectInitialSource();
    trackedInitialRoute = true;
    const callable = httpsCallable(functions, 'recordPageView');
    await callable({
        path: normalizeAnalyticsPath(pathname),
        title: document.title,
        sessionId: getAnalyticsSessionId(),
        device: detectDevice(),
        source,
    });
};

export const recordShareEvent = async (
    entity: ShareEntityPayload,
    channel: AnalyticsShareChannel,
    count = 1,
): Promise<void> => {
    if (import.meta.env.DEV) return;
    const path = normalizeAnalyticsPath(entity.route || window.location.pathname);
    if (!isTrackableAnalyticsPath(path)) return;
    const callable = httpsCallable(functions, 'recordShareEvent');
    await callable({
        path,
        title: entity.title,
        entityType: entity.type,
        entityId: entity.id || '',
        channel,
        count,
        eventId: newEventId(),
    });
};

export const recordConnectionLocation = async (latitude: number, longitude: number): Promise<void> => {
    if (import.meta.env.DEV || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    // El servidor vuelve a aplicar la misma reduccion. Nunca enviamos la
    // coordenada precisa al sistema de analitica.
    const lat = Number((Math.round(latitude * 10) / 10).toFixed(1));
    const lng = Number((Math.round(longitude * 10) / 10).toFixed(1));
    const callable = httpsCallable(functions, 'recordConnectionLocation');
    await callable({ lat, lng, sessionId: getAnalyticsSessionId() });
};

export const getPageAnalytics = async (pathname: string, days = 30): Promise<PageAnalyticsResult> => {
    const callable = httpsCallable<{ path: string; days: number }, PageAnalyticsResult>(functions, 'getPageAnalytics');
    const result = await callable({ path: normalizeAnalyticsPath(pathname), days });
    return result.data;
};

export const getAnalyticsOverview = async (days = 30): Promise<AnalyticsOverviewResult> => {
    const callable = httpsCallable<{ days: number }, AnalyticsOverviewResult>(functions, 'getAnalyticsOverview');
    const result = await callable({ days });
    return result.data;
};

export const getBusinessPlaceAnalytics = async (placeId: string, days = 30): Promise<BusinessPlaceAnalyticsResult> => {
    const callable = httpsCallable<{ placeId: string; days: number }, BusinessPlaceAnalyticsResult>(functions, 'getBusinessPlaceAnalytics');
    const result = await callable({ placeId, days });
    return result.data;
};

export const getAnalyticsHeatmaps = async (days = 30): Promise<AnalyticsHeatmapsResult> => {
    const callable = httpsCallable<{ days: number }, AnalyticsHeatmapsResult>(functions, 'getAnalyticsHeatmaps');
    const result = await callable({ days });
    return result.data;
};

export const backfillReviewHeatmap = async (): Promise<ReviewHeatmapBackfillResult> => {
    const callable = httpsCallable<Record<string, never>, ReviewHeatmapBackfillResult>(functions, 'adminBackfillReviewHeatmap');
    const result = await callable({});
    return result.data;
};
