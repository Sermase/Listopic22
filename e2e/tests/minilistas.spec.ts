// Ventana de Minilistas de una Lista: tarjeta propia, orden, buscador y podio al desplegar.
import { test, expect, login } from './support';

const SHOTS = process.env.SHOTS_DIR;
const FIRESTORE = `http://${process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'}/v1/projects/demo-listopic/databases/(default)/documents`;

test('Minilistas: concurso primero, buscar, «Las mías» y podio sin lecturas', async ({ page, errors }) => {
  // El podio y los participantes los guarda el servidor; aquí se fijan para no depender del recálculo.
  await fetch(`${FIRESTORE}/lists/picantes?updateMask.fieldPaths=podium&updateMask.fieldPaths=participantsCount`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields: {
      participantsCount: { integerValue: '3' },
      podium: { arrayValue: { values: [
        { mapValue: { fields: { name: { stringValue: 'Brava del podio' }, placeName: { stringValue: 'Bar Uno' }, average: { doubleValue: 9.2 } } } },
        { mapValue: { fields: { name: { stringValue: 'Brava segunda' }, average: { doubleValue: 8.1 } } } },
      ] } },
    } }),
  });

  await login(page, 'ana');
  await page.goto('/list/bravas');
  await page.getByRole('button', { name: /Más acciones/ }).click();
  await page.getByRole('button', { name: /Minilistas/ }).click();
  const cards = page.getByTestId('minilist-card');
  await expect(cards.first()).toContainText('Concurso de bravas');
  await expect(cards.first()).toContainText('🏆 Concurso abierto');
  const picantes = cards.filter({ hasText: 'Bravas picantes' });
  await expect(picantes).toContainText('👥 3 personas');

  await picantes.getByRole('button', { name: /Podio/ }).click();
  await expect(picantes.getByRole('list', { name: /Podio de Bravas picantes/ })).toContainText('Brava del podio');
  await page.waitForTimeout(400);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/minilistas-ventana.png` });

  await page.getByLabel('Buscar minilista').fill('picántes');
  await expect(cards).toHaveCount(1);
  await page.getByLabel('Buscar minilista').fill('');
  await page.getByRole('tab', { name: 'Las mías' }).click();
  await expect(cards.filter({ hasText: 'Bravas picantes' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Editar lista: la portada se puede poner después de crearla', async ({ page, errors }) => {
  await login(page, 'duena');
  await page.goto('/list/picantes');
  await page.getByRole('button', { name: /Más acciones/ }).click();
  await page.getByRole('button', { name: 'Editar lista' }).click();
  await expect(page.getByRole('button', { name: 'Subir portada' })).toBeVisible();
  await page.getByRole('button', { name: 'Subir portada' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/minilistas-portada.png` });
  expect(errors).toEqual([]);
});

test('descripción larga: «Leer más» y enlaces que se pulsan', async ({ page, errors }) => {
  const description = `Bases del concurso en https://ejemplo.es/bases. ${'Mucho texto para que no quepa en dos líneas. '.repeat(8)}Fin.`;
  await fetch(`${FIRESTORE}/lists/picantes?updateMask.fieldPaths=description`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { description: { stringValue: description } } }),
  });
  await page.goto('/list/picantes');
  const more = page.getByRole('button', { name: 'Leer más' });
  await expect(more).toBeVisible();
  await expect(page.getByRole('link', { name: 'ejemplo.es/bases' })).toHaveAttribute('href', 'https://ejemplo.es/bases');
  await more.click();
  await expect(page.getByText('Fin.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Leer menos' })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/minilistas-leer-mas.png` });
  expect(errors).toEqual([]);
});
