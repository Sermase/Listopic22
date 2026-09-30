import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
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
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'europe-west1');

// Solo para pruebas locales: `VITE_USE_EMULATORS=true npm run dev` con
// `firebase emulators:start --only auth,firestore,functions`. En producción no se activa.
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

export default app;
