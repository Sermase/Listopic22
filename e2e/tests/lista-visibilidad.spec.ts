// Hacer pública una Lista privada: sus valoraciones (de cualquiera) pasan a
// públicas (trigger list-visibility-sync) con las reglas que ya no dejan listar
// sin filtrar una Lista pública.
import { test, expect, login } from './support';

const FIRESTORE = `http://${process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'}/v1/projects/demo-listopic/databases/(default)/documents`;

async function visibilities() {
  const res = await fetch(`${FIRESTORE}/lists/cerrada/reviews`, { headers: { authorization: 'Bearer owner' } });
  const body = await res.json() as { documents?: Array<{ name: string; fields: Record<string, { stringValue?: string }> }> };
  return Object.fromEntries((body.documents || []).map((d) => [d.name.split('/').pop(), d.fields.visibility?.stringValue]));
}

test('hacer pública una Lista privada publica sus valoraciones', async ({ page, errors }) => {
  expect(await visibilities()).toEqual({ rc_duena: 'private', rc_luis: 'private' });
  await login(page, 'duena');
  await page.goto('/list/cerrada/edit');
  const checkbox = page.getByLabel(/Lista Pública/);
  await expect(checkbox).not.toBeChecked({ timeout: 15_000 });
  await checkbox.check();
  await page.getByRole('button', { name: /Guardar Cambios/ }).click();
  await expect.poll(visibilities, { timeout: 15_000 }).toEqual({ rc_duena: 'public', rc_luis: 'public' });
  expect(errors).toEqual([]);
});
