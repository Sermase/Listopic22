import { useEffect, useState } from 'react';

/**
 * Una elección de interfaz (vista, agrupación…) que se recuerda en este
 * navegador. Si el almacenamiento no está disponible, funciona igual sin recordar.
 */
export function useStoredChoice<T extends string>(key: string, allowed: readonly T[], fallback: T) {
    const [value, setValue] = useState<T>(() => {
        try {
            const stored = localStorage.getItem(key);
            if (stored && (allowed as readonly string[]).includes(stored)) return stored as T;
        } catch {
            // Sin almacenamiento (modo privado, bloqueado): valor por defecto.
        }
        return fallback;
    });

    useEffect(() => {
        try {
            localStorage.setItem(key, value);
        } catch {
            // Ignorado: recordar es opcional.
        }
    }, [key, value]);

    return [value, setValue] as const;
}
