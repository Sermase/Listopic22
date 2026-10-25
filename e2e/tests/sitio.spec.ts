// Ficha de un sitio y de un plato: La Carta va primero, «Reclamar negocio» vive en «⋯»
// y el mapa se amplía a pantalla completa (con «Cómo llegar»); el plato abre el mapa de su sitio.
import { test, expect, login } from './support';

test('Sitio: La Carta primero, reclamar en ⋯ y mapa a pantalla completa', async ({ page, errors }) => {
  await login(page, 'ana');
  await page.goto('/place/p_prol');
  await expect(page.getByRole('heading', { name: 'Casa Prolífica' })).toBeVisible({ timeout: 20_000 });

  // La Carta es la primera pestaña y la que está abierta.
  const tabs = page.getByRole('button', { name: /^(La Carta|Reseñas) \(/ });
  await expect(tabs.first()).toHaveText(/La Carta/);
  await expect(page.getByText('¿Gestionas este negocio?')).toHaveCount(0);

  await page.getByRole('button', { name: 'Más acciones' }).click();
  await expect(page.getByRole('menuitem', { name: /Reclamar negocio/ })).toBeVisible();
  await page.getByRole('menuitem', { name: /Reclamar negocio/ }).click();
  const claim = page.getByRole('heading', { name: 'Reclamar negocio' });
  await expect(claim).toBeVisible();
  await page.goBack();
  await expect(claim).toHaveCount(0);

  await page.getByRole('button', { name: 'Ampliar mapa' }).click();
  const full = page.getByRole('dialog', { name: 'Casa Prolífica' });
  await expect(full.locator('.leaflet-container')).toBeVisible();
  await expect(full.getByRole('link', { name: 'Cómo llegar' })).toHaveAttribute('href', /google\.com\/maps\/dir\/.*destination=36\.5271,-6\.2886/);
  await page.goBack();
  await expect(full).toHaveCount(0);
  await expect(page).toHaveURL(/\/place\/p_prol$/);
  expect(errors).toEqual([]);
});

test('Plato: «Mapa» enseña su sitio a pantalla completa', async ({ page, errors }) => {
  await page.goto(`/group/p_prol/${encodeURIComponent('Plato m00')}`);
  await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  const full = page.getByRole('dialog', { name: 'Casa Prolífica' });
  await expect(full.locator('.leaflet-marker-icon').first()).toBeVisible();
  await full.getByRole('button', { name: 'Cerrar mapa' }).click();
  await expect(full).toHaveCount(0);
  expect(errors).toEqual([]);
});
