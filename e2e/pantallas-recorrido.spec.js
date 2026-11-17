// Recorrido por las pantallas con un navegador real. Solo lectura y navegación: no se escribe nada.
//
// Cada prueba recoge los `pageerror` y las respuestas 5xx de lo que visita y las exige vacías al final.

const { test, expect } = require('@playwright/test');
const { ROLES, entrarComo, salir, documentos, buscarDocumento, controlDeFuga } = require('./apoyo');

// Engancha los vigilantes de errores a la página y devuelve una función que los exige vacíos.
function vigilar(page) {
  const errores = [];
  page.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 500) errores.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return () => expect(errores, 'errores de página o respuestas 5xx').toEqual([]);
}

const PD_DAW = { tipo: 'programacion_didactica', ciclo: 'daw', curso: '2025-26' };

// Quien ensucia es quien falla: al terminar, la base tiene que estar como al empezar.
controlDeFuga(test);

test.describe('portada', () => {
  for (const rol of ROLES) {
    test(`la portada de ${rol} carga y lista los documentos que le tocan`, async ({ page }) => {
      const exigir = vigilar(page);
      await salir(page);
      const quien = await entrarComo(page, rol);
      const lista = await documentos(page);
      expect(lista.length).toBeGreaterThan(0);
      if (rol !== 'jefe_estudios') {
        for (const d of lista) expect(d.departamento, 'solo el suyo').toBe(quien.departamento);
      }

      const r = await page.goto('/');
      expect(r.status()).toBeLessThan(500);
      await expect(page.getByRole('heading', { level: 1, name: 'Documentos del departamento' })).toBeVisible();
      // Una fila por documento, sin contar la cabecera de cada tabla.
      await expect(page.locator('main table tbody tr')).toHaveCount(lista.length);
      await expect(page.getByRole('link', { name: /Programación didáctica · DAW · 2025-26/ }).first()).toBeVisible();
      await expect(page.getByText('Para ver los documentos hay que entrar')).toHaveCount(0);
      exigir();
    });
  }

  test('sin sesión la portada explica cómo se entra y no enseña un error', async ({ page }) => {
    const exigir = vigilar(page);
    await salir(page);
    await page.goto('/');
    await expect(page.getByText('Para ver los documentos hay que entrar')).toBeVisible();
    exigir();
  });

  test('solo quien gestiona el censo ve el enlace a las personas', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Personas del departamento' })).toBeVisible();
    await salir(page);
    await entrarComo(page, 'docente');
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Personas del departamento' })).toHaveCount(0);
  });
});

