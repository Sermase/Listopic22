// Quedadas del chat: notas de la mesa a ciegas, valorar sin salir del chat e
// invitar a alguien de fuera con un enlace (se apunta y entra al grupo).
import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, login, isolate, PASSWORD } from './support';

const SHOTS = process.env.CHAT_SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test('notas de la mesa a ciegas hasta valorar, y valorar sin salir del chat', async ({ page, errors }) => {
  await login(page, 'prolifica');
  await page.goto('/chats/mesa');
  const card = page.locator('[data-event-card]', { hasText: 'Tortilla de la mesa' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /Notas de la mesa/ }).click();

  // Luis y Gerente ya han valorado; sus notas no se ven hasta que Prolífica ponga la suya.
  const locked = page.getByTestId('duel-locked');
  await expect(locked).toContainText('2 de la mesa ya han valorado');
  await expect(page.getByRole('cell', { name: 'Nota final' })).toHaveCount(0);
  await shot(page, 'q1-a-ciegas');

  // Valorar abre el formulario encima del chat y, al publicar, se destapan las notas.
  await locked.getByRole('button', { name: /Valorar y ver las notas/ }).click();
  const sliders = page.locator('input[type="range"]');
  await expect(sliders.first()).toBeVisible();
  for (const slider of await sliders.all()) await slider.fill('8');
  await shot(page, 'q2-valorar-en-el-chat');
  await page.getByRole('button', { name: /Publicar reseña/ }).click();
  await expect(page.getByRole('cell', { name: 'Nota final' })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/chats\/mesa$/);
  await expect(page.getByRole('cell', { name: 'Tú', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'luis', exact: true })).toBeVisible();
  await shot(page, 'q3-notas-destapadas');
  expect(errors).toEqual([]);
});

test('invitar a la quedada a alguien de fuera: se apunta y entra al grupo', async ({ page, browser, errors }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => Object.defineProperty(navigator, 'share', { value: undefined }));
  await login(page, 'luis');
  await page.goto('/chats/mesa');
  const card = page.locator('[data-event-card]', { hasText: 'Bar Medina', hasNotText: 'Tortilla de la mesa' });
  await card.getByRole('button', { name: 'Detalles' }).click();
  await page.getByRole('button', { name: '🔗 Invitar a alguien de fuera' }).click();
  await expect(page.getByText('Enlace copiado')).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/¿Te vienes\?/);
  const url = new URL(copied.match(/https?:\/\/\S+/)![0]);
  expect(url.pathname).toMatch(/^\/g\//);

  // Eva no está en el grupo: abre el enlace, ve la quedada, entra y queda apuntada.
  const other = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES', serviceWorkers: 'block' });
  await isolate(other);
  const eva = await other.newPage();
  await eva.goto(`${url.pathname}${url.search}`);
  await expect(eva.getByText('🍽️ LUIS TE INVITA')).toBeVisible();
  await expect(eva.getByRole('button', { name: '✅ Me apunto' })).toBeVisible();
  await shot(eva, 'q4-enlace-quedada');
  await eva.getByRole('button', { name: '¿Ya tienes cuenta? Entra' }).click();
  await eva.locator('input[type="email"]').fill('eva@e2e.test');
  await eva.locator('input[type="password"]').fill(PASSWORD);
  await eva.locator('form button[type="submit"]').first().click();
  await expect(eva).toHaveURL(/\/chats\/mesa/, { timeout: 15_000 });
  await expect(eva.getByText('✅ Van · 2')).toBeVisible();
  await expect(eva.getByRole('button', { name: '✅ Voy' }).last()).toHaveClass(/bg-emerald-500/);
  await shot(eva, 'q5-dentro-y-apuntada');
  await other.close();

  await expect(page.getByText(/eva se ha unido con el enlace/).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(/✅ eva va a /).filter({ visible: true })).toBeVisible();
  expect(errors).toEqual([]);
});
