// QUIÉN CAMBIA LA ESTRUCTURA, TAL COMO ES HOY.
//
// Hoy `core/permisos.js` → `puedeCambiarEstructura` es `admin || jefe_departamento` para el DOCUMENTO
// ENTERO: no mira módulos. Estas pruebas dejan fijado ese antes con un navegador y la base de datos de
// verdad, para que cuando un módulo pueda llevar estructura propia se vea exactamente qué ha cambiado:
//
//   · la jefatura de departamento y el soporte añaden, renombran, mueven y retiran campos
//   · un docente recibe 403, TAMBIÉN en un apartado de un módulo que lleva él
//   · la jefatura de estudios recibe 403
//
// LO QUE SE ABRIÓ Y LO QUE SIGUE CERRADO. Cuando un módulo pasó a poder llevar estructura propia, el
// departamento decidió que quien puede editar un apartado puede configurarlo (`reglaEstructuraPropia`
// ya es la de `reglaEdicion`). Eso se abrió por una ruta NUEVA, PUT .../unidades/[unidad]/estructura, que
// prueba e2e/estructura-propia.spec.js: ahí el docente que lleva el módulo SÍ reforma los campos de su
// apartado, y los otros diez módulos no cambian.
//
// Estas rutas, las de /estructura/apartado/..., siguen cerradas al docente en toda SECCIÓN DE MÓDULO,
// también en el módulo que lleva, y por eso ninguna prueba de aquí ha cambiado de signo: las pruebas de
// este fichero eligen siempre apartados de módulo (`hojasDeModulo`), y cambian la PLANTILLA COMÚN, donde un
// campo añadido sale en los once módulos a la vez. Abrírselas al docente de uno sería justo lo que la
// estructura propia existe para evitar.
//
// LO QUE SE ABRIÓ DESPUÉS. Por estas mismas rutas, en un apartado COMÚN, ya entra quien puede editarlo,
// incluido quien solo lo tiene asignado (el departamento: el documento es configurable por quien tiene
// permisos en cada apartado, sea cual sea). Una afirmación de «el docente recibe 403 en un apartado común»
// ya no sería cierta para el apartado que tiene asignado, y por eso no está aquí: está, con su signo nuevo,
// en e2e/estructura-comun.spec.js. Sigue cerrado, para el docente, en esa misma batería: el común que no
// tiene asignado, toda sección de módulo, y añadir, mover o retirar apartados. La jefatura de estudios sigue
// sin poder nada.
//
// Las rutas están en app/_lib/rutas/estructura.js. Lo que se cambia se deshace en un `finally`: el
// campo que se crea se retira y se borra, y el reparto de módulos vuelve a como estaba. Lo único que
// no se puede deshacer es el registro de cambios de la plantilla (`plantilla.cambios`) y su versión,
// que solo suben: es por diseño, y no se lee desde ninguna otra prueba.

const { test, expect } = require('@playwright/test');
const { entrarComo, salir, buscarDocumento, controlDeFuga } = require('./apoyo');

async function arbol(page, id) {
  const r = await page.request.get(`/api/documentos/${id}/arbol`);
  expect(r.status()).toBe(200);
  return (await r.json()).arbol;
}

// Las hojas de módulo: los apartados que edita quien lleva la unidad y que tienen campos.
function hojasDeModulo(raiz) {
  const out = [];
  const ver = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.edita === 'docentes_del_modulo' && n.unidadId && n.contenido) out.push(n);
    (n.hijos || []).forEach(ver);
  };
  ver(raiz);
  return out;
}

const base = (doc) => `/api/documentos/${doc}/estructura`;
const q = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

async function plantillaVersion(page, doc) {
  const r = await page.request.get(base(doc));
  expect(r.status(), await r.text()).toBe(200);
  const j = await r.json();
  return j.plantillaVersion;
}

// Los cuatro cambios de campo que pide la tarea, sobre un campo y un apartado, más retirar y borrar.
// Devuelven la respuesta para que cada prueba mire el código que le toca.
const cambios = {
  anadir: (page, doc, seccion) => page.request.post(`${base(doc)}/apartado/campo?${q({ seccion })}`, {
    data: { campo: { tipo: 'texto_largo', etiqueta: 'Campo de la puerta' } },
  }),
  renombrar: (page, doc, seccion, campo) => page.request.patch(`${base(doc)}/apartado/campo?${q({ seccion, campo })}`, {
    data: { etiqueta: 'Campo de la puerta renombrado' },
  }),
  mover: (page, doc, seccion, campo, delta) => page.request.post(`${base(doc)}/apartado/campo/mover?${q({ seccion, campo })}`, {
    data: { delta },
  }),
  retirar: (page, doc, seccion, campo) => page.request.post(`${base(doc)}/apartado/campo/retirar?${q({ seccion, campo })}`, {
    data: {},
  }),
  borrar: (page, doc, seccion, campo) => page.request.delete(`${base(doc)}/apartado/campo?${q({ seccion, campo })}`, { data: { confirmar: true } }),
};

