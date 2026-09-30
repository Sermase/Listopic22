/**
 * Escritura con campos nuevos que las reglas desplegadas quizá aún no aceptan
 * (p. ej. `scoringWeights` antes de desplegar las reglas de B1). Se intenta con
 * ellos y, si Firestore responde «permission-denied», se repite sin ellos.
 * Si el segundo intento también falla, el error es real y se propaga.
 */
export const isPermissionDeniedError = (error: unknown): boolean =>
    Boolean(error && typeof error === 'object' && 'code' in error
        && (error as { code?: unknown }).code === 'permission-denied');

export async function writeWithOptionalFields<T>(write: (includeOptional: boolean) => Promise<T>): Promise<T> {
    try {
        return await write(true);
    } catch (error) {
        if (!isPermissionDeniedError(error)) throw error;
        return write(false);
    }
}
