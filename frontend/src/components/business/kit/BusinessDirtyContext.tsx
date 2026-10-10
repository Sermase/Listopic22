/**
 * Cambios sin guardar en toda la gestión del negocio.
 *
 *   // BusinessManagePage (dentro de ConfirmProvider):
 *   <BusinessDirtyProvider>…</BusinessDirtyProvider>
 *
 *   // Cada pestaña o sección informa de su estado (y opcionalmente cómo descartarlo):
 *   useReportDirty('ficha:pets', dirty, '🐾 Mascotas', () => setDraft(saved));
 *
 *   // Antes de cambiar de pestaña, sección o cerrar un modal:
 *   const { confirmLeave } = useLeaveGuard();
 *   if (!(await confirmLeave())) return;               // todo lo pendiente
 *   if (!(await confirmLeave('ficha:pets'))) return;   // solo esa clave
 *
 * Si no hay nada pendiente, confirmLeave resuelve true sin preguntar. Si la
 * persona elige «Salir», se llama al descarte de cada clave afectada. Mientras
 * haya algo pendiente hay un único aviso `beforeunload` al cerrar o recargar.
 * Fuera del provider los hooks no hacen nada (confirmLeave → true).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useConfirm } from '../../../context/ConfirmContext';

type DirtyEntries = Record<string, { label: string }>;

interface DirtyActions {
    report: (key: string, dirty: boolean, label: string) => void;
    setDiscard: (key: string, discard: (() => void) | null) => void;
    confirmLeave: (keys?: string | string[]) => Promise<boolean>;
}

const DirtyActionsContext = createContext<DirtyActions | null>(null);
const DirtyStateContext = createContext<DirtyEntries>({});

const joinLabels = (labels: string[]): string => {
    if (labels.length <= 1) return labels[0] || 'esta sección';
    return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
};

export const BusinessDirtyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const confirm = useConfirm();
    const [entries, setEntries] = useState<DirtyEntries>({});
    // Fuente de verdad síncrona: confirmLeave lee siempre lo último informado.
    const entriesRef = useRef<DirtyEntries>(entries);
    const discardsRef = useRef(new Map<string, () => void>());

    const report = useCallback((key: string, dirty: boolean, label: string) => {
        const prev = entriesRef.current;
        let next = prev;
        if (dirty) {
            if (prev[key]?.label !== label) next = { ...prev, [key]: { label } };
        } else if (key in prev) {
            next = { ...prev };
            delete next[key];
        }
        if (next === prev) return;
        entriesRef.current = next;
        setEntries(next);
    }, []);

    const setDiscard = useCallback((key: string, discard: (() => void) | null) => {
        if (discard) discardsRef.current.set(key, discard);
        else discardsRef.current.delete(key);
    }, []);

    const confirmLeave = useCallback(async (keys?: string | string[]) => {
        const current = entriesRef.current;
        const wanted = keys == null ? Object.keys(current) : (Array.isArray(keys) ? keys : [keys]);
        const scope = wanted.filter((key) => key in current);
        if (scope.length === 0) return true;

        const labels = Array.from(new Set(scope.map((key) => current[key].label).filter(Boolean)));
        const ok = await confirm({
            title: '¿Salir sin guardar?',
            message: `Perderás los cambios en ${joinLabels(labels)}.`,
            confirmLabel: 'Salir',
            cancelLabel: 'Seguir editando',
            destructive: true,
        });
        if (ok) scope.forEach((key) => discardsRef.current.get(key)?.());
        return ok;
    }, [confirm]);

    const anyDirty = Object.keys(entries).length > 0;
    useEffect(() => {
        if (!anyDirty) return;
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            // Chrome antiguo necesita returnValue para enseñar el aviso.
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [anyDirty]);

    const actions = useMemo<DirtyActions>(() => ({ report, setDiscard, confirmLeave }), [report, setDiscard, confirmLeave]);

    return (
        <DirtyActionsContext.Provider value={actions}>
            <DirtyStateContext.Provider value={entries}>
                {children}
            </DirtyStateContext.Provider>
        </DirtyActionsContext.Provider>
    );
};

/**
 * Informa de si `key` tiene cambios sin guardar. `label` es lo que verá la
 * persona en «Perderás los cambios en {label}». Al desmontar se retira.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useReportDirty(key: string, dirty: boolean, label: string, onDiscard?: () => void): void {
    const actions = useContext(DirtyActionsContext);
    const onDiscardRef = useRef(onDiscard);
    const hasDiscard = Boolean(onDiscard);

    useEffect(() => {
        onDiscardRef.current = onDiscard;
    }, [onDiscard]);

    useEffect(() => {
        actions?.report(key, dirty, label);
    }, [actions, key, dirty, label]);

    useEffect(() => {
        if (!actions) return;
        actions.setDiscard(key, hasDiscard ? () => onDiscardRef.current?.() : null);
        return () => actions.setDiscard(key, null);
    }, [actions, key, hasDiscard]);

    useEffect(() => () => actions?.report(key, false, ''), [actions, key]);
}

export interface LeaveGuard {
    /** Pregunta antes de salir si hay cambios (todas las claves o solo `keys`). */
    confirmLeave: (keys?: string | string[]) => Promise<boolean>;
    /** Hay algo sin guardar en alguna parte. */
    dirty: boolean;
    /** Etiquetas de lo que está sin guardar. */
    dirtyLabels: string[];
    /** ¿Esta clave tiene cambios sin guardar? */
    isDirty: (key: string) => boolean;
}

const alwaysLeave = async () => true;

// eslint-disable-next-line react-refresh/only-export-components
export function useLeaveGuard(): LeaveGuard {
    const actions = useContext(DirtyActionsContext);
    const entries = useContext(DirtyStateContext);
    const isDirty = useCallback((key: string) => key in entries, [entries]);
    return useMemo(() => ({
        confirmLeave: actions?.confirmLeave ?? alwaysLeave,
        dirty: Object.keys(entries).length > 0,
        dirtyLabels: Array.from(new Set(Object.values(entries).map((entry) => entry.label))),
        isDirty,
    }), [actions, entries, isDirty]);
}
