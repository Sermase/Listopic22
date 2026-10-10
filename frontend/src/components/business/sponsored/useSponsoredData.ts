/**
 * Datos de 📣 Promos, cada uno con su propia carga y su propio error (S2, S5):
 * si falla uno, los demás siguen y nunca se pinta un 0 o una lista vacía falsos.
 *
 *   const { offers, placements, spotlights, items } = useSponsoredData(placeId);
 *   if (offers.status === 'error') return <PanelError what="tus ofertas" onRetry={offers.reload} />;
 *   offers.setData((prev) => [...prev, created]);
 *   await spotlights.refresh();   // sin pasar por «cargando»
 */
import { useCallback, useEffect, useState } from 'react';
import type { CanonicalPlaceItem } from '../../../services/CanonicalItemService';
import {
    getBusinessOffers,
    getPlaceItemSpotlights,
    getPlaceSponsoredPlacements,
    type BusinessOffer,
    type ItemSpotlight,
    type SponsoredPlacement,
} from '../../../services/BusinessProService';
import { getPlaceItemsHealed } from '../items/getPlaceItemsHealed';

export type LoadStatus = 'loading' | 'ready' | 'error';

export interface Loadable<T> {
    status: LoadStatus;
    data: T;
    /** Vuelve a cargar mostrando «cargando» (botón Reintentar). */
    reload: () => void;
    /** Vuelve a leer en segundo plano; si falla, se queda lo que había. */
    refresh: () => Promise<void>;
    setData: (updater: T | ((prev: T) => T)) => void;
}

function useLoadable<T>(loader: (placeId: string) => Promise<T>, placeId: string, initial: T, label: string): Loadable<T> {
    const [state, setState] = useState<{ status: LoadStatus; data: T }>({ status: 'loading', data: initial });
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let cancelled = false;
        loader(placeId)
            .then((data) => {
                if (!cancelled) setState({ status: 'ready', data });
            })
            .catch((error) => {
                console.error(`BusinessSponsoredSection: ${label} load failed`, error);
                if (!cancelled) setState((prev) => ({ status: 'error', data: prev.data }));
            });
        return () => {
            cancelled = true;
        };
    }, [loader, placeId, tick, label]);

    const reload = useCallback(() => {
        setState((prev) => ({ ...prev, status: 'loading' }));
        setTick((value) => value + 1);
    }, []);

    const refresh = useCallback(async () => {
        try {
            const data = await loader(placeId);
            setState({ status: 'ready', data });
        } catch (error) {
            console.warn(`BusinessSponsoredSection: ${label} refresh failed`, error);
        }
    }, [loader, placeId, label]);

    const setData = useCallback((updater: T | ((prev: T) => T)) => {
        setState((prev) => ({
            status: prev.status,
            data: typeof updater === 'function' ? (updater as (prev: T) => T)(prev.data) : updater,
        }));
    }, []);

    return { status: state.status, data: state.data, reload, refresh, setData };
}

export interface SponsoredData {
    offers: Loadable<BusinessOffer[]>;
    placements: Loadable<SponsoredPlacement[]>;
    spotlights: Loadable<ItemSpotlight[]>;
    items: Loadable<CanonicalPlaceItem[]>;
}

const NO_OFFERS: BusinessOffer[] = [];
const NO_PLACEMENTS: SponsoredPlacement[] = [];
const NO_SPOTLIGHTS: ItemSpotlight[] = [];
const NO_ITEMS: CanonicalPlaceItem[] = [];

export function useSponsoredData(placeId: string): SponsoredData {
    return {
        offers: useLoadable(getBusinessOffers, placeId, NO_OFFERS, 'offers'),
        placements: useLoadable(getPlaceSponsoredPlacements, placeId, NO_PLACEMENTS, 'placements'),
        spotlights: useLoadable(getPlaceItemSpotlights, placeId, NO_SPOTLIGHTS, 'spotlights'),
        items: useLoadable(getPlaceItemsHealed, placeId, NO_ITEMS, 'items'),
    };
}
