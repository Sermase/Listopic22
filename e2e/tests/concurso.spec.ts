// Minilista en modo concurso: aspirantes «Sin probar», «Valorar» relleno y ajustes.
import { test, expect, login } from './support';

const SHOTS = process.env.SHOTS_DIR;

test('concurso: aspirantes sin probar y Valorar con sitio y plato ya puestos', async ({ page, errors }) => {
  await login(page, 'duena');
  await page.goto('/list/concurso');
  await expect(page.getByText('🏆 Concurso').first()).toBeVisible();
  await expect(page.getByText('✔️ Oficial de Listopic')).toBeVisible();
  const panel = page.locator('#contest-panel');
  await expect(panel.getByText(/3 aspirantes · 2 sin probar/)).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-minilista-concurso.png` });

  // «Valorar» de arriba no abre un formulario libre: despliega los aspirantes.
  await page.getByRole('button', { name: 'Valorar' }).first().click();
  await expect(panel.getByText('Brava ahumada')).toBeVisible();
  await expect(panel.getByText('Bravas', { exact: true })).toHaveCount(0);
  await panel.scrollIntoViewIfNeeded();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-sin-probar.png` });

  await panel.getByRole('button', { name: /Brava ahumada/ }).click();
  await expect(page.locator('input[value="Brava ahumada"]')).toBeVisible();
  await page.waitForTimeout(800);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/3-valorar-relleno.png` });
  await page.keyboard.press('Escape');
  await page.goBack().catch(() => undefined);

  await page.goto('/list/concurso');
  await page.getByRole('button', { name: 'Ajustes del concurso' }).click();
  await expect(page.getByText('🏆 Modo concurso')).toBeVisible();
  await page.waitForTimeout(800);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/4-ajustes.png` });
  expect(errors).toEqual([]);
});

test('concurso: quien no es dueño no ve ajustes', async ({ page }) => {
  await login(page, 'ana');
  await page.goto('/list/concurso');
  await expect(page.locator('#contest-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajustes del concurso' })).toHaveCount(0);
});

test('crear Minilista desde la lista en modo concurso: va a ella con los aspirantes abiertos', async ({ page, errors }) => {
  await login(page, 'ana');
  await page.goto('/list/bravas');
  await page.getByRole('button', { name: /Más acciones/ }).click();
  await page.getByRole('button', { name: /Minilistas/ }).click();
  await expect(page.getByText('Concurso de bravas')).toBeVisible();
  await page.getByRole('button', { name: /Crear Minilista/ }).first().click();
  await page.getByPlaceholder(/Sushi \(Minilista\)/).fill('Concurso de ana');
  await page.getByText('🏆 Modo concurso').click();
  await expect(page.getByText('Hasta (incluido)')).toBeVisible();
  await page.waitForTimeout(500);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/5-crear-con-concurso.png` });
  await page.getByRole('button', { name: /^Crear Minilista$/ }).last().click();
  await expect(page).toHaveURL(/\/list\/(?!bravas)[^/?]+/);
  await expect(page.getByRole('heading', { name: '🏆 Aspirantes y concurso' })).toBeVisible();
  await expect(page.getByPlaceholder('Busca el sitio')).toBeVisible();
  await page.waitForTimeout(800);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/6-aspirantes-al-crear.png` });
  await page.getByRole('button', { name: 'Cerrar' }).first().click();
  await page.goto('/list/bravas');
  await page.getByRole('button', { name: /Más acciones/ }).click();
  await page.getByRole('button', { name: /Minilistas/ }).click();
  await expect(page.getByText('Concurso de ana')).toBeVisible();
  expect(errors).toEqual([]);
});
