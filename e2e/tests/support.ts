import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

export const MOCK_ALGOLIA = process.env.ALGOLIA_MOCK_URL || 'http://127.0.0.1:7700';
export const PASSWORD = 'secreto-e2e';

export const vectors = JSON.parse(readFileSync(fileURLToPath(new URL('../../frontend/src/lib/listElements.vectors.json', import.meta.url)), 'utf8')) as {
  expected: { elements: Array<{ key: string; rank: number }>; zones: Record<string, string[]>; botOnlyKeys: string[] };
};

// Errores que no son de la app: recursos externos cortados a propósito.
const IGNORED = [/net::ERR_FAILED/, /Failed to load resource/, /ERR_BLOCKED_BY_CLIENT/];

/** Algolia → simulador local; todo lo que no sea local se corta (nada sale a internet). */
export async function isolate(context: BrowserContext, { allowHttpsLocalhost = false } = {}) {
  await context.route((url) => /(^|\.)algolia\.(net|io)$|(^|\.)algolianet\.com$/.test(url.hostname), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const response = await fetch(MOCK_ALGOLIA + url.pathname + url.search, { method: request.method(), body: request.postData() || undefined });
    await route.fulfill({ status: response.status, body: await response.text(), headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
  });
  // Google Places no existe en el emulador: la «sincronización» del sitio devuelve el sembrado.
  await context.route((url) => url.pathname.endsWith('/getPlaceDetailsFromGoogle'), async (route) => {
    const placeId = new URL(route.request().url()).searchParams.get('placeid') || '';
    const place = (vectors as unknown as { places: Record<string, Record<string, unknown>> }).places[placeId];
    await route.fulfill(place
      ? { status: 200, contentType: 'application/json', body: JSON.stringify({ placeId, ...place }), headers: { 'access-control-allow-origin': '*' } }
      : { status: 404, contentType: 'application/json', body: '{"message":"no sembrado"}', headers: { 'access-control-allow-origin': '*' } });
  });
  await context.route((url) => {
    if (/algolia/.test(url.hostname)) return false;
    if (url.hostname === '127.0.0.1') return false;
    if (url.hostname === 'localhost') return !allowHttpsLocalhost;
    return true;
  }, (route) => route.abort());
}

/** Errores de JS y de consola de la página. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (!IGNORED.some((re) => re.test(text))) errors.push(`console: ${text.slice(0, 300)}`);
  });
  return errors;
}

export const test = base.extend<{ errors: string[] }>({
  context: async ({ context }, use) => {
    await isolate(context);
    await use(context);
  },
  errors: async ({ page }, use) => {
    const errors = watchErrors(page);
    await use(errors);
    // Ninguna prueba puede terminar con errores de JS o de consola.
    expect(errors, 'errores de JS o de consola').toEqual([]);
  },
});

export { expect };

/** Claves de los elementos visibles, en orden. */
export const elementKeys = (page: Page) => page.locator('[data-element-key]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-element-key')));

export async function login(page: Page, uid: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(`${uid}@e2e.test`);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}
