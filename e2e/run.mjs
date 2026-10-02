// E2E completo, sin red ni secretos:
//   1. build de la web en modo emuladores (.dist), salvo --no-build;
//   2. Algolia simulado (127.0.0.1:7700);
//   3. emuladores de Auth, Firestore y Functions (proyecto demo-listopic);
//   4. sembrado + reindexado de Algolia con la Function real (seed.mjs);
//   5. Playwright.
// Uso: cd e2e && npm test   (o: node run.mjs --no-build -- -g "Buscar")

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startAlgoliaMock } from './mock-algolia.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const sep = args.indexOf('--');
const playwrightArgs = sep >= 0 ? args.slice(sep + 1) : [];
const build = !args.includes('--no-build');

const run = (command, commandArgs, options) => new Promise((resolve) => {
  const child = spawn(command, commandArgs, { stdio: 'inherit', ...options });
  child.on('exit', (code) => resolve(code ?? 1));
});

if (build) {
  const code = await run('npx', ['vite', 'build', '--outDir', '../e2e/.dist', '--emptyOutDir'], {
    cwd: `${root}frontend`,
    env: {
      ...process.env,
      VITE_USE_EMULATORS: 'true',
      // Ficticias: el navegador nunca llega a Algolia (lo intercepta Playwright).
      VITE_ALGOLIA_APP_ID: 'E2ETEST',
      VITE_ALGOLIA_SEARCH_KEY: 'e2e-solo-busqueda',
      VITE_SENTRY_DSN: '',
    },
  });
  if (code !== 0) process.exit(code);
}

const { server } = await startAlgoliaMock({ port: 7700 });
const quote = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
const inner = ['node e2e/seed.mjs', `npx --prefix e2e playwright test --config e2e/playwright.config.ts ${playwrightArgs.map(quote).join(' ')}`].join(' && ');
const code = await run(`${here}node_modules/.bin/firebase`, ['emulators:exec', '--only', 'auth,firestore,functions', '--project', 'demo-listopic', inner], {
  cwd: root,
  env: {
    ...process.env,
    // Solo los lee el emulador de Functions (resolveAlgoliaHosts ignora el host fuera de él).
    ALGOLIA_EMULATOR_HOST: '127.0.0.1:7700',
    ALGOLIA_APP_ID: 'E2ETEST',
    ALGOLIA_API_KEY: 'e2e-clave-ficticia',
  },
});
server.close();
process.exit(code);
