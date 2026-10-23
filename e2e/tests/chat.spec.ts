// Chat «con vida»: emojis, reacciones, responder, quedadas (tarjeta, ficha, avisos
// en gris, fijadas arriba), invitar desde el sitio y notas de la mesa.
import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, login, isolate } from './support';

const SHOTS = process.env.CHAT_SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const sheet = (page: Page) => page.locator('.max-h-\\[88vh\\]');

/** Día 15 del mes que viene a las 14:00 (siempre en el futuro). */
async function pickDate(page: Page) {
  await page.getByRole('button', { name: 'Mes siguiente' }).click();
  await page.getByRole('button', { name: / 15 de / }).click();
  await page.getByRole('button', { name: '14:00', exact: true }).click();
}

test('chat: emoji, reacción, respuesta, quedada con respuesta y notas de la mesa', async ({ page, browser, errors }) => {
  await login(page, 'ana');
  await page.goto('/chats/comilona');

  // Quedada pasada: notas de la mesa (ana 9, luis 8,5, eva 6) en su ficha.
  const quedada = page.locator('#msg-quedada');
  await expect(quedada.getByRole('button', { name: '⭐ Valorar', exact: true })).toBeVisible();
  await quedada.getByRole('button', { name: /Notas de la mesa/ }).click();
  await expect(page.getByRole('cell', { name: 'Nota final' })).toBeVisible();
  await expect(page.getByText(/9 👑/)).toBeVisible();
  await shot(page, '5-notas-de-la-mesa');
  await page.getByRole('button', { name: 'Cerrar' }).click();

  // Emoji grande y doble toque (😋).
  await page.getByRole('button', { name: 'Emojis' }).click();
  await page.getByRole('button', { name: '🍕' }).click();
  await page.getByRole('button', { name: 'Enviar' }).click();
  const pizza = page.locator('p.text-5xl', { hasText: '🍕' });
  await expect(pizza).toBeVisible();
  await pizza.dblclick();
  await expect(page.getByRole('button', { name: '😋' }).last()).toBeVisible();

  // Reaccionar (clic derecho = mantener pulsado) y responder.
  await pizza.click({ button: 'right' });
  await page.getByRole('button', { name: '🔥', exact: true }).click();
  await expect(page.getByRole('button', { name: '🔥' }).last()).toBeVisible();
  await pizza.click({ button: 'right' });
  await page.getByRole('button', { name: '↩️ Responder' }).click();
  await expect(page.getByText('Respondiendo a Tú')).toBeVisible();
  await page.getByPlaceholder('Escribe un mensaje...').fill('¡Repetimos!');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.locator('p.whitespace-pre-wrap', { hasText: '¡Repetimos!' })).toBeVisible();

  // Nueva quedada con el calendario.
  await page.getByRole('button', { name: 'Invitar, encuesta o ruleta' }).click();
  await shot(page, '1-herramientas');
  await page.getByRole('button', { name: /Invitar a comer/ }).click();
  await sheet(page).locator('button:has(p)').first().click();
  await pickDate(page);
  await page.getByPlaceholder(/Pago yo/).fill('Pago yo 😎');
  await shot(page, '2-crear-quedada');
  await sheet(page).getByRole('button', { name: /^Invitar · / }).click();
  await expect(page.getByText('🍽️ TU QUEDADA').last()).toBeVisible();
  await expect(page.locator('button', { hasText: /En \d+ días/ }).first()).toBeVisible(); // fijada arriba

  // Eva responde «Voy» desde la tarjeta y ve el aviso en gris y la ficha.
  const other = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES', serviceWorkers: 'block' });
  await isolate(other);
  const evaPage = await other.newPage();
  await login(evaPage, 'eva');
  await evaPage.goto('/chats/comilona');
  const card = evaPage.locator('[data-event-card]', { hasText: '🍽️ ANA TE INVITA' }).last();
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await shot(evaPage, '3-quedada-en-el-chat');
  await card.getByRole('button', { name: '✅ Voy' }).click();
  await expect(evaPage.getByText(/✅ Tú vas a /)).toBeVisible();
  await card.getByRole('button', { name: 'Detalles' }).click();
  await expect(evaPage.getByText('✅ Van · 2')).toBeVisible();
  await expect(evaPage.getByText('Platos y notas')).toBeVisible();
  await shot(evaPage, '4-ficha-quedada');
  await other.close();

  // Ana ve el aviso de Eva.
  await expect(page.getByText(/✅ eva va a /).filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Invitar, encuesta o ruleta' }).click();
  await shot(page, '7-aviso-y-fijada');
  expect(errors).toEqual([]);
});

test('invitar a comer desde el botón Compartir de un sitio', async ({ page, errors }) => {
  await login(page, 'ana');
  await page.goto('/place/p_vll1');
  await page.getByRole('button', { name: 'Compartir', exact: true }).click();
  await page.getByRole('button', { name: /Invitar a comer aquí/ }).click();
  await sheet(page).getByRole('button', { name: /Comilona/ }).click();
  await sheet(page).getByRole('button', { name: /^Brav/ }).first().click();
  await pickDate(page);
  await shot(page, '6-invitar-desde-sitio');
  await sheet(page).getByRole('button', { name: /^Invitar · / }).click();
  await expect(page).toHaveURL(/\/chats\/comilona/);
  await expect(page.getByText('🍽️ TU QUEDADA').last()).toBeVisible();
  expect(errors).toEqual([]);
});
