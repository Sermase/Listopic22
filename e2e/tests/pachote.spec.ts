// Pachote dentro del chat de Listopic: crear cuentas con la gente del grupo,
// abrirlas en Pachote (servido desde su repo, en su dominio y con estos mismos
// emuladores) ya con la cuenta de Listopic, apuntar un gasto y ver el saldo en
// Listopic. Y «Pachote» en el menú, también con la cuenta.
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

/** Usuario con el que está Pachote (null mientras carga). */
const pachoteUser = (p: Page) => p.evaluate(() => {
  const st = (window as unknown as { PachoteStore?: { user?: () => { uid: string; anon: boolean } | null } }).PachoteStore;
  return st?.user ? st.user() : null;
}).catch(() => null);

test('Pachote en el chat: crear cuentas, abrir Pachote con la cuenta, apuntar y ver el saldo en Listopic', async ({ page, context, errors }) => {
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

  // Abrir en Pachote: entra ya con la cuenta de Ana (sin «¿Quién eres?», ya es «ana») y apunta una cena.
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Abrir en Pachote' }).click();
  const pachote = await popupPromise;
  await pachote.setViewportSize({ width: 390, height: 844 });
  await expect(pachote.locator('#fab')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => pachoteUser(pachote)).toEqual(expect.objectContaining({ uid: 'ana', anon: false }));
  expect(pachote.url()).not.toContain('auth=');
  await expect(pachote.getByText('¿Quién eres en «Riaño»?')).toBeHidden();
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

  // El chat ya no está dentro de Pachote: se abre en Listopic.
  await expect(pachote.getByRole('button', { name: 'Chat del grupo en Listopic' })).toHaveCount(0);
  await shot(pachote, 'p4-grupo-en-pachote');
  void errors;
});

test('«Pachote» del menú abre Pachote con la cuenta de Listopic', async ({ page, context, errors }) => {
  await servePachote(context);
  await login(page, 'luis');
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('dialog', { name: 'Menú' }).getByRole('button', { name: 'Pachote', exact: true }).click();
  const pachote = await popupPromise;
  await expect.poll(() => pachoteUser(pachote), { timeout: 30_000 }).toEqual(expect.objectContaining({ uid: 'luis', anon: false }));
  expect(pachote.url()).not.toContain('auth=');
  await shot(pachote, 'p5-bote-a-pachas');
  void errors;
});

