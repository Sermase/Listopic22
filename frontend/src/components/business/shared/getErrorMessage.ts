// Mensaje legible de un error de callable o de red, o el texto por defecto.
export const getErrorMessage = (error: unknown, fallback: string): string => {
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
        return (error as { message: string }).message;
    }
    return fallback;
};
