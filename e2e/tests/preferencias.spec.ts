// Preferencias: todo lo que se ajusta, en una página; cada fila abre su ventana
// y lo que se elige se guarda en la cuenta al momento.
import { test, expect, login } from './support';

const row = (page, name: RegExp) => page.getByRole('button', { name });

test('Preferencias guarda distancia, avisos, filtros y perfil; «atrás» cierra la ventana', async ({ page, errors }) => {
  await login(page, 'prolifica');
  await page.goto('/preferencias');
  await expect(page.getByRole('heading', { name: 'Preferencias' })).toBeVisible();
  const dialog = page.getByRole('dialog');

  // Distancia: un toque y la ventana se cierra sola.
  await row(page, /^Distancia por defecto/).click();
  await dialog.getByRole('button', { name: '5 km', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row(page, /^Distancia por defecto/)).toContainText('5 km');

  // Avisos: el interruptor se guarda solo; «atrás» cierra la ventana sin salir de la página.
  await row(page, /^Avisos/).click();
  await dialog.getByText('Likes en tus reseñas').click();
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/preferencias$/);
  await expect(row(page, /^Avisos/)).toContainText('6 de 7');

  // Mis filtros.
  await row(page, /^Comida y alérgenos/).click();
  await dialog.getByRole('button', { name: 'Filtrar: 🌾 Sin gluten' }).click();
  await page.goBack();
  await expect(row(page, /^Comida y alérgenos/)).toContainText('Sin gluten');

  // Perfil: es un formulario, se guarda con su botón.
  await page.getByRole('button', { name: 'Editar perfil' }).click();
  await dialog.getByLabel('Sobre ti').fill('Croquetas ante todo');
  // Al guardar, el nombre se copia a sus reseñas en segundo plano: se espera antes de recargar.
  const copied = page.waitForResponse((r) => r.url().includes('propagateAuthorFieldsToReviews'));
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toHaveCount(0);
  await copied;

  // Tras recargar, todo sigue.
  await page.reload();
  await expect(row(page, /^Distancia por defecto/)).toContainText('5 km');
  await expect(row(page, /^Avisos/)).toContainText('6 de 7');
  await expect(row(page, /^Comida y alérgenos/)).toContainText('Sin gluten');
  await page.getByRole('button', { name: 'Editar perfil' }).click();
  await expect(dialog.getByLabel('Sobre ti')).toHaveValue('Croquetas ante todo');
  expect(errors).toEqual([]);
});

test('Desde el perfil: «Editar perfil» abre la ventana y la rueda lleva a Preferencias', async ({ page, errors }) => {
  await login(page, 'prolifica');
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Editar perfil' }).click();
  await expect(page.getByRole('dialog', { name: 'Editar perfil' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/profile$/);

  await page.getByRole('link', { name: 'Preferencias', exact: true }).click();
  await expect(page).toHaveURL(/\/preferencias$/);
  await expect(page.getByRole('button', { name: /^Eliminar cuenta/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Barra de abajo: se elige y ordena en Preferencias; lo que no va en ella sale en el menú', async ({ page, errors }) => {
  await login(page, 'prolifica');
  await page.goto('/preferencias');
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  // Por defecto: Chats en la barra y Guardados en el menú.
  await expect(nav.getByRole('link', { name: 'Chats' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Guardados' })).toHaveCount(0);
  await expect(row(page, /^Barra de abajo/)).toContainText('Inicio · Buscar · Chats · Perfil');

  await row(page, /^Barra de abajo/).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Subir Guardados' }).click();
  await dialog.getByRole('button', { name: 'Subir Guardados' }).click();
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(row(page, /^Barra de abajo/)).toContainText('Inicio · Buscar · Guardados · Chats');
  await expect(nav.getByRole('link', { name: 'Guardados' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Perfil' })).toHaveCount(0);

  // El menú lleva lo que quedó fuera (el perfil ya está arriba del todo) y ya no «Mi negocio» en la cabecera.
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  const menu = page.getByRole('dialog', { name: 'Menú' });
  await expect(menu.getByRole('link', { name: 'Crear minilista' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Guardados' })).toHaveCount(0);
  await expect(menu.getByRole('link', { name: 'Chats' })).toHaveCount(0);
  await page.goBack();

  // Se queda tras recargar; «Volver a la de siempre» lo deshace.
  await page.reload();
  await expect(nav.getByRole('link', { name: 'Guardados' })).toBeVisible();
  await row(page, /^Barra de abajo/).click();
  await dialog.getByRole('button', { name: 'Volver a la de siempre' }).click();
  await page.goBack();
  await expect(nav.getByRole('link', { name: 'Chats' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Guardados' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
