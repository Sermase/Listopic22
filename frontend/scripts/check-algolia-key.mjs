// Comprueba que la clave de Algolia que va en la web solo sirve para buscar.
// Falla (código 1) si tiene permisos de escritura o de administración.
// Uso: VITE_ALGOLIA_APP_ID=… VITE_ALGOLIA_SEARCH_KEY=… node scripts/check-algolia-key.mjs
//  o: node --env-file=.env.local scripts/check-algolia-key.mjs
// Si no hay clave (PR de un fork) o Algolia no responde, avisa y no bloquea.

/* global process, fetch, console */

// `settings` solo lee los ajustes; cambiarlos es `editSettings`.
const ALLOWED = new Set(['search', 'listIndexes', 'settings']);

const appId = process.env.VITE_ALGOLIA_APP_ID;
const apiKey = process.env.VITE_ALGOLIA_SEARCH_KEY;

if (!appId || !apiKey) {
    console.warn('⚠️  Sin VITE_ALGOLIA_APP_ID o VITE_ALGOLIA_SEARCH_KEY: no se comprueba la clave.');
    process.exit(0);
}

const masked = `${apiKey.slice(0, 4)}…`;

try {
    const res = await fetch(`https://${appId}-dsn.algolia.net/1/keys/${encodeURIComponent(apiKey)}`, {
        headers: { 'x-algolia-application-id': appId, 'x-algolia-api-key': apiKey },
        signal: AbortSignal.timeout(10000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(body.acl)) {
        console.warn(`⚠️  No se ha podido leer la clave ${masked} (HTTP ${res.status}: ${body.message || 'sin detalle'}). No se bloquea; revisa Buscar en la vista previa.`);
        process.exit(0);
    }
    const extra = body.acl.filter((acl) => !ALLOWED.has(acl));
    if (extra.length > 0) {
        console.error(`❌ La clave de Algolia de la web (${masked}) tiene permisos que no puede tener en el navegador: ${extra.join(', ')}.`);
        console.error('   Usa la «Search API Key» de Algolia en el secreto VITE_ALGOLIA_SEARCH_KEY. Nunca la Write ni la Admin API Key.');
        process.exit(1);
    }
    console.log(`✅ Clave de Algolia de la web (${masked}): ${body.acl.join(', ')}. Solo lectura.`);
} catch (error) {
    console.warn(`⚠️  No se ha podido comprobar la clave ${masked}: ${error.message}. No se bloquea.`);
}
