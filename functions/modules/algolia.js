// ===================================================================
// ===            MÓDULO DE FUNCIONES DE ALGOLIA (CORREGIDO)       ===
// ===            ARCHIVO: functions/algolia.js                  ===
// ===================================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const algoliasearch = require("algoliasearch");

// --- INICIALIZACIÓN SEGURA DE ALGOLIA ---
let index;
let algoliaClient;

try {
    const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID;
    const ALGOLIA_ADMIN_KEY = process.env.ALGOLIA_API_KEY;

    if (!ALGOLIA_APP_ID || !ALGOLIA_ADMIN_KEY) {
        logger.error("FATAL: Variables de entorno de Algolia no definidas. Las funciones de Algolia no operarán.");
    } else {
        algoliaClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY);
        index = algoliaClient.initIndex('lists'); // Índice por defecto
        logger.info("Cliente de Algolia inicializado correctamente desde variables de entorno.");
    }
} catch (e) {
    logger.error("FATAL: Excepción al inicializar el cliente de Algolia.", e);
}

// ===================================================================
// ===       FUNCIONES DE SINCRONIZACIÓN AUTOMÁTICA              ===
// ===================================================================
// (Estas funciones se mantienen igual que las tenías)
const onListCreated = onDocumentCreated("lists/{listId}", (event) => {
    if (!index) {
        logger.error("onListCreated: El índice de Algolia no está disponible. Abortando.");
        return;
    }
    const snap = event.data;
    if (!snap) { return; }
    const data = snap.data();
    data.objectID = snap.id;
    return index.saveObject(data)
        .then(() => logger.info(`ÉXITO: Objeto ${data.objectID} guardado en Algolia.`))
        .catch(err => logger.error(`ERROR al guardar ${data.objectID} en Algolia:`, err));
});

const onListUpdated = onDocumentUpdated("lists/{listId}", (event) => {
    if (!index) {
        logger.error("onListUpdated: El índice de Algolia no está disponible. Abortando.");
        return;
    }
    const snap = event.data?.after;
    if (!snap) { return; }
    const newData = snap.data();
    newData.objectID = snap.id;
    return index.saveObject(newData)
        .then(() => logger.info(`ÉXITO: Objeto ${newData.objectID} actualizado en Algolia.`))
        .catch(err => logger.error(`ERROR al actualizar ${newData.objectID} en Algolia:`, err));
});

const onListDeleted = onDocumentDeleted("lists/{listId}", (event) => {
    if (!index) {
        logger.error("onListDeleted: El índice de Algolia no está disponible. Abortando.");
        return;
    }
    const snap = event.data;
    if (!snap) { return; }
    const objectID = snap.id;
    return index.deleteObject(objectID)
        .then(() => logger.info(`ÉXITO: Objeto ${objectID} eliminado de Algolia.`))
        .catch(err => logger.error(`ERROR al eliminar ${objectID} de Algolia:`, err));
});


// ===================================================================
// ===         FUNCIÓN DE ADMINISTRADOR (VERSIÓN "JEFE")         ===
// ===================================================================

const adminBackfillAlgolia = onCall({ cors: true }, async (request) => {
    // 1. Verificar que el usuario está autenticado
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debes estar autenticado para realizar esta operación.');
    }

    // 2. Leer el perfil del usuario desde Firestore para buscar el rol "jefe"
    const uid = request.auth.uid;
    const userDoc = await admin.firestore().collection('users').doc(uid).get();

    if (!userDoc.exists) {
        throw new HttpsError('permission-denied', 'No se encontró tu perfil de usuario.');
    }

    const userData = userDoc.data();
    // 3. Comprobar si el array userType contiene la palabra "jefe"
    if (!userData.userType || !userData.userType.includes('jefe')) {
        logger.error(`Intento no autorizado de ejecutar adminBackfillAlgolia por el usuario: ${uid}`);
        throw new HttpsError('permission-denied', 'Solo los usuarios de tipo "jefe" pueden ejecutar esta operación.');
    }

    // 4. El resto de la lógica se mantiene igual
    const { collectionName } = request.data;
    const allowedCollections = ['lists', 'reviews', 'places', 'users'];
    if (!allowedCollections.includes(collectionName)) {
        throw new HttpsError('invalid-argument', `La colección "${collectionName}" no está permitida.`);
    }

    if (!algoliaClient) {
        throw new HttpsError('internal', 'El servicio de Algolia no está configurado.');
    }
    const targetIndex = algoliaClient.initIndex(collectionName);
    const db = admin.firestore();

    try {
        const snapshot = await db.collection(collectionName).get();
        if (snapshot.empty) {
            return { success: true, message: `La colección "${collectionName}" está vacía.` };
        }
        const records = snapshot.docs.map(doc => ({ ...doc.data(), objectID: doc.id }));
        const { objectIDs } = await targetIndex.saveObjects(records);
        const message = `Sincronización completada. ${objectIDs.length} registros de "${collectionName}" enviados a Algolia.`;
        logger.info(message);
        return { success: true, message: message };
    } catch (error) {
        logger.error(`Error durante el backfill de "${collectionName}":`, error);
        throw new HttpsError('internal', 'Error al procesar la sincronización.');
    }
});


// Exportamos todas las funciones de este módulo
module.exports = {
    onListCreated,
    onListUpdated,
    onListDeleted,
    adminBackfillAlgolia
};