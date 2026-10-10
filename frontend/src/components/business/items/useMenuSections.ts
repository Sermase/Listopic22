/**
 * Secciones de la carta: se guardan solas al momento (la lista entera en cada
 * guardado, en orden) y nunca antes de haber leído las guardadas de este
 * negocio, porque un cambio hecho antes borraría las del servidor.
 *
 *   const menu = useMenuSections(placeId, { onSaved, onError });
 *   menu.commit([...menu.sections, 'Postres']);              // al momento
 *   menu.commit(reordered, { debounce: true });              // reordenar: espera 800 ms
 *   const ok = await menu.commit(renamed);                    // true si se guardó
 *
 * Si un guardado falla se vuelve a lo guardado en el servidor (si no hubo
 * cambios después) y se avisa con onError. Una lectura que empezó antes de un
 * cambio local no lo pisa.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    getBusinessMenuSections,
    updateBusinessMenuSections,
} from '../../../services/BusinessProService';

export const SECTION_REORDER_DEBOUNCE_MS = 800;

export interface MenuSectionsState {
    /** Nombres en el orden público. */
    sections: string[];
    /** Ya se leyeron las guardadas de este negocio: se pueden editar. */
    ready: boolean;
    loading: boolean;
    /** No se pudieron leer (y aún no hay nada leído). */
    loadError: boolean;
    saving: boolean;
    reload: () => Promise<void>;
    commit: (next: string[], options?: { debounce?: boolean }) => Promise<boolean>;
}

interface Options {
    onSaved?: () => void;
    onError?: (error: unknown, restored: boolean) => void;
}

export function useMenuSections(placeId: string, { onSaved, onError }: Options = {}): MenuSectionsState {
    const [sections, setSections] = useState<string[]>([]);
    const [readyFor, setReadyFor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [saving, setSaving] = useState(false);

    const version = useRef(0);
    const inFlight = useRef(0);
    const chain = useRef<Promise<unknown>>(Promise.resolve());
    const timer = useRef<number | undefined>(undefined);
    const waiting = useRef<Array<(ok: boolean) => void>>([]);
    const latest = useRef<string[]>([]);
    const readyRef = useRef(false);
    const callbacks = useRef({ onSaved, onError });
    useEffect(() => {
        callbacks.current = { onSaved, onError };
    }, [onSaved, onError]);

    const ready = readyFor === placeId;
    useEffect(() => {
        readyRef.current = ready;
    }, [ready]);

    const reload = useCallback(async () => {
        const startVersion = version.current;
        setLoading(true);
        try {
            const rows = await getBusinessMenuSections(placeId);
            // Ni guardados en curso, ni uno esperando, ni cambios durante la lectura.
            if (inFlight.current === 0 && timer.current === undefined && version.current === startVersion) {
                const names = rows.map((section) => section.name);
                latest.current = names;
                setSections(names);
            }
            setLoadError(false);
            readyRef.current = true;
            setReadyFor(placeId);
        } catch (error) {
            console.error('useMenuSections: load failed', error);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [placeId]);

    useEffect(() => {
        void reload();
    }, [reload]);

    const send = useCallback((names: string[]): Promise<boolean> => {
        inFlight.current += 1;
        setSaving(true);
        const run = chain.current.then(async () => {
            let failure: unknown = null;
            try {
                await updateBusinessMenuSections(placeId, names);
            } catch (error) {
                failure = error;
                console.error('useMenuSections: save failed', error);
            }
            inFlight.current -= 1;
            const settled = inFlight.current === 0 && timer.current === undefined;
            if (failure) {
                // Solo informa el último: si hay otro detrás, ese lleva la lista buena.
                if (settled) {
                    const startVersion = version.current;
                    const saved = await getBusinessMenuSections(placeId).catch(() => null);
                    const restored = Boolean(saved) && version.current === startVersion && inFlight.current === 0 && timer.current === undefined;
                    if (restored && saved) {
                        const savedNames = saved.map((section) => section.name);
                        latest.current = savedNames;
                        setSections(savedNames);
                    }
                    callbacks.current.onError?.(failure, restored);
                }
            } else if (settled) {
                callbacks.current.onSaved?.();
            }
            if (inFlight.current === 0 && timer.current === undefined) setSaving(false);
            return !failure;
        });
        chain.current = run.catch(() => undefined);
        return run;
    }, [placeId]);

    const takeWaiting = useCallback(() => {
        const resolvers = waiting.current;
        waiting.current = [];
        return resolvers;
    }, []);

    const commit = useCallback((next: string[], { debounce = false }: { debounce?: boolean } = {}): Promise<boolean> => {
        if (!readyRef.current) return Promise.resolve(false);
        version.current += 1;
        latest.current = next;
        setSections(next);
        window.clearTimeout(timer.current);
        timer.current = undefined;
        if (debounce) {
            setSaving(true);
            return new Promise<boolean>((resolve) => {
                waiting.current.push(resolve);
                timer.current = window.setTimeout(() => {
                    timer.current = undefined;
                    const resolvers = takeWaiting();
                    void send(latest.current).then((ok) => resolvers.forEach((done) => done(ok)));
                }, SECTION_REORDER_DEBOUNCE_MS);
            });
        }
        const resolvers = takeWaiting();
        return send(next).then((ok) => {
            resolvers.forEach((done) => done(ok));
            return ok;
        });
    }, [send, takeWaiting]);

    // Al salir con un reordenado esperando, se guarda ya (no se pierde).
    useEffect(() => () => {
        if (timer.current === undefined) return;
        window.clearTimeout(timer.current);
        timer.current = undefined;
        const resolvers = takeWaiting();
        void updateBusinessMenuSections(placeId, latest.current)
            .then(() => resolvers.forEach((done) => done(true)))
            .catch(() => resolvers.forEach((done) => done(false)));
    }, [placeId, takeWaiting]);

    return {
        sections: ready ? sections : [],
        ready,
        loading,
        loadError: loadError && !ready,
        saving,
        reload,
        commit,
    };
}
