// Envoltorio de onCall para Listopic. Pachote vive en este mismo proyecto y
// entra con usuarios anónimos: para Listopic, una sesión anónima es como no
// tener sesión, así que el manejador la recibe sin `auth`.
const https = require("firebase-functions/v2/https");

const isAnonymous = (auth) => auth?.token?.firebase?.sign_in_provider === "anonymous";

function onCall(optsOrHandler, maybeHandler) {
  const handler = typeof optsOrHandler === "function" ? optsOrHandler : maybeHandler;
  const wrapped = (request, response) => handler(isAnonymous(request.auth) ? { ...request, auth: undefined } : request, response);
  return typeof optsOrHandler === "function" ? https.onCall(wrapped) : https.onCall(optsOrHandler, wrapped);
}

module.exports = { ...https, onCall, isAnonymous };
