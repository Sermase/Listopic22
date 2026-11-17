/** Imagen copiada en el portapapeles, como archivo para subirla igual que una elegida. */

const asFile = (blob: Blob, type: string): File =>
    blob instanceof File && blob.name ? blob : new File([blob], `pegada.${type.split('/')[1] || 'png'}`, { type });

/** La imagen de un evento «pegar» (Ctrl+V), o null si lo pegado no es una imagen. */
export function imageFromPaste(data: DataTransfer | null | undefined): File | null {
    if (!data) return null;
    for (const item of Array.from(data.items ?? [])) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) return asFile(file, item.type);
        }
    }
    const file = Array.from(data.files ?? []).find((f) => f.type.startsWith('image/'));
    return file ? asFile(file, file.type) : null;
}

/** El navegador deja leer imágenes del portapapeles con un botón (móvil incluido). */
export const canReadClipboardImage = (): boolean =>
    typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function';

/** Lee una imagen del portapapeles; null si no hay ninguna. Lanza si el permiso se deniega. */
export async function readClipboardImage(): Promise<File | null> {
    const items = await navigator.clipboard.read();
    for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) return asFile(await item.getType(type), type);
    }
    return null;
}
