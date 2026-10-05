// Buscar (Algolia simulado, reindexado por la Function real): mismo puesto que
// la Lista para el mismo elemento, Lista y zona.
import { test, expect, elementKeys, vectors } from './support';

const url = (zone: string) => `/search?type=items&listId=bravas&listName=Patatas%20bravas&sort=grouped_items_by_score&zone=${encodeURIComponent(zone)}`;

test.use({ viewport: { width: 390, height: 3000 } });

for (const zone of ['city:Valladolid', 'city:Madrid', 'region:Castilla y León']) {
  test(`mismo puesto que la Lista en ${zone}`, async ({ page, errors }) => {
    const label = zone.split(':')[1];
    const keys = vectors.expected.zones[zone];
    await page.goto(url(zone));
    await expect.poll(() => elementKeys(page)).toEqual(keys);
    for (let i = 0; i < keys.length; i++) {
      await expect(page.locator(`[data-element-key="${keys[i]}"]`)).toContainText(`#${i + 1} en ${label}`);
    }
    expect(errors).toEqual([]);
  });
}

test('cambio de zona desde el selector', async ({ page, errors }) => {
  await page.goto(url('city:Valladolid'));
  await expect.poll(() => elementKeys(page)).toEqual(vectors.expected.zones['city:Valladolid']);
  await page.getByRole('group', { name: 'Zona' }).getByRole('button').first().click();
  await page.getByRole('button', { name: 'Quitar todas' }).click();
  await page.getByRole('checkbox', { name: /Comunidad de Madrid/ }).check();
  await page.getByRole('dialog', { name: 'Elegir zona' }).getByRole('button', { name: 'Listo' }).click();
  await expect(page).toHaveURL(/zone=region%3AComunidad\+de\+Madrid|zone=region:Comunidad/);
  await expect.poll(() => elementKeys(page)).toEqual(vectors.expected.zones['region:Comunidad de Madrid']);
  expect(errors).toEqual([]);
});

test('los elementos solo de bots aparecen solo con el filtro «Bots»', async ({ page, errors }) => {
  await page.goto('/search?type=items&listId=bravas&listName=Patatas%20bravas&sort=grouped_items_by_score');
  await expect.poll(async () => (await elementKeys(page)).length).toBe(vectors.expected.elements.length);
  expect(await elementKeys(page)).not.toContain(vectors.expected.botOnlyKeys[0]);
  await page.getByRole('button', { name: 'Bots' }).first().click();
  await expect.poll(() => elementKeys(page)).toContain(vectors.expected.botOnlyKeys[0]);
  expect(errors).toEqual([]);
});

test('toda la tarjeta del resultado lleva al elemento, no solo el nombre', async ({ page, errors }) => {
  await page.goto(url('city:Valladolid'));
  const card = page.locator('[data-element-key]').first();
  await expect(card).toBeVisible();
  // Las fuentes van empaquetadas y se cargan después: medir antes movería el clic.
  await page.evaluate(() => document.fonts.ready);
  const box = await card.boundingBox();
  // Esquina inferior izquierda: la foto, lejos del nombre.
  await page.mouse.click(box!.x + 16, box!.y + box!.height - 16);
  await expect(page).toHaveURL(/\/group\/p_/);
  expect(errors).toEqual([]);
});

test.describe('Sitios: un sitio solo con bots', () => {
  const placeNames = (page) => page.locator('article h3').allInnerTexts();

  test('sale en Buscar, «Sin nota pública todavía», y al ordenar por nota va detrás', async ({ page, errors }) => {
    await page.goto('/search?type=places&sort=rating');
    const robot = page.locator('article', { hasText: 'Bar Robot' });
    await expect(robot).toBeVisible();
    await expect(robot).toContainText('Sin nota pública todavía');
    await expect.poll(async () => (await placeNames(page)).length).toBeGreaterThan(3);
    const names = await placeNames(page);
    expect(names[names.length - 1]).toBe('Bar Robot');
    expect(errors).toEqual([]);
  });

  test('con el filtro «Bots», enseña su nota de bots (marcada) y los demás siguen con la pública', async ({ page, errors }) => {
    await page.goto('/search?type=places&sort=rating');
    await expect(page.locator('article', { hasText: 'Bar Robot' })).toBeVisible();
    await page.getByRole('button', { name: /Bots/ }).first().click();
    const robot = page.locator('article', { hasText: 'Bar Robot' });
    await expect(robot).toContainText('7.5');
    await expect(robot.getByLabel('bots')).toBeVisible();
    await expect(robot).not.toContainText('Sin nota pública todavía');
    // Solo sitios con valoraciones de bots: Bar Dos (2 personas + 2 bots) mantiene su nota pública.
    expect((await placeNames(page)).sort()).toEqual(['Bar Dos', 'Bar León', 'Bar Robot'].sort());
    expect(errors).toEqual([]);
  });
});
