// Minilista en modo concurso: aspirantes «Sin valorar», «Valorar» relleno y ajustes.
import { test, expect, login, sheetGone } from './support';

const SHOTS = process.env.SHOTS_DIR;

test('concurso: aspirantes sin valorar y Valorar con sitio y plato ya puestos', async ({ page, errors }) => {
  await login(page, 'duena');
  await page.goto('/list/concurso');
  // Una sola etiqueta en la cabecera: qué es y que es oficial.
  await expect(page.getByText('🏆 Concurso oficial')).toBeVisible();
  const panel = page.locator('#contest-panel');
  const unrated = panel.getByRole('button', { name: '2 sin valorar' });
  await expect(unrated).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-minilista-concurso.png` });

  // Los aspirantes sin valorar están en el ranking, al final, sin puesto y con «Valorar».
  const ahumada = page.locator('article', { hasText: 'Brava ahumada' });
  await expect(ahumada.getByText('Sin valorar', { exact: true })).toBeVisible();
  await expect(ahumada.locator('[aria-label^="Puesto"]')).toHaveCount(0);

  // Filtro del concurso (en «Filtros»): con nota, solo los valorados.
  await page.getByRole('button', { name: /^Filtros/ }).click();
  await page.getByRole('radio', { name: 'Con nota' }).click();
  await page.getByRole('button', { name: /^Ver \d+ resultados?$/ }).click();
  await expect(page.locator('article', { hasText: 'Brava ahumada' })).toHaveCount(0);
  await expect(page.getByText('Sin valorar', { exact: true })).toHaveCount(0);
  await expect(page.locator('article [aria-label^="Puesto"]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Ver todos' }).click();
  await expect(ahumada).toBeVisible();

  // Tocar «2 sin valorar» deja solo esos; otra vez, todos.
  await unrated.click();
  await expect(page.getByRole('heading', { name: 'Por valorar' })).toBeVisible();
  await expect(page.locator('article [aria-label^="Puesto"]')).toHaveCount(0);
  await unrated.click();
  await expect(unrated).toHaveAttribute('aria-pressed', 'false');

  // «Valorar» de arriba no abre un formulario libre: deja a la vista los que faltan por valorar.
  await page.getByRole('button', { name: 'Valorar' }).first().click();
  await expect(unrated).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('article', { hasText: 'Brava ahumada' })).toBeVisible();
  await expect(page.locator('article [aria-label^="Puesto"]')).toHaveCount(0);
  await page.locator('article', { hasText: 'Brava ahumada' }).scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(400);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-sin-valorar.png` });

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
  await sheetGone(page);
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
  await sheetGone(page);
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

test('mapa del concurso: la ficha lleva a la página del plato, no al sitio', async ({ page, errors }) => {
  await login(page, 'duena');
  await page.goto('/list/concurso');
  await page.getByRole('button', { name: 'Ver mapa' }).first().click();
  // Bar Tres: un solo plato valorado (8.2 de media).
  const pin = page.locator('.leaflet-marker-icon').filter({ hasText: /\d/ }).first();
  await expect(pin).toBeVisible();
  await page.waitForTimeout(800); // el mapa termina de encuadrar
  const popup = page.locator('.leaflet-popup');
  // Si el clic llega mientras el mapa aún se mueve, Leaflet lo toma por arrastre: se reintenta.
  await expect(async () => {
    await pin.click();
    await expect(popup).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  const dishLink = popup.locator('a[href*="/group/"]').first();
  await expect(dishLink).toBeVisible();
  await expect(popup.locator('a[href^="/place/"]')).toHaveCount(0);
  await page.waitForTimeout(400);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/7-ficha-mapa-plato.png` });
  await dishLink.click();
  await expect(page).toHaveURL(/\/group\//);
  expect(errors).toEqual([]);
});

test.describe('concurso visto desde Madrid', () => {
  test.use({ geolocation: { latitude: 40.4168, longitude: -3.7038 } });

  test('la distancia no ofrece radios que no lleguen al aspirante más cercano', async ({ page, errors }) => {
    await login(page, 'ana');
    await page.goto('/list/concurso');
    // Por defecto, el concurso entero, estés donde estés.
    const zone = page.getByLabel('Distancia o zona');
    await expect(zone).toHaveValue('r:all');
    await expect(page.locator('article', { hasText: 'Brava ahumada' })).toBeVisible();
    // Desde Madrid, lo más cercano está a ~160 km: ni 5 km ni 100 km; 200 km sí, y se ve todo.
    await zone.selectOption('r:200');
    await expect(zone.locator('option[value="r:5"]')).toHaveCount(0);
    await expect(zone.locator('option[value="r:100"]')).toHaveCount(0);
    await expect(zone).toHaveValue('r:200');
    await expect(page.locator('article', { hasText: 'Brava ahumada' })).toBeVisible();
    await expect(zone.locator('optgroup').first()).toHaveAttribute('label', /lo más cerca está a 1\d\d km/);
    expect(errors).toEqual([]);
  });
});
