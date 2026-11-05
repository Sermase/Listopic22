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
// Fotos de la lista «Tarjetas E2E» (seed): PREMIOS_PHOTOS=a.jpg,b.jpg,c.jpg para capturas bonitas.
const PLATES = (process.env.PREMIOS_PHOTOS || '').split(',').filter(Boolean);
const servePlates = (page: Page) => page.route('**/images/e2e-plato-*.jpg', (route) => {
  const n = Number(route.request().url().match(/e2e-plato-(\d)/)?.[1] || 1);
  return route.fulfill({ path: PLATES[n - 1] || PLATES[0] || fileURLToPath(new URL('../../frontend/public/images/listopic-app-icon.png', import.meta.url)) });
});

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
  // Intensidad del filtro, con su barra.
  const strength = page.getByRole('slider', { name: 'Intensidad del filtro' });
  await expect(strength).toBeVisible();
  await strength.fill('40');
  await expect(page.getByText('40%')).toBeVisible();
  await shot(page, '4-filtros');
  // Recortar: formatos y zoom.
  await page.getByRole('button', { name: 'Recortar' }).click();
  await page.getByRole('radio', { name: '4:3' }).click();
  await expect(page.getByRole('slider', { name: 'Zoom' })).toBeVisible();
  await shot(page, '4-recortar');

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

test('crear tarjeta: firma a mano, tema y formato', async ({ page, errors }) => {
  await login(page, 'jefe');
  await page.goto('/preferencias');
  await page.getByRole('button', { name: /Mis premios/ }).click();
  const prizes = page.getByRole('dialog', { name: /Mis premios/ });
  await prizes.getByRole('button', { name: 'Probado y aprobado' }).click();
  await expect(prizes.getByLabel('Tu frase')).toHaveValue('Probado y aprobado');
  await prizes.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Firma guardada')).toBeVisible();
  await expect(prizes.getByText('“Probado y aprobado”')).toBeVisible();
  await shot(page, '7-firma');
  await page.keyboard.press('Escape');
  await expect(prizes).toBeHidden();

  await page.goto('/place/p_vll1');
  await page.getByRole('button', { name: 'Compartir', exact: true }).click();
  await expect(page.getByRole('button', { name: /Crear tarjeta/ })).toBeVisible();
  await page.waitForTimeout(600);
  await shot(page, '8-compartir');
  await page.getByRole('button', { name: /Crear tarjeta/ }).click();
  const studio = page.getByRole('dialog', { name: 'Crear tarjeta' });
  await expect(studio.getByLabel('Vista previa de la tarjeta')).toBeVisible();
  await studio.getByRole('radio', { name: 'Neón' }).click();
  await expect(studio.getByRole('radio', { name: 'Neón' })).toHaveAttribute('aria-checked', 'true');
  await studio.getByRole('button', { name: 'Formato' }).click();
  await studio.getByRole('radio', { name: 'Post' }).click();
  await expect(studio.getByRole('radio', { name: 'Post' })).toHaveAttribute('aria-checked', 'true');
  await studio.getByRole('button', { name: 'Firma' }).click();
  // La de siempre, y se cambia solo para esta tarjeta.
  const phrase = studio.getByLabel('Frase de la firma');
  await expect(phrase).toHaveValue('Probado y aprobado');
  await expect(studio.getByRole('switch', { name: 'Firmar esta tarjeta' })).toHaveAttribute('aria-checked', 'true');
  await phrase.fill('Hoy, sin dieta');
  await expect(studio.getByRole('button', { name: '↩ La de siempre' })).toBeVisible();
  await shot(page, '8-estudio');
  // «Atrás» vuelve al menú de compartir.
  await page.goBack();
  await expect(studio).toBeHidden();
  await expect(page.getByRole('button', { name: /Crear tarjeta/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('tarjetas con fotos: la reseña con las suyas, sello y lista con top 5 y fondo', async ({ page, errors }) => {
  await servePlates(page);
  await login(page, 'jefe');

  // Lista: sin foto de fondo hasta que se elige una de lo que sale en el ranking.
  await page.goto('/list/tarjetas');
  await page.getByLabel('Distancia o zona').selectOption('r:all');
  await expect(page.getByText('Burger de foto').first()).toBeVisible();
  await page.getByRole('button', { name: 'Más acciones' }).click();
  await page.getByRole('button', { name: 'Compartir', exact: true }).click();
  await page.getByRole('button', { name: /Crear tarjeta/ }).click();
  const studio = page.getByRole('dialog', { name: 'Crear tarjeta' });
  await expect(studio.getByLabel('Vista previa de la tarjeta')).toBeVisible();
  await studio.getByRole('button', { name: 'Fondo' }).click();
  const backdrop = studio.getByRole('radiogroup', { name: 'Fondo de la tarjeta' });
  await expect(backdrop.getByRole('radio', { name: 'Sin foto' })).toHaveAttribute('aria-checked', 'true');
  await expect(backdrop.getByRole('radio')).toHaveCount(3);
  await backdrop.getByRole('radio', { name: 'Usar foto 1' }).click();
  await expect(backdrop.getByRole('radio', { name: 'Usar foto 1' })).toHaveAttribute('aria-checked', 'true');
  await expect(studio.getByRole('button', { name: 'Marco' })).toHaveCount(0);
  await page.waitForTimeout(700);
  await shot(page, '9-lista-fondo');
  await page.goBack();
  await expect(studio).toBeHidden();
  // Sin cerrar el menú de compartir: su «atrás» llegaría a la vez que la siguiente visita.

  // Plato (sitio + nombre): sus fotos y el marco de sello.
  await page.goto(`/group/p_tarjeta/${encodeURIComponent('Tortilla de foto')}`);
  await page.getByRole('button', { name: 'Compartir' }).first().click();
  await page.getByRole('button', { name: /Crear tarjeta/ }).click();
  await studio.getByRole('button', { name: 'Foto' }).click();
  await expect(studio.getByRole('radiogroup', { name: 'Foto de la tarjeta' }).getByRole('radio')).toHaveCount(2);
  await studio.getByRole('button', { name: 'Marco' }).click();
  await studio.getByRole('radio', { name: 'Sello' }).click();
  await expect(studio.getByRole('radio', { name: 'Sello' })).toHaveAttribute('aria-checked', 'true');
  await page.waitForTimeout(700);
  await shot(page, '10-sello');
  expect(errors).toEqual([]);
});
