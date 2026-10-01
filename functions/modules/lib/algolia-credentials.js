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

module.exports = { resolveAlgoliaCredentials, DEFAULT_ALGOLIA_APP_ID };
