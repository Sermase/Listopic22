// Carta de un negocio Business Pro de punta a punta (sembrado en seed.mjs: «Casa Carta»,
// gestora «gerente» y una valoración de «Croketa de jamon» en «Croquetas E2E»):
// la gestora añade dos platos con sección y precio sin recargar, un duplicado avisa,
// propone mover la valoración mal escrita a su plato y renombrarlo; la jefa lo ve en
// Developer → «📥 Pendientes», lo aprueba en Patrocinios y Pro → 📥 Bandeja, simula
// «🧹 Reparar cartas» (🛠️ Herramientas) y la valoración sale con el nombre nuevo (el
// enlace antiguo redirige).
import { test, expect, login, isolate, watchErrors } from './support';

const PLACE = 'p_carta';
const COMMENT = 'Cremosa por dentro y crujiente por fuera.';
const groupUrl = (name: string) => `/group/${PLACE}/${encodeURIComponent(name)}`;

test('carta: alta de platos, mover una valoración y renombrar con aprobación admin', async ({ page, browser, errors }) => {
  test.setTimeout(180_000);

  // ── Gestora: secciones y platos ───────────────────────────────────────────
  await login(page, 'gerente');
  await page.goto(`/businesses/${PLACE}/manage?tab=items`);
  await expect(page.getByRole('heading', { name: 'Tu carta', exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Croketa de jamon', exact: true })).toBeVisible({ timeout: 20_000 });
  // Si la página se recargara, esta marca desaparecería.
  await page.evaluate(() => { (window as unknown as { e2eSinRecargar?: boolean }).e2eSinRecargar = true; });

  const newSection = page.getByLabel('Nombre de la sección nueva');
  for (const name of ['Entrantes', 'Postres']) {
    await newSection.fill(name);
    await newSection.press('Enter');
    await expect(page.getByRole('region', { name: `Sección ${name}` })).toBeVisible();
  }
  await expect(page.getByText('✅ Secciones guardadas').first()).toBeVisible();

  // «＋ Añadir plato» abre «🍽️ Nuevo plato»: nombre, sección y precio (sin lista de Listopic).
  const addDish = page.getByRole('button', { name: '＋ Añadir plato', exact: true });
  const newDish = page.getByRole('dialog', { name: /Nuevo plato/ });
  const dishName = newDish.getByLabel('Nombre del plato');
  const dishPrice = newDish.getByLabel('Precio (opcional)');
  const dishSection = (name: string) => newDish.getByRole('radio', { name, exact: true });
  const submitDish = newDish.getByRole('button', { name: '＋ Añadir plato', exact: true });
  const entrantes = page.getByRole('region', { name: 'Sección Entrantes' });

  await addDish.click();
  await expect(newDish).toBeVisible();
  await newDish.getByRole('button', { name: 'Ahora no' }).click();
  await dishName.fill('Croqueta casera');
  await dishSection('Entrantes').click();
  await expect(dishSection('Entrantes')).toHaveAttribute('aria-checked', 'true');
  await dishPrice.fill('6,5');
  await submitDish.click();
  await expect(page.getByText('«Croqueta casera» ya está en Entrantes.')).toBeVisible();
  await expect(newDish).toBeHidden();
  await expect(entrantes.getByRole('button', { name: 'Croqueta casera', exact: true })).toBeVisible();

  // El segundo, con Enter: el formulario recuerda la última sección.
  await addDish.click();
  await expect(dishName).toHaveValue('');
  await expect(dishSection('Entrantes')).toHaveAttribute('aria-checked', 'true');
  await newDish.getByRole('button', { name: 'Ahora no' }).click();
  await dishName.fill('Pimientos de Padrón');
  await dishPrice.fill('5');
  await dishName.press('Enter');
  await expect(page.getByText('«Pimientos de Padrón» ya está en Entrantes.')).toBeVisible();
  await expect(newDish).toBeHidden();
  await expect(entrantes.getByRole('button', { name: 'Pimientos de Padrón', exact: true })).toBeVisible();
  await expect(entrantes.getByRole('button', { name: 'Croqueta casera', exact: true })).toBeVisible();

  // Duplicado (otro formato del mismo nombre): aviso en el formulario, no deja añadirlo y abre el que había.
  await addDish.click();
  await dishName.fill('croqueta CASERA');
  await expect(newDish.getByText('👀 Ya tienes «Croqueta casera» en la carta.')).toBeVisible();
  await expect(newDish.getByText('Ese plato ya está en tu carta.')).toBeVisible();
  await expect(submitDish).toBeDisabled();
  await newDish.getByRole('button', { name: 'Abrir ficha' }).click();
  await expect(newDish).toBeHidden();
  const croquetaSheet = page.getByRole('dialog', { name: /Croqueta casera/ });
  await expect(croquetaSheet.getByRole('tab', { name: /Ficha/ })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(croquetaSheet).toBeHidden();

  // Vista pública: los dos en «Entrantes», con el precio normalizado por el servidor.
  await page.getByRole('tab', { name: /Vista pública/ }).click();
  const preview = page.getByRole('region', { name: /Así te ven/ });
  const previewEntrantes = preview.locator('div')
    .filter({ has: page.getByRole('heading', { name: 'Entrantes', exact: true }) })
    .last();
  await expect(previewEntrantes).toContainText('Croqueta casera');
  await expect(previewEntrantes).toContainText('Pimientos de Padrón');
  await expect(previewEntrantes).toContainText('6,50 €');
  await expect(previewEntrantes).toContainText('5,00 €');
  await page.getByRole('tab', { name: /Editar/ }).click();
  await expect(entrantes).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { e2eSinRecargar?: boolean }).e2eSinRecargar)).toBe(true);

  // ── Gestora: propuestas (mover la valoración y renombrar el plato) ────────
  await page.getByRole('button', { name: 'Croketa de jamon', exact: true }).click();
  const croketaSheet = page.getByRole('dialog', { name: /Croketa de jamon/ });
  await croketaSheet.getByRole('tab', { name: /Valoraciones/ }).click();
  await expect(croketaSheet.getByText(COMMENT)).toBeVisible();
  await croketaSheet.getByRole('button', { name: /Mover a otro plato/ }).click();
  await croketaSheet.getByRole('group', { name: '¿De qué plato es esta valoración?' })
    .getByRole('button', { name: 'Croqueta casera', exact: true })
    .click();
  await croketaSheet.getByRole('button', { name: 'Proponer', exact: true }).click();
  await expect(croketaSheet.getByText(/¡Enviada!/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(croketaSheet).toBeHidden();

  await entrantes.getByRole('button', { name: 'Croqueta casera', exact: true }).click();
  await croquetaSheet.getByRole('tab', { name: /Correcciones/ }).click();
  await croquetaSheet.getByLabel('Nombre nuevo').fill('Croqueta de la casa');
  await croquetaSheet.getByRole('button', { name: 'Proponer nombre nuevo' }).click();
  await expect(croquetaSheet.getByText(/¡Enviada!/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(croquetaSheet).toBeHidden();

  // «🕓 Historial»: las dos pendientes.
  await page.getByRole('button', { name: 'Historial de propuestas, 2 pendientes' }).click();
  const history = page.getByRole('dialog', { name: /Tus propuestas/ });
  await expect(history.getByText('«Croqueta de la casa»')).toBeVisible();
  await expect(history.getByText(/valoración de ana/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(history).toBeHidden();

  // ── Jefa: Pendientes → Patrocinios y Pro → 📥 Bandeja, aprueba las dos ─────
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
  // Developer abre en «📥 Pendientes»: las dos propuestas esperan en su grupo, que lleva
  // a Patrocinios y Pro → 📥 Bandeja.
  const proposalsGroup = admin.getByRole('region', { name: 'Propuestas de carta' });
  await expect(proposalsGroup.getByRole('heading')).toContainText('· 2', { timeout: 20_000 });
  await proposalsGroup.getByRole('button', { name: 'Ver todas →' }).click();
  await expect(admin.getByRole('tab', { name: /Bandeja/ })).toHaveAttribute('aria-selected', 'true');

  const MOVE = 'Mover la valoración "Croketa de jamon" de ana a "Croqueta casera"';
  const RENAME = 'Renombrar "Croqueta casera" a "Croqueta de la casa"';
  const proposalRow = (description: string) => admin.locator('article').filter({ hasText: description });
  await expect(proposalRow(MOVE)).toBeVisible({ timeout: 20_000 });
  await expect(proposalRow(RENAME)).toBeVisible();

  const approve = async (description: string) => {
    const row = proposalRow(description);
    await row.getByRole('button', { name: /Aprobar y aplicar/ }).click();
    const dialog = admin.getByRole('alertdialog');
    await expect(dialog).toContainText('¿Aprobar y aplicar la propuesta?');
    await dialog.getByRole('button', { name: 'Aprobar y aplicar', exact: true }).click();
    // El aviso queda en la propia fila, que pasa a «Aprobada» y ya no se puede decidir.
    await expect(row.getByText('Aprobada y aplicada. Hemos avisado al negocio.')).toBeVisible({ timeout: 30_000 });
    await expect(row.getByRole('button', { name: /Aprobar y aplicar/ })).toHaveCount(0);
  };
  // Primero se mueve la valoración y después se renombra el plato (el caso de la dueña).
  await approve(MOVE);
  await approve(RENAME);

  // «🧹 Reparar cartas» está en Patrocinios y Pro → 🛠️ Herramientas: simular no cambia nada.
  await admin.getByRole('tab', { name: /Herramientas/ }).click();
  await expect(admin.getByRole('heading', { name: '🧹 Reparar cartas' })).toBeVisible();
  await admin.getByLabel('placeId del sitio a reparar').fill(PLACE);
  await admin.getByRole('button', { name: 'Simular', exact: true }).click();
  await expect(admin.getByTestId('repair-result')).toContainText('Simulación (no se ha cambiado nada) · 1 sitio', { timeout: 30_000 });
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
  const renamed = page.getByRole('button', { name: 'Croqueta de la casa', exact: true });
  await expect(renamed).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('li[data-item-id]').filter({ has: renamed })).toContainText('(1)');
  await expect(page.getByRole('button', { name: 'Croketa de jamon', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
