// Pachote dentro del chat de Listopic: crear cuentas con la gente del grupo,
// abrirlas en Pachote (servido desde su repo, en su dominio y con estos mismos
// emuladores), apuntar un gasto, ver el saldo en Listopic y escribir en el
// chat del grupo desde Pachote con la cuenta de Listopic.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, login, PASSWORD } from './support';

const PACHOTE = process.env.PACHOTE_DIR || fileURLToPath(new URL('../../../pachote/public', import.meta.url));
const FIREBASE_CDN = fileURLToPath(new URL('../../frontend/node_modules/firebase', import.meta.url));
const SHOTS = process.env.CHAT_SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png',
};

/** Pachote en su dominio de verdad, servido desde el repo local y hablando con los emuladores. */
async function servePachote(context: BrowserContext) {
  await context.addInitScript(() => {
    if (location.hostname === 'pachote-78042.web.app') (window as unknown as { PACHOTE_EMU: boolean }).PACHOTE_EMU = true;
  });
  await context.route('https://pachote-78042.web.app/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = join(PACHOTE, path === '/' ? 'index.html' : path);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: '' });
    await route.fulfill({ status: 200, body: readFileSync(file), contentType: TYPES[extname(file)] || 'application/octet-stream' });
  });
  // El SDK de Firebase que Pachote carga del CDN, desde el paquete instalado.
  // Sus imports internos apuntan a la versión pedida, para que todo sea un único módulo de cada.
  await context.route('https://www.gstatic.com/firebasejs/**', async (route) => {
    const url = new URL(route.request().url());
    const version = url.pathname.split('/')[2];
    const body = readFileSync(join(FIREBASE_CDN, basename(url.pathname)), 'utf8').replace(/firebasejs\/[\d.]+\//g, `firebasejs/${version}/`);
    await route.fulfill({ status: 200, body, contentType: 'text/javascript' });
  });
  await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, body: '', contentType: 'text/css' }));
}

test.skip(!existsSync(join(PACHOTE, 'store.js')), 'Hace falta el repo de Pachote al lado (o PACHOTE_DIR)');

test('Pachote en el chat: crear cuentas, apuntar en Pachote, saldo en Listopic y chat dentro de Pachote', async ({ page, context, errors }) => {
  test.setTimeout(150_000);
  await servePachote(context);
  await login(page, 'ana');
  await page.goto('/chats/riano');

  // Info del grupo → 💸 Cuentas con Pachote → crear con la gente del chat.
  await page.getByRole('button', { name: 'Info del chat' }).click();
  await page.getByRole('button', { name: 'Crear cuentas' }).click();
  await page.getByLabel('Nombre de las cuentas').fill('Riaño');
  await page.getByRole('radio', { name: '⛰️' }).click();
  await expect(page.getByText(/Con 3 personas: tú, luis, eva/)).toBeVisible();
  await shot(page, 'p1-crear-cuentas');
  await page.getByRole('button', { name: 'Crear cuentas' }).click();
  await expect(page.getByText('El resumen aparecerá aquí')).toBeVisible();
  await expect(page.getByText('💸 Tú has creado las cuentas «Riaño» en Pachote')).toBeVisible();

  // Abrir en Pachote: entra este «móvil» con el link, dice quién es y apunta una cena.
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Abrir en Pachote' }).click();
  const pachote = await popupPromise;
  await pachote.setViewportSize({ width: 390, height: 844 });
  await expect(pachote.getByText('¿Quién eres en «Riaño»?')).toBeVisible({ timeout: 30_000 });
  await pachote.locator('[data-who]').filter({ hasText: 'ana' }).click();
  await pachote.locator('#fab').click();
  await pachote.locator('#eamt').fill('60');
  await pachote.locator('#edesc').fill('Cena en Riaño');
  await pachote.locator('#esave').click();
  await expect(pachote.getByText('Cena en Riaño')).toBeVisible();

  // Listopic ve el resumen al momento: total y lo que me deben.
  await expect(page.getByText(/^60,00\s€$/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Te deben', { exact: true })).toBeVisible();
  await expect(page.getByText(/^\+?40,00\s€$/).first()).toBeVisible();
  await expect(page.getByText(/luis → ana/)).toBeVisible();
  await shot(page, 'p2-cuentas-en-listopic');

  // Tarjeta viva en el chat.
  await page.getByRole('button', { name: 'Al chat' }).click();
  const card = page.getByRole('button', { name: /CUENTAS · PACHOTE/ }).last();
  await expect(card).toContainText('Riaño');
  await expect(card).toContainText(/60,00\s€/);
  await expect(card).toContainText(/Te deben 40,00\s€/);
  await shot(page, 'p3-tarjeta-en-el-chat');

  // En Pachote: 💬 → entrar con la cuenta de Listopic (email) → el chat del grupo, y escribir.
  await pachote.getByRole('button', { name: 'Chat del grupo en Listopic' }).click();
  await pachote.getByRole('button', { name: 'Entrar', exact: true }).click();
  await pachote.getByRole('button', { name: /Con email y contraseña/ }).click();
  await pachote.locator('[data-lemail]').fill('ana@e2e.test');
  await pachote.locator('[data-lpass]').fill(PASSWORD);
  await pachote.locator('[data-login="mailgo"]').click();
  await expect(pachote.locator('#lpname')).toHaveText('Viaje a Riaño', { timeout: 20_000 });
  await expect(pachote.locator('.lpev', { hasText: 'ha creado las cuentas «Riaño»' })).toBeVisible();
  await pachote.locator('#lptxt').fill('Hola desde Pachote 👋');
  await pachote.getByRole('button', { name: 'Enviar' }).click();
  await expect(pachote.locator('.lpmsg.me', { hasText: 'Hola desde Pachote' })).toBeVisible();
  await shot(pachote, 'p4-chat-dentro-de-pachote');

  // El mensaje llega al chat de Listopic, y el grupo sigue en Pachote tras entrar con la cuenta.
  await expect(page.getByRole('paragraph').filter({ hasText: 'Hola desde Pachote 👋' })).toBeVisible();
  await pachote.keyboard.press('Escape');
  await expect(pachote.getByText('Cena en Riaño')).toBeVisible();
  await shot(pachote, 'p5-grupo-en-pachote');
  void errors;
});
