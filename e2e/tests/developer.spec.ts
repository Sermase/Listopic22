// Developer como jefe SIN claim `admin` (lo normal en una cuenta nueva): el claim se
// pide solo, Developer abre en «📥 Pendientes», Reseñas carga por el servidor y una
// valoración se ve y se edita (también el autor) en su modal; Usuarios abre la ficha
// completa; ninguna pestaña ni sub-pestaña de Patrocinios y Pro da errores.
import type { Page } from '@playwright/test';
import { test, expect, login } from './support';

test.use({ viewport: { width: 1280, height: 900 } });

/** Barra lateral de Developer, agrupada en secciones (Bandeja, Moderación, Negocios y planes…). */
const devNav = (page: Page) => page.getByRole('navigation', { name: 'Herramientas de Developer' });

const openTab = async (page: Page, label: string) => {
  await devNav(page).locator('button').filter({ hasText: label }).first().click();
};

test('Reseñas: carga todo por el servidor y se edita una valoración en su modal', async ({ page, errors }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await login(page, 'jefe');
  await page.goto('/developer');
  await expect(page.getByText('Comprobando permisos…')).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText(/Activando tus permisos/)).toBeHidden({ timeout: 20_000 });
  await openTab(page, 'Reseñas');
  await page.getByRole('button', { name: /^\s*Cargar\s*$/ }).click();
  // 25 del caso compartido + 2 de «Bar Robot» + 1 de «Casa Carta» (carta.spec.ts).
  await expect(page.getByText(/\d+ \/ 28 reseñas/)).toBeVisible();

  // La de «Bar Robot» (Lista «Robots E2E»): ninguna prueba posterior depende de ella.
  await page.getByPlaceholder('itemName...').fill('Bravas robot');
  await page.getByTitle('Ver y editar').first().click();
  const modal = page.getByRole('dialog', { name: 'Valoración' });
  await expect(modal.getByText('Autor')).toBeVisible();
  await modal.getByLabel('Comentario').fill('Editado desde Developer');
  await modal.getByLabel('Motivo').fill('prueba E2E');
  await modal.getByRole('button', { name: /Guardar/ }).click();
  await expect(modal.getByText(/Guardado: comment/)).toBeVisible();

  // Cambio de autor (del bot a la jefa) → recuento de los dos.
  await modal.getByLabel('Buscar nuevo autor').fill('jefe');
  await modal.getByRole('button', { name: 'Buscar autor' }).click();
  await modal.getByRole('button', { name: /^Jefa/ }).first().click();
  await modal.getByRole('button', { name: /Guardar/ }).click();
  await expect(modal.getByText(/Guardado: author · Recontados/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('Usuarios: ficha completa y, desde ella, el detalle de una valoración', async ({ page, errors }) => {
  await login(page, 'jefe');
  await page.goto('/developer');
  await expect(page.getByText('Comprobando permisos…')).toBeHidden({ timeout: 20_000 });
  await openTab(page, 'Usuarios');
  await page.getByPlaceholder(/Buscar por username/).fill('ana');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await page.locator('tr', { hasText: '@ana' }).first().click();
  const panel = page.getByRole('dialog', { name: 'Ficha de usuario' });
  await expect(panel.getByRole('button', { name: /Valoraciones \(\d+\)/ })).toBeVisible();
  await expect(panel.getByText('Públicas / privadas')).toBeVisible();
  await panel.locator('button', { hasText: 'pública' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Valoración' }).getByText('Autor')).toBeVisible();
  expect(errors).toEqual([]);
});

test('ninguna pestaña de Developer da errores de permisos (jefe sin claim)', async ({ page, errors }) => {
  test.setTimeout(180_000);
  await login(page, 'jefe');
  await page.goto('/developer');
  const nav = devNav(page);
  await expect(nav).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Comprobando permisos…')).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText(/Activando tus permisos/)).toBeHidden({ timeout: 20_000 });
  // Sin ?tab= abre en «📥 Pendientes».
  await expect(nav.locator('button[aria-current="page"]')).toContainText('Pendientes');
  await expect(page.locator('main').getByRole('heading', { level: 2, name: /Pendientes/ })).toBeVisible({ timeout: 20_000 });
  // Solo el nombre de cada pestaña (su primer <span>): los contadores de la barra
  // («Pendientes 3 por revisar») aparecen y cambian mientras carga.
  const labels = (await nav.locator('button').evaluateAll((els) => els.map((e) => (e.querySelector('span')?.textContent || '').trim()))).filter(Boolean);
  expect(labels.length).toBeGreaterThan(15);
  expect(labels[0]).toBe('Pendientes');
  for (const label of labels) {
    await nav.locator('button').filter({ hasText: label }).first().click();
    await page.waitForTimeout(1200);
    // Solo botones de lectura («Cargar», «Buscar», «Analizar»): nada que escriba.
    for (const name of [/^\s*Cargar\s*$/, /^\s*Buscar\s*$/, /^\s*Analizar\s*$/]) {
      const button = page.locator('main').getByRole('button', { name }).first();
      if (await button.isVisible().catch(() => false) && await button.isEnabled().catch(() => false)) {
        await button.click();
        await page.waitForTimeout(1500);
      }
    }
  }
  // Patrocinios y Pro: cada sub-pestaña lee lo suyo al abrirla. «🧹 Reparar cartas»
  // (🛠️ Herramientas) no lanza nada hasta pulsar «Simular» o «Aplicar».
  await openTab(page, 'Patrocinios y Pro');
  for (const name of [/Bandeja/, /En curso/, /Historial/, /Precios/, /Duelo/, /Herramientas/]) {
    const subTab = page.locator('main').getByRole('tab', { name });
    await subTab.click();
    await expect(subTab).toHaveAttribute('aria-selected', 'true');
    await page.waitForTimeout(1200);
  }
  await expect(page.getByRole('heading', { name: '🧹 Reparar cartas' })).toBeVisible();
  // El fixture `errors` falla la prueba con cualquier error de JS o de consola (permisos incluidos).
  expect(errors).toEqual([]);
});
