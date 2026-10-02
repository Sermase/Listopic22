// Arranque de la build de producción: en web y con el origen de Capacitor
// (https://localhost, como el WebView de Android). Un error de JS al evaluar
// los chunks (el fallo de map-vendor) deja #root vacío y hace fallar esto.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, isolate, watchErrors } from './support';

const DIST = fileURLToPath(new URL('../.dist', import.meta.url));
const TYPES: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36';

test('arranca en web sin errores y carga datos', async ({ page, errors }) => {
  await page.goto('/');
  await expect(page.locator('#lp-boot')).toHaveCount(0);
  await expect(page.getByText('Patatas bravas').first()).toBeVisible();
  expect(errors).toEqual([]);
});

for (const path of ['/', '/search?type=items', '/list/bravas']) {
  test(`arranca con el origen de Capacitor: ${path}`, async ({ browser }) => {
    const context = await browser.newContext({ userAgent: ANDROID_UA, isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await isolate(context, { allowHttpsLocalhost: true });
    // Como el cargador de Capacitor: los archivos de la build, con la SPA como respaldo.
    await context.route((url) => url.protocol === 'https:' && url.hostname === 'localhost', async (route) => {
      const { pathname } = new URL(route.request().url());
      let file = join(DIST, decodeURIComponent(pathname));
      if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
      await route.fulfill({ status: 200, contentType: TYPES[extname(file)] || 'application/octet-stream', body: readFileSync(file) });
    });
    const page = await context.newPage();
    const errors = watchErrors(page);
    await page.goto(`https://localhost${path}`);
    await expect(page.locator('#lp-boot')).toHaveCount(0);
    await expect(page.locator('#root')).not.toBeEmpty();
    await expect(page.getByRole('link', { name: 'Listopic' }).first()).toBeVisible();
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
    await context.close();
  });
}
