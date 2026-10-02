// Home, Lista (ranking, zona y mapa) con los datos sembrados del caso compartido.
import { test, expect, elementKeys, vectors } from './support';

const ranking = vectors.expected.elements.map((e) => e.key);

test('Home: Listas y mapa', async ({ page, errors }) => {
  await page.goto('/');
  await expect(page.getByText('Patatas bravas').first()).toBeVisible();
  await page.getByRole('button', { name: 'Ver mapa' }).first().click();
  await expect(page.locator('.leaflet-container').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('Lista', () => {
  test.use({ viewport: { width: 390, height: 3000 } });

  test('ranking de toda la Lista: orden, puestos y sin la Minilista privada ni bots', async ({ page, errors }) => {
    await page.goto('/list/bravas');
    await page.getByRole('button', { name: 'Ranking' }).click();
    await page.getByLabel('Distancia o zona').selectOption('r:all');
    await expect.poll(() => elementKeys(page)).toEqual(ranking);
    const first = page.locator('[data-element-key]').first();
    await expect(first).toContainText('#1');
    expect(errors).toEqual([]);
  });

  test('cambio de zona: puestos de Valladolid y de Castilla y León', async ({ page, errors }) => {
    await page.goto('/list/bravas');
    await page.getByRole('button', { name: 'Ranking' }).click();
    await page.getByLabel('Distancia o zona').selectOption('city:Valladolid');
    await expect.poll(() => elementKeys(page)).toEqual(vectors.expected.zones['city:Valladolid']);
    await page.getByLabel('Zona').selectOption('region:Castilla y León');
    await expect.poll(() => elementKeys(page)).toEqual(vectors.expected.zones['region:Castilla y León']);
    expect(errors).toEqual([]);
  });

  test('mapa de la Lista', async ({ page, errors }) => {
    await page.goto('/list/bravas');
    await page.getByLabel('Distancia o zona').selectOption('r:all');
    await page.getByRole('button', { name: 'Ver mapa' }).first().click();
    await expect(page.locator('.leaflet-container').first()).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon, .leaflet-interactive').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
