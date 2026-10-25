// Una reseña por persona y plato (lib/reviewUniqueness + Function de respaldo),
// carrusel «Les encantó» (almas gemelas) y apps del laboratorio en Developer.
import { test, expect, login } from './support';

const FIRESTORE = `http://${process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'}/v1/projects/demo-listopic/databases/(default)/documents`;
const SHOTS = process.env.SHOTS_DIR;

type Fields = Record<string, string | number>;
const toFields = (data: Fields) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k,
  k === 'createdAt' ? { timestampValue: new Date(v).toISOString() } : typeof v === 'number' ? { doubleValue: v } : { stringValue: v }]));

async function put(path: string, data: Fields) {
  const res = await fetch(`${FIRESTORE}/${path}`, {
    method: 'PATCH', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ fields: toFields(data) }),
  });
  expect(res.ok).toBe(true);
}
const exists = async (path: string) => (await fetch(`${FIRESTORE}/${path}`, { headers: { authorization: 'Bearer owner' } })).ok;

test('no deja una segunda reseña del mismo plato y ofrece editar la tuya', async ({ page, errors }) => {
  await login(page, 'ana');
  await page.goto('/create-review?listId=bravas&placeId=p_vll1&itemName=Bravas');
  await expect(page.getByText(/Ya valoraste/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Publicar reseña/ })).toBeDisabled();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-aviso.png` });
  await page.getByRole('button', { name: /Editar la mía/ }).click();
  await expect(page.getByRole('button', { name: /Guardar Cambios/ })).toBeVisible();
  await expect(page.getByText(/Ya valoraste/)).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-editar-la-mia.png` });
  expect(errors).toEqual([]);
});

test('si se cuela una repetida, la Function se queda con la más antigua', async () => {
  const base = { userId: 'eva', listId: 'pruebas', placeId: 'p_med', itemName: 'Tortilla única', visibility: 'public', overallRating: 7 };
  await put('lists/pruebas/reviews/dup_a', { ...base, createdAt: Date.now() - 60_000 });
  await expect.poll(() => exists('lists/pruebas/reviews/dup_a')).toBe(true);
  await put('lists/pruebas/reviews/dup_b', { ...base, itemName: 'tortilla ÚNICA', createdAt: Date.now() });
  await expect.poll(() => exists('lists/pruebas/reviews/dup_b'), { timeout: 20_000 }).toBe(false);
  expect(await exists('lists/pruebas/reviews/dup_a')).toBe(true);
});

test('carrusel de almas gemelas en Inicio', async ({ page, errors }) => {
  // Luis (afín a Ana por sus bravas) ha probado algo que Ana no.
  await put('lists/croquetas/reviews/alma1', {
    userId: 'luis', authorName: 'luis', listId: 'croquetas', placeId: 'p_carta', itemName: 'Croqueta de boletus',
    placeName: 'Casa Carta', visibility: 'public', overallRating: 9.2, comment: 'Brutal.', createdAt: Date.now(),
  });
  await login(page, 'ana');
  await page.goto('/');
  const title = page.getByText('Les encantó', { exact: true });
  await expect(title).toBeVisible({ timeout: 20_000 });
  await title.scrollIntoViewIfNeeded();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/3-almas-gemelas.png` });
  expect(errors).toEqual([]);
});

test('Developer elige qué apps del laboratorio se muestran', async ({ page, errors }) => {
  await login(page, 'jefe');
  await page.goto('/developer?tab=proyectos');
  const toggles = page.getByRole('button', { name: /Se mostrará|Se muestra|Oculta/ });
  await expect(toggles).toHaveCount(2);
  await toggles.nth(1).click();
  await expect(toggles.nth(1)).toHaveText(/Oculta/);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/4-developer-lab.png`, fullPage: true });
  await page.goto('/developer?tab=maintenance');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByText(/reseñas revisadas/)).toBeVisible({ timeout: 20_000 });
  await page.getByText('Reseñas repetidas').scrollIntoViewIfNeeded();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/5-repetidas.png` });
  expect(errors).toEqual([]);
});
