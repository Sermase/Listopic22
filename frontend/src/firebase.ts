import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signOut } from "firebase/auth";
import { connectFirestoreEmulator, clearIndexedDbPersistence, getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, terminate, type Firestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

const firebaseConfig = {
    apiKey: "AIzaSyDPEW5zXtvfnD0XtdmXSkMBZrsFdO-tmsg",
    authDomain: "listopic.es",
    // En emuladores, proyecto "demo-": garantiza que nada llega a producción.
    projectId: import.meta.env.VITE_USE_EMULATORS === 'true' ? "demo-listopic" : "listopic",
    storageBucket: "listopic.firebasestorage.app",
    messagingSenderId: "851333213702",
    appId: "1:851333213702:web:e8c2f3b1aa098d923d5d87"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Caché en el dispositivo (IndexedDB, compartida entre pestañas): las escuchas
// pintan al momento con lo guardado y al volver solo bajan lo que ha cambiado.
// Si el navegador no la permite (p. ej. algunos modos privados), sin caché.
function createDb(): Firestore {
    try {
        return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
    } catch {
        return getFirestore(app);
    }
}
export const db = createDb();
export const storage = getStorage(app);
export const functions = getFunctions(app, 'europe-west1');

// Solo para pruebas locales: `VITE_USE_EMULATORS=true npm run dev` con
// `firebase emulators:start --only auth,firestore,functions`. En producción no se activa.
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

/**
 * Cierra sesión y borra la caché de Firestore del dispositivo (para que en un
 * móvil compartido no quede nada de la cuenta). Recarga la app en `to`.
 */
export async function signOutAndForget(to = '/'): Promise<void> {
    await signOut(auth).catch(() => undefined);
    try {
        await terminate(db);
        await clearIndexedDbPersistence(db);
    } catch {
        /* sin caché o en uso en otra pestaña: no pasa nada */
    }
    window.location.assign(to);
}

export default app;
