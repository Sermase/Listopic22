// Chat «con vida»: emojis, reacciones, responder, invitación a comer, encuesta y duelo de notas.
import { mkdirSync } from 'node:fs';
import { test, expect, login } from './support';

const SHOTS = process.env.CHAT_SHOTS_DIR;
const shot = async (page: import('@playwright/test').Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test('emoji grande, reacción, respuesta e invitación con respuesta', async ({ page, browser, errors }) => {
  await login(page, 'ana');
  await page.goto('/chats/comilona');

  // Quedada pasada: valorar y notas de la mesa (ana 9, luis 8,5, eva 6).
  const quedada = page.locator('#msg-quedada');
  await expect(quedada.getByText('¿Qué tal estaba?')).toBeVisible();
  await quedada.getByRole('button', { name: /Notas de la mesa/ }).click();
  await expect(page.getByRole('cell', { name: 'Nota final' })).toBeVisible();
  await expect(page.getByText(/9 👑/)).toBeVisible();
  await shot(page, '4-duelo');
  await page.getByRole('button', { name: 'Cerrar' }).click();

  // Emoji grande.
  await page.getByRole('button', { name: 'Emojis' }).click();
  await page.getByRole('button', { name: '🍕' }).click();
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.locator('p.text-5xl', { hasText: '🍕' })).toBeVisible();

  // Reaccionar (clic derecho = mantener pulsado) y responder.
  await page.locator('#msg-quedada [class*="select-none"]').first().click({ button: 'right' });
  await page.getByRole('button', { name: '😋', exact: true }).first().click();
  await expect(quedada.getByRole('button', { name: '😋' })).toBeVisible();
  await page.locator('#msg-quedada [class*="select-none"]').first().click({ button: 'right' });
  await page.getByRole('button', { name: '↩️ Responder' }).click();
  await expect(page.getByText('Respondiendo a Tú')).toBeVisible();
  await page.getByPlaceholder('Escribe un mensaje...').fill('¡Repetimos!');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.locator('p.whitespace-pre-wrap', { hasText: '¡Repetimos!' })).toBeVisible();
  await expect(page.locator('button.border-l-2').last()).toContainText('Te invito a comer Bravas');

  // Invitación nueva.
  await page.getByRole('button', { name: 'Invitar, encuesta o ruleta' }).click();
  await shot(page, '1-herramientas');
  await page.getByRole('button', { name: /Invitar a comer/ }).click();
  await page.locator('.max-h-\\[88vh\\] button:has(p)').first().click();
  await page.getByRole('button', { name: 'Mañana 14:00' }).click();
  await page.getByPlaceholder(/Pago yo/).fill('Pago yo 😎');
  await shot(page, '2-crear-invitacion');
  await page.getByRole('button', { name: 'Enviar invitación' }).click();
  await expect(page.getByText('🍽️ HAS INVITADO A COMER')).toHaveCount(2);

  // Encuesta.
  await page.getByRole('button', { name: 'Invitar, encuesta o ruleta' }).click();
  await page.getByRole('button', { name: /¿Dónde comemos\?/ }).click();
  const sheet = page.locator('.max-h-\\[88vh\\]');
  await sheet.locator('button:has(p)').first().click();
  await sheet.locator('button:has(p)').first().click();
  await sheet.getByRole('button', { name: 'Enviar encuesta' }).click();
  await expect(page.getByText('🗳️ ENCUESTA')).toBeVisible();
  await page.getByText('🗳️ ENCUESTA').locator('..').locator('button:has(p)').first().click();
  await expect(page.getByRole('button', { name: /Invitar a/ })).toBeVisible();

  // Eva responde «Voy» en su sesión.
  const other = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES', serviceWorkers: 'block' });
  const { isolate } = await import('./support');
  await isolate(other);
  const evaPage = await other.newPage();
  await login(evaPage, 'eva');
  await evaPage.goto('/chats/comilona');
  const card = evaPage.getByText('🍽️ ANA TE INVITA').last().locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
  await card.getByRole('button', { name: '✅ Voy' }).click();
  await expect(evaPage.locator('p.whitespace-pre-wrap', { hasText: '✅ ¡Voy!' })).toBeVisible();
  await expect(card.getByText('✅ Tú')).toBeVisible();
  await shot(evaPage, '3-invitacion-respondida');
  await other.close();

  expect(errors).toEqual([]);
});
