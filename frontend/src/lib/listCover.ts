import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { db, storage } from '../firebase';
import { IMMUTABLE_UPLOAD_CACHE_CONTROL } from './storageCache';

const MAX_COVER_WIDTH = 1600;
const COVER_QUALITY = 0.85;

// Reduce la foto antes de subirla (las del móvil pueden pesar varios MB).
// Si el navegador no puede procesarla (p. ej. HEIC), se sube el original.
async function resizeToJpeg(file: File): Promise<Blob> {
    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, MAX_COVER_WIDTH / bitmap.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return file;
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', COVER_QUALITY));
        return blob ?? file;
    } catch {
        return file;
    }
}

/**
 * Sube la portada de una lista a Storage y guarda su URL en la lista.
 * Antes la imagen se guardaba en base64 dentro del propio documento: una foto
 * de móvil superaba el límite de 1 MiB de Firestore y la creación fallaba, y
 * las que cabían hacían pesadísimo cada documento de lista.
 *
 * La lista debe existir antes: la regla de Storage comprueba que el usuario es
 * su dueño.
 */
export async function uploadListCover(listId: string, file: File): Promise<string> {
    const blob = await resizeToJpeg(file);
    const isJpeg = blob.type === 'image/jpeg';
    const path = `list-images/${listId}/${Date.now()}_cover.${isJpeg ? 'jpg' : (file.name.split('.').pop() || 'img')}`;
    const snapshot = await uploadBytes(ref(storage, path), blob, {
        contentType: isJpeg ? 'image/jpeg' : (file.type || 'image/jpeg'),
        cacheControl: IMMUTABLE_UPLOAD_CACHE_CONTROL,
    });
    const url = await getDownloadURL(snapshot.ref);
    await updateDoc(doc(db, 'lists', listId), { photoUrl: url, mainImageUrl: url, mainImagePath: path });
    return url;
}

export const isInlineImage = (value: string | null | undefined): boolean => Boolean(value && value.startsWith('data:'));
