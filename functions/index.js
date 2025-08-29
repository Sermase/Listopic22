// functions/index.js (Versión Orquestador)

const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

// --- INICIALIZACIÓN GLOBAL ---
admin.initializeApp();
setGlobalOptions({ region: "europe-west1" });

// --- CARGA DE MÓDULOS DE FUNCIONES ---
const algoliaFunctions = require('./modules/algolia');
const coreFunctions = require('./modules/core'); // <-- Cargamos el nuevo módulo

// --- EXPORTACIÓN DE TODAS LAS FUNCIONES PARA FIREBASE ---
module.exports = {
    ...algoliaFunctions,
    ...coreFunctions, // <-- Las añadimos a la exportación final
};
// Force redeploy