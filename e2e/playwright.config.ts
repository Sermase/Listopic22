import { defineConfig } from '@playwright/test';

// La build de la web (modo emuladores) está en .dist; la sirve vite preview.
// Los emuladores, el Algolia simulado y el sembrado los arranca run.mjs.
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // Sin reintentos: un fallo intermitente también es un fallo.
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'es-ES',
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 41.6523, longitude: -4.7245 },
    permissions: ['geolocation'],
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    launchOptions: {
      // El origen https://localhost (Capacitor) habla con los emuladores en 127.0.0.1.
      args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'],
    },
  },
  webServer: {
    command: 'npx vite preview --outDir ../e2e/.dist --host 127.0.0.1 --port 4173 --strictPort',
    cwd: '../frontend',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
