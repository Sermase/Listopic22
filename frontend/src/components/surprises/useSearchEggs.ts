import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppConfig } from '../../context/AppConfigContext';
import { LAB_EGG_KEY, POLL_SURPRISE, fireSurprise, isAnsieviQuery, isSurpriseOn, pollQuery, pollVotedHere } from '../../lib/surprises';

/** Lo escondido del buscador: las encuestas (tortilla, piña) y «ansievi». Cada encuesta sale sola una vez por visita y no vuelve si ya votaste. */
export function useSearchEggs(query: string): void {
    const config = useAppConfig();
    const navigate = useNavigate();
    const lastFired = useRef('');
    const pollsShown = useRef(new Set<string>());

    useEffect(() => {
        const q = query.trim();
        if (!q || q === lastFired.current) return;
        const match = pollQuery(q);
        if (match) {
            if (isSurpriseOn(config, POLL_SURPRISE[match.poll]) && !pollsShown.current.has(match.poll) && !pollVotedHere(match.poll)) {
                pollsShown.current.add(match.poll);
                lastFired.current = q;
                fireSurprise({ kind: 'poll', poll: match.poll, side: match.side });
            }
        } else if (isAnsieviQuery(q) && isSurpriseOn(config, 'ansievi')) {
            lastFired.current = q;
            try { sessionStorage.setItem(LAB_EGG_KEY, '1'); } catch { /* sin almacenamiento */ }
            navigate('/lab');
        }
    }, [query, config, navigate]);
}
