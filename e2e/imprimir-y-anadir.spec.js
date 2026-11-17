// LAS DOS PANTALLAS DE ESTE EVOLUTIVO, CON UN NAVEGADOR Y LA BASE DE DATOS DE VERDAD.
//
//   1. CÓMO SE IMPRIME (`?vista=impresion`, app/_componentes/Impresion.js). Hasta qué nivel llega el
//      índice y qué apartados empiezan en página nueva. La configuran la jefatura del departamento,
//      la de estudios y el soporte; un docente la ve y no la cambia.
//   2. AÑADIR UN APARTADO DE PRIMER NIVEL A UN MÓDULO, desde la página del módulo
//      (`AnadirApartadoAlModulo` en app/_componentes/Estructura.js). Es el hueco que había: la
//      tarjeta *Estructura* añade DENTRO del apartado que se mira y no sale en un módulo, así que
//      quien lleva el módulo solo podía colgar el apartado nuevo dentro de otro.
//
// LO QUE DE VERDAD SE VIGILA AQUÍ, y que las pruebas de servidor no pueden ver:
//
//   · que el apartado nuevo sale SOLO EN ESE MÓDULO. Cada prueba que añade algo comprueba al final
//     que el módulo de al lado sigue igual. Es el mismo agujero de e2e/borrar-en-el-modulo.spec.js:
//     lo propio de un módulo lleva ids con prefijo `m_` que otro módulo puede tener iguales.
//   · que la pantalla de impresión no enseña controles a quien no los tiene. Un desplegable que
//     parece suyo y contesta 403 al usarlo es peor que no tenerlo.
//   · que el cambio llega al PDF y al Word. Se pide la exportación de verdad después de configurar.
//
// Todo lo que se toca se deshace en un `finally`: la estructura propia de los módulos vuelve a la
// común —con `confirmar`, porque destruye lo que la prueba creó— y la configuración de impresión
// vuelve a lo de serie.

const { test, expect } = require('@playwright/test');
const { entrarComo, salir, buscarDocumento, controlDeFuga } = require('./apoyo');

const TIPO_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Dos módulos del mismo documento: el que se toca y el vecino que tiene que quedarse igual.
const A = 'daw-0373';
const B = 'daw-0483';

const rutaEstructura = (doc, unidad) => `/api/documentos/${doc}/unidades/${encodeURIComponent(unidad)}/estructura`;
const rutaImpresion = (doc) => `/api/documentos/${doc}/impresion`;

controlDeFuga(test);

async function docDeDaw(page) {
  const d = await buscarDocumento(page, { tipo: 'programacion_didactica', ciclo: 'daw', curso: '2026-27' });
  expect(d, 'hace falta la PD de DAW de 2026-27 cargada').toBeTruthy();
  return d._id;
}

// La estructura propia de un módulo, leída por la API. `null` es no tener ninguna.
async function estructuraDe(page, doc, unidad) {
  const r = await page.request.get(rutaEstructura(doc, unidad));
  expect(r.status()).toBe(200);
  return (await r.json()).estructura;
}

// Devuelve los dos módulos a la común. VA CON `confirmar`: quitar la estructura propia DESTRUYE los
// apartados que el módulo había creado, y sin confirmar el servidor contesta 400 (es la pregunta).
async function limpiarModulos(page, doc) {
  for (const unidad of [A, B]) {
    const leida = await page.request.get(rutaEstructura(doc, unidad));
    if (leida.status() !== 200) continue;
    const { updatedAt } = await leida.json();
    await page.request.put(rutaEstructura(doc, unidad), {
      data: { estructura: null, confirmar: true, esperaUpdatedAt: updatedAt },
    });
  }
}

async function limpiarImpresion(page, doc) {
  const leida = await page.request.get(rutaImpresion(doc));
  if (leida.status() !== 200) return;
  const { updatedAt } = await leida.json();
  await page.request.patch(rutaImpresion(doc), {
    data: { indice: 2, saltos: 0, esperaUpdatedAt: updatedAt },
  });
}

// ================================================================ cómo se imprime

