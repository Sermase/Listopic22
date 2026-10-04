// Developer como jefe SIN claim `admin` (lo normal en una cuenta nueva): el claim se
// pide solo, Reseñas carga por el servidor y una valoración se ve y se edita (también
// el autor) en su modal; Usuarios abre la ficha completa.
import { test, expect, login } from './support';

test.use({ viewport: { width: 1280, height: 900 } });

const openTab = async (page, label: string) => {
  await page.locator('nav button').filter({ hasText: label }).first().click();
};

test('Reseñas: carga todo por el servidor y se edita una valoración en su modal', async ({ page, errors }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await login(page, 'jefe');
  await page.goto('/developer');
  await expect(page.getByText('Comprobando permisos…')).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText(/Activando tus permisos/)).toBeHidden({ timeout: 20_000 });
  await openTab(page, 'Reseñas');
  await page.getByRole('button', { name: /^\s*Cargar\s*$/ }).click();
  await expect(page.getByText(/\d+ \/ 27 reseñas/)).toBeVisible();

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
  test.setTimeout(150_000);
  await login(page, 'jefe');
  await page.goto('/developer');
  const nav = page.locator('nav').filter({ hasText: 'Consola de Datos' });
  await expect(nav).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Comprobando permisos…')).toBeHidden({ timeout: 20_000 });
  const labels = (await nav.locator('button').evaluateAll((els) => els.map((e) => (e.textContent || '').trim()))).filter(Boolean);
  expect(labels.length).toBeGreaterThan(15);
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
  // El fixture `errors` falla la prueba con cualquier error de JS o de consola (permisos incluidos).
  expect(errors).toEqual([]);
});
