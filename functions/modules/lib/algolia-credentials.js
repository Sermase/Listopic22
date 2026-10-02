'use strict';

// Credenciales de Algolia para escribir desde Functions.
// - ALGOLIA_APP_ID es público (también va en la web): valor fijo, con la
//   variable de entorno como alternativa.
// - ALGOLIA_API_KEY es la clave de administración/escritura: SOLO desde
//   Secret Manager (defineSecret). Nunca en .env, Git ni logs.

const DEFAULT_ALGOLIA_APP_ID = 'FI4Q0XQABV';

/**
 * @param {{ appId?: string, apiKey?: string }} source
 * @returns {{ appId: string, apiKey: string } | null} null si falta la clave (el módulo queda inactivo).
 */
function resolveAlgoliaCredentials({ appId, apiKey } = {}) {
  const id = String(appId || DEFAULT_ALGOLIA_APP_ID).trim();
  const key = String(apiKey || '').trim();
  if (!id || !key) return null;
  return { appId: id, apiKey: key };
}

/**
 * Solo en el emulador de Functions (E2E): ALGOLIA_EMULATOR_HOST apunta a un
 * Algolia simulado local. Fuera del emulador se ignora: en producción nunca se
 * puede desviar la escritura a otro sitio.
 * @returns {Array<{ url: string, protocol: string }> | null}
 */
function resolveAlgoliaHosts(env = process.env) {
  if (env.FUNCTIONS_EMULATOR !== 'true') return null;
  const host = String(env.ALGOLIA_EMULATOR_HOST || '').trim();
  return host ? [{ url: host, protocol: 'http' }] : null;
}

module.exports = { resolveAlgoliaCredentials, resolveAlgoliaHosts, DEFAULT_ALGOLIA_APP_ID };
