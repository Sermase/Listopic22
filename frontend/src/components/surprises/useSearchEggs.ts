import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppConfig } from '../../context/AppConfigContext';
import { LAB_EGG_KEY, fireSurprise, isAnsieviQuery, isSurpriseOn, tortillaQuery } from '../../lib/surprises';

/** Lo escondido del buscador: la encuesta de la tortilla y «ansievi». */
export function useSearchEggs(query: string): void {
    const config = useAppConfig();
    const navigate = useNavigate();
    const lastFired = useRef('');

    useEffect(() => {
        const q = query.trim();
        if (!q || q === lastFired.current) return;
        const side = tortillaQuery(q);
        if (side && isSurpriseOn(config, 'tortilla')) {
            lastFired.current = q;
            fireSurprise({ kind: 'tortilla', side });
        } else if (isAnsieviQuery(q) && isSurpriseOn(config, 'ansievi')) {
            lastFired.current = q;
            try { sessionStorage.setItem(LAB_EGG_KEY, '1'); } catch { /* sin almacenamiento */ }
            navigate('/lab');
        }
    }, [query, config, navigate]);
}
