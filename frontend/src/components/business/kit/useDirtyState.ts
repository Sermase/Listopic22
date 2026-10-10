/**
 * ¿Difiere el borrador de lo guardado? Comparación profunda; una clave con
 * `undefined` cuenta igual que una clave que no está.
 *
 *   const { dirty } = useDirtyState(saved.data, draft.data);
 *   const { dirty } = useDirtyState(saved, draft, (a, b) => a.id === b.id);
 */
import { useMemo } from 'react';

export const isDeepEqual = (a: unknown, b: unknown): boolean => {
    if (Object.is(a, b)) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;

    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
        return a.every((item, index) => isDeepEqual(item, b[index]));
    }

    if (a instanceof Date || b instanceof Date) {
        return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
    }

    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aRecord), ...Object.keys(bRecord)]);
    for (const key of keys) {
        if (!isDeepEqual(aRecord[key], bRecord[key])) return false;
    }
    return true;
};

export function useDirtyState<T>(saved: T, draft: T, isEqual: (a: T, b: T) => boolean = isDeepEqual): { dirty: boolean } {
    const dirty = useMemo(() => !isEqual(saved, draft), [saved, draft, isEqual]);
    return { dirty };
}
