// Inicio de sesión y una valoración nueva de punta a punta (Firestore emulado).
import { test, expect, login } from './support';

const FIRESTORE = `http://${process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'}/v1/projects/demo-listopic/databases/(default)/documents`;

async function reviewsBy(uid: string, listId: string) {
  const res = await fetch(`${FIRESTORE}/lists/${listId}/reviews?pageSize=300`, { headers: { authorization: 'Bearer owner' } });
  const body = await res.json() as { documents?: Array<{ fields: Record<string, { stringValue?: string }> }> };
  return (body.documents || []).filter((d) => d.fields.userId?.stringValue === uid);
}

test('iniciar sesión', async ({ page, errors }) => {
  await login(page, 'ana');
  await expect(page.getByRole('button', { name: 'Iniciar Sesión' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('valorar un elemento y verlo en la Lista', async ({ page, errors }) => {
  const before = (await reviewsBy('eva', 'pruebas')).length;
  await login(page, 'eva');
  await page.goto('/create-review?listId=pruebas&placeId=p_med&itemName=Tortilla');
  const sliders = page.locator('input[type="range"]');
  await expect(sliders.first()).toBeVisible();
  for (const slider of await sliders.all()) await slider.fill('8');
  await page.getByRole('button', { name: /Publicar valoración/ }).click();
  await expect.poll(async () => (await reviewsBy('eva', 'pruebas')).length, { timeout: 15_000 }).toBe(before + 1);
  await page.goto('/list/pruebas');
  await page.getByLabel('Distancia o zona').selectOption('r:all');
  await expect(page.locator('[data-element-key="p_med_tortilla"]')).toBeVisible();
  expect(errors).toEqual([]);
});