test.describe('documento', () => {
  test('el árbol se pinta, se abre un apartado y cambia la dirección', async ({ page }) => {
    const exigir = vigilar(page);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const doc = await buscarDocumento(page, PD_DAW);
    expect(doc).toBeTruthy();

    await page.goto(`/doc/${doc._id}`);
    const arbol = page.getByRole('tree');
    await expect(arbol).toBeVisible();
    const nodos = arbol.getByRole('treeitem');
    await expect(nodos.first()).toBeVisible();
    expect(await nodos.count()).toBeGreaterThan(3);
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();

    const antes = page.url();
    const hoja = page.locator('[role="treeitem"]:not([aria-expanded]):visible').first();
    const clave = await hoja.getAttribute('data-clave');
    expect(clave).toBeTruthy();
    const titulo = (await hoja.locator('.etq').textContent()).trim();
    await hoja.click();
    await expect(page).not.toHaveURL(antes);
    await expect(page).toHaveURL(new RegExp('/doc/' + doc._id + '/'));
    await expect(page.getByRole('treeitem', { selected: true })).toHaveAttribute('data-clave', clave);
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toContainText(titulo);
    exigir();
  });

  test('un enlace a un apartado abre ese apartado al pegarlo', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const doc = await buscarDocumento(page, PD_DAW);
    await page.goto(`/doc/${doc._id}`);
    const hoja = page.locator('[role="treeitem"]:not([aria-expanded]):visible').first();
    await hoja.click();
    await expect(page.getByRole('treeitem', { selected: true })).toBeVisible();
    const url = page.url();
    const clave = await page.getByRole('treeitem', { selected: true }).getAttribute('data-clave');
    await page.goto(url);
    await expect(page.getByRole('treeitem', { selected: true })).toHaveAttribute('data-clave', clave);
  });

  test('cada documento cargado abre sin errores', async ({ page }) => {
    const exigir = vigilar(page);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const lista = await documentos(page);
    for (const d of lista) {
      const r = await page.goto(`/doc/${d._id}`);
      const que = `${d.tipo} ${d.ciclo || ''} ${d.curso || ''}`;
      expect(r.status(), que).toBeLessThan(500);
      await expect(page.getByRole('main').getByRole('heading', { level: 1 }), que).toBeVisible();
      await expect(page.getByText('No se puede abrir este documento'), que).toHaveCount(0);
      await expect(page.getByRole('tree'), que).toBeVisible();
    }
    exigir();
  });

  test('el candado: un docente ve un apartado ajeno en solo lectura', async ({ page }) => {
    const exigir = vigilar(page);
    await salir(page);
    await entrarComo(page, 'docente', 'Lucía');
    const doc = await buscarDocumento(page, PD_DAW);
    await page.goto(`/doc/${doc._id}`);
    await expect(page.getByRole('tree')).toBeVisible();
    // El nombre accesible del nodo lleva «solo lectura» cuando está bloqueado (Arbol.js).
    const bloqueados = page.getByRole('treeitem', { name: /solo lectura/ });
    expect(await bloqueados.count(), 'ningún apartado bloqueado para un docente').toBeGreaterThan(0);

    // Se despliegan las ramas para que el nodo bloqueado quede a la vista.
    const plegadas = page.locator('[role="treeitem"][aria-expanded="false"]');
    for (let i = 0; i < 50 && (await plegadas.count()); i++) {
      await plegadas.first().locator('.twisty').first().click();
    }
    const elegido = bloqueados.first();
    await expect(elegido.locator('.etq').first()).toBeVisible();
    await elegido.locator('.etq').first().click();
    await expect(page.locator('.chip-lock', { hasText: 'solo lectura' }).first()).toBeVisible();
    // El único cuadro de texto que queda es el de comentarios, que no es editar el apartado.
    await expect(page.getByRole('main').locator('textarea:not(#texto-comentario), [contenteditable="true"]')).toHaveCount(0);
    exigir();
  });
});

test.describe('personas', () => {
  for (const rol of ['admin', 'jefe_departamento']) {
    test(`/personas con ${rol} enseña el censo y deja gestionarlo`, async ({ page }) => {
      const exigir = vigilar(page);
      await salir(page);
      await entrarComo(page, rol);
      await page.goto('/personas');
      await expect(page.getByRole('heading', { level: 1, name: 'Personas del departamento' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Censo' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Dar de alta a alguien' })).toBeVisible();
      await expect(page.getByRole('rowheader', { name: 'Lucía Martínez' })).toBeVisible();
      await expect(page.getByText('Estás viendo el censo, no gestionándolo.')).toHaveCount(0);
      exigir();
    });
  }

  test('/personas con un docente no deja gestionar: sin altas ni cambios de rol', async ({ page }) => {
    const exigir = vigilar(page);
    await salir(page);
    await entrarComo(page, 'docente');
    await page.goto('/personas');
    await expect(page.getByText('Estás viendo el censo, no gestionándolo.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Dar de alta a alguien' })).toHaveCount(0);
    await expect(page.locator('select[id^="rol-"]')).toHaveCount(0);
    exigir();
  });

  test('/personas sin sesión avisa de que hace falta entrar', async ({ page }) => {
    await salir(page);
    await page.goto('/personas');
    await expect(page.getByText('No hay sesión en este navegador.')).toBeVisible();
  });
});

