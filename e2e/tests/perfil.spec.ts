// Perfil con más valoraciones que una página: ordenar «mejor → peor» debe
// ordenar todas (no solo las ya cargadas) y, desde otra cuenta, solo las públicas.
import { test, expect, login } from './support';

const PUBLIC_REVIEWS = 35;
const tileIds = (page) => page.locator('[data-review-id]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-review-id')));

test.beforeEach(async ({ page }) => {
  await login(page, 'ana');
  await page.goto('/profile/prolifica');
  await expect(page.locator('[data-review-id]').first()).toBeVisible({ timeout: 15_000 });
});

test('ordenar por nota muestra todas las valoraciones públicas, de mejor a peor', async ({ page, errors }) => {
  await page.getByTitle('Mejor valoradas').click();
  await expect.poll(() => tileIds(page), { timeout: 15_000 }).toHaveLength(PUBLIC_REVIEWS);
  const ids = await tileIds(page);
  expect(ids.slice(0, 2)).toEqual(['m00', 'm01']);
  expect(ids).not.toContain('mpriv');
  // Volver a recientes: la más nueva primero.
  await page.getByTitle('Recientes').click();
  await expect.poll(async () => (await tileIds(page))[0]).toBe('m34');
  expect(errors).toEqual([]);
});

test('filtrar por una Lista con una valoración privada (Minilista) muestra todas las públicas', async ({ page, errors }) => {
  await page.locator('select:has(option[value="all"])').selectOption('muchas');
  await page.getByTitle('Mejor valoradas').click();
  await expect.poll(() => tileIds(page), { timeout: 15_000 }).toHaveLength(PUBLIC_REVIEWS);
  const ids = await tileIds(page);
  expect(ids.slice(0, 2)).toEqual(['m00', 'm01']);
  expect(ids).not.toContain('mpriv');
  expect(errors).toEqual([]);
});