// El documento y el apartado de módulo con los que trabajan todas las pruebas.
async function elegir(page) {
  const doc = await buscarDocumento(page, { tipo: 'programacion_didactica', ciclo: 'daw', curso: '2026-27' });
  expect(doc, 'hace falta la PD de DAW 26-27').toBeTruthy();
  const hojas = hojasDeModulo(await arbol(page, doc._id));
  expect(hojas.length, 'el documento no tiene apartados de módulo').toBeGreaterThan(1);
  const mio = hojas[0];
  const ajeno = hojas.find((h) => h.unidadId !== mio.unidadId);
  expect(ajeno, 'hacen falta dos módulos distintos').toBeTruthy();
  // Un campo que ya existe en el apartado, para los intentos que se niegan antes de mirar nada.
  const ap = await page.request.get(`/api/documentos/${doc._id}/apartado?${q({ seccion: mio.seccion, unidad: mio.unidadId })}`);
  expect(ap.status()).toBe(200);
  const campos = (await ap.json()).campos || [];
  expect(campos.length, 'el apartado no tiene campos').toBeGreaterThan(0);
  return { doc, mio, ajeno, campoExistente: campos[0].id };
}

// Las ocho rutas de campo, apartado y ficha con las que se intenta cambiar la estructura sin permiso.
// Los cuerpos son válidos a propósito: el 403 tiene que venir de QUIÉN pregunta, no de un cuerpo malo.
function intentos(page, doc, seccion, campo) {
  return {
    'añadir campo': () => cambios.anadir(page, doc, seccion),
    'renombrar campo': () => cambios.renombrar(page, doc, seccion, campo),
    'mover campo': () => cambios.mover(page, doc, seccion, campo, 1),
    'retirar campo': () => cambios.retirar(page, doc, seccion, campo),
    'borrar campo': () => cambios.borrar(page, doc, seccion, campo),
    'añadir apartado': () => page.request.post(`${base(doc)}/apartado`, { data: { titulo: 'Apartado de la puerta' } }),
    'renombrar apartado': () => page.request.patch(`${base(doc)}/apartado?${q({ seccion })}`, { data: { titulo: 'Otro título' } }),
    'mover apartado': () => page.request.post(`${base(doc)}/apartado/mover?${q({ seccion })}`, { data: { delta: 1 } }),
    'retirar apartado': () => page.request.post(`${base(doc)}/apartado/retirar?${q({ seccion })}`, { data: {} }),
  };
}

// Quien ensucia es quien falla: al terminar, la base tiene que estar como al empezar.
controlDeFuga(test);

