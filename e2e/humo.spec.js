// Humo: que el montaje de las pruebas funciona y la aplicación responde con los cuatro roles.
// Si esto falla, lo demás no vale de nada y no hay que mirarlo.

const { test, expect } = require('@playwright/test');
const { ROLES, entrarComo, salir, documentos, controlDeFuga } = require('./apoyo');

// Quien ensucia es quien falla: al terminar, la base tiene que estar como al empezar.
controlDeFuga(test);

test.describe('humo', () => {
  test('la portada carga y pide entrar cuando no hay sesión', async ({ page }) => {
    await salir(page);
    const r = await page.goto('/');
    expect(r.status()).toBeLessThan(500);
    await expect(page.locator('body')).toBeVisible();
  });

  for (const rol of ROLES) {
    test(`entra como ${rol} y ve la portada`, async ({ page }) => {
      await salir(page);
      const quien = await entrarComo(page, rol);
      await page.goto('/');
      await expect(page.locator('main')).toBeVisible();
      // El nombre de quien ha entrado sale en la pantalla: es la prueba de que la sesión es suya.
      await expect(page.getByText(quien.nombre, { exact: false }).first()).toBeVisible();
    });
  }

  test('la jefatura del departamento ve los documentos cargados', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const lista = await documentos(page);
    expect(lista.length, 'la base no tiene documentos: ejecuta npm run cargar-reales').toBeGreaterThan(0);
    const pd = lista.filter((d) => d.tipo === 'programacion_didactica');
    expect(pd.length, 'no hay ninguna programación didáctica').toBeGreaterThan(0);
  });
});