test('Cuenta de Pachote: cerrar sesión y volver a entrar sin perder el grupo; crear cuenta desde un link', async ({ page, context, browser, errors }) => {
  test.setTimeout(180_000);
  await servePachote(context);
  await login(page, 'ana');
  await page.goto('/chats/riano');
  await page.getByRole('button', { name: 'Info del chat' }).click();
  await page.getByRole('button', { name: 'Crear cuentas' }).click();
  await page.getByLabel('Nombre de las cuentas').fill('Riaño');
  await page.getByRole('button', { name: 'Crear cuentas' }).click();
  await expect(page.getByText('El resumen aparecerá aquí')).toBeVisible();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Abrir en Pachote' }).click();
  const p = await popupPromise;
  await p.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => pachoteUser(p), { timeout: 30_000 }).toEqual(expect.objectContaining({ uid: 'ana', anon: false }));
  await expect(p.locator('#fab')).toBeVisible({ timeout: 30_000 });
  // El link del grupo (S y PachoteStore son globales de la página de Pachote).
  const { gid, token } = await p.evaluate(() => {
    const w = window as unknown as { PachoteStore: { token: (g: string) => string } };
    // eslint-disable-next-line no-eval
    const ids = Object.keys((0, eval)('S').plans as Record<string, unknown>);
    return { gid: ids[0] || '', token: ids[0] ? w.PachoteStore.token(ids[0]) : '' };
  });

  // Cerrar sesión: el móvil se queda sin cuenta y ofrece volver a entrar con la de antes.
  await p.goto('https://pachote-78042.web.app/');
  await expect(p.getByText('Riaño').first()).toBeVisible({ timeout: 20_000 });
  await p.locator('[data-act="menu"]').first().click();
  await p.locator('[data-m="logout"]').click();
  await p.locator('[data-yes]').click();
  await expect(p.getByText('Has cerrado sesión')).toBeVisible({ timeout: 20_000 });
  await expect(p.getByText('ana@e2e.test')).toBeVisible();
  await shot(p, 'p6-sesion-cerrada');
  await p.getByRole('button', { name: 'Volver a entrar' }).click();
  await expect(p.getByRole('heading', { name: '🔐 Tu cuenta de Pachote' })).toBeVisible();
  // Entró con email: el formulario ya viene abierto y con su email, sin abrir el teclado.
  await expect(p.locator('[data-lemail]')).toHaveValue('ana@e2e.test');
  await shot(p, 'p7-entrar');
  await p.locator('[data-lpass]').fill(PASSWORD);
  await p.locator('[data-login="mailgo"]').click();
  await expect.poll(() => pachoteUser(p), { timeout: 20_000 }).toEqual(expect.objectContaining({ uid: 'ana', anon: false }));
  await expect(p.getByText('Riaño').first()).toBeVisible({ timeout: 20_000 });
  await expect(p.getByText('Has cerrado sesión')).toHaveCount(0);
  await p.getByText('Riaño').first().click();
  await expect(p.locator('#fab')).toBeVisible();
  await expect(p.getByText('¿Quién eres en «Riaño»?')).toBeHidden();

  // Alguien sin Listopic abre el link del grupo y crea su cuenta de Pachote: sigue dentro, ya con cuenta.
  expect(gid && token).toBeTruthy();
  const other = await browser.newContext();
  await servePachote(other);
  const q = await other.newPage();
  await q.setViewportSize({ width: 390, height: 844 });
  await q.goto(`https://pachote-78042.web.app/#join/${gid}/${token}`);
  await expect(q.getByText('¿Quién eres en «Riaño»?')).toBeVisible({ timeout: 30_000 });
  await q.getByRole('button', { name: 'Entrar o crear cuenta' }).click();
  await q.getByRole('button', { name: 'Crear cuenta' }).first().click();
  await q.locator('[data-login="mail"]').click();
  await q.locator('[data-lemail]').fill('nuevo@e2e.test');
  await q.locator('[data-lpass]').fill('corto');
  await q.locator('[data-login="mailgo"]').click();
  await expect(q.getByText('al menos 6 caracteres')).toBeVisible();
  await q.locator('[data-lpass]').fill('secreto-nuevo');
  await shot(q, 'p8-crear-cuenta');
  const anonUid = (await pachoteUser(q))?.uid;
  await q.locator('[data-login="mailgo"]').click();
  await expect.poll(() => pachoteUser(q), { timeout: 20_000 }).toEqual(expect.objectContaining({ uid: anonUid, anon: false }));
  // Tras crearla, vuelve a preguntar quién es (ahora ya con cuenta) y el grupo sigue ahí.
  await expect(q.getByText('¿Quién eres en «Riaño»?')).toBeVisible({ timeout: 20_000 });
  await q.getByRole('button', { name: 'eva' }).click();
  await expect(q.locator('#fab')).toBeVisible();

  // Con un email que ya existe, avisa y pasa a «Entrar».
  await q.goto('https://pachote-78042.web.app/');
  await expect(q.getByText('Riaño').first()).toBeVisible({ timeout: 20_000 });
  await q.locator('[data-act="menu"]').first().click();
  await q.locator('[data-m="logout"]').click();
  await q.locator('[data-yes]').click();
  await expect(q.getByText('Has cerrado sesión')).toBeVisible({ timeout: 20_000 });
  await q.getByRole('button', { name: 'Volver a entrar' }).click();
  // La última cuenta fue con email: el formulario ya está abierto.
  await expect(q.locator('[data-lemail]')).toHaveValue('nuevo@e2e.test');
  await q.getByRole('button', { name: 'Crear cuenta' }).first().click();
  await q.locator('[data-lemail]').fill('ana@e2e.test');
  await q.locator('[data-lpass]').fill('loquesea');
  await q.locator('[data-login="mailgo"]').click();
  await expect(q.getByText('Ya hay una cuenta con ese email')).toBeVisible();
  await expect(q.locator('[data-login="mailgo"]')).toHaveText('Entrar');
  await other.close();
  void errors;
});
