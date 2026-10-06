// Carta de un negocio Business Pro de punta a punta (sembrado en seed.mjs: «Casa Carta»,
// gestora «gerente» y una valoración de «Croketa de jamon» en «Croquetas E2E»):
// la gestora añade dos platos con sección y precio sin recargar, un duplicado avisa,
// propone mover la valoración mal escrita a su plato y renombrarlo; la jefa lo aprueba
// en Developer y la valoración sale con el nombre nuevo (el enlace antiguo redirige).
import { test, expect, login, isolate, watchErrors } from './support';

const PLACE = 'p_carta';
const COMMENT = 'Cremosa por dentro y crujiente por fuera.';
const groupUrl = (name: string) => `/group/${PLACE}/${encodeURIComponent(name)}`;

test('carta: alta de platos, mover una valoración y renombrar con aprobación admin', async ({ page, browser, errors }) => {
  test.setTimeout(180_000);

  // ── Gestora: secciones y platos ───────────────────────────────────────────
  await login(page, 'gerente');
  await page.goto(`/businesses/${PLACE}/manage?tab=items`);
  await expect(page.getByRole('heading', { name: 'Elementos del lugar' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /^Croketa de jamon/ })).toBeVisible();
  // Si la página se recargara, esta marca desaparecería.
  await page.evaluate(() => { (window as unknown as { e2eSinRecargar?: boolean }).e2eSinRecargar = true; });

  const newSection = page.getByLabel('Nueva sección');
  for (const name of ['Entrantes', 'Postres']) {
    await newSection.fill(name);
    await newSection.press('Enter');
    await expect(page.getByRole('button', { name: `Quitar ${name}` })).toBeVisible();
  }
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();

  const dishName = page.getByLabel('Nombre del plato o producto');
  const dishSection = page.getByLabel('Sección del plato');
  const dishPrice = page.getByLabel('Precio del plato');

  await dishName.fill('Croqueta casera');
  await dishSection.selectOption('Entrantes');
  await dishPrice.fill('6,5');
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(page.getByText('«Croqueta casera» añadido a Entrantes.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Croqueta casera/ })).toBeVisible();
  await expect(page.getByText('Editando: Croqueta casera')).toBeVisible();

  // El segundo, con Enter: conserva la sección elegida.
  await expect(dishSection).toHaveValue('Entrantes');
  await expect(dishName).toHaveValue('');
  await dishName.fill('Pimientos de Padrón');
  await dishPrice.fill('5');
  await dishName.press('Enter');
  await expect(page.getByText('«Pimientos de Padrón» añadido a Entrantes.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pimientos de Padrón/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Croqueta casera/ })).toBeVisible();
  await expect(dishSection).toHaveValue('Entrantes');

  // Duplicado (otro formato del mismo nombre): aviso visible y se abre el que había.
  await dishName.fill('croqueta CASERA');
  await dishName.press('Enter');
  await expect(page.getByText('Ya estaba en tu carta: te lo abro.')).toBeVisible();
  await expect(page.getByText('Editando: Croqueta casera')).toBeVisible();

  // Vista previa: los dos en «Entrantes», con el precio normalizado por el servidor.
  await page.getByRole('button', { name: 'Vista previa de la carta' }).click();
  const entrantes = page.locator('div')
    .filter({ has: page.getByRole('heading', { name: 'Entrantes', exact: true }) })
    .filter({ hasText: 'Croqueta casera' })
    .last();
  await expect(entrantes).toContainText('Pimientos de Padrón');
  await expect(entrantes).toContainText('6,50 €');
  await expect(entrantes).toContainText('5,00 €');
  await page.getByRole('button', { name: 'Cerrar vista previa' }).click();
  expect(await page.evaluate(() => (window as unknown as { e2eSinRecargar?: boolean }).e2eSinRecargar)).toBe(true);

  // ── Gestora: propuestas (mover la valoración y renombrar el plato) ────────
  await page.getByRole('button', { name: /^Croketa de jamon/ }).click();
  await expect(page.getByRole('heading', { name: 'Valoraciones de este elemento (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Mover', exact: true }).click();
  await page.locator('select')
    .filter({ has: page.locator('option', { hasText: 'Elemento correcto...' }) })
    .selectOption({ label: 'Croqueta casera' });
  await page.getByRole('button', { name: 'Proponer', exact: true }).click();
  await expect(page.getByText(/^Propuesta enviada/)).toBeVisible();

  await page.getByRole('button', { name: /^Croqueta casera/ }).click();
  await page.getByPlaceholder('Nuevo nombre para "Croqueta casera"').fill('Croqueta de la casa');
  await page.getByRole('button', { name: 'Proponer renombre' }).click();
  await expect(page.getByText(/^Propuesta enviada/)).toBeVisible();
  await expect(page.getByText('Renombrar "Croqueta casera" a "Croqueta de la casa"')).toBeVisible();

  // ── Jefa: aprueba las dos en Developer → Patrocinios y Pro ────────────────
  const adminContext = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173', locale: 'es-ES', viewport: { width: 1280, height: 900 }, serviceWorkers: 'block',
  });
  await isolate(adminContext);
  const admin = await adminContext.newPage();
  const adminErrors = watchErrors(admin);
  admin.on('dialog', (dialog) => dialog.accept());
  await login(admin, 'jefe');
  await admin.goto('/developer');
  await expect(admin.getByText('Comprobando permisos…')).toBeHidden({ timeout: 20_000 });
  await expect(admin.getByText(/Activando tus permisos/)).toBeHidden({ timeout: 20_000 });
  await admin.locator('nav button').filter({ hasText: 'Patrocinios y Pro' }).first().click();
  await expect(admin.getByRole('heading', { name: 'Propuestas de carta (2)' })).toBeVisible({ timeout: 20_000 });

  const approve = async (description: string, remaining: number) => {
    const card = admin.locator('div')
      .filter({ hasText: description })
      .filter({ has: admin.getByRole('button', { name: 'Aprobar y aplicar' }) })
      .last();
    await card.getByRole('button', { name: 'Aprobar y aplicar' }).click();
    await expect(admin.getByRole('heading', { name: `Propuestas de carta (${remaining})` })).toBeVisible({ timeout: 30_000 });
    await expect(admin.getByText('Propuesta aprobada y aplicada.')).toBeVisible();
  };
  // Primero se mueve la valoración y después se renombra el plato (el caso de la dueña).
  await approve('Mover la valoración "Croketa de jamon" de ana a "Croqueta casera"', 1);
  await approve('Renombrar "Croqueta casera" a "Croqueta de la casa"', 0);
  expect(adminErrors, 'errores de JS o de consola (jefa)').toEqual([]);
  await adminContext.close();

  // ── Resultado público ─────────────────────────────────────────────────────
  await page.goto(groupUrl('Croqueta de la casa'));
  await expect(page.getByRole('heading', { level: 1, name: 'Croqueta de la casa' })).toBeVisible();
  await expect(page.getByText(COMMENT).first()).toBeVisible();

  // El enlace con el nombre anterior lleva al nuevo.
  await page.goto(groupUrl('Croqueta casera'));
  await expect(page).toHaveURL(new RegExp(`/group/${PLACE}/${encodeURIComponent('Croqueta de la casa')}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Croqueta de la casa' })).toBeVisible();
  await expect(page.getByText(COMMENT).first()).toBeVisible();

  // La Lista agrupa la valoración en el plato con su nombre nuevo (ya no en «Croketa de jamon»).
  await page.goto('/list/croquetas');
  await page.getByLabel('Distancia o zona').selectOption('r:all');
  await expect(page.locator(`[data-element-key="${PLACE}_croqueta de la casa"]`)).toBeVisible();
  await expect(page.locator(`[data-element-key^="${PLACE}_"]`)).toHaveCount(1);

  // Y en la gestión el plato renombrado tiene la valoración; el mal escrito ya no sale.
  await page.goto(`/businesses/${PLACE}/manage?tab=items`);
  await expect(page.getByRole('button', { name: /^Croqueta de la casa\s*1 valoraciones/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /^Croketa de jamon/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});
