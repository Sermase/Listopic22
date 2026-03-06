import React, { useEffect, useState } from 'react';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db, auth } from '../firebase';

export const DebugView: React.FC = () => {
    const [lists, setLists] = useState<any[]>([]);
    const [logs, setLogs] = useState<string[]>([]);
    const [user, setUser] = useState<any>(null);

    const log = (msg: string) => setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);

    useEffect(() => {
        log("Iniciando DebugView...");

        // Check Auth
        log(`Auth State: ${auth.currentUser ? 'Logueado as ' + auth.currentUser.email : 'No logueado'}`);
        setUser(auth.currentUser);

        const fetchRaw = async () => {
            try {
                log("Intentando fetch 'lists' collection...");
                const q = query(collection(db, 'lists'), limit(5));
                const snap = await getDocs(q);

                log(`Snapshot query existosa. Docs encontrados: ${snap.size}`);

                if (snap.empty) {
                    log("⚠️ La colección 'lists' está vacía o no se tienen permisos.");
                }

                const rawData = snap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setLists(rawData);
            } catch (e: any) {
                log(`❌ ERROR FETCHING LISTS: ${e.message}`);
                console.error(e);
            }
        };

        fetchRaw();
    }, []);

    return (
        <div className="p-8 bg-black text-green-400 font-mono text-sm min-h-screen overflow-auto">
            <h1 className="text-xl font-bold mb-4">📢 DIAGNOSTICO DE DATOS</h1>

            <div className="mb-6 border border-green-800 p-4">
                <h2 className="text-white mb-2">Logs:</h2>
                {logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>

            <div className="mb-6 border border-green-800 p-4">
                <h2 className="text-white mb-2">Usuario Actual:</h2>
                <pre>{JSON.stringify(user?.toJSON() || "Null", null, 2)}</pre>
            </div>

            <div className="border border-green-800 p-4">
                <h2 className="text-white mb-2">Muestra de Datos (Colección 'lists'):</h2>
                <pre>{JSON.stringify(lists, null, 2)}</pre>
            </div>
        </div>
    );
};