test.describe('quién cambia la estructura (hoy)', () => {
  for (const rol of ['jefe_departamento', 'admin']) {
    test(`${rol} añade, renombra, mueve y retira un campo, y lo deja todo como estaba`, async ({ page }) => {
      test.setTimeout(120_000);
      await salir(page);
      await entrarComo(page, 'jefe_departamento');
      const { doc, mio } = await elegir(page);

      await salir(page);
      await entrarComo(page, rol);
      let creado = null;
      try {
        const v0 = await plantillaVersion(page, doc._id);

        const a = await cambios.anadir(page, doc._id, mio.seccion);
        expect(a.status(), await a.text()).toBe(201);
        const ja = await a.json();
        creado = ja.campos[0].id;
        expect(ja.afectaUnidades, 'cambiar un apartado de módulo se avisa a los once').toBeTruthy();

        const r = await cambios.renombrar(page, doc._id, mio.seccion, creado);
        expect(r.status(), await r.text()).toBe(200);

        // El campo nuevo va al final: subirlo y volver a bajarlo son dos movimientos válidos.
        const sube = await cambios.mover(page, doc._id, mio.seccion, creado, -1);
        expect(sube.status(), await sube.text()).toBe(200);
        const baja = await cambios.mover(page, doc._id, mio.seccion, creado, 1);
        expect(baja.status(), await baja.text()).toBe(200);

        const quita = await cambios.retirar(page, doc._id, mio.seccion, creado);
        expect(quita.status(), await quita.text()).toBe(200);

        // Cada cambio sube la versión de la plantilla del documento entero.
        expect(await plantillaVersion(page, doc._id)).toBeGreaterThan(v0);
      } finally {
        // Deshacer: si quedó vigente se retira (no pasa nada si ya estaba retirado) y se borra de verdad.
        if (creado) {
          await cambios.retirar(page, doc._id, mio.seccion, creado);
          const b = await cambios.borrar(page, doc._id, mio.seccion, creado);
          expect([200, 404], `no se ha podido borrar el campo de la prueba: ${await b.text()}`).toContain(b.status());
        }
      }
    });
  }

  test('un docente recibe 403 en las rutas de estructura, también en un módulo que lleva él', async ({ page }) => {
    test.setTimeout(120_000);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const { doc, mio, ajeno, campoExistente } = await elegir(page);

    const lista = (await (await page.request.get('/api/acceso-libre')).json()).personas;
    const lucia = lista.find((p) => p.rol === 'docente');
    expect(lucia).toBeTruthy();
    const previo = await page.request.get(`/api/documentos/${doc._id}/unidades`);
    const antes = (await previo.json()).unidades.find((u) => u.unidadId === mio.unidadId);
    const docentesAntes = (antes && antes.docentes) || [];

    const campoDe = async (nodo) => {
      const ap = await page.request.get(`/api/documentos/${doc._id}/apartado?${q({ seccion: nodo.seccion, unidad: nodo.unidadId })}`);
      return (await ap.json()).campos[0].id;
    };

    try {
      const puesto = await page.request.put(`/api/documentos/${doc._id}/unidades/${encodeURIComponent(mio.unidadId)}/docentes`, {
        data: { docentes: [lucia._id] },
      });
      expect(puesto.status(), await puesto.text()).toBeLessThan(400);
      const v0 = await plantillaVersion(page, doc._id);

      await salir(page);
      await entrarComo(page, 'docente', lucia.nombre);

      // Antes de nada: es de verdad quien lleva ese módulo, y lo puede escribir.
      const suyo = await page.request.get(`/api/documentos/${doc._id}/apartado?${q({ seccion: mio.seccion, unidad: mio.unidadId })}`);
      expect((await suyo.json()).puedeEditar, 'el docente tiene que llevar este módulo para que la prueba valga').toBe(true);

      // En el apartado de SU módulo, y en el de otro, y en una sección común: 403 en todos.
      const sitios = [
        ['su módulo', mio.seccion, campoExistente],
        ['el módulo de otro', ajeno.seccion, await campoDe(ajeno)],
      ];
      for (const [donde, seccion, campo] of sitios) {
        for (const [que, pedir] of Object.entries(intentos(page, doc._id, seccion, campo))) {
          const r = await pedir();
          expect(r.status(), `docente: ${que} en ${donde} (hoy es 403)`).toBe(403);
        }
      }

      // Y no se ha movido nada: lo comprueba quien sí puede mirar.
      await salir(page);
      await entrarComo(page, 'jefe_departamento');
      expect(await plantillaVersion(page, doc._id), 'una petición negada no puede subir la versión').toBe(v0);
    } finally {
      await salir(page);
      await entrarComo(page, 'jefe_departamento');
      await page.request.put(`/api/documentos/${doc._id}/unidades/${encodeURIComponent(mio.unidadId)}/docentes`, {
        data: { docentes: docentesAntes },
      });
    }
  });

  test('la jefatura de estudios recibe 403 en las rutas de estructura', async ({ page }) => {
    test.setTimeout(120_000);
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const { doc, mio, campoExistente } = await elegir(page);
    const v0 = await plantillaVersion(page, doc._id);

    await salir(page);
    await entrarComo(page, 'jefe_estudios');
    for (const [que, pedir] of Object.entries(intentos(page, doc._id, mio.seccion, campoExistente))) {
      const r = await pedir();
      expect(r.status(), `jefatura de estudios: ${que} (hoy es 403)`).toBe(403);
    }

    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    expect(await plantillaVersion(page, doc._id)).toBe(v0);
  });

  test('sin sesión las rutas de estructura piden entrar (401)', async ({ page }) => {
    await salir(page);
    await entrarComo(page, 'jefe_departamento');
    const { doc, mio, campoExistente } = await elegir(page);
    await salir(page);
    const r = await cambios.renombrar(page, doc._id, mio.seccion, campoExistente);
    expect(r.status()).toBe(401);
  });
});
