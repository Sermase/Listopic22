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

  // Los aspirantes sin probar están en el ranking, al final, sin puesto y con «Valorar».
  const ahumada = page.locator('article', { hasText: 'Brava ahumada' });
  await expect(ahumada.getByText('🏆 Sin probar')).toBeVisible();
  await expect(ahumada.locator('[aria-label^="Puesto"]')).toHaveCount(0);

  // Filtro del concurso: con nota, solo los valorados; sin probar, solo los que faltan.
  await panel.getByRole('radio', { name: 'Con nota' }).click();
  await expect(page.locator('article', { hasText: 'Brava ahumada' })).toHaveCount(0);
  await expect(page.getByText('🏆 Sin probar')).toHaveCount(0);
  await expect(page.locator('article [aria-label^="Puesto"]').first()).toBeVisible();
  await panel.getByRole('radio', { name: 'Todos' }).click();

  // «Valorar» de arriba no abre un formulario libre: deja a la vista los que faltan por probar.
  await page.getByRole('button', { name: 'Valorar' }).first().click();
  await expect(panel.getByRole('radio', { name: /Sin probar/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('article', { hasText: 'Brava ahumada' })).toBeVisible();
  await expect(page.locator('article [aria-label^="Puesto"]')).toHaveCount(0);
  await page.locator('article', { hasText: 'Brava ahumada' }).scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(400);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-sin-probar.png` });

  await page.locator('article', { hasText: 'Brava ahumada' }).getByRole('button', { name: 'Valorar' }).click();
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
  const newListId = new URL(page.url()).pathname.split('/').pop();
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
  // Limpieza: que la Minilista nueva no cambie lo que ven las pruebas siguientes.
  const FIRESTORE = `http://${process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'}/v1/projects/demo-listopic/databases/(default)/documents`;
  await fetch(`${FIRESTORE}/lists/${newListId}`, { method: 'DELETE', headers: { authorization: 'Bearer owner' } });
});

test('destacar el concurso: el dueño lo pide desde la ventana del concurso', async ({ page, errors }) => {
  await login(page, 'duena');
  await page.goto('/list/concurso');
  await page.getByRole('button', { name: 'Ajustes del concurso' }).click();
  const zone = page.getByRole('combobox', { name: 'Zona donde destacar' });
  await expect(zone.locator('option', { hasText: 'Valladolid provincia' })).toHaveCount(1, { timeout: 15_000 });
  await zone.selectOption({ label: 'Valladolid provincia' });
  await page.getByRole('button', { name: 'Pedir', exact: true }).click();
  await expect(page.getByText(/Pendiente de revisión · Valladolid provincia/)).toBeVisible();
  await page.waitForTimeout(500);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/10-pedir-destacado.png` });

  await page.getByRole('button', { name: 'Cerrar' }).first().click();
  await page.goto('/');
  await expect(page.getByText('Concurso abierto')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('destacar el concurso: un jefe lo acepta en Developer y sale en Inicio', async ({ page, errors }) => {
  await login(page, 'jefe');
  await page.goto('/developer');
  const requests = page.getByRole('region', { name: 'Concursos destacados' });
  await expect(requests.getByText('Concurso de bravas')).toBeVisible({ timeout: 15_000 });
  if (SHOTS) await requests.screenshot({ path: `${SHOTS}/11-developer-destacar.png` });
  await requests.getByRole('button', { name: 'Aceptar' }).click();
  await expect(requests).toHaveCount(0);

  await page.goto('/');
  const card = page.getByRole('link', { name: /Concurso abierto.*Concurso de bravas/ });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/12-inicio-destacado.png` });
  expect(errors).toEqual([]);

  // Limpieza: sin destacado para las pruebas siguientes.
  const FIRESTORE = `http://${process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'}/v1/projects/demo-listopic/databases/(default)/documents`;
  await fetch(`${FIRESTORE}/lists/concurso?updateMask.fieldPaths=featureRequest`, { method: 'PATCH', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ fields: {} }) });
});
