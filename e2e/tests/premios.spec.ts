// Medallas con premio (lib/abilities). La jefa los tiene todos para probarlos:
// Mis premios (firma, chincheta y aro), aro dorado en su perfil (también visto por otra
// cuenta), Developer apaga el premio, filtros al subir una foto y reacciones de comida.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { test, expect, login } from './support';

const SHOTS = process.env.PREMIOS_SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const ICON = process.env.PREMIOS_PHOTO || fileURLToPath(new URL('../../frontend/public/images/listopic-app-icon.png', import.meta.url));

test('Mis premios, aro en el perfil y Developer apaga el premio', async ({ page, browser, errors }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await login(page, 'jefe');

  await page.goto('/preferencias');
  await page.getByRole('button', { name: /Mis premios/ }).click();
  const prizes = page.getByRole('dialog', { name: /Mis premios/ });
  await prizes.getByPlaceholder('Si no cruje, no es croqueta').fill('Si no cruje, no es croqueta');
  await prizes.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Firma guardada')).toBeVisible();
  await prizes.getByRole('button', { name: 'Chincheta 🍕' }).click();
  await prizes.getByRole('button', { name: '🏆 Dorado' }).click();
  await expect(prizes.getByRole('button', { name: '🏆 Dorado' })).toHaveClass(/accent-soft/);
  await shot(page, '1-mis-premios');
  await page.keyboard.press('Escape');

  await page.goto('/profile');
  await expect(page.getByTestId('profile-ring')).toHaveClass(/lt-ring--gold/);
  await shot(page, '2-aro-dorado');

  // Otra cuenta ve el aro (llega por publicProfiles).
  const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const visitor = await other.newPage();
  await login(visitor, 'ana');
  await visitor.goto('/profile/jefe');
  await expect(visitor.getByTestId('profile-ring')).toHaveClass(/lt-ring--gold/, { timeout: 20_000 });
  await other.close();

  // Developer → Sorpresas → Medallas con premio: sin el premio dorado queda el de color.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/developer');
  await expect(page.getByText('Comprobando permisos…')).toBeHidden({ timeout: 20_000 });
  await page.getByRole('navigation', { name: 'Herramientas de Developer' }).locator('button').filter({ hasText: 'Sorpresas' }).first().click();
  const goldRow = page.locator('li').filter({ hasText: 'Aro dorado' });
  await expect(goldRow.getByRole('button', { name: 'Premio: sí' })).toBeVisible();
  await goldRow.scrollIntoViewIfNeeded();
  await shot(page, '3-developer');
  await goldRow.getByRole('button', { name: 'Premio: sí' }).click();
  await expect(goldRow.getByRole('button', { name: 'Premio: no' })).toBeVisible();
  await page.goto('/profile');
  await expect(page.getByTestId('profile-ring')).not.toHaveClass(/lt-ring--gold/);
  await expect(page.getByTestId('profile-ring')).toHaveClass(/lt-ring/);
  // Se deja como estaba.
  await page.goto('/developer');
  await page.getByRole('navigation', { name: 'Herramientas de Developer' }).locator('button').filter({ hasText: 'Sorpresas' }).first().click();
  await page.locator('li').filter({ hasText: 'Aro dorado' }).getByRole('button', { name: 'Premio: no' }).click();
  await expect(page.locator('li').filter({ hasText: 'Aro dorado' }).getByRole('button', { name: 'Premio: sí' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('filtros al subir una foto y reacciones de comida en el chat', async ({ page, errors }) => {
  await login(page, 'jefe');

  await page.goto('/place/p_vll1');
  await page.getByRole('button', { name: 'Más acciones' }).click();
  await page.getByRole('menuitem', { name: /Subir fotos del sitio/ }).click();
  await page.locator('#place-photo-upload').setInputFiles(ICON);
  const filters = page.getByRole('radiogroup', { name: 'Filtro de la foto' });
  await expect(filters.getByRole('radio')).toHaveCount(7);
  await filters.getByRole('radio', { name: /Neón/ }).click();
  await expect(filters.getByRole('radio', { name: /Neón/ })).toHaveAttribute('aria-checked', 'true');
  await shot(page, '4-filtros');

  await page.goto('/chats/premios');
  const message = page.locator('p.whitespace-pre-wrap', { hasText: '¿Croquetas el viernes?' });
  await expect(message).toBeVisible();
  await message.click({ button: 'right' });
  const food = page.getByLabel('Reacciones de comida');
  await expect(food.getByRole('button')).toHaveCount(6);
  await shot(page, '5-reacciones');
  await food.getByRole('button', { name: '🥘' }).click();
  await expect(page.getByRole('button', { name: '🥘' }).last()).toBeVisible();
  expect(errors).toEqual([]);
});
