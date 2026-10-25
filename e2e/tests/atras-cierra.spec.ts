// Las ventanas se cierran como en Pachote: «atrás» cierra la ventana en vez de
// salir de la página, y deslizar hacia abajo también la cierra.
import type { Locator, Page } from '@playwright/test';
import { test, expect, login } from './support';

test.use({ hasTouch: true });

/** Desliza el dedo hacia abajo desde lo alto del panel (eventos táctiles de verdad). */
async function swipeDown(page: Page, panel: Locator) {
  // La ventana entra desde abajo (lt-sheet): se mide cuando ya ha llegado a su sitio.
  await panel.evaluate((el) => Promise.all((el.closest('.lt-sheet')?.getAnimations() ?? []).map((a) => a.finished.catch(() => {}))));
  const box = await panel.boundingBox();
  if (!box) throw new Error('sin panel');
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + 24;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + i * 25 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('«Atrás» y deslizar cierran las ventanas sin salir de la página', async ({ page, errors }) => {
  await login(page, 'ana');
  await page.goto('/');
  await page.goto('/chats/riano');
  const info = page.getByRole('heading', { name: 'Grupo' });

  // «Atrás» con la info del grupo abierta: se cierra y seguimos en el chat.
  await page.getByRole('button', { name: 'Info del chat' }).click();
  await expect(info).toBeVisible();
  await page.goBack();
  await expect(info).toBeHidden();
  await expect(page).toHaveURL(/\/chats\/riano$/);

  // Deslizar hacia abajo: se cierra y su entrada del historial se va con ella.
  await page.getByRole('button', { name: 'Info del chat' }).click();
  await expect(info).toBeVisible();
  await swipeDown(page, info);
  await expect(info).toBeHidden();
  await expect(page).toHaveURL(/\/chats\/riano$/);

  // Una herramienta del chat (hoja) también se cierra con «atrás».
  await page.getByRole('button', { name: 'Invitar, encuesta o ruleta' }).click();
  await page.getByRole('button', { name: /Ruleta del antojo/ }).click();
  const sheet = page.getByRole('heading', { name: /Ruleta del antojo/ });
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/chats\/riano$/);

  // Sin ventanas abiertas, «atrás» vuelve a la página anterior como siempre.
  await page.goBack();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);

  // El menú de Inicio, igual.
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  const menu = page.getByRole('dialog', { name: 'Menú' });
  await expect(menu).toBeVisible();
  await page.goBack();
  await expect(menu).toBeHidden();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  void errors;
});
