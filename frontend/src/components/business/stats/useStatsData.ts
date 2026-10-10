/**
 * Datos de 📊 Estadísticas, cada fuente con su propia carga y su propio error
 * (T4): si falla la analítica, las valoraciones y la carta se siguen viendo, y
 * nunca se pinta un 0 en lugar de un error.
 *
 *   const { traffic, reviews, items, campaigns, rating, refreshAll } = useStatsData(placeId, ratingProp);
 *   if (traffic.status === 'error') return <PanelError what="tus visitas" onRetry={traffic.reload} />;
 *   const ok = await refreshAll();   // «🔄 Actualizar»: relee sin pasar por «cargando»
 *
 * La nota pública llega de la página (`rating`); si no la pasa, se lee aquí.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { getBusinessPlaceAnalytics } from '../../../services/AnalyticsService';
import { getCanonicalPlaceItems, type CanonicalPlaceItem } from '../../../services/CanonicalItemService';
import {
    getLatestPlaceReviewsForManager,
    getPlaceItemSpotlights,
    getPlaceSponsoredPlacements,
    type ManagerPlaceReview,
} from '../../../services/BusinessProService';
import { placeRating, type PlaceRating } from '../../../lib/placeRating';
import { STATS_FETCH_DAYS } from './statsMeta';
import { dailyStats, summarizeCampaigns, type CampaignSummary, type DayStats } from './statsModel';

export type StatsLoadStatus = 'loading' | 'ready' | 'error';

export interface StatsSource<T> {
    status: StatsLoadStatus;
    /** Lo último que llegó bien (se conserva al recargar o si falla un «Actualizar»). */
    data: T | null;
    /** Vuelve a cargar mostrando «cargando» (botón Reintentar). */
    reload: () => void;
    /** Relee en segundo plano; true si fue bien (o si la fuente está apagada). */
    refresh: () => Promise<boolean>;
}

export interface StatsReviews {
    reviews: ManagerPlaceReview[];
    /** Son las más recientes (con el índice de createdAt); si no, unas cualquiera. */
    newestFirst: boolean;
    /** Se leyó el máximo: puede haber más. */
    capped: boolean;
}

function useStatsSource<T>(loader: (() => Promise<T>) | null, label: string): StatsSource<T> {
    const [state, setState] = useState<{ status: StatsLoadStatus; data: T | null }>({ status: 'loading', data: null });
    const [tick, setTick] = useState(0);
    // El cargador vigente, para que un «refresh» lento nunca escriba datos de otro sitio.
    const loaderRef = useRef(loader);
    useEffect(() => {
        loaderRef.current = loader;
    }, [loader]);

    useEffect(() => {
        if (!loader) return undefined;
        let cancelled = false;
        loader()
            .then((data) => {
                if (!cancelled) setState({ status: 'ready', data });
            })
            .catch((error) => {
                console.error(`BusinessStatsSection: ${label} load failed`, error);
                if (!cancelled) setState((prev) => ({ status: 'error', data: prev.data }));
            });
        return () => {
            cancelled = true;
        };
    }, [loader, label, tick]);

    const reload = useCallback(() => {
        setState((prev) => ({ ...prev, status: 'loading' }));
        setTick((value) => value + 1);
    }, []);

    const refresh = useCallback(async () => {
        if (!loader) return true;
        try {
            const data = await loader();
            if (loaderRef.current === loader) setState({ status: 'ready', data });
            return true;
        } catch (error) {
            console.warn(`BusinessStatsSection: ${label} refresh failed`, error);
            return false;
        }
    }, [loader, label]);

    return { status: state.status, data: state.data, reload, refresh };
}

export interface StatsData {
    traffic: StatsSource<DayStats[]>;
    reviews: StatsSource<StatsReviews>;
    items: StatsSource<CanonicalPlaceItem[]>;
    campaigns: StatsSource<CampaignSummary>;
    /** Nota pública: la de la página si la pasa; si no, leída aquí. */
    rating: { status: StatsLoadStatus; data: PlaceRating | null; reload: () => void };
    /** Relee todo en segundo plano. false si alguna fuente no se pudo actualizar. */
    refreshAll: () => Promise<boolean>;
}

export function useStatsData(placeId: string, ratingProp?: PlaceRating | null): StatsData {
    const loadTraffic = useCallback(
        () => getBusinessPlaceAnalytics(placeId, STATS_FETCH_DAYS).then(dailyStats),
        [placeId],
    );
    const loadReviews = useCallback(() => getLatestPlaceReviewsForManager(placeId), [placeId]);
    const loadItems = useCallback(() => getCanonicalPlaceItems(placeId), [placeId]);
    const loadCampaigns = useCallback(
        () => Promise.all([getPlaceSponsoredPlacements(placeId), getPlaceItemSpotlights(placeId)])
            .then(([placements, spotlights]) => summarizeCampaigns(placements, spotlights)),
        [placeId],
    );
    const ratingFromPage = ratingProp !== undefined;
    const loadRating = useCallback(async (): Promise<PlaceRating> => {
        const snap = await getDoc(doc(db, 'places', placeId));
        if (!snap.exists()) throw new Error('No se encontró el lugar');
        return placeRating(snap.data());
    }, [placeId]);

    const traffic = useStatsSource(loadTraffic, 'traffic');
    const reviews = useStatsSource(loadReviews, 'reviews');
    const items = useStatsSource(loadItems, 'items');
    const campaigns = useStatsSource(loadCampaigns, 'campaigns');
    const ownRating = useStatsSource(ratingFromPage ? null : loadRating, 'rating');

    const rating: StatsData['rating'] = ratingFromPage
        ? { status: ratingProp ? 'ready' : 'error', data: ratingProp ?? null, reload: () => undefined }
        : { status: ownRating.status, data: ownRating.data, reload: ownRating.reload };

    const { refresh: refreshTraffic } = traffic;
    const { refresh: refreshReviews } = reviews;
    const { refresh: refreshItems } = items;
    const { refresh: refreshCampaigns } = campaigns;
    const { refresh: refreshRating } = ownRating;
    const refreshAll = useCallback(async () => {
        const results = await Promise.all([refreshTraffic(), refreshReviews(), refreshItems(), refreshCampaigns(), refreshRating()]);
        return results.every(Boolean);
    }, [refreshTraffic, refreshReviews, refreshItems, refreshCampaigns, refreshRating]);

    return { traffic, reviews, items, campaigns, rating, refreshAll };
}