test.describe('reparto', () => {
  for (const rol of ['jefe_departamento', 'admin']) {
    test(`/reparto con ${rol} deja repartir`, async ({ page }) => {
      const exigir = vigilar(page);
      await salir(page);
      await entrarComo(page, rol);
      const doc = await buscarDocumento(page, PD_DAW);
      await page.goto(`/reparto/${doc._id}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Quién lleva cada unidad' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Unidades × personas' })).toBeVisible();
      await expect(page.getByText('Puedes ver el reparto, pero no cambiarlo.')).toHaveCount(0);
      exigir();
    });
  }

  test('/reparto con un docente solo lo ve, sin poder cambiarlo', async ({ page }) => {
    const exigir = vigilar(page);
    await salir(page);
    await entrarComo(page, 'docente');
    const doc = await buscarDocumento(page, PD_DAW);
    await page.goto(`/reparto/${doc._id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Quién lleva cada unidad' })).toBeVisible();
    await expect(page.getByText('Puedes ver el reparto, pero no cambiarlo.')).toBeVisible();
    // Las casillas de la matriz no se desactivan: se marcan con aria-disabled (Reparto.js).
    expect(await page.locator('main input[type="checkbox"][data-fila]').count()).toBeGreaterThan(0);
    await expect(page.locator('main input[type="checkbox"][data-fila]:not([aria-disabled="true"])')).toHaveCount(0);
    exigir();
  });

  test('/reparto de un documento sin unidades no revienta', async ({ page }) => {
    const exigir = vigilar(page);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const doc = await buscarDocumento(page, { tipo: 'memoria' });
    await page.goto(`/reparto/${doc._id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Quién lleva cada apartado' })).toBeVisible();
    exigir();
  });
});

test.describe('versiones', () => {
  for (const rol of ['jefe_departamento', 'docente']) {
    test(`/versiones con ${rol} lista las versiones del documento`, async ({ page }) => {
      const exigir = vigilar(page);
      await salir(page);
      await entrarComo(page, rol);
      const doc = await buscarDocumento(page, PD_DAW);
      await page.goto(`/versiones/${doc._id}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Versiones del documento' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: /^(Una versión|\d+ versiones)$/ })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Abrir el documento' })).toHaveAttribute('href', `/doc/${doc._id}`);
      exigir();
    });
  }
});

test.describe('direcciones que no existen', () => {
  test('/doc/noexiste enseña el aviso en castellano y un enlace para volver', async ({ page }) => {
    const exigir = vigilar(page);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    await page.goto('/doc/noexiste');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/No se puede abrir este documento|No hay nada aquí/);
    await expect(page.getByRole('link', { name: 'Volver a la lista de documentos' })).toBeVisible();
    exigir();
  });
  // El contenido del documento lo pide el NAVEGADOR, no el servidor: la pagina existe y responde 200
  // aunque el documento no exista, y quien dice que no existe es la API. Lo que se exige aqui es lo
  // que ve la persona; el codigo HTTP de la pagina no decide nada y pedirle un 404 seria pedirle que
  // el servidor resolviera algo que ya resuelve el cliente.
  test('/doc/noexiste avisa a la persona, y la API da el 404', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const api = await page.request.get('/api/documentos/noexiste/arbol');
    expect(api.status(), 'la API es quien dice que no existe').toBe(404);
    await page.goto('/doc/noexiste');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/No se puede abrir este documento|No hay nada aqu/);
    await expect(page.getByRole('link', { name: 'Volver a la lista de documentos' })).toBeVisible();
  });

  test('una ruta sin pantalla da la página de «no hay nada aquí»', async ({ page }) => {
    const exigir = vigilar(page);
    const r = await page.goto('/esto/no/existe');
    expect(r.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'No hay nada aquí' })).toBeVisible();
    exigir();
  });

  test('/reparto y /versiones de un documento que no existe no revientan', async ({ page }) => {
    const exigir = vigilar(page);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    await page.goto('/reparto/noexiste');
    await expect(page.getByRole('heading', { level: 1, name: 'No se puede ver el reparto' })).toBeVisible();
    await page.goto('/versiones/noexiste');
    await expect(page.getByRole('heading', { level: 1, name: 'No se pueden ver las versiones' })).toBeVisible();
    exigir();
  });
});

test.describe('entrada y acceso', () => {
  test('/entrar y /acceso cargan sin errores', async ({ page }) => {
    const exigir = vigilar(page);
    await salir(page);
    for (const ruta of ['/entrar', '/acceso']) {
      const r = await page.goto(ruta);
      expect(r.status(), ruta).toBeLessThan(500);
      await expect(page.getByRole('main').getByRole('heading').first()).toBeVisible();
    }
    exigir();
  });
});