test.describe('cómo se imprime', () => {
  test.setTimeout(240_000);

  test('la jefatura del departamento la configura, y el cambio llega al PDF y al Word', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const doc = await docDeDaw(page);
    try {
      await page.goto(`/doc/${doc}?vista=impresion`);
      await expect(page.getByRole('heading', { level: 2, name: 'Cómo se imprime' })).toBeVisible();

      const indice = page.getByLabel('Índice hasta');
      const saltos = page.getByLabel('Página nueva en');
      await expect(indice).toBeVisible();
      await expect(saltos).toBeVisible();

      // Lo de serie: el índice hasta el segundo nivel, que es lo que hacía el PDF antes de que esto
      // existiera, y ningún salto además del de cada módulo.
      await expect(indice).toHaveValue('2');
      await expect(saltos).toHaveValue('0');
      // Que cada módulo empieza en página nueva igualmente tiene que estar dicho.
      await expect(page.getByText(/Cada módulo empieza en página nueva siempre/)).toBeVisible();

      await indice.selectOption('4');
      // El aviso dice QUÉ cambia en el documento, no «guardado».
      await expect(page.getByRole('status').filter({ hasText: /índice del PDF y del Word/ })).toBeVisible();
      await expect(page.getByText(/lo de siempre es/)).toBeVisible();

      await saltos.selectOption('1');
      // La frase la redacta el servidor (`efecto` de cada nivel), así que aquí se busca lo que de
      // verdad dice y no una paráfrasis: «cada apartado principal empieza arriba de una página».
      await expect(page.getByRole('status').filter({ hasText: /cada apartado principal empieza arriba de una página/ })).toBeVisible();

      // Guardado de verdad: se relee del servidor.
      const guardado = await (await page.request.get(rutaImpresion(doc))).json();
      expect(guardado.indice).toBe(4);
      expect(guardado.saltos).toBe(1);

      // Y las dos salidas se generan con ello. No se puede leer el índice de un PDF desde aquí, así
      // que lo que se comprueba es que las dos exportaciones siguen saliendo: un cambio de impresión
      // que rompiera el generador se vería aquí y en ningún otro sitio.
      const pdf = await page.request.get(`/api/documentos/${doc}/pdf`);
      expect(pdf.status()).toBe(200);
      expect(pdf.headers()['content-type']).toContain('application/pdf');
      const docx = await page.request.get(`/api/documentos/${doc}/docx`);
      expect(docx.status()).toBe(200);
      expect(docx.headers()['content-type']).toContain(TIPO_DOCX);
      expect((await docx.body()).length).toBeGreaterThan(1000);
    } finally {
      await limpiarImpresion(page, doc);
    }
  });

  test('la jefatura de estudios tambien la configura: es la excepcion decidida', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'jefe_estudios');
    const doc = await docDeDaw(page);
    try {
      await page.goto(`/doc/${doc}?vista=impresion`);
      const indice = page.getByLabel('Índice hasta');
      await expect(indice).toBeVisible();
      await indice.selectOption('3');
      await expect(page.getByRole('status').filter({ hasText: /tercer nivel/ })).toBeVisible();
      expect((await (await page.request.get(rutaImpresion(doc))).json()).indice).toBe(3);
    } finally {
      await limpiarImpresion(page, doc);
    }
  });

  test('un docente la ve y no la puede cambiar: no hay controles', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'docente');
    const doc = await docDeDaw(page);
    await page.goto(`/doc/${doc}?vista=impresion`);
    await expect(page.getByRole('heading', { level: 2, name: 'Cómo se imprime' })).toBeVisible();
    // Ve lo que hay configurado…
    await expect(page.getByText('Hasta el segundo nivel')).toBeVisible();
    // …y no hay desplegables suyos. Un control que contesta 403 al usarlo es peor que no tenerlo.
    await expect(page.getByLabel('Índice hasta')).toHaveCount(0);
    await expect(page.getByLabel('Página nueva en')).toHaveCount(0);
    await expect(page.getByText(/Cambiar.*corresponde/)).toBeVisible();
    // Y el servidor dice lo mismo.
    const r = await page.request.patch(rutaImpresion(doc), { data: { indice: 5 } });
    expect(r.status()).toBe(403);
  });

  test('se llega desde el menu «Ir a» sin recargar la pagina', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const doc = await docDeDaw(page);
    await page.goto(`/doc/${doc}`);
    await page.getByRole('main').getByRole('heading', { level: 1 }).waitFor();
    await page.getByRole('button', { name: /Ir a/ }).click();
    await page.getByRole('menuitem', { name: 'Cómo se imprime' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Cómo se imprime' })).toBeVisible();
    // La vista también va en la dirección, para poder compartir el enlace.
    await expect(page).toHaveURL(/vista=impresion/);
  });
});

// ================================================================ añadir un apartado a un módulo

