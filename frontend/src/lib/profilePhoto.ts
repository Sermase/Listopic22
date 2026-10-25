import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, listAll, ref, uploadBytes } from 'firebase/storage';
import { updateProfile, type User } from 'firebase/auth';
import { db, storage } from '../firebase';
import { IMMUTABLE_UPLOAD_CACHE_CONTROL } from './storageCache';
import { propagateAuthorFieldsToReviews } from '../services/UserProfileService';

// Foto de perfil: subirla, guardarla en el perfil y en las reseñas, y borrar las antiguas.

const errorCode = (error: unknown): string | null => {
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === 'string' ? code : null;
};

const uploadErrorMessage = (error: unknown): string => {
    const code = errorCode(error);
    if (code === 'storage/unauthorized' || code === 'permission-denied') {
        return 'No tienes permisos para cambiar la foto de perfil. Cierra sesión, vuelve a entrar e inténtalo de nuevo.';
    }
    if (code === 'storage/retry-limit-exceeded' || code === 'storage/canceled' || code === 'storage/unknown') {
        return 'La subida se interrumpió por conexión o por un bloqueo temporal. Cambia de red y vuelve a intentarlo.';
    }
    if (code === 'storage/quota-exceeded') {
        return 'No hay espacio disponible para guardar la foto de perfil ahora mismo. Inténtalo más tarde.';
    }
    return code ? `No se pudo subir la foto de perfil (error: ${code}). Inténtalo de nuevo.` : 'No se pudo subir la foto de perfil. Inténtalo de nuevo.';
};

const saveErrorMessage = (error: unknown): string => {
    const code = errorCode(error);
    if (code === 'permission-denied') return 'La foto se ha subido, pero no se pudo guardar en tu perfil por permisos de Firestore.';
    return code ? `La foto se ha subido, pero no se pudo guardar en tu perfil (error: ${code}).` : 'La foto se ha subido, pero no se pudo guardar en tu perfil.';
};

const EXTENSIONS: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
};

const imageExtension = (file: File): string => {
    if (EXTENSIONS[file.type]) return EXTENSIONS[file.type];
    const fromName = file.name.split('.').pop()?.toLowerCase();
    return fromName && /^[a-z0-9]+$/.test(fromName) ? fromName : 'jpg';
};

async function cleanupPreviousProfileImages(uid: string, currentPath: string) {
    await Promise.allSettled(['profile_images', 'profile-photos'].map(async (folder) => {
        const result = await listAll(ref(storage, `${folder}/${uid}`));
        const stale = result.items.filter((item) => item.fullPath !== currentPath);
        const deletions = await Promise.allSettled(stale.map((item) => deleteObject(item)));
        deletions.forEach((d, i) => {
            if (d.status === 'rejected') console.warn('profilePhoto: no se pudo borrar', stale[i].fullPath, d.reason);
        });
    }));
}

/** Comprueba la imagen antes de subirla: devuelve el motivo si no vale. */
export function profilePhotoProblem(file: File): string | null {
    if (!file.type.startsWith('image/')) return 'Solo se permiten archivos de imagen.';
    if (file.size > 5 * 1024 * 1024) return 'La imagen no debe superar los 5 MB.';
    return null;
}

/** Sube la foto y la pone en el perfil. Si falla, lanza un Error con el mensaje para la persona. */
export async function uploadProfilePhoto(user: User, file: File): Promise<string> {
    const storagePath = `profile_images/${user.uid}/${Date.now()}.${imageExtension(file)}`;
    const storageRef = ref(storage, storagePath);
    let url = '';
    try {
        await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg', cacheControl: IMMUTABLE_UPLOAD_CACHE_CONTROL });
        url = await getDownloadURL(storageRef);
    } catch (error) {
        console.error('Profile photo upload failed:', error);
        throw new Error(uploadErrorMessage(error));
    }
    try {
        await setDoc(doc(db, 'users', user.uid), { photoUrl: url, photoStoragePath: storagePath, updatedAt: serverTimestamp() }, { merge: true });
    } catch (error) {
        console.error('Profile photo profile save failed:', error);
        throw new Error(saveErrorMessage(error));
    }
    void updateProfile(user, { photoURL: url }).catch((error) => console.warn('profilePhoto: auth', error));
    void propagateAuthorFieldsToReviews(user.uid, { authorPhoto: url }).catch((error) => console.warn('profilePhoto: reseñas', error));
    await cleanupPreviousProfileImages(user.uid, storagePath);
    return url;
}

/** Vuelve a la foto de la cuenta de Google. */
export async function setGooglePhoto(user: User): Promise<void> {
    if (!user.photoURL) return;
    await setDoc(doc(db, 'users', user.uid), { photoUrl: user.photoURL, updatedAt: serverTimestamp() }, { merge: true });
    void propagateAuthorFieldsToReviews(user.uid, { authorPhoto: user.photoURL }).catch(() => undefined);
}
