import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
    apiKey: "AIzaSyDPEW5zXtvfnD0XtdmXSkMBZrsFdO-tmsg",
    authDomain: "listopic.firebaseapp.com",
    projectId: "listopic",
    storageBucket: "listopic.firebasestorage.app",
    messagingSenderId: "851333213702",
    appId: "1:851333213702:web:e8c2f3b1aa098d923d5d87"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'europe-west1');

export default app;