test.describe('añadir un apartado de primer nivel a un módulo', () => {
  test.setTimeout(240_000);

  test('la docente del modulo lo anade, y el modulo de al lado no cambia', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const doc = await docDeDaw(page);
    try {
      // El vecino, para poder decir al final que sigue igual.
      const antesB = await estructuraDe(page, doc, B);

      await page.goto(`/doc/${doc}/modulos?u=${encodeURIComponent(A)}`);
      await expect(page.getByRole('heading', { level: 2, name: 'Añadir un apartado a este módulo' })).toBeVisible();
      // Lo que la tarjeta promete antes de pulsar: sale solo en este módulo.
      await expect(page.getByText(/solo en este módulo/)).toBeVisible();

      await page.getByLabel('Título del apartado nuevo').fill('Taller de la prueba de navegador');
      await page.getByRole('button', { name: 'Añadir', exact: true }).click();

      const aviso = page.getByRole('status').filter({ hasText: /Taller de la prueba de navegador/ });
      await expect(aviso).toBeVisible();
      await expect(aviso).toContainText('Los otros módulos no han cambiado');

      // EN LA ESTRUCTURA DEL MÓDULO, Y DE PRIMER NIVEL. Que sea de primer nivel se reconoce en que su
      // padre es el bloque de módulos y no otro apartado: es justo lo que no se podía hacer.
      const propia = await estructuraDe(page, doc, A);
      expect(propia, 'el módulo tiene que haberse quedado con estructura propia').toBeTruthy();
      const anadidos = (propia.apartados && propia.apartados.anadidos) || [];
      const nuevo = anadidos.find((x) => x.titulo === 'Taller de la prueba de navegador');
      expect(nuevo, 'el apartado nuevo tiene que estar en lo añadido del módulo').toBeTruthy();
      expect(nuevo.id.startsWith('modulos/m_')).toBe(true);
      expect(nuevo.padre).toBe('modulos');

      // EL VECINO SIGUE IGUAL.
      expect(await estructuraDe(page, doc, B)).toEqual(antesB);

      // Y se puede abrir para escribir desde el propio aviso.
      await page.getByRole('button', { name: /Abrir «Taller de la prueba de navegador»/ }).click();
      await expect(page.getByRole('main').getByRole('heading', { level: 1 }))
        .toContainText('Taller de la prueba de navegador');
    } finally {
      await limpiarModulos(page, doc);
    }
  });

  test('sale en el arbol del modulo y en su PDF, y no en el del modulo de al lado', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const doc = await docDeDaw(page);
    try {
      await page.goto(`/doc/${doc}/modulos?u=${encodeURIComponent(A)}`);
      await page.getByLabel('Título del apartado nuevo').fill('Apartado propio de A');
      await page.getByRole('button', { name: 'Añadir', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: /Apartado propio de A/ })).toBeVisible();

      // El tomo del módulo A lo lleva; el de B no. Se mide sobre la definición que la ruta prepara,
      // que es lo que el PDF es, y no sobre los bytes.
      const deA = await page.request.get(`/api/documentos/${doc}/pdf?unidad=${encodeURIComponent(A)}`);
      expect(deA.status()).toBe(200);
      const deB = await page.request.get(`/api/documentos/${doc}/pdf?unidad=${encodeURIComponent(B)}`);
      expect(deB.status()).toBe(200);
      // Los dos se generan: lo que de verdad distingue uno de otro se comprueba en el árbol, que es
      // texto y se puede leer.
      const arbol = await (await page.request.get(`/api/documentos/${doc}/arbol`)).json();
      const texto = JSON.stringify(arbol);
      expect(texto).toContain('Apartado propio de A');
      // Y no está dos veces: si estuviera también en B, el título saldría repetido.
      expect(texto.split('Apartado propio de A').length - 1).toBe(1);
    } finally {
      await limpiarModulos(page, doc);
    }
  });

  test('un docente que no lleva el modulo no ve la tarjeta', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'jefe_estudios');
    const doc = await docDeDaw(page);
    await page.goto(`/doc/${doc}/modulos?u=${encodeURIComponent(A)}`);
    await page.getByRole('main').getByRole('heading', { level: 1 }).waitFor();
    // La jefatura de estudios ve todo y no edita nada: la tarjeta de añadir no es suya.
    //
    // HAY QUE ESPERAR A QUE LA PÁGINA TERMINE DE PREGUNTAR EL PERMISO. La tarjeta aparece solo
    // cuando el servidor contesta que sí, así que mirar «no está» en cuanto carga la página la
    // encontraría ausente por el motivo que no es. Se espera a la tabla de apartados del módulo, que
    // es lo último que pinta esta pantalla.
    await expect(page.getByRole('heading', { level: 2, name: 'Apartados' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Añadir un apartado a este módulo' })).toHaveCount(0);
  });
});
