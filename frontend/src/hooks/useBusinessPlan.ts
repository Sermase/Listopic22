import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { FREE_BUSINESS_PLAN, getBusinessPlanFromPlace, type BusinessPlan } from '../utils/businessPlan';

export interface UseBusinessPlanResult {
    plan: BusinessPlan;
    loading: boolean;
}

// Plan Business Pro de un lugar. Para pantallas que ya cargan el documento del
// lugar (como BusinessManagePage), usar getBusinessPlanFromPlace directamente.
export const useBusinessPlan = (placeId: string | undefined): UseBusinessPlanResult => {
    const [plan, setPlan] = useState<BusinessPlan>(FREE_BUSINESS_PLAN);
    const [loading, setLoading] = useState(Boolean(placeId));

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            if (!placeId) {
                setPlan(FREE_BUSINESS_PLAN);
                setLoading(false);
                return;
            }
            setLoading(true);
            try {
                const snap = await getDoc(doc(db, 'places', placeId));
                if (!cancelled) setPlan(getBusinessPlanFromPlace(snap.exists() ? snap.data() : null));
            } catch (error) {
                console.error('useBusinessPlan: load failed', error);
                if (!cancelled) setPlan(FREE_BUSINESS_PLAN);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [placeId]);

    return { plan, loading };
};
